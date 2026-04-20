import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { db } from '../firebase';
import { ReconciliationRecord, Order } from '../types';
import * as XLSX from 'xlsx';

export class ReconciliationService {
  /**
   * Parse carrier report from Excel/CSV
   */
  static async parseCarrierReport(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to 2D array first to find the header row
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          // Find the row that contains common header keywords
          let headerRowIndex = 0;
          const keywords = ['mã vận đơn', 'tracking', 'số tiền', 'chi tiết', 'mã đơn hàng', 'dòng tiền', 'loại giao dịch'];
          
          for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row)) continue;
            const rowString = row.join(' ').toLowerCase();
            
            // A real header row usually matches multiple key terms
            const matchCount = keywords.filter(k => rowString.includes(k)).length;
            if (matchCount >= 3) {
              headerRowIndex = i;
              break;
            }
          }

          // Re-parse from the identified header row
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  }

  /**
   * Matches report data with system orders and saves results
   */
  static async reconcileDualFiles(userId: string, orderData: any[], transactionData: any[]): Promise<{ results: ReconciliationRecord[], saveError: boolean }> {
    const results: ReconciliationRecord[] = [];
    let saveError = false;

    // 1. Map Orders from File A
    // We expect File A to have columns like "Mã đơn hàng", "Tổng số tiền"...
    const ordersMap = new Map<string, any>();
    orderData.forEach(row => {
      const id = (row['Mã đơn hàng'] || row['Order ID'] || row['Order ID #'] || '').toString().trim();
      if (id) ordersMap.set(id, row);
    });

    // 2. Map Transactions from File B
    // We expect File B to have columns like "Mã đơn hàng", "Số tiền"...
    const transactionsMap = new Map<string, any[]>();
    transactionData.forEach(row => {
      const id = (row['Mã đơn hàng'] || row['Order ID'] || row['Chi tiết']?.match(/#\s*([A-Za-z0-9]+)/)?.[1] || '').toString().trim();
      if (id) {
        const existing = transactionsMap.get(id) || [];
        transactionsMap.set(id, [...existing, row]);
      }
    });

    // 3. Process all orders from File A (Detecting MATCHED, DISCREPANCY, LATE_PAYMENT)
    ordersMap.forEach((orderRow, orderId) => {
      const transRows = transactionsMap.get(orderId);
      
      let systemAmount = orderRow['Tổng số tiền'] || orderRow['Giá bán'] || orderRow['Total Amount'] || 0;
      if (typeof systemAmount === 'string') systemAmount = parseFloat(systemAmount.replace(/[^0-9.-]+/g, ""));
      
      // Estimated platform fee (roughly 10% if not specified)
      const estimatedFee = orderRow['Phí sàn dự tính'] || orderRow['Platform Fee'] || (systemAmount * 0.1);
      const expectedNet = systemAmount - estimatedFee;

      if (!transRows || transRows.length === 0) {
        // LATE_PAYMENT: In A but not in B
        results.push({
          id: `recon_late_${orderId}_${Date.now()}`,
          userId,
          trackingCode: orderId,
          carrierAmount: 0,
          systemAmount: expectedNet,
          status: 'late_payment',
          carrier: orderRow['Đơn vị VC'] || 'Shopee',
          reconciledAt: new Date().toISOString()
        });
        return;
      }

      // Calculate total net from B
      let totalReceived = 0;
      transRows.forEach(tr => {
        let amt = tr['Số tiền'] || tr['Dòng tiền'] || tr['Amount'] || 0;
        if (typeof amt === 'string') amt = parseFloat(amt.replace(/[^0-9.-]+/g, ""));
        totalReceived += amt; // Correctly sum positive/negative values
      });

      const discrepancy = Math.abs(expectedNet - totalReceived);
      const status = discrepancy < 1000 ? 'matched' : 'discrepancy';

      results.push({
        id: `recon_${orderId}_${Date.now()}`,
        userId,
        trackingCode: orderId,
        carrierAmount: totalReceived,
        systemAmount: expectedNet,
        status,
        carrier: transRows[0]['Loại giao dịch'] || 'Giao dịch Shopee',
        reconciledAt: new Date().toISOString()
      });
    });

    // 4. Process transactions in B that are NOT in A (Detecting OTHER_TRANSACTION)
    transactionsMap.forEach((transRows, orderId) => {
      if (!ordersMap.has(orderId)) {
        let totalReceived = 0;
        transRows.forEach(tr => {
          let amt = tr['Số tiền'] || tr['Dòng tiền'] || tr['Amount'] || 0;
          if (typeof amt === 'string') amt = parseFloat(amt.replace(/[^0-9.-]+/g, ""));
          totalReceived += amt;
        });

        results.push({
          id: `recon_other_${orderId}_${Date.now()}`,
          userId,
          trackingCode: orderId,
          carrierAmount: totalReceived,
          systemAmount: 0,
          status: 'other_transaction',
          carrier: transRows[0]['Loại giao dịch'] || 'Giao dịch khác',
          reconciledAt: new Date().toISOString()
        });
      }
    });

    // 5. Try to save all records
    for (const record of results) {
      try {
        if (!saveError) {
          const reconDocRef = doc(db, 'reconciliations', record.id);
          await setDoc(reconDocRef, {
            ...record,
            createdAt: serverTimestamp()
          });
        }
      } catch (err: any) {
        saveError = true;
      }
    }

    return { results, saveError };
  }

  /**
   * Matches report data with system orders and saves results
   */
  static async reconcile(userId: string, reportData: any[]): Promise<{ results: ReconciliationRecord[], saveError: boolean }> {
    // 1. Fetch all orders for this user
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const ordersMap = new Map<string, Order>();
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data() as Order;
      // Index by both tracking code and order ID if available
      ordersMap.set(data.trackingCode, data);
      if (data.id) ordersMap.set(data.id, data);
    });

    const results: ReconciliationRecord[] = [];
    let saveError = false;
    
    for (const [index, row] of (reportData as any[]).entries()) {
      // Robust detection of columns
      let tracking = (row['Mã vận đơn'] || row['Waybill Number'] || row['Waybill'] || row['MVD'] || row['Tracking No'] || row['Tracking Number'] || row['Mã đơn hàng'] || '').toString().trim();
      
      // Shopee logic: Extract from "Chi tiết" if tracking is empty
      if (!tracking && row['Chi tiết']) {
        const detail = row['Chi tiết'].toString();
        const match = detail.match(/#\s*([A-Za-z0-9]+)/);
        if (match && match[1]) {
          tracking = match[1];
        }
      }

      let codInput = row['Tiền thu hộ'] || row['COD'] || row['COD Amount'] || row['Số tiền'] || row['Dòng tiền'] || 0;
      
      // Clean COD input (string with commas/dots)
      if (typeof codInput === 'string') {
        codInput = parseFloat(codInput.replace(/[^0-9.-]+/g, ""));
      }
      const cod = Math.abs(parseFloat(codInput)) || 0;

      const carrier = row['Hãng vận chuyển'] || row['Đơn vị VC'] || row['Carrier'] || row['Loại giao dịch'] || 'Chưa xác định';

      if (!tracking) continue;

      const order = ordersMap.get(tracking);
      let status: ReconciliationRecord['status'] = 'discrepancy';
      let systemAmount = 0;

      if (order) {
        systemAmount = order.totalRevenue || 0;
        if (Math.abs(systemAmount - cod) < 100) { 
          status = 'matched';
        }
      }

      const reconRecord: ReconciliationRecord = {
        id: `recon_${tracking}_${Date.now()}_${index}`,
        userId,
        trackingCode: tracking,
        carrierAmount: cod,
        systemAmount,
        status,
        carrier,
        reconciledAt: new Date().toISOString(),
        deliveredAt: order?.deliveredAt || order?.processedAt
      };

      // Attempt save but don't block if quota is exceeded
      try {
        if (!saveError) {
          const reconDocRef = doc(db, 'reconciliations', reconRecord.id);
          await setDoc(reconDocRef, {
            ...reconRecord,
            createdAt: serverTimestamp()
          });
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('Quota') || err.message.includes('permission-denied'))) {
          saveError = true;
          console.warn("Firestore save failed during reconciliation, likely quota exceeded. Continuing in memory.");
        }
      }

      results.push(reconRecord);
    }

    return { results, saveError };
  }

  /**
   * Identifies orders that are DELIVERED but NOT yet reconciled after 7 days
   */
  static async checkLatePayments(userId: string): Promise<Order[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isolimit = sevenDaysAgo.toISOString();

    // 1. Get delivered orders
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('userId', '==', userId), where('status', '==', 'delivered'));
    const snapshot = await getDocs(q);
    
    // 2. Get all reconciled tracking codes for this user
    const reconRef = collection(db, 'reconciliations');
    const reconQ = query(reconRef, where('userId', '==', userId));
    const reconSnap = await getDocs(reconQ);
    const reconciledCodes = new Set<string>();
    reconSnap.forEach(d => reconciledCodes.add(d.data().trackingCode));

    const lateOrders: Order[] = [];
    snapshot.forEach(docSnap => {
      const order = docSnap.data() as Order;
      const deliveryDate = order.deliveredAt || order.processedAt;
      if (deliveryDate && deliveryDate < isolimit && !reconciledCodes.has(order.trackingCode)) {
        lateOrders.push({ ...order, id: docSnap.id });
      }
    });

    return lateOrders;
  }

  /**
   * Fetches reconciliation history
   */
  static async fetchHistory(userId: string): Promise<ReconciliationRecord[]> {
    const reconRef = collection(db, 'reconciliations');
    const q = query(reconRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ReconciliationRecord));
  }
}
