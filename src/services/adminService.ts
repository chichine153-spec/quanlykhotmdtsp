import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  updateDoc, 
  getDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { getSupabase } from '../lib/supabase';

export interface ShopStats {
  uid: string;
  email: string;
  role: string;
  planType: string;
  dailyOrderCount: number;
  orderLimit: number;
  status: 'active' | 'inactive';
  paymentStatus: 'none' | 'pending' | 'completed';
  geminiApiKey?: string;
  failoverEnabled: boolean;
  apiStatus: 'active' | 'error' | 'none';
  lastLog?: string;
  errorCount: number;
}

export const AdminService = {
  /**
   * Fetch all shops and their monitor health
   */
  async getAllShops(): Promise<ShopStats[]> {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const shops: ShopStats[] = [];
      
      const supabase = getSupabase();
      
      for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();
        
        // Fetch recent error count from Supabase for this user
        let errorCount = 0;
        let lastLog = '';
        
        if (supabase) {
          const { count, data: logs } = await supabase
            .from('error_logs')
            .select('id, created_at', { count: 'exact' })
            .eq('shop_id', data.uid)
            .order('created_at', { ascending: false })
            .limit(1);
            
          errorCount = count || 0;
          lastLog = logs?.[0]?.created_at || '';
        }

        shops.push({
          uid: data.uid,
          email: data.email,
          role: data.role,
          planType: data.planType || 'free',
          dailyOrderCount: data.dailyOrderCount || 0,
          orderLimit: data.orderLimit || 10,
          status: data.status,
          paymentStatus: data.paymentStatus,
          geminiApiKey: data.geminiApiKey,
          failoverEnabled: data.failoverEnabled || false,
          apiStatus: data.geminiApiKey ? 'active' : 'none', // Simple heuristic
          errorCount,
          lastLog
        });
      }
      
      return shops;
    } catch (error) {
      console.error('[AdminService] Error fetching shops:', error);
      throw error;
    }
  },

  /**
   * Update shop specific limits or status
   */
  async updateShopConfig(uid: string, updates: Partial<ShopStats>) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[AdminService] Error updating shop config:', error);
      throw error;
    }
  },

  /**
   * Fetch global configs
   */
  async getGlobalConfig() {
    try {
      const configDoc = await getDoc(doc(db, 'global_configs', 'settings'));
      return configDoc.exists() ? configDoc.data() : null;
    } catch (error) {
      console.error('[AdminService] Error fetching global config:', error);
      throw error;
    }
  },

  /**
   * Update global system parameters
   */
  async updateGlobalConfig(updates: any) {
    try {
      const configRef = doc(db, 'global_configs', 'settings');
      await updateDoc(configRef, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[AdminService] Error updating global config:', error);
      throw error;
    }
  }
};
