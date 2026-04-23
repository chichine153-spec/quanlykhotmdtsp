import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  setDoc,
  serverTimestamp, 
  doc, 
  updateDoc, 
  increment,
  orderBy,
  deleteDoc,
  runTransaction,
  getDoc,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { ReturnRecord } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

import { getSupabase } from '../lib/supabase';

export class ReturnService {
  /**
   * Search for an original order by tracking code
   */
  static async searchOrder(trackingCode: string, userId: string) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('user_id', userId)
          .eq('tracking_code', trackingCode)
          .maybeSingle();
        
        if (error) throw error;
        if (data) {
          return {
            id: data.id,
            trackingCode: data.tracking_code,
            userId: data.user_id,
            platform: data.platform,
            status: data.status,
            total_amount: data.total_amount,
            total_cost: data.total_cost,
            processedAt: data.created_at,
            items: data.items || [] // Assumes items are stored as JSONB in Supabase
          };
        }
      } catch (err) {
        console.error('[ReturnService] Supabase search failed:', err);
      }
    }

    // Try searching in 'orders' first in Firestore
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('userId', '==', userId),
      where('trackingCode', '==', trackingCode)
    );
    
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
      };
    }

    // Fallback to 'shipping_labels' if needed (though orders should have the data)
    const labelsRef = collection(db, 'shipping_labels');
    const q2 = query(
      labelsRef,
      where('userId', '==', userId),
      where('trackingCode', '==', trackingCode)
    );
    const snapshot2 = await getDocs(q2);
    if (!snapshot2.empty) {
      return {
        id: snapshot2.docs[0].id,
        ...snapshot2.docs[0].data()
      };
    }

    return null;
  }

  /**
   * Process a return: Update inventory, save return record, and update order status
   */
  static async processReturn(order: any, userId: string) {
    const returnData = {
      userId,
      trackingCode: order.trackingCode,
      returnedAt: new Date().toISOString(),
      reason: 'Hàng hoàn Shopee',
      items: order.items.map((item: any) => ({
        sku: item.sku,
        variant: item.variant || '',
        quantity: item.quantity,
        productName: item.productName || '',
        productId: item.productId || '',
        sellingPrice: item.sellingPrice || 0,
        costPrice: item.costPrice || 0
      }))
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        // 1. Save return to Supabase
        await supabase
          .from('returns')
          .insert({
            user_id: userId,
            tracking_code: order.trackingCode,
            returned_at: returnData.returnedAt,
            items: returnData.items,
            reason: returnData.reason
          });
        
        // 2. Update order status in Supabase
        await supabase
          .from('orders')
          .update({ status: 'returned' })
          .eq('tracking_code', order.trackingCode);
        
        // 3. Update inventory in Supabase
        for (const item of returnData.items) {
          const { data: p } = await supabase
            .from('products')
            .select('stock_quantity, id')
            .eq('sku', item.sku)
            .eq('variant', item.variant)
            .maybeSingle();
          
          if (p) {
            await supabase
              .from('products')
              .update({ stock_quantity: Number(p.stock_quantity || 0) + item.quantity })
              .eq('id', p.id);
            
            // Log addition
            await supabase.from('inventory_logs').insert({
              user_id: userId,
              sku: item.sku,
              product_name: item.productName,
              variant: item.variant,
              quantity_change: item.quantity,
              type: 'addition',
              details: `Nhập hàng hoàn từ mã ${order.trackingCode}`
            });
          }
        }
      } catch (err) {
        console.error('[ReturnService] Supabase process failed:', err);
      }
    }

    await runTransaction(db, async (transaction) => {
      // 1. ALL READS FIRST
      // Try orderRef by trackingCode ID
      let orderRef = doc(db, 'orders', order.trackingCode);
      let orderSnap = await transaction.get(orderRef);

      // If not found by ID (sometimes it might be a random ID), search via query but in transaction we must use doc refs
      // To keep it simple, we expect order.id to be the doc ID if searchOrder found it
      if (order.id && order.id !== order.trackingCode) {
        orderRef = doc(db, 'orders', order.id);
        orderSnap = await transaction.get(orderRef);
      }

      const productSnaps: Record<string, any> = {};
      for (const item of order.items) {
        if (item.productId && !productSnaps[item.productId]) {
          const productRef = doc(db, 'inventory', item.productId);
          productSnaps[item.productId] = await transaction.get(productRef);
        }
      }

      // 2. ALL WRITES AFTER
      // Add return record
      const returnRef = doc(collection(db, 'returns'));
      transaction.set(returnRef, {
        ...returnData,
        createdAt: serverTimestamp()
      });

      // Update inventory and log for each item
      for (const item of order.items) {
        if (item.productId) {
          const snap = productSnaps[item.productId];
          if (snap && snap.exists()) {
            transaction.update(snap.ref, {
              stock: increment(item.quantity),
              updatedAt: new Date().toISOString()
            });

            // Log the return entry
            const logRef = doc(collection(db, 'inventory_logs'));
            transaction.set(logRef, {
              userId,
              sku: item.sku,
              productName: item.productName || 'Hàng hoàn',
              variant: item.variant || '',
              change: item.quantity,
              type: 'addition',
              trackingCode: order.trackingCode,
              timestamp: serverTimestamp(),
              details: `Nhập hàng hoàn từ mã ${order.trackingCode}`
            });
          }
        }
      }

      // Update order status to "Returned"
      if (orderSnap.exists()) {
        transaction.update(orderRef, {
          status: 'returned',
          returnStatus: 'Đã hoàn về kho',
          updatedAt: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Fetch return history
   */
  static async fetchReturns(userId: string) {
    try {
      const q = query(
        collection(db, 'returns'),
        where('userId', '==', userId),
        orderBy('returnedAt', 'desc'),
        limit(50) // Limit to save quota
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'returns');
      return [];
    }
  }

  /**
   * Delete a return record and revert inventory
   */
  static async deleteReturn(returnId: string, performerId: string) {
    console.log(`[ReturnService] Attempting to delete return: ${returnId} by user: ${performerId}`);
    try {
      await runTransaction(db, async (transaction) => {
        const returnRef = doc(db, 'returns', returnId);
        const returnSnap = await transaction.get(returnRef);
        
        if (!returnSnap.exists()) {
          console.error(`[ReturnService] Return record not found: ${returnId}`);
          throw new Error('Không tìm thấy bản ghi hàng hoàn.');
        }

        const returnData = returnSnap.data() as ReturnRecord;
        const { trackingCode, items } = returnData;
        console.log(`[ReturnService] Found return record for tracking: ${trackingCode}, items: ${items?.length}`);

        // 1. ALL READS FIRST
        const productSnaps: Record<string, any> = {};
        if (items && Array.isArray(items)) {
          for (const item of items) {
            if (item.productId && !productSnaps[item.productId]) {
              const pRef = doc(db, 'inventory', item.productId);
              productSnaps[item.productId] = await transaction.get(pRef);
            }
          }
        }
        const orderRef = doc(db, 'orders', trackingCode);
        const orderSnap = await transaction.get(orderRef);

        // 2. ALL WRITES AFTER
        // Revert inventory stock
        if (items && Array.isArray(items)) {
          for (const item of items) {
            if (item.productId) {
              const snap = productSnaps[item.productId];
              if (snap && snap.exists()) {
                console.log(`[ReturnService] Reverting stock for product ${item.productId}, qty: ${item.quantity}`);
                transaction.update(snap.ref, {
                  stock: increment(-item.quantity)
                });

                // Log the reversion
                const logRef = doc(collection(db, 'inventory_logs'));
                transaction.set(logRef, {
                  userId: performerId,
                  sku: item.sku,
                  productName: item.productName || 'Sản phẩm (Hoàn tác)',
                  variant: item.variant || '',
                  change: -item.quantity,
                  type: 'manual_edit',
                  trackingCode: `REVERT_${trackingCode}`,
                  timestamp: serverTimestamp()
                });
              } else {
                console.warn(`[ReturnService] Product ${item.productId} not found in inventory, skipping stock revert.`);
              }
            }
          }
        }

        // Update order status back if possible
        if (orderSnap.exists()) {
          console.log(`[ReturnService] Updating order ${trackingCode} status back to delivered`);
          transaction.update(orderRef, {
            status: 'delivered',
            returnStatus: null
          });
        } else {
          console.warn(`[ReturnService] Order ${trackingCode} not found, skipping status update.`);
        }

        // Delete the return record
        console.log(`[ReturnService] Deleting return record ${returnId}`);
        transaction.delete(returnRef);
      });
      console.log(`[ReturnService] Successfully deleted return ${returnId}`);
    } catch (error) {
      console.error('[ReturnService] Error deleting return:', error);
      handleFirestoreError(error, OperationType.DELETE, `returns/${returnId}`);
      throw error;
    }
  }

  /**
   * Clears all return records for the current user.
   */
  static async clearAllReturns(userId: string): Promise<{ success: number, failed: number }> {
    try {
      const returnsRef = collection(db, 'returns');
      const q = query(returnsRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);
      
      let success = 0;
      let failed = 0;
      
      for (const docSnap of snapshot.docs) {
        try {
          await this.deleteReturn(docSnap.id, userId);
          success++;
        } catch (err) {
          console.error(`Failed to delete return ${docSnap.id}:`, err);
          failed++;
        }
      }
      return { success, failed };
    } catch (error) {
      console.error('Clear All Returns Error:', error);
      throw error;
    }
  }

  /**
   * Submit a dispute for a returned order
   */
  static async submitDispute(data: {
    userId: string;
    trackingCode: string;
    description: string;
    images: string[];
    orderId?: string;
  }) {
    const disputeRef = doc(collection(db, 'disputes'));
    await setDoc(disputeRef, {
      ...data,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Update order or return record if needed
    if (data.trackingCode) {
      const q = query(collection(db, 'returns'), where('trackingCode', '==', data.trackingCode), limit(1));
      const res = await getDocs(q);
      if (!res.empty) {
        await updateDoc(res.docs[0].ref, {
          hasDispute: true,
          updatedAt: serverTimestamp()
        });
      }
    }
  }
}
