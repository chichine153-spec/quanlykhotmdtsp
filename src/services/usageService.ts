import { db } from '../firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment,
  serverTimestamp
} from 'firebase/firestore';

export interface UsageStats {
  userId: string;
  date: string; // YYYY-MM-DD
  count: number;
}

export class UsageService {
  private static getTodayStr() {
    // Current time in Vietnam (UTC+7)
    const now = new Date();
    const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return vnTime.toISOString().split('T')[0];
  }

  static async getDailyUsage(userId: string): Promise<number> {
    const today = this.getTodayStr();
    const docId = `${userId}_${today}`;
    const docRef = doc(db, 'usage_records', docId);

    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data().count || 0;
      }
      return 0;
    } catch (err) {
      console.error('[UsageService] Error getting usage:', err);
      return 0;
    }
  }

  static async getShopLimit(userId: string): Promise<number> {
    const docRef = doc(db, 'users', userId);
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data().orderLimit || 100;
      }
      return 100;
    } catch (err) {
      console.error('[UsageService] Error getting limit:', err);
      return 100;
    }
  }

  static async incrementUsage(userId: string): Promise<void> {
    const today = this.getTodayStr();
    const docId = `${userId}_${today}`;
    const docRef = doc(db, 'usage_records', docId);

    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        await updateDoc(docRef, {
          count: increment(1)
        });
      } else {
        await setDoc(docRef, {
          userId,
          date: today,
          count: 1,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error('[UsageService] Increment failed:', err);
    }
  }

  static async updateDailyLimit(userId: string, limit: number): Promise<void> {
    const docRef = doc(db, 'users', userId);
    try {
      await updateDoc(docRef, {
        orderLimit: limit
      });
    } catch (err) {
      console.error('[UsageService] Update limit failed:', err);
      throw err;
    }
  }
}
