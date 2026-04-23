import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  Timestamp,
  limit,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  runTransaction,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Product, InTransitLog, InventoryLog } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { getSupabase } from '../lib/supabase';

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
  image_url?: string;
  productName?: string;
  sku?: string;
  quantity?: number;
  trackingStatus?: string;
  lastChecked?: string;
  orderId?: string;
  job_id?: string;
  shop_id?: string;
  deliveryHistory?: {
    status: string;
    time: string;
    location?: string;
  }[];
  isSettled?: boolean;
  actualRevenue?: number;
  actual_revenue?: number;
}

export class InventoryService {
  /**
   * Fetch all inventory from Supabase
   */
  static async fetchInventory(userId: string) {
    const supabase = getSupabase();
    if (!supabase) {
      // Fallback to Firebase for now if Supabase not configured
      try {
        const q = query(
          collection(db, 'inventory'),
          where('userId', '==', userId)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'inventory');
        return [];
      }
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      return data.map(p => {
        const stock = Number(p.stock_quantity || 0);
        const status = stock >= 10 ? 'in_stock' : (stock >= 5 ? 'low_stock' : 'out_of_stock');
        
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          costPrice: Number(p.cost_price || 0),
          sellingPrice: Number(p.selling_price || 0),
          stock: stock,
          status: status, // Dynamically derived from Supabase stock_quantity
          variant: p.variant || '',
          weight: p.weight,
          image: p.image_url || 'https://picsum.photos/seed/piti/200/200',
          userId: p.user_id,
          lastUpdated: p.updated_at
        };
      }) as Product[];
    } catch (err) {
      console.error('[InventoryService] Supabase fetch error:', err);
      return [];
    }
  }

  /**
   * Fetch all orders from Supabase (filtered to last 15 days)
   */
  static async fetchOrders(userId: string) {
    const supabase = getSupabase();
    if (!supabase) {
      try {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        const fifteenDaysAgoStr = fifteenDaysAgo.toISOString();

        const q = query(
          collection(db, 'orders'), 
          where('userId', '==', userId),
          where('processedAt', '>=', fifteenDaysAgoStr),
          orderBy('processedAt', 'desc'),
          limit(150)
        );
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as OrderRecord[];
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'orders');
        return [];
      }
    }

    try {
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .gte('processed_at', fifteenDaysAgo.toISOString())
        .order('processed_at', { ascending: false })
        .limit(150);

      if (error) throw error;

      const supabaseOrders = data.map(o => {
        let items = o.items;
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items);
          } catch (e) {
            console.error('[InventoryService] Failed to parse items JSON:', e);
            items = [];
          }
        }
        
        return {
          id: o.tracking_code || o.id,
          trackingCode: o.tracking_code,
          processedAt: o.processed_at,
          platform: o.platform || 'Shopee',
          customerName: o.customer_name,
          items: Array.isArray(items) ? items : [],
          userId: o.user_id,
          totalRevenue: Number(o.total_amount || 0),
          totalCost: Number(o.total_cost || 0),
          platformFee: Number(o.platform_fee || 0),
          taxFee: Number(o.tax_fee || 0),
          packagingFee: Number(o.packaging_fee || 0),
          profit: Number(o.profit || 0),
          image_url: o.image_url,
          status: o.status,
          recipientName: o.customer_name,
          recipientPhone: o.recipient_phone || '',
          recipientAddress: o.recipient_address || '',
          orderId: o.order_id,
          job_id: o.job_id,
          shop_id: o.shop_id
        };
      }) as OrderRecord[];

      // If we have very few orders in Supabase, try to fetch some from Firebase as fallback 
      // to ensure the dashboard isn't empty during transition
      if (supabaseOrders.length < 5) {
        try {
          const fifteenDaysAgoStr = fifteenDaysAgo.toISOString();
          const q = query(
            collection(db, 'orders'), 
            where('userId', '==', userId),
            where('processedAt', '>=', fifteenDaysAgoStr),
            orderBy('processedAt', 'desc'),
            limit(50)
          );
          const snapshot = await getDocs(q);
          const firebaseOrders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as OrderRecord[];
          
          // Merge and de-duplicate by trackingCode
          const orderMap = new Map();
          supabaseOrders.forEach(o => orderMap.set(o.trackingCode, o));
          firebaseOrders.forEach(o => {
            if (!orderMap.has(o.trackingCode)) {
              orderMap.set(o.trackingCode, o);
            }
          });
          
          return Array.from(orderMap.values()).sort((a, b) => 
            new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
          );
        } catch (e) {
          console.warn('[InventoryService] Firebase fallback fetch failed:', e);
        }
      }

      return supabaseOrders;
    } catch (err) {
      console.error('[InventoryService] Supabase orders fetch error:', err);
      return [];
    }
  }

  /**
   * Get products with stock below a threshold
   */
  static getLowStockItems(products: Product[], threshold: number = 5) {
    return products.filter(p => p.stock < threshold);
  }

  /**
   * Fetch problematic orders from Supabase
   */
  static async fetchProblematicOrders(userId: string) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('problematic_orders')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30);
        
        if (error) throw error;
        return data as any[];
      } catch (err) {
        console.error('[InventoryService] Supabase problematic orders fetch error:', err);
      }
    }

    try {
      const q = query(
        collection(db, 'problematic_orders'),
        where('userId', '==', userId),
        orderBy('created_at', 'desc'),
        limit(30)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'problematic_orders');
      return [];
    }
  }
  /**
   * Fetch inventory logs from Supabase
   */
  static async fetchInventoryLogs(userId: string, type?: string) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        let queryBuilder = supabase
          .from('inventory_logs')
          .select('*')
          .eq('user_id', userId);
        
        if (type) {
          queryBuilder = queryBuilder.eq('type', type);
        }

        const { data, error } = await queryBuilder
          .order('timestamp', { ascending: false })
          .limit(50);
        
        if (error) throw error;
        return data.map(log => ({
          id: log.id,
          sku: log.sku,
          productName: log.product_name,
          variant: log.variant,
          change: log.quantity_change,
          type: log.type,
          userId: log.user_id,
          timestamp: log.timestamp,
          details: log.details,
          trackingCode: log.tracking_code || ''
        }));
      } catch (err) {
        console.error('[InventoryService] Supabase inventory logs fetch error:', err);
      }
    }

    try {
      let q = query(
        collection(db, 'inventory_logs'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      
      if (type) {
        q = query(q, where('type', '==', type));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryLog[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'inventory_logs');
      return [];
    }
  }

  /**
   * Perform stock-in: Update inventory and log addition
   */
  static async stockIn(userId: string, productId: string, variantProduct: any, quantity: number) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        // 1. Update product stock in Supabase
        const { data: product, error: pError } = await supabase
          .from('products')
          .select('stock_quantity, id')
          .eq('sku', variantProduct.sku)
          .eq('variant', variantProduct.variant || '')
          .maybeSingle();
        
        if (product) {
          const newStock = Number(product.stock_quantity || 0) + quantity;
          await supabase
            .from('products')
            .update({ stock_quantity: newStock })
            .eq('id', product.id);
          
          // 2. Log to inventory_logs
          await supabase.from('inventory_logs').insert({
            user_id: userId,
            sku: variantProduct.sku,
            product_name: variantProduct.name,
            variant: variantProduct.variant || '',
            quantity_change: quantity,
            type: 'addition',
            details: 'Nhập hàng thủ công'
          });
        }
      } catch (err) {
        console.error('[InventoryService] Supabase stock-in error:', err);
      }
    }

    // Still sync to Firebase for now
    try {
      const productRef = doc(db, 'inventory', productId);
      const logRef = doc(collection(db, 'inventory_logs'));

      await runTransaction(db, async (transaction) => {
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) return;

        const currentStock = productDoc.data().stock || 0;
        const newStock = currentStock + quantity;
        const status = newStock > 10 ? 'in_stock' : (newStock > 0 ? 'low_stock' : 'out_of_stock');

        transaction.update(productRef, { 
          stock: newStock,
          status: status,
          updatedAt: serverTimestamp()
        });

        transaction.set(logRef, {
          timestamp: serverTimestamp(),
          sku: variantProduct.sku,
          productName: variantProduct.name,
          variant: variantProduct.variant || 'Mặc định',
          change: quantity,
          type: 'addition',
          userId: userId,
          details: 'Nhập hàng thủ công'
        });
      });
    } catch (err) {
      console.warn('[InventoryService] Firebase stock-in failed (likely quota or missing product):', err);
    }
  }
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

    // Use SKU for mapping as IDs differ between Firestore and Supabase
    const productMap = new Map(products.map(p => [p.sku, p]));

    orders.forEach(order => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach(item => {
        const product = productMap.get(item.sku);
        const itemCategory = product?.category || 'Khác';
        const category = String(itemCategory).toLowerCase();
        const n = (item.productName || product?.name || '').toLowerCase();
        const quantity = Number(item.quantity || 0);
        
        if (category.includes('bình') || n.includes('bình')) {
          stats['Bình giữ nhiệt'] += quantity;
        } else if (category.includes('cốc') || n.includes('cốc') || n.includes('ly') || n.includes('cup') || n.includes('tumbler')) {
          stats['Cốc giữ nhiệt'] += quantity;
        } else {
          stats['Khác'] += quantity;
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
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach(item => {
        const variant = item.variant || 'Mặc định';
        const key = `${item.sku}_${variant}`;
        if (!sales[key]) {
          sales[key] = { 
            count: 0, 
            name: item.productName || item.sku, 
            variant: variant, 
            sku: item.sku 
          };
        }
        sales[key].count += Number(item.quantity || 0);
      });
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
   * 5. Total_Available = Current_Stock + In_Transit
   * 6. Restock_Qty = Target_Stock - Total_Available (rounded up to 5/10 if < 5)
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
      
      // Fix: Supabase uses tracking_code, not tracking_number
      const tCode = o.tracking_code || o.tracking_number;
      if (isSuccess && isRecent && tCode) {
        successfulTrackingMap.set(tCode, o.created_at);
      }
    });

    // 2. Filter Firestore orders that match these tracking numbers
    const successfulOrders = orders.filter(o => o.trackingCode && successfulTrackingMap.has(o.trackingCode));

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
      const inTransit = product.inTransit || 0;
      
      const avgDailySales = sold10Days / 10;
      const targetStock = avgDailySales * 15;
      const totalAvailable = product.stock + inTransit;
      const restockQty = Math.max(0, Math.ceil(targetStock - totalAvailable));
      
      // Calculate Days of Inventory (DOI)
      const doi = avgDailySales > 0 ? product.stock / avgDailySales : (product.stock > 0 ? 999 : 0);

      // Prepare sparkline data
      const sparklineData = last10Days.map(date => ({
        date,
        value: dailySalesMap[key]?.[date] || 0
      }));

      // Priority Logic:
      // Nhập gấp (Red flashing): stock < 5 AND ra đơn liên tục (sold48h >= 1) AND inTransit <= 20
      // Chờ hàng về (Blue): stock < 5 AND inTransit > 20
      // Cần chú ý (Orange): stock 5-9
      let priority = 'An toàn';
      if (product.stock < 5 && sold48h >= 1) {
        if (inTransit > 20) {
          priority = 'Chờ hàng về';
        } else {
          priority = 'Nhập gấp';
        }
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
        inTransit: inTransit,
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
   * Update in-transit quantity for a product
   */
  static async updateInTransit(productId: string, quantity: number) {
    const productRef = doc(db, 'inventory', productId);
    try {
      await updateDoc(productRef, {
        inTransit: quantity,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory/${productId}`);
    }
  }

  /**
   * Fetch in-transit logs from Supabase
   */
  static async fetchInTransitLogs(userId: string) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('in_transit_logs')
          .select('*')
          .eq('user_id', userId)
          .order('timestamp', { ascending: false })
          .limit(100);
        
        if (error) throw error;
        return data.map(log => ({
          id: log.id,
          productId: log.product_id,
          productName: log.product_name,
          sku: log.sku,
          variant: log.variant,
          quantity: log.quantity,
          expectedArrival: log.expected_arrival || log.timestamp,
          status: log.status,
          userId: log.user_id,
          timestamp: log.timestamp
        }));
      } catch (err) {
        console.error('[InventoryService] Supabase in-transit logs fetch error:', err);
      }
    }

    try {
      const q = query(
        collection(db, 'in_transit_logs'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InTransitLog[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'in_transit_logs');
      return [];
    }
  }

  /**
   * Add a new in-transit log
   */
  static async addInTransitLog(log: Omit<InTransitLog, 'id' | 'timestamp'>) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from('in_transit_logs')
          .insert({
            user_id: log.userId,
            product_id: log.productId,
            sku: log.sku,
            product_name: log.productName,
            variant: log.variant,
            quantity: log.quantity,
            expected_arrival: log.expectedArrival,
            status: log.status
          });
        if (error) throw error;
      } catch (err) {
        console.error('[InventoryService] Supabase in-transit log add error:', err);
      }
    }

    try {
      const logRef = await addDoc(collection(db, 'in_transit_logs'), {
        ...log,
        timestamp: serverTimestamp()
      });
      
      // If status is in_transit, update product's inTransit field
      if (log.status === 'in_transit') {
        const productRef = doc(db, 'inventory', log.productId);
        const productSnap = await getDoc(productRef);
        if (productSnap.exists()) {
          const currentInTransit = productSnap.data().inTransit || 0;
          await updateDoc(productRef, {
            inTransit: currentInTransit + log.quantity
          });
        }
      }
      
      return logRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'in_transit_logs');
    }
  }

  /**
   * Toggle in-transit log status
   */
  static async toggleInTransitStatus(log: any, newStatus: 'in_transit' | 'completed') {
    if (log.status === newStatus) return;

    const supabase = getSupabase();
    if (supabase) {
      try {
        // 1. Update log status
        const { error: logError } = await supabase
          .from('in_transit_logs')
          .update({ status: newStatus })
          .eq('id', log.id);
        
        if (logError) throw logError;

        // 2. Update product stock in Supabase directly
        const { data: product, error: pError } = await supabase
          .from('products')
          .select('stock_quantity, id')
          .eq('sku', log.sku)
          .eq('variant', log.variant)
          .maybeSingle();
        
        if (!pError && product) {
          const currentStock = Number(product.stock_quantity || 0);
          if (newStatus === 'completed') {
            await supabase
              .from('products')
              .update({ stock_quantity: currentStock + log.quantity })
              .eq('id', product.id);
            
            // Log to inventory_logs
            await supabase
              .from('inventory_logs')
              .insert({
                user_id: log.userId,
                sku: log.sku,
                product_name: log.productName,
                variant: log.variant,
                quantity_change: log.quantity,
                type: 'addition',
                details: `Nhập kho từ hàng đang về (Lô: ${log.id})`
              });
          }
        }
      } catch (err) {
        console.error('[InventoryService] Supabase toggle status error:', err);
      }
    }

    const logRef = doc(db, 'in_transit_logs', log.id);
    const productRef = doc(db, 'inventory', log.productId);

    try {
      await runTransaction(db, async (transaction) => {
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) return; // Might be moved to Supabase already

        const productData = productSnap.data();
        const currentStock = productData.stock || 0;
        const currentInTransit = productData.inTransit || 0;

        if (newStatus === 'completed') {
          // Move from in-transit to stock
          transaction.update(productRef, {
            stock: currentStock + log.quantity,
            inTransit: Math.max(0, currentInTransit - log.quantity),
            status: (currentStock + log.quantity) > 10 ? 'in_stock' : ((currentStock + log.quantity) > 0 ? 'low_stock' : 'out_of_stock')
          });
          
          // Log to inventory_logs
          const invLogRef = doc(collection(db, 'inventory_logs'));
          transaction.set(invLogRef, {
            timestamp: serverTimestamp(),
            sku: log.sku,
            productName: log.productName,
            variant: log.variant || '',
            change: log.quantity,
            type: 'addition',
            userId: log.userId,
            details: `Nhập kho từ hàng đang về (Lô: ${log.id})`
          });
        } else {
          // Move back from stock to in-transit (revert)
          transaction.update(productRef, {
            stock: Math.max(0, currentStock - log.quantity),
            inTransit: currentInTransit + log.quantity,
            status: Math.max(0, currentStock - log.quantity) > 10 ? 'in_stock' : (Math.max(0, currentStock - log.quantity) > 0 ? 'low_stock' : 'out_of_stock')
          });
        }

        transaction.update(logRef, { status: newStatus });
      });
    } catch (error) {
      console.warn('[InventoryService] Firebase toggle status failed, likely product already in Supabase:', error);
    }
  }

  /**
   * Find best selling product in a set of orders (Legacy - kept for compatibility if needed)
   */
  static getBestSeller(orders: OrderRecord[]) {
    const topSellers = this.getTopSellers(orders, 'today', 1);
    return topSellers[0] || null;
  }
}
