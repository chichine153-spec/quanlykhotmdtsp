import * as pdfjs from 'pdfjs-dist';

// Use a reliable CDN for the worker to avoid local path resolution issues in the AI Studio environment
// This ensures the worker is always accessible with the correct MIME type for ES modules.
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;

import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment,
  query,
  where,
  getDocs,
  runTransaction,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';

export interface ExtractedItem {
  sku: string;
  color: string;
  quantity: number;
  productName?: string;
}

export interface ExtractedOrder {
  trackingCode: string;
  items: ExtractedItem[];
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export class PDFService {
  /**
   * Extracts text from a PDF file and parses it for Shopee order data (supports multiple orders/pages).
   */
  static async extractOrderData(file: File): Promise<ExtractedOrder[]> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const orders: ExtractedOrder[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const items = textContent.items as any[];
      items.sort((a, b) => {
        if (Math.abs(a.transform[5] - b.transform[5]) < 5) {
          return a.transform[4] - b.transform[4];
        }
        return b.transform[5] - a.transform[5];
      });

      let pageText = '';
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        const nextItem = items[j + 1];
        pageText += item.str;
        
        if (nextItem) {
          const isSameLine = Math.abs(item.transform[5] - nextItem.transform[5]) < 5;
          if (isSameLine) {
            const gap = nextItem.transform[4] - (item.transform[4] + (item.width || 0));
            if (gap > 2.5) {
              pageText += ' ';
            }
          } else {
            pageText += '\n';
          }
        }
      }

      // 1. Mã vận đơn: Extremely flexible search
      let trackingCode: string | null = null;
      
      // Try multiple patterns for tracking code
      const trackingPatterns = [
        // Standard keyword search
        /(?:M\s*ã\s*v\s*ậ\s*n\s*đ\s*ơ\s*n|M\s*a\s*v\s*a\s*n\s*d\s*o\s*n)[\s\n:]*([A-Z0-9]{8,20})\b/i,
        // Common Shopee prefixes
        /\b(SPX[A-Z0-9]{10,20})\b/i,
        /\b(GY[A-Z0-9]{10,20})\b/i,
        /\b(VN[0-9]{10,20})\b/i,
        /\b([A-Z]{2}[0-9]{10,20})\b/i,
        // Any long alphanumeric string (10-20 chars) that starts with SPX or GY
        /\b((?:SPX|GY)[A-Z0-9]{8,20})\b/i,
        // Any long alphanumeric string that looks like a code (12-20 chars)
        /\b([A-Z0-9]{12,20})\b/
      ];

      for (const pattern of trackingPatterns) {
        const match = pageText.match(pattern);
        if (match) {
          trackingCode = (match[1] || match[0]).trim();
          if (trackingCode.length >= 8) break;
        }
      }

      if (!trackingCode) {
        console.warn(`Page ${i}: No tracking code detected.`);
        continue; 
      }

      // 2. Mã sản phẩm (SKU), Màu sắc & Số lượng
      const extractedItems: ExtractedItem[] = [];
      
      // Look for the items section
      const contentKeywords = [/N\s*ộ\s*i\s*d\s*u\s*n\s*g\s*h\s*à\s*n\s*g/i, /T\s*ê\s*n\s*s\s*ả\s*n\s*p\s*h\s*ẩ\s*m/i, /S\s*ả\s*n\s*p\s*h\s*ẩ\s*m/i, /C\s*h\s*i\s*t\s*i\s*ế\s*t/i];
      let contentSection = pageText;
      
      for (const kw of contentKeywords) {
        const match = pageText.match(kw);
        if (match) {
          contentSection = pageText.substring(match.index!);
          break;
        }
      }
      
      // Pattern A: Numbered list items (e.g., "1. Product Name, SKU, SL: 1")
      // This is the most reliable pattern for Shopee labels and avoids "Tổng SL"
      const numberedItemPattern = /(\d+)\.\s+([\s\S]*?)\s*(?:S\s*L|S\s*ố\s*l\s*ư\s*ợ\s*n\s*g|S\s*o\s*l\s*u\s*o\s*n\s*g|Q\s*t\s*y)[\s\n:]*(\d+)/gi;
      let match;
      
      while ((match = numberedItemPattern.exec(contentSection)) !== null) {
        const rawInfo = match[2].trim().replace(/\n/g, ' ');
        const quantity = parseInt(match[3], 10);
        if (quantity > 0) {
          const item = this.parseSkuAndColor(rawInfo, quantity);
          if (item) {
            item.productName = rawInfo;
            extractedItems.push(item);
          }
        }
      }

      // Pattern B: Fallback if no numbered items found (less strict, but excludes "Tổng")
      if (extractedItems.length === 0) {
        const fallbackPattern = /(?!\bTổng\b)(?:^|\n)(.*?)\s*(?:S\s*L|S\s*ố\s*l\s*ư\s*ợ\s*n\s*g)[\s\n:]*(\d+)/gi;
        while ((match = fallbackPattern.exec(contentSection)) !== null) {
          const rawInfo = match[1].trim();
          const quantity = parseInt(match[2], 10);
          if (quantity > 0 && !rawInfo.toLowerCase().includes('tổng')) {
            const item = this.parseSkuAndColor(rawInfo, quantity);
            if (item) {
              item.productName = rawInfo;
              extractedItems.push(item);
            }
          }
        }
      }

      // Pattern C: Last resort - look for any SKU-like string followed by a number
      if (extractedItems.length === 0) {
        const fallbackPattern = /\b([A-Z0-9]{3,15})\b.*?\b(\d{1,2})\b/g;
        let fMatch;
        while ((fMatch = fallbackPattern.exec(contentSection)) !== null) {
          const sku = fMatch[1];
          const qty = parseInt(fMatch[2], 10);
          if (sku.length >= 3 && qty > 0 && qty < 50) { // Sanity check
            extractedItems.push({ sku, color: '', quantity: qty });
          }
        }
      }

      if (extractedItems.length > 0) {
        orders.push({ trackingCode, items: extractedItems });
      }
    }

    if (orders.length === 0) {
      throw new Error('Không tìm thấy dữ liệu đơn hàng hợp lệ trong file PDF. Vui lòng kiểm tra xem file có phải là vận đơn Shopee chuẩn không.');
    }

    return orders;
  }

  private static parseSkuAndColor(rawInfo: string, quantity: number): ExtractedItem | null {
    // Remove leading item numbers like "1. " and trailing commas/spaces
    let cleanedInfo = rawInfo.replace(/^\d+[\.\s\]]*/, '').trim();
    cleanedInfo = cleanedInfo.replace(/[,;]\s*$/, '').trim();
    if (!cleanedInfo) return null;

    // Filter out unwanted items (stickers, bags, gifts, etc.)
    const excludedKeywords = ['sticker', 'túi đựng', 'quà tặng', 'phụ kiện', 'quà', 'set', 'túi', 'nắp đạy', 'nắp cốc', 'ống hút', 'nắp đậy', 'sticker nắp đạy', 'nắp đậy ống hút'];
    const lowerInfo = cleanedInfo.toLowerCase();
    if (excludedKeywords.some(kw => lowerInfo.includes(kw))) {
      return null;
    }

    // Split by comma or semicolon - Shopee labels often use commas to separate name, SKU, and variant
    const parts = cleanedInfo.split(/[,;]/).map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length === 0) return null;
    
    let sku = '';
    let color = '';
    
    // Strategy 1: Look for a numeric SKU (3+ digits) anywhere in the last part
    const lastPart = parts[parts.length - 1];
    
    // Try to find the first number that looks like a SKU (3+ digits)
    const skuCandidateMatch = lastPart.match(/\b(\d{3,10})\b/);
    if (skuCandidateMatch) {
      sku = skuCandidateMatch[1];
      // The rest of the string after the SKU is likely the color/variant
      const skuIndex = lastPart.indexOf(sku);
      color = lastPart.substring(skuIndex + sku.length).trim();
      
      // Clean up color (remove leading SL: or other junk)
      color = color.replace(/SL:\s*\d+/i, '').trim();
      color = color.replace(/^[,\-\s]+/, '').trim();
    }

    if (!sku) {
      // If no numeric SKU found, try to extract leading number as SKU (for shorter SKUs)
      const leadingNumberMatch = lastPart.match(/^(\d+)\s*(.*)$/);
      if (leadingNumberMatch) {
        sku = leadingNumberMatch[1];
        color = leadingNumberMatch[2];
      }
    }

    if (!sku) {
      // Check if lastPart looks like "SKU-Variant" or just "SKU"
      const skuMatch = lastPart.match(/^([A-Z0-9]{2,})(?:[\s\-]+(.*))?$/i);
      
      if (skuMatch) {
        sku = skuMatch[1].trim();
        color = skuMatch[2] ? skuMatch[2].trim() : '';
      } else {
        // If lastPart doesn't look like a SKU, maybe the SKU is in the second to last part
        if (parts.length > 1) {
          const secondLastPart = parts[parts.length - 2];
          const secondLastMatch = secondLastPart.match(/^([A-Z0-9]{2,})$/i);
          if (secondLastMatch) {
            sku = secondLastMatch[1];
            color = lastPart;
          } else {
            // Fallback: use the last part as SKU if it's alphanumeric
            sku = lastPart.replace(/[^A-Z0-9]/gi, '');
          }
        } else {
          sku = lastPart.replace(/[^A-Z0-9]/gi, '');
        }
      }
    }

    // Final validation: SKU should not be a common word or too long to be a SKU
    const commonWords = ['COSTA', 'DUNG', 'TICH', 'BINH', 'COC', 'GIU', 'NHIET'];
    if (commonWords.includes(sku.toUpperCase())) {
        // If it's a common word, it's likely part of the name, not the SKU
        // Try to find a better SKU in the string
        const allPossibleSkus = cleanedInfo.match(/\b[A-Z0-9]{3,15}\b/gi);
        if (allPossibleSkus) {
            // Pick the one that looks most like a SKU (e.g., contains numbers)
            const bestSku = allPossibleSkus.find(s => /\d/.test(s)) || allPossibleSkus[allPossibleSkus.length - 1];
            if (bestSku) sku = bestSku;
        }
    }

    // Clean SKU to be alphanumeric only for internal matching
    sku = sku.replace(/[^A-Z0-9]/gi, '');
    if (sku.length < 2) return null;

    // NEW REQUIREMENT: SKU must start with a number
    if (!/^\d/.test(sku)) {
      console.warn(`Skipping SKU [${sku}] because it does not start with a number.`);
      return null;
    }

    return { sku, color, quantity };
  }

  /**
   * Helper to find a product in inventory based on SKU and Variant
   */
  static async findMatchedProduct(sku: string, color: string, preFetchedProducts?: any[]) {
    let allProducts = preFetchedProducts;
    
    if (!allProducts) {
      const inventoryRef = collection(db, 'inventory');
      const allProductsSnap = await getDocs(inventoryRef);
      allProducts = allProductsSnap.docs.map(d => ({ 
        id: d.id, 
        ref: d.ref, 
        ...d.data() as any 
      }));
    }

    const normalize = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normExtractedSku = normalize(sku);
    const normExtractedColor = normalize(color);
    const normExtractedCombined = normalize(sku + color);

    let matchedProduct = allProducts.find(p => {
      return normalize(p.sku) === normExtractedSku && normalize(p.variant) === normExtractedColor;
    });

    if (!matchedProduct) {
      matchedProduct = allProducts.find(p => normalize(p.sku) === normExtractedCombined);
    }

    if (!matchedProduct) {
      const skuMatches = allProducts.filter(p => normalize(p.sku) === normExtractedSku);
      if (skuMatches.length > 0) {
        matchedProduct = skuMatches.find(p => {
          const v = normalize(p.variant);
          return v.includes(normExtractedColor) || normExtractedColor.includes(v);
        }) || skuMatches[0];
      }
    }

    if (!matchedProduct) {
      matchedProduct = allProducts.find(p => {
        const pSku = normalize(p.sku);
        return pSku.includes(normExtractedSku) || normExtractedSku.includes(pSku);
      });
    }

    return matchedProduct;
  }

  /**
   * Checks if a product is in stock
   */
  static async checkStockStatus(sku: string, color: string): Promise<{ inStock: boolean, currentStock: number, productName?: string }> {
    try {
      const matchedProduct = await this.findMatchedProduct(sku, color);
      if (!matchedProduct) return { inStock: false, currentStock: 0 };
      
      return { 
        inStock: matchedProduct.stock > 0, 
        currentStock: matchedProduct.stock,
        productName: matchedProduct.name
      };
    } catch (error) {
      console.error('Check Stock Error:', error);
      return { inStock: false, currentStock: 0 };
    }
  }

  /**
   * Processes an entire order: checks for duplicates, updates inventory for all items, and uploads the label.
   */
  static async processOrder(file: File, order: ExtractedOrder): Promise<{ productNames: string[] }> {
    const { trackingCode, items } = order;
    console.log(`Processing order: ${trackingCode} with ${items.length} items`);

    try {
      const processedOrderRef = doc(db, 'processed_orders', trackingCode);
      const orderRef = doc(db, 'orders', trackingCode);
      const productNames: string[] = [];

      // Fetch all inventory once to perform robust matching in memory
      const inventoryRef = collection(db, 'inventory');
      const allProductsSnap = await getDocs(inventoryRef);
      const allProducts = allProductsSnap.docs.map(d => ({ 
        id: d.id, 
        ref: d.ref, 
        ...d.data() as any 
      }));

      // 1. Perform atomic transaction for the entire order
      await runTransaction(db, async (transaction) => {
        // Check for duplicate order in processed_orders collection
        const tProcessedSnap = await transaction.get(processedOrderRef);
        if (tProcessedSnap.exists()) {
          throw new Error(`Đơn hàng [${trackingCode}] đã được xử lý trước đó, không thể trừ kho thêm lần nữa`);
        }

        const inventoryUpdates: { ref: any, newStock: number, status: string }[] = [];
        const processedItems: any[] = [];
        const logEntries: any[] = [];

        for (const item of items) {
          const { sku, color, quantity } = item;
          
          const matchedProduct = await PDFService.findMatchedProduct(sku, color, allProducts);

          if (!matchedProduct) {
            console.warn(`Skipping item [${sku}] - [${color || 'Mặc định'}] for order ${trackingCode} as it's not in inventory.`);
            continue;
          }

          const productRef = matchedProduct.ref;
          
          // Get latest stock in transaction
          const tProductSnap = await transaction.get(productRef);
          if (!tProductSnap.exists()) {
            console.error(`Product document ${productRef.id} not found in transaction!`);
            continue;
          }
          
          const productDataInTransaction = tProductSnap.data() as any;
          const currentStock = Number(productDataInTransaction?.stock || 0);
          const deductQty = Number(quantity);
          const newStock = currentStock - deductQty;
          const status = newStock > 10 ? 'in_stock' : (newStock > 0 ? 'low_stock' : 'out_of_stock');

          console.log(`[Transaction] Updating ${matchedProduct.sku} (${matchedProduct.variant}): ${currentStock} - ${deductQty} = ${newStock}`);

          inventoryUpdates.push({ ref: productRef, newStock, status });
          productNames.push(matchedProduct.name);
          
          processedItems.push({
            sku: matchedProduct.sku,
            variant: matchedProduct.variant || '',
            quantity,
            productName: matchedProduct.name,
            productId: productRef.id
          });

          // Prepare inventory log
          const logRef = doc(collection(db, 'inventory_logs'));
          logEntries.push({
            ref: logRef,
            data: {
              timestamp: serverTimestamp(),
              trackingCode,
              sku: matchedProduct.sku,
              productName: matchedProduct.name,
              variant: matchedProduct.variant || '',
              change: -deductQty,
              type: 'deduction',
              userId: auth.currentUser?.uid
            }
          });
        }

        if (processedItems.length === 0) {
          throw new Error(`Không tìm thấy bất kỳ sản phẩm nào trong kho khớp với đơn hàng ${trackingCode}. Vui lòng kiểm tra lại mã SKU.`);
        }

        // Apply all updates
        for (const update of inventoryUpdates) {
          transaction.update(update.ref, { 
            stock: update.newStock,
            status: update.status
          });
        }

        // Apply all logs
        for (const log of logEntries) {
          transaction.set(log.ref, log.data);
        }

        // Save order record
        transaction.set(orderRef, {
          trackingCode,
          processedAt: new Date().toISOString(),
          items: processedItems,
          userId: auth.currentUser?.uid
        });

        // Mark as processed
        transaction.set(processedOrderRef, {
          trackingCode,
          processedAt: new Date().toISOString(),
          userId: auth.currentUser?.uid
        });
      });

      // 2. Upload PDF to Storage in background (optional, but good for records)
      // Since we might have multiple orders in one file, we upload the same file for each tracking code
      const storageRef = ref(storage, `shipping_labels/${trackingCode}.pdf`);
      uploadBytes(storageRef, file).catch(err => console.error('Storage Upload Error:', err));

      return { productNames };
    } catch (error: any) {
      if (error.message.includes('đã được nhập kho')) throw error;
      if (error.message.includes('Không tìm thấy sản phẩm')) throw error;
      handleFirestoreError(error, OperationType.WRITE, 'transaction');
      throw error;
    }
  }

  /**
   * Reverts an order: increments stock back for all items and deletes the record.
   */
  static async revertOrder(trackingCode: string): Promise<void> {
    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', trackingCode);
        const orderSnap = await transaction.get(orderRef);
        
        if (!orderSnap.exists()) {
          throw new Error('Không tìm thấy bản ghi đơn hàng.');
        }

        const data = orderSnap.data();
        const items = data.items || [];

        for (const item of items) {
          if (item.productId) {
            const productRef = doc(db, 'inventory', item.productId);
            transaction.update(productRef, {
              stock: increment(item.quantity)
            });

            // Log the revert as an addition
            const logRef = doc(collection(db, 'inventory_logs'));
            transaction.set(logRef, {
              timestamp: serverTimestamp(),
              trackingCode: `REVERT-${trackingCode}`,
              sku: item.sku,
              productName: item.productName,
              variant: item.variant || '',
              change: item.quantity,
              type: 'addition',
              userId: auth.currentUser?.uid
            });
          }
        }

        // Delete order record
        transaction.delete(orderRef);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `revert/${trackingCode}`);
    }
  }
}
