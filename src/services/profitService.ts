import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  where, 
  orderBy,
  Timestamp,
  getDocs,
  limit
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { ProfitConfig, ReturnRecord } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { getSupabase } from '../lib/supabase';

export class ProfitService {
  /**
   * Fetch profit configuration
   */
  static async fetchConfig(userId: string) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profit_configs')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (error) throw error;
        if (data) {
          return {
            platformFeePercent: Number(data.platform_fee_percent || 12),
            platformFeeCup: Number(data.platform_fee_cup || 25),
            platformFeeBottle: Number(data.platform_fee_bottle || 20),
            taxPercent: Number(data.tax_percent || 1.5),
            packagingCostBottle: Number(data.packaging_cost_bottle || 6000),
            packagingCostCup: Number(data.packaging_cost_cup || 8000),
            marketingCost: Number(data.marketing_cost || 0),
            otherCosts: Number(data.other_costs || 0),
            cutoffHour: Number(data.cutoff_hour ?? 15),
            dailyMarketingCosts: data.daily_marketing_costs || {},
            lastUpdated: data.updated_at
          } as ProfitConfig;
        }
      } catch (err) {
        console.error('[ProfitService] Supabase config fetch error:', err);
      }
    }

    try {
      const docRef = doc(db, 'profit_configs', userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as ProfitConfig;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `profit_configs/${userId}`);
      return null;
    }
  }

  /**
   * Save profit configuration
   */
  static async saveConfig(userId: string, config: ProfitConfig) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from('profit_configs')
          .upsert({
            user_id: userId,
            platform_fee_percent: config.platformFeePercent,
            platform_fee_cup: config.platformFeeCup,
            platform_fee_bottle: config.platformFeeBottle,
            tax_percent: config.taxPercent,
            packaging_cost_bottle: config.packagingCostBottle,
            packaging_cost_cup: config.packagingCostCup,
            marketing_cost: config.marketingCost,
            other_costs: config.otherCosts,
            cutoff_hour: config.cutoffHour,
            daily_marketing_costs: config.dailyMarketingCosts,
            updated_at: new Date().toISOString()
          });
        if (error) throw error;
      } catch (err) {
        console.error('[ProfitService] Supabase config save error:', err);
      }
    }

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
    const shippingFee = item.shippingFee || 0;
    const packagingFee = (item.packagingFee || 0) / (item.quantity || 1);
    
    const feePercent = this.getPlatformFeePercent(item.sku, item.productName || '', config);
    const taxPercent = config?.taxPercent || 1.5;
    
    const platformFee = sellingPrice * (feePercent / 100);
    const tax = sellingPrice * (taxPercent / 100);
    
    // Formula: Profit = Selling Price - Cost Price - Shipping Fee - Platform Fee - Tax - Packaging Fee
    const unitProfit = sellingPrice - costPrice - shippingFee - platformFee - tax - packagingFee;
    
    return unitProfit * quantity;
  }

  /**
   * Fetch return records
   */
  static async fetchReturns(userId: string) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('returns')
          .select('*')
          .eq('user_id', userId)
          .order('returned_at', { ascending: false })
          .limit(100);
        
        if (error) throw error;
        return data.map(r => ({
          id: r.id,
          trackingCode: r.tracking_code,
          reason: r.reason,
          items: r.items,
          returnedAt: r.returned_at,
          userId: r.user_id
        })) as ReturnRecord[];
      } catch (err) {
        console.error('[ProfitService] Supabase returns fetch error:', err);
      }
    }

    try {
      const q = query(
        collection(db, 'returns'),
        where('userId', '==', userId),
        orderBy('returnedAt', 'desc'),
        limit(100)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ReturnRecord[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'returns');
      return [];
    }
  }

  /**
   * Add a return record
   */
  static async addReturn(userId: string, record: Partial<ReturnRecord>) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from('returns')
          .insert({
            user_id: userId,
            tracking_code: record.trackingCode,
            reason: record.reason,
            items: record.items,
            returned_at: record.returnedAt || new Date().toISOString()
          });
        if (error) throw error;
      } catch (err) {
        console.error('[ProfitService] Supabase return add error:', err);
      }
    }

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

    // Filter orders for the main session/timeframe with robust date parsing
    const filteredOrders = orders.filter(o => {
      if (!o.processedAt) return false;
      // Handle potential space instead of T in date string
      const d = new Date(o.processedAt.includes(' ') && !o.processedAt.includes('T') 
        ? o.processedAt.replace(' ', 'T') 
        : o.processedAt);
      return !isNaN(d.getTime()) && d >= startDate && d < endDate;
    });

    // For 'today', also calculate pending orders (after cutoff)
    let pendingOrders: any[] = [];
    if (timeframe === 'today') {
      pendingOrders = orders.filter(o => {
        if (!o.processedAt) return false;
        const d = new Date(o.processedAt.includes(' ') && !o.processedAt.includes('T') 
          ? o.processedAt.replace(' ', 'T') 
          : o.processedAt);
        return !isNaN(d.getTime()) && d >= endDate;
      });
    }

    const filteredReturns = returns.filter(r => {
      const d = new Date(r.returnedAt);
      return d >= startDate && d < endDate;
    });

    // Helper to safely parse numbers and strip common currency formats
    const safeNum = (val: any) => {
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      if (!val) return 0;
      // Clean string: keep only digits, minus, and dot for decimals
      let cleaned = String(val).replace(/[^\d.-]/g, '');
      // To be safe for VND: if no cents are expected, remove all dots/commas.
      if (cleaned.includes('.') && cleaned.split('.').pop()?.length !== 2) {
        cleaned = cleaned.replace(/\./g, '');
      }
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    let revenue = filteredOrders.reduce((sum, o) => sum + safeNum(o.totalRevenue), 0);
    let costOfGoods = filteredOrders.reduce((sum, o) => sum + safeNum(o.totalCost), 0);
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
      const returnRevenue = ret.items.reduce((sum, item) => sum + ((item.sellingPrice || 0) * (item.quantity || 0)), 0);
      const returnCost = ret.items.reduce((sum, item) => sum + ((item.costPrice || 0) * (item.quantity || 0)), 0);
      
      revenue -= returnRevenue;
      costOfGoods -= returnCost;

      // Adjust fees if possible (assuming similar fee structure)
      ret.items.forEach(item => {
        const feePercent = this.getPlatformFeePercent(item.sku, item.productName || '', config);
        const taxPercent = config?.taxPercent || 1.5;
        platformFees -= (item.sellingPrice * (feePercent / 100)) * item.quantity;
        taxFees -= (item.sellingPrice * (taxPercent / 100)) * item.quantity;
      });
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
      const items = Array.isArray(o.items) ? o.items : [];
      items.forEach((item: any) => {
        const variant = item.variant || item.color || 'Default';
        const key = `${item.sku}_${variant}`;
        
        if (!productStats[key]) {
          const feePercent = this.getPlatformFeePercent(item.sku, item.productName || item.name || '', config);
          productStats[key] = { 
            name: item.productName || item.name || item.sku, 
            variant, 
            profit: 0, 
            count: 0, 
            feePercent 
          };
        }
        
        const itemProfit = this.calculateItemProfit({ ...item, productName: item.productName || item.name }, config);
        productStats[key].profit += itemProfit;
        productStats[key].count += safeNum(item.quantity);
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
