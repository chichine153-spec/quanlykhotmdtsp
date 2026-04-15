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
  trackingStatus?: string;
  lastChecked?: string;
  deliveryHistory?: {
    status: string;
    time: string;
    location?: string;
  }[];
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
      if (Array.isArray(order.items)) {
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
      }
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
      if (Array.isArray(order.items)) {
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
      }
    });

    return Object.values(sales)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Calculate restock forecast based on sales history
   * Logic:
   * 1. Get successful orders from last 10 days
   * 2. Filter: stock < 10 AND sold in last 48h >= 1
   * 3. Avg_Daily_Sales = Total sold in 10 days / 10
   * 4. Target_Stock = Avg_Daily_Sales * 15
   * 5. Restock_Qty = Target_Stock - Current_Stock (rounded up to 5/10 if < 5)
   */
  static calculateRestockForecast(orders: OrderRecord[], inventory: Product[], shippingOrders: any[]) {
    if (!Array.isArray(inventory) || !Array.isArray(shippingOrders)) return [];
    
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const tenDaysAgoStr = tenDaysAgo.toISOString();
    const fortyEightHoursAgoStr = fortyEightHoursAgo.toISOString();

    // Create a map of dates for the last 10 days for sparklines
    const last10Days: string[] = [];
    for (let i = 9; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last10Days.push(d.toISOString().split('T')[0]);
    }

    // 1. Get tracking numbers of successful orders in last 10 days
    const successfulTrackingMap = new Map<string, string>(); // Tracking -> CreatedAt
    shippingOrders.forEach(o => {
      const status = (o.status || '').toLowerCase();
      const isSuccess = status.includes('thành công') || status.includes('giao hàng') || status === 'đã giao';
      const isRecent = o.created_at >= tenDaysAgoStr;
      if (isSuccess && isRecent) {
        successfulTrackingMap.set(o.tracking_number, o.created_at);
      }
    });

    // 2. Filter Firestore orders that match these tracking numbers
    const successfulOrders = orders.filter(o => successfulTrackingMap.has(o.trackingCode));

    // Aggregate sales
    const salesMap: Record<string, number> = {};
    const sales48hMap: Record<string, number> = {};
    const dailySalesMap: Record<string, Record<string, number>> = {}; // SKU_Variant -> Date -> Qty

    successfulOrders.forEach(order => {
      if (Array.isArray(order.items)) {
        const orderDate = order.processedAt.split('T')[0];
        const createdAt = successfulTrackingMap.get(order.trackingCode) || order.processedAt;
        const is48h = createdAt >= fortyEightHoursAgoStr;

        order.items.forEach(item => {
          const key = `${item.sku}_${item.variant}`;
          salesMap[key] = (salesMap[key] || 0) + (item.quantity || 0);
          if (is48h) {
            sales48hMap[key] = (sales48hMap[key] || 0) + (item.quantity || 0);
          }
          
          if (!dailySalesMap[key]) dailySalesMap[key] = {};
          dailySalesMap[key][orderDate] = (dailySalesMap[key][orderDate] || 0) + (item.quantity || 0);
        });
      }
    });

    // Calculate forecast for each item in inventory
    const forecast = inventory.map(product => {
      const key = `${product.sku}_${product.variant}`;
      const sold10Days = salesMap[key] || 0;
      const sold48h = sales48hMap[key] || 0;
      
      const avgDailySales = sold10Days / 10;
      const targetStock = avgDailySales * 15;
      let restockQty = Math.max(0, Math.ceil(targetStock - product.stock));
      
      // Rounding logic: Round up to the nearest multiple of 5 to optimize shipping
      if (restockQty > 0) {
        restockQty = Math.ceil(restockQty / 5) * 5;
      }

      // Calculate Days of Inventory (DOI)
      const doi = avgDailySales > 0 ? product.stock / avgDailySales : (product.stock > 0 ? 999 : 0);

      // Prepare sparkline data
      const sparklineData = last10Days.map(date => ({
        date,
        value: dailySalesMap[key]?.[date] || 0
      }));

      // Priority Logic:
      // Nhập gấp (Red flashing): stock < 5 AND ra đơn liên tục (sold48h >= 1)
      // Cần chú ý (Orange): stock 5-9
      let priority = 'An toàn';
      if (product.stock < 5 && sold48h >= 1) {
        priority = 'Nhập gấp';
      } else if (product.stock < 10) {
        priority = 'Cần chú ý';
      }

      return {
        id: product.id,
        productName: product.name,
        sku: product.sku,
        variant: product.variant,
        supplier: product.supplier || 'Chưa xác định',
        sold10Days: sold10Days,
        sold48h: sold48h,
        avgDailySales: avgDailySales,
        currentStock: product.stock,
        expected15Days: targetStock,
        restockQty: restockQty,
        doi: doi,
        sparklineData,
        isUrgent: priority === 'Nhập gấp',
        priority: priority
      };
    });

    // Filter: stock < 10 AND sold in last 48h >= 1
    return forecast
      .filter(item => item.currentStock < 10 && item.sold48h >= 1)
      .sort((a, b) => {
        const priorityScore = { 'Nhập gấp': 3, 'Cần chú ý': 2, 'An toàn': 1 };
        const scoreA = priorityScore[a.priority as keyof typeof priorityScore] || 0;
        const scoreB = priorityScore[b.priority as keyof typeof priorityScore] || 0;
        
        if (scoreA !== scoreB) return scoreB - scoreA;
        return b.sold10Days - a.sold10Days;
      });
  }

  /**
   * Find best selling product in a set of orders (Legacy - kept for compatibility if needed)
   */
  static getBestSeller(orders: OrderRecord[]) {
    const topSellers = this.getTopSellers(orders, 'today', 1);
    return topSellers[0] || null;
  }
}
