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
  Timestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { ProfitService } from './profitService';

export interface ExtractedItem {
  sku: string;
  color: string;
  quantity: number;
  productName?: string;
  currentStock?: number;
  packagingFee?: number;
  stockStatus?: 'in_stock' | 'out_of_stock' | 'low_stock' | 'checking';
}

export interface ExtractedOrder {
  trackingCode: string;
  items: ExtractedItem[];
  region?: string;
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
    const startTime = Date.now();
    const TIMEOUT_MS = 15000; // 15 seconds timeout

    let timedOut = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      // Check for timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        console.warn(`Extraction timed out after ${TIMEOUT_MS}ms. Returning ${orders.length} partial results.`);
        timedOut = true;
        break; 
      }

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

      // 1.5. Mã vùng (Region): Look for something like "HCM-7", "HN-3", etc.
      const regionPattern = /\b([A-Z]{2,3}-\d{1,3})\b/;
      const regionMatch = pageText.match(regionPattern);
      const region = regionMatch ? regionMatch[1] : undefined;

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
        orders.push({ trackingCode, items: extractedItems, region });
      }
    }

    if (orders.length === 0) {
      if (timedOut) {
        throw new Error('Lỗi kết nối, vui lòng thử lại (Quá thời gian xử lý 15s)');
      }
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

    // Split by comma or semicolon
    const parts = cleanedInfo.split(/[,;]/).map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length === 0) return null;
    
    let sku = '';
    let color = '';
    
    // The last part usually contains the SKU and Variant in Shopee labels
    const lastPart = parts[parts.length - 1];
    
    // 1. Clean dimension patterns (e.g., 31x16x7, 1200ml) and "Size"
    const dimensionPattern = /\b\d+x\d+x\d+\b|\b\d+ml\b/i;
    const sizePattern = /\bSize\b/i;

    // 2. Extract SKU: Look for numeric SKU (3+ digits) or BGN prefix
    // We want to be strict about what counts as an SKU
    const skuMatch = lastPart.match(/\b(BGN\d*|315|330|336|338|\d{3,10})\b/i);
    
    if (skuMatch) {
      const potentialSku = skuMatch[1].trim();
      
      // Check if this potential SKU is actually a dimension or "Size"
      if (dimensionPattern.test(potentialSku) || sizePattern.test(potentialSku)) {
        // If it is garbage, we look for a REAL SKU in the remaining text
        const remainingText = cleanedInfo.replace(potentialSku, '');
        const realSkuMatch = remainingText.match(/\b(BGN\d*|315|330|336|338|\d{3,10})\b/i);
        
        if (realSkuMatch) {
          sku = realSkuMatch[1].trim();
          // Color is the rest of the text, including the garbage we found
          color = cleanedInfo.replace(sku, '').trim();
        } else {
          // If no real SKU found, this might not be a valid product for our inventory
          sku = '';
          color = cleanedInfo;
        }
      } else {
        sku = potentialSku;
        // Color is everything else in the last part or other parts
        color = lastPart.replace(sku, '').trim();
        if (!color && parts.length > 1) {
          color = parts.slice(0, -1).join(', ');
        }
      }
    } else {
      // Fallback: use the first word of the last part if it looks like a code
      const firstWord = lastPart.split(/[\s\-]/)[0].trim();
      if (firstWord.length >= 3 && !dimensionPattern.test(firstWord) && !sizePattern.test(firstWord)) {
        sku = firstWord;
        color = lastPart.substring(sku.length).trim();
      } else {
        // Try other parts
        for (let i = parts.length - 2; i >= 0; i--) {
          const partMatch = parts[i].match(/\b(BGN\d*|315|330|336|338|\d{3,10})\b/i);
          if (partMatch && !dimensionPattern.test(partMatch[1]) && !sizePattern.test(partMatch[1])) {
            sku = partMatch[1].trim();
            color = cleanedInfo.replace(sku, '').trim();
            break;
          }
        }
      }
    }

    // 3. Final cleanup of SKU and Color
    sku = sku.replace(/^[,\-\s]+|[,\-\s]+$/g, '').trim();
    color = color.replace(/^[,\-\s]+|[,\-\s]+$/g, '').trim();
    
    // Remove "SL: X" from color
    color = color.replace(/SL:\s*\d+/i, '').trim();
    
    // If SKU is still a dimension or "Size", move it to color
    if (dimensionPattern.test(sku) || sizePattern.test(sku)) {
      color = `${sku} ${color}`.trim();
      sku = '';
    }

    if (!sku) return null;

    return { sku, color, quantity };
  }

  /**
   * Helper to find a product in inventory based on SKU and Variant
   */
  static async findMatchedProduct(sku: string, color: string, preFetchedProducts?: any[]) {
    let allProducts = preFetchedProducts;
    
    if (!allProducts) {
      try {
        const inventoryRef = collection(db, 'inventory');
        const allProductsSnap = await getDocs(query(
          inventoryRef, 
          where('userId', '==', auth.currentUser?.uid)
        ));
        allProducts = allProductsSnap.docs.map(d => ({ 
          id: d.id, 
          ref: d.ref, 
          ...d.data() as any 
        }));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'inventory');
        return null;
      }
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
  static async checkStockStatus(sku: string, color: string, preFetchedProducts?: any[]): Promise<{ inStock: boolean, currentStock: number, productName?: string, category?: string }> {
    try {
      const matchedProduct = await this.findMatchedProduct(sku, color, preFetchedProducts);
      if (!matchedProduct) return { inStock: false, currentStock: 0 };
      
      return { 
        inStock: matchedProduct.stock > 0, 
        currentStock: matchedProduct.stock,
        productName: matchedProduct.name,
        category: matchedProduct.category
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'inventory');
      return { inStock: false, currentStock: 0 };
    }
  }

  /**
   * Processes an entire order: checks for duplicates, updates inventory for all items, and uploads the label.
   */
  static async processOrder(file: File, order: ExtractedOrder, preFetchedProducts?: any[], preFetchedConfig?: any): Promise<{ productNames: string[] }> {
    const { trackingCode, items } = order;
    console.log(`Processing order: ${trackingCode} with ${items.length} items`);

    try {
      const processedOrderRef = doc(db, 'processed_orders', trackingCode);
      const orderRef = doc(db, 'orders', trackingCode);
      const shippingLabelRef = doc(db, 'shipping_labels', trackingCode);
      const productNames: string[] = [];

      // Use pre-fetched products if available, otherwise fetch once
      let allProducts = preFetchedProducts;
      if (!allProducts) {
        const inventoryRef = collection(db, 'inventory');
        const allProductsSnap = await getDocs(query(
          inventoryRef, 
          where('userId', '==', auth.currentUser?.uid)
        ));
        allProducts = allProductsSnap.docs.map(d => ({ 
          id: d.id, 
          ref: d.ref, 
          ...d.data() as any 
        }));
      }

      // 1. Upload PDF to Storage first to get the URL
      const storageRef = ref(storage, `shipping_labels/${trackingCode}_${Date.now()}.pdf`);
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      // 1.5 Use pre-fetched config if available, otherwise fetch
      let config = preFetchedConfig;
      if (!config) {
        const configSnap = await getDoc(doc(db, 'profit_configs', auth.currentUser?.uid || ''));
        config = configSnap.exists() ? configSnap.data() as any : { packagingCostBottle: 6500, packagingCostCup: 8200 };
      }

      // 2. Perform atomic transaction for the entire order
      await runTransaction(db, async (transaction) => {
        // Check for duplicate order in processed_orders collection
        const tProcessedSnap = await transaction.get(processedOrderRef);
        if (tProcessedSnap.exists()) {
          throw new Error(`Đơn hàng [${trackingCode}] đã được xử lý trước đó, không thể trừ kho thêm lần nữa`);
        }

        const inventoryUpdates: { ref: any, newStock: number, status: string }[] = [];
        const processedItems: any[] = [];

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
            productId: productRef.id,
            category: matchedProduct.category || '',
            costPrice: Number(matchedProduct.costPrice || 0),
            sellingPrice: Number(matchedProduct.sellingPrice || 0)
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

        // Save order record
        const now = new Date();
        const expiryDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
        
        const totalRevenue = processedItems.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
        const totalCost = processedItems.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);
        
        // Calculate packaging fee based on item category
        const packagingFee = processedItems.reduce((sum, item) => {
          const fee = ProfitService.calculatePackagingFee(item.sku, item.productName || '', config);
          return sum + (item.quantity * fee);
        }, 0);

        transaction.set(orderRef, {
          trackingCode,
          processedAt: now.toISOString(),
          expiryDate: expiryDate.toISOString(),
          items: processedItems,
          region: order.region || '',
          userId: auth.currentUser?.uid,
          pdfUrl: downloadURL,
          totalRevenue,
          totalCost,
          packagingFee
        });

        // Mark as processed
        transaction.set(processedOrderRef, {
          trackingCode,
          processedAt: now.toISOString(),
          expiryDate: expiryDate.toISOString(),
          userId: auth.currentUser?.uid
        });

        // Save to shipping_labels for re-print
        transaction.set(shippingLabelRef, {
          trackingCode,
          pdfUrl: downloadURL,
          storagePath: storageRef.fullPath,
          uploadDate: now.toISOString(),
          expiryDate: expiryDate.toISOString(),
          userId: auth.currentUser?.uid,
          region: order.region || '',
          items: processedItems.map(i => `${i.sku} (${i.quantity})`).join(', ')
        });
      });

      return { productNames };
    } catch (error: any) {
      if (error.message.includes('đã được nhập kho')) throw error;
      if (error.message.includes('Không tìm thấy sản phẩm')) throw error;
      handleFirestoreError(error, OperationType.WRITE, 'transaction');
      throw error;
    }
  }

  /**
   * Cleanup expired orders and PDF files (15 days retention)
   */
  static async cleanupExpiredData(userId: string): Promise<number> {
    try {
      const now = new Date().toISOString();
      const labelsRef = collection(db, 'shipping_labels');
      const q = query(
        labelsRef, 
        where('userId', '==', userId),
        where('expiryDate', '<=', now)
      );
      const snapshot = await getDocs(q);
      
      let count = 0;
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        // 1. Delete from Storage
        if (data.storagePath) {
          try {
            const fileRef = ref(storage, data.storagePath);
            await deleteObject(fileRef);
          } catch (e) {
            console.error('Error deleting file from storage:', e);
          }
        }

        // 2. Delete from Firestore shipping_labels
        await deleteDoc(docSnap.ref);

        // 3. Delete from orders and processed_orders (optional but keeps DB clean)
        try {
          await deleteDoc(doc(db, 'orders', data.trackingCode));
          await deleteDoc(doc(db, 'processed_orders', data.trackingCode));
        } catch (e) {
          console.error('Error deleting order records:', e);
        }

        count++;
      }
      return count;
    } catch (error) {
      console.error('Cleanup Error:', error);
      return 0;
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
