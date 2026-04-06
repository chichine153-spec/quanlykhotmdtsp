import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc, 
  increment,
  onSnapshot,
  orderBy,
  deleteDoc,
  runTransaction,
  getDoc,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { ReturnRecord } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export class ReturnService {
  /**
   * Search for an original order by tracking code
   */
  static async searchOrder(trackingCode: string, userId: string) {
    // Try searching in 'orders' first
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
        productId: item.productId || ''
      }))
    };

    await runTransaction(db, async (transaction) => {
      // 1. ALL READS FIRST
      const orderRef = doc(db, 'orders', order.trackingCode);
      const orderSnap = await transaction.get(orderRef);

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

      // Update inventory for each item
      for (const item of order.items) {
        if (item.productId) {
          const snap = productSnaps[item.productId];
          if (snap && snap.exists()) {
            transaction.update(snap.ref, {
              stock: increment(item.quantity)
            });
          }
        }
      }

      // Update order status to "Đã hoàn về kho"
      if (orderSnap.exists()) {
        transaction.update(orderRef, {
          status: 'returned',
          returnStatus: 'Đã hoàn về kho'
        });
      }
    });
  }

  /**
   * Listen to return history
   */
  static listenToReturns(userId: string, callback: (returns: any[]) => void) {
    const q = query(
      collection(db, 'returns'),
      where('userId', '==', userId),
      orderBy('returnedAt', 'desc'),
      limit(50) // Limit to save quota
    );

    return onSnapshot(q, (snapshot) => {
      const returns = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(returns);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'returns');
    });
  }

  /**
   * Delete a return record
   */
  static async deleteReturn(returnId: string) {
    await deleteDoc(doc(db, 'returns', returnId));
  }
}
