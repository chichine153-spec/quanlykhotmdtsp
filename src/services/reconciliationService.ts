import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { db } from '../firebase';
import { ReconciliationRecord, Order } from '../types';
import * as XLSX from 'xlsx';

export class ReconciliationService {
  /**
   * Parse carrier report from Excel/CSV
   */
  static async parseCarrierReport(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  }

  /**
   * Matches report data with system orders and saves results
   */
  static async reconcile(userId: string, reportData: any[]): Promise<ReconciliationRecord[]> {
    // 1. Fetch all orders for this user
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const ordersMap = new Map<string, Order>();
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data() as Order;
      ordersMap.set(data.trackingCode, data);
    });

    const results: ReconciliationRecord[] = [];
    
    for (const [index, row] of (reportData as any[]).entries()) {
      // Robust detection of columns
      const tracking = (row['Mã vận đơn'] || row['Waybill Number'] || row['Waybill'] || row['MVD'] || row['Tracking No'] || row['Tracking Number'] || '').toString().trim();
      let codInput = row['Tiền thu hộ'] || row['COD'] || row['COD Amount'] || row['Số tiền'] || 0;
      
      // Clean COD input (string with commas/dots)
      if (typeof codInput === 'string') {
        codInput = parseFloat(codInput.replace(/[^0-9.-]+/g, ""));
      }
      const cod = parseFloat(codInput) || 0;

      const carrier = row['Hãng vận chuyển'] || row['Đơn vị VC'] || row['Carrier'] || 'Chưa xác định';

      if (!tracking) continue;

      const order = ordersMap.get(tracking);
      let status: ReconciliationRecord['status'] = 'discrepancy';
      let systemAmount = 0;

      if (order) {
        systemAmount = order.totalRevenue || 0;
        // Check if amount matches (within small tolerance for platform oddities)
        if (Math.abs(systemAmount - cod) < 100) { 
          status = 'matched';
        }
      } else {
        // We can't match if order isn't in system
        status = 'discrepancy';
      }

      const reconRecord: ReconciliationRecord = {
        id: `recon_${tracking}_${Date.now()}_${index}`,
        userId,
        trackingCode: tracking,
        carrierAmount: cod,
        systemAmount,
        status,
        carrier,
        reconciledAt: new Date().toISOString(),
        deliveredAt: order?.deliveredAt || order?.processedAt
      };

      // Save to Firestore
      const reconDocRef = doc(db, 'reconciliations', reconRecord.id);
      await setDoc(reconDocRef, {
        ...reconRecord,
        createdAt: serverTimestamp()
      });

      results.push(reconRecord);
    }

    return results;
  }

  /**
   * Identifies orders that are DELIVERED but NOT yet reconciled after 7 days
   */
  static async checkLatePayments(userId: string): Promise<Order[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isolimit = sevenDaysAgo.toISOString();

    // 1. Get delivered orders
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('userId', '==', userId), where('status', '==', 'delivered'));
    const snapshot = await getDocs(q);
    
    // 2. Get all reconciled tracking codes for this user
    const reconRef = collection(db, 'reconciliations');
    const reconQ = query(reconRef, where('userId', '==', userId));
    const reconSnap = await getDocs(reconQ);
    const reconciledCodes = new Set<string>();
    reconSnap.forEach(d => reconciledCodes.add(d.data().trackingCode));

    const lateOrders: Order[] = [];
    snapshot.forEach(docSnap => {
      const order = docSnap.data() as Order;
      const deliveryDate = order.deliveredAt || order.processedAt;
      if (deliveryDate && deliveryDate < isolimit && !reconciledCodes.has(order.trackingCode)) {
        lateOrders.push({ ...order, id: docSnap.id });
      }
    });

    return lateOrders;
  }

  /**
   * Fetches reconciliation history
   */
  static async fetchHistory(userId: string): Promise<ReconciliationRecord[]> {
    const reconRef = collection(db, 'reconciliations');
    const q = query(reconRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ReconciliationRecord));
  }
}
