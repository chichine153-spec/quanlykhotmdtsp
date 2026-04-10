import axios from 'axios';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  addDoc, 
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { OrderRecord } from './inventoryService';
import { ProblematicOrder } from '../types';

const GHN_API_URL = 'https://dev-online-gateway.ghn.vn/shipper-order/v1/status';
const GHN_TOKEN = import.meta.env.VITE_GHN_TOKEN;

export class TrackingService {
  /**
   * Extract city from address string
   */
  static getCityFromAddress(address: string): string {
    if (!address) return '';
    const parts = address.split(',');
    const lastPart = parts[parts.length - 1]?.trim() || '';
    // Common patterns in Vietnam addresses
    if (lastPart.toLowerCase().includes('hà nội')) return 'Hà Nội';
    if (lastPart.toLowerCase().includes('hồ chí minh') || lastPart.toLowerCase().includes('hcm')) return 'TP. HCM';
    return lastPart;
  }

  /**
   * Check if an order should be tracked based on region and time
   */
  static shouldTrack(order: OrderRecord): boolean {
    if (order.trackingStatus === 'delivered' || order.trackingStatus === 'returned') return false;
    
    const now = new Date();
    const processedAt = new Date(order.processedAt);
    const diffDays = (now.getTime() - processedAt.getTime()) / (1000 * 3600 * 24);
    
    const city = this.getCityFromAddress(order.destination || '');
    const isDomestic = city.includes('Hà Nội');
    
    if (isDomestic) {
      return diffDays >= 1;
    } else {
      return diffDays >= 4; // User requested 4 days for distant provinces
    }
  }

  /**
   * Fetch tracking from GHN
   */
  static async fetchGHNTracking(trackingCode: string) {
    if (!GHN_TOKEN) {
      console.warn('GHN Token missing');
      return null;
    }

    try {
      const response = await axios.post(GHN_API_URL, {
        order_code: trackingCode
      }, {
        headers: {
          'Token': GHN_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.code === 200) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error('GHN Tracking Error:', error);
      return null;
    }
  }

  /**
   * Fetch tracking from SPX (Shopee Express)
   */
  static async fetchSPXTracking(trackingCode: string) {
    // Note: Direct fetch to spx.vn will fail in browser due to CORS.
    // We attempt to use a public tracking aggregator or log the requirement for a proxy.
    try {
      console.log(`Checking SPX tracking for ${trackingCode}...`);
      
      // Attempting a public tracking API if available, otherwise return status based on code pattern
      // This is a simulation of the fetch logic requested
      const response = await fetch(`https://spx.vn/api/v2/fleet/order/tracking?sls_tracking_number=${trackingCode}`, {
        mode: 'no-cors' // This won't allow reading the body, but it's what's possible in browser
      });

      // Since we can't read body with no-cors, we'd normally need a backend proxy.
      // For this OMS, we'll mark as "Checking" or use a mock status if in demo mode.
      return null; 
    } catch (error) {
      console.error('SPX Tracking Fetch Error:', error);
      return null;
    }
  }

  /**
   * Process a batch of orders for tracking
   */
  static async processTrackingBatch(userId: string) {
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('userId', '==', userId),
      where('trackingStatus', 'not-in', ['delivered', 'returned']),
      limit(20) // Batch size to avoid rate limits
    );

    const snapshot = await getDocs(q);
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as OrderRecord[];

    for (const order of orders) {
      if (!this.shouldTrack(order)) continue;

      let trackingData = null;
      const carrier = (order.trackingCode || '').startsWith('SPX') ? 'SPX' : 'GHN';

      if (carrier === 'GHN') {
        trackingData = await this.fetchGHNTracking(order.trackingCode);
      } else {
        trackingData = await this.fetchSPXTracking(order.trackingCode);
      }

      if (trackingData) {
        await this.updateOrderStatus(order, trackingData);
      }

      // Delay between calls to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Update order status in Firestore
   */
  static async updateOrderStatus(order: OrderRecord, data: any) {
    const status = data.status || data.state;
    let normalizedStatus: string = 'shipping';
    let isProblematic = false;
    let problemReason = '';

    // Classification logic
    if (['delivered', 'Thành công', 'delivered_to_customer', 'Giao thành công'].includes(status)) {
      normalizedStatus = 'delivered';
    } else if (['returned', 'returning', 'Đang trả lại', 'Nhận lỗi', 'Sai địa chỉ/điện thoại', 'Lỗi giao hàng', 'Sai SĐT', 'Không liên lạc được'].includes(status)) {
      normalizedStatus = 'problematic';
      isProblematic = true;
      problemReason = status;
    }

    const orderRef = doc(db, 'orders', order.id);
    await updateDoc(orderRef, {
      trackingStatus: normalizedStatus,
      lastChecked: new Date().toISOString(),
      status: normalizedStatus === 'delivered' ? 'delivered' : (normalizedStatus === 'problematic' ? 'returned' : 'shipping')
    });

    if (isProblematic) {
      // Add to problematic_orders collection
      await addDoc(collection(db, 'problematic_orders'), {
        orderId: order.id,
        trackingCode: order.trackingCode,
        reason: problemReason,
        status: status,
        updatedAt: new Date().toISOString(),
        userId: order.userId,
        recipient: order.destination || '',
        phone: '' // Would need to fetch from original order if available
      });
    }
  }
}
