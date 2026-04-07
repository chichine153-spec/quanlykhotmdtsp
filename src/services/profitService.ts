import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  Timestamp,
  getDocs,
  limit
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { ProfitConfig, ReturnRecord } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export class ProfitService {
  /**
   * Listen to profit configuration
   */
  static listenToConfig(userId: string, callback: (config: ProfitConfig | null) => void) {
    const docRef = doc(db, 'profit_configs', userId);
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data() as ProfitConfig);
      } else {
        callback(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `profit_configs/${userId}`);
    });
  }

  /**
   * Save profit configuration
   */
  static async saveConfig(userId: string, config: ProfitConfig) {
    const docRef = doc(db, 'profit_configs', userId);
    await setDoc(docRef, {
      ...config,
      lastUpdated: new Date().toISOString()
    });
  }

  /**
   * Calculate packaging fee based on SKU and Product Name
   */
  static calculatePackagingFee(sku: string, productName: string, config: ProfitConfig | null): number {
    const s = String(sku || '').toUpperCase();
    const n = String(productName || '').toLowerCase();
    
    // Default values from config or hardcoded as per user request
    const cupFee = config?.packagingCostCup || 8000;
    const bottleFee = config?.packagingCostBottle || 6000;
    const defaultFee = 6000;

    // 1. Check SKU for Cup (8,000)
    // Group: 315, 330, 336, 338
    const cupSkus = ['315', '330', '336', '338'];
    if (cupSkus.some(code => s.includes(code))) {
      return cupFee;
    }
    
    // 2. Check SKU for Bottle (6,000)
    // Group: BGN
    if (s.startsWith('BGN')) {
      return bottleFee;
    }

    // 3. Fallback checks for name
    if (n.includes('cốc') || n.includes('ly') || n.includes('lót sứ') || n.includes('costa')) {
      return cupFee;
    }
    
    if (n.includes('bình')) {
      return bottleFee;
    }
    
    // Default to 6,000
    return defaultFee;
  }

  /**
   * Calculate shipping fee based on category, destination, weight/volume and config
   */
  static calculateShippingFee(category: string, destination: string, weight: number, volume: number, config: ProfitConfig | null): number {
    if (!config?.pricingTiers) return 0;

    let tierKey: keyof NonNullable<ProfitConfig['pricingTiers']> = 'standard';
    const cat = category.toLowerCase();
    if (cat.includes('mỹ phẩm')) tierKey = 'cosmetics';
    else if (cat.includes('linh kiện') || cat.includes('điện tử')) tierKey = 'electronics';
    else if (cat.includes('nặng')) tierKey = 'heavy';

    const tier = config.pricingTiers[tierKey];
    if (!tier) return 0;

    const isHN = destination.toUpperCase().includes('HN') || destination.toLowerCase().includes('hà nội');
    
    const kgPrice = isHN ? tier.kgHN : tier.kgSG;
    const m3Price = isHN ? tier.m3HN : tier.m3SG;

    const feeByWeight = weight * kgPrice;
    const feeByVolume = volume * m3Price;

    // Usually shipping is the max of weight vs volume based price
    return Math.max(feeByWeight, feeByVolume);
  }

  /**
   * Listen to return records
   */
  static listenToReturns(userId: string, callback: (returns: ReturnRecord[]) => void) {
    const q = query(
      collection(db, 'returns'),
      where('userId', '==', userId),
      orderBy('returnedAt', 'desc'),
      limit(100) // Limit to save quota
    );
    return onSnapshot(q, (snapshot) => {
      const returns = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ReturnRecord[];
      callback(returns);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'returns');
    });
  }

  /**
   * Add a return record
   */
  static async addReturn(userId: string, record: Partial<ReturnRecord>) {
    const docRef = doc(collection(db, 'returns'));
    await setDoc(docRef, {
      ...record,
      userId,
      returnedAt: new Date().toISOString()
    });
  }

  /**
   * Calculate profit stats for a given timeframe
   */
  static calculateProfitStats(
    orders: any[], 
    returns: ReturnRecord[], 
    config: ProfitConfig | null,
    timeframe: 'today' | 'week' | 'month'
  ) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate: Date;
    if (timeframe === 'today') {
      startDate = startOfToday;
    } else if (timeframe === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const filteredOrders = orders.filter(o => new Date(o.processedAt) >= startDate);
    const filteredReturns = returns.filter(r => new Date(r.returnedAt) >= startDate);

    let revenue = filteredOrders.reduce((sum, o) => sum + (o.totalRevenue || 0), 0);
    let costOfGoods = filteredOrders.reduce((sum, o) => sum + (o.totalCost || 0), 0);
    
    // Subtract returns from revenue and cost
    filteredReturns.forEach(ret => {
      const returnRevenue = ret.items.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
      revenue -= returnRevenue;
      // Note: We don't necessarily subtract cost if the item is returned to stock, 
      // but the user says "đảm bảo không tính tiền lãi cho đơn lỗi".
      // If profit = revenue - cost, and we subtract revenue, profit decreases.
      // If we also subtract cost, profit stays the same (revenue - cost).
      // Usually, profit = (Revenue - ReturnRevenue) - (Cost - ReturnCost) ...
      // Let's assume we subtract the revenue from the total.
    });

    const platformFees = revenue * ((config?.platformFeePercent || 0) / 100);
    
    // Sum up packaging fees from orders if they have it, otherwise use a default or 0
    const packagingFees = filteredOrders.reduce((sum, o) => {
      if (o.packagingFee !== undefined) return sum + o.packagingFee;
      // Fallback for older orders: use a default if we don't have per-order fee
      return sum + (o.items.length * (config?.packagingCostBottle || 0)); 
    }, 0);

    const marketingFees = config?.marketingCost || 0;
    const otherFees = config?.otherCosts || 0;

    const totalCosts = costOfGoods + platformFees + packagingFees + marketingFees + otherFees;
    const netProfit = revenue - totalCosts;

    // Calculate top products
    const productStats: Record<string, { name: string, variant: string, profit: number, count: number }> = {};
    filteredOrders.forEach(o => {
      o.items.forEach((item: any) => {
        const key = `${item.sku}_${item.variant}`;
        if (!productStats[key]) {
          productStats[key] = { name: item.productName, variant: item.variant, profit: 0, count: 0 };
        }
        const itemProfit = (item.sellingPrice - item.costPrice) * item.quantity;
        productStats[key].profit += itemProfit;
        productStats[key].count += item.quantity;
      });
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    return {
      revenue,
      costOfGoods,
      platformFees,
      packagingFees,
      marketingFees,
      otherFees,
      totalCosts,
      netProfit,
      topProducts,
      orderCount: filteredOrders.length,
      returnCount: filteredReturns.length
    };
  }
}
