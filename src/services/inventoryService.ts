import { 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot,
  orderBy,
  Timestamp,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { Product } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export interface OrderRecord {
  id: string;
  trackingCode: string;
  processedAt: string;
  expiryDate?: string;
  region?: string;
  destination?: string;
  items: {
    sku: string;
    variant: string;
    quantity: number;
    productName: string;
    productId: string;
  }[];
  userId: string;
  totalRevenue?: number;
  totalCost?: number;
  platformFee?: number;
  taxFee?: number;
  packagingFee?: number;
  pdfUrl?: string;
  productName?: string;
  sku?: string;
  quantity?: number;
}

export class InventoryService {
  /**
   * Listen to all inventory changes
   */
  static listenToInventory(userId: string, callback: (products: Product[]) => void) {
    const q = query(
      collection(db, 'inventory'),
      where('userId', '==', userId)
    );
    return onSnapshot(q, (snapshot) => {
      const products = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      callback(products);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });
  }

  /**
   * Listen to all orders (filtered to last 15 days)
   */
  static listenToOrders(userId: string, callback: (orders: OrderRecord[]) => void) {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const fifteenDaysAgoStr = fifteenDaysAgo.toISOString();

    const q = query(
      collection(db, 'orders'), 
      where('userId', '==', userId),
      where('processedAt', '>=', fifteenDaysAgoStr),
      orderBy('processedAt', 'desc'),
      limit(200) // Limit to save quota
    );
    
    return onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OrderRecord[];
      callback(orders);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    });
  }

  /**
   * Get products with stock below a threshold
   */
  static getLowStockItems(products: Product[], threshold: number = 5) {
    return products.filter(p => p.stock < threshold);
  }

  /**
   * Group orders by date
   */
  static groupOrdersByDate(orders: OrderRecord[]) {
    const groups: Record<string, OrderRecord[]> = {};
    orders.forEach(order => {
      const date = order.processedAt.split('T')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(order);
    });
    return groups;
  }

  /**
   * Calculate sales by category for a specific set of orders
   */
  static getSalesByCategory(orders: OrderRecord[], products: Product[]) {
    const stats: Record<string, number> = {
      'Bình giữ nhiệt': 0,
      'Cốc giữ nhiệt': 0,
      'Khác': 0
    };

    const productMap = new Map(products.map(p => [p.id, p]));

    orders.forEach(order => {
      order.items.forEach(item => {
        const product = productMap.get(item.productId);
        const category = (product?.category || 'Khác').toLowerCase();
        
        if (category.includes('bình')) {
          stats['Bình giữ nhiệt'] += item.quantity;
        } else if (category.includes('cốc')) {
          stats['Cốc giữ nhiệt'] += item.quantity;
        } else {
          stats['Khác'] += item.quantity;
        }
      });
    });

    return stats;
  }

  /**
   * Get top selling products for a specific timeframe
   */
  static getTopSellers(orders: OrderRecord[], timeframe: 'today' | '7days' | '30days', limit: number = 7) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const filteredOrders = orders.filter(order => {
      const orderDate = new Date(order.processedAt);
      if (timeframe === 'today') {
        return order.processedAt.startsWith(todayStr);
      } else if (timeframe === '7days') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        return orderDate >= sevenDaysAgo;
      } else if (timeframe === '30days') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return orderDate >= thirtyDaysAgo;
      }
      return true;
    });

    const sales: Record<string, { 
      count: number, 
      name: string, 
      variant: string, 
      sku: string 
    }> = {};

    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        const key = `${item.sku}_${item.variant}`;
        if (!sales[key]) {
          sales[key] = { 
            count: 0, 
            name: item.productName, 
            variant: item.variant, 
            sku: item.sku 
          };
        }
        sales[key].count += item.quantity;
      });
    });

    return Object.values(sales)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Find best selling product in a set of orders (Legacy - kept for compatibility if needed)
   */
  static getBestSeller(orders: OrderRecord[]) {
    const topSellers = this.getTopSellers(orders, 'today', 1);
    return topSellers[0] || null;
  }
}
