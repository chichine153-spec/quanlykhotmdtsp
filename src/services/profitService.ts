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
   * Calculate platform fee based on SKU and Product Name
   */
  static getPlatformFeePercent(sku: string, productName: string, config: ProfitConfig | null): number {
    const s = String(sku || '').toUpperCase();
    const n = String(productName || '').toLowerCase();
    
    const cupFee = config?.platformFeeCup || 25;
    const bottleFee = config?.platformFeeBottle || 20;
    const defaultFee = config?.platformFeePercent || 12;

    // 1. Check SKU for Cup
    const cupSkus = ['315', '330', '336', '338'];
    if (cupSkus.some(code => s.includes(code))) {
      return cupFee;
    }
    
    // 2. Check SKU for Bottle
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
    
    return defaultFee;
  }

  /**
   * Calculate profit for a single item
   */
  static calculateItemProfit(item: any, config: ProfitConfig | null): number {
    const sellingPrice = item.sellingPrice || 0;
    const costPrice = item.costPrice || 0;
    const quantity = item.quantity || 0;
    const shippingFee = item.shippingFee || 0; // Per item shipping if available
    
    const platformFeePercent = this.getPlatformFeePercent(item.sku, item.productName || '', config);
    const taxPercent = config?.taxPercent || 1.5;
    
    const platformFee = sellingPrice * (platformFeePercent / 100);
    const tax = sellingPrice * (taxPercent / 100);
    
    // Formula: Profit = Selling Price - Cost Price - Shipping Fee - Platform Fee - Tax
    const unitProfit = sellingPrice - costPrice - shippingFee - platformFee - tax;
    
    return unitProfit * quantity;
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
   * Get session bounds based on cutoff hour
   */
  static getSessionBounds(date: Date, cutoffHour: number) {
    const d = new Date(date);
    const currentCutoff = new Date(date);
    currentCutoff.setHours(cutoffHour, 0, 0, 0);
    
    let start: Date;
    let end: Date;
    
    if (d >= currentCutoff) {
      // We are after today's cutoff, so the current session started today at cutoff
      start = currentCutoff;
      end = new Date(currentCutoff.getTime() + 24 * 60 * 60 * 1000);
    } else {
      // We are before today's cutoff, so the current session started yesterday at cutoff
      start = new Date(currentCutoff.getTime() - 24 * 60 * 60 * 1000);
      end = currentCutoff;
    }
    return { start, end };
  }

  /**
   * Calculate profit stats for a given timeframe
   */
  static calculateProfitStats(
    orders: any[], 
    returns: ReturnRecord[], 
    config: ProfitConfig | null,
    timeframe: 'today' | 'week' | 'month',
    targetDate: Date = new Date()
  ) {
    const cutoffHour = config?.cutoffHour ?? 15;
    
    let startDate: Date;
    let endDate: Date = new Date(); // Default to now for filtering

    if (timeframe === 'today') {
      const { start, end } = this.getSessionBounds(targetDate, cutoffHour);
      startDate = start;
      endDate = end;
    } else if (timeframe === 'week') {
      startDate = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = targetDate;
    } else {
      startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      endDate = targetDate;
    }

    // Filter orders for the main session/timeframe
    const filteredOrders = orders.filter(o => {
      const d = new Date(o.processedAt);
      return d >= startDate && d < endDate;
    });

    // For 'today', also calculate pending orders (after cutoff)
    let pendingOrders: any[] = [];
    if (timeframe === 'today') {
      pendingOrders = orders.filter(o => {
        const d = new Date(o.processedAt);
        return d >= endDate;
      });
    }

    const filteredReturns = returns.filter(r => {
      const d = new Date(r.returnedAt);
      return d >= startDate && d < endDate;
    });

    let revenue = filteredOrders.reduce((sum, o) => sum + (o.totalRevenue || 0), 0);
    let costOfGoods = filteredOrders.reduce((sum, o) => sum + (o.totalCost || 0), 0);
    let platformFees = 0;
    let taxFees = 0;

    filteredOrders.forEach(o => {
      if (o.platformFee !== undefined && o.taxFee !== undefined) {
        platformFees += o.platformFee;
        taxFees += o.taxFee;
      } else {
        o.items.forEach((item: any) => {
          const feePercent = this.getPlatformFeePercent(item.sku, item.productName || '', config);
          const taxPercent = config?.taxPercent || 1.5;
          const itemPlatformFee = (item.sellingPrice * (feePercent / 100)) * item.quantity;
          const itemTax = (item.sellingPrice * (taxPercent / 100)) * item.quantity;
          platformFees += itemPlatformFee;
          taxFees += itemTax;
        });
      }
    });
    
    filteredReturns.forEach(ret => {
      const returnRevenue = ret.items.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
      revenue -= returnRevenue;
    });

    const packagingFees = filteredOrders.reduce((sum, o) => {
      if (o.packagingFee !== undefined) return sum + o.packagingFee;
      return sum + (o.items.length * (config?.packagingCostBottle || 0)); 
    }, 0);

    // Marketing Cost Allocation Logic
    const calculateMarketingForPeriod = (start: Date, end: Date) => {
      // If timeframe is week or month, we might just sum up the daily costs
      // But for the session-based "today", we need the proportional split
      
      const getDayMarketing = (date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
        return config?.dailyMarketingCosts?.[dateStr] ?? 0;
      };

      // Simple implementation: find all calendar days in range and sum their proportional costs
      let totalMarketing = 0;
      const current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const dayCost = config?.dailyMarketingCosts?.[dateStr] ?? 0;
        
        if (dayCost > 0) {
          // Find orders for this calendar day to calculate ratio
          const dayOrders = orders.filter(o => o.processedAt.startsWith(dateStr));
          if (dayOrders.length > 0) {
            const ordersInRange = dayOrders.filter(o => {
              const d = new Date(o.processedAt);
              return d >= start && d < end;
            });
            const ratio = ordersInRange.length / dayOrders.length;
            totalMarketing += dayCost * ratio;
          } else {
            // If no orders, fallback to time-based ratio if the day is partially in range
            const dayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 0, 0, 0);
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            
            const overlapStart = Math.max(dayStart.getTime(), start.getTime());
            const overlapEnd = Math.min(dayEnd.getTime(), end.getTime());
            
            if (overlapEnd > overlapStart) {
              const ratio = (overlapEnd - overlapStart) / (24 * 60 * 60 * 1000);
              totalMarketing += dayCost * ratio;
            }
          }
        }
        current.setDate(current.getDate() + 1);
      }
      return totalMarketing;
    };

    const marketingFees = calculateMarketingForPeriod(startDate, endDate);
    const otherFees = config?.otherCosts || 0;

    const totalCosts = costOfGoods + platformFees + taxFees + packagingFees + marketingFees + otherFees;
    const netProfit = revenue - totalCosts;

    const productStats: Record<string, { name: string, variant: string, profit: number, count: number, feePercent: number }> = {};
    filteredOrders.forEach(o => {
      o.items.forEach((item: any) => {
        const key = `${item.sku}_${item.variant}`;
        if (!productStats[key]) {
          productStats[key] = { 
            name: item.productName, 
            variant: item.variant, 
            profit: 0, 
            count: 0,
            feePercent: this.getPlatformFeePercent(item.sku, item.productName || '', config)
          };
        }
        const itemProfit = this.calculateItemProfit(item, config);
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
      taxFees,
      packagingFees,
      marketingFees,
      otherFees,
      totalCosts,
      netProfit,
      topProducts,
      orderCount: filteredOrders.length,
      returnCount: filteredReturns.length,
      pendingStats: timeframe === 'today' ? {
        revenue: pendingOrders.reduce((sum, o) => sum + (o.totalRevenue || 0), 0),
        orderCount: pendingOrders.length
      } : undefined
    };
  }
}
