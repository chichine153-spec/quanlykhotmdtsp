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

import { GeminiService } from './gemini';
import { Type } from "@google/genai";

import { getSupabase } from '../lib/supabase';

export interface ExtractedItem {
  sku: string;
  color: string;
  quantity: number;
  productName?: string;
  currentStock?: number;
  packagingFee?: number;
  costPrice?: number;
  sellingPrice?: number;
  stockStatus?: 'in_stock' | 'out_of_stock' | 'low_stock' | 'checking';
}

export interface ExtractedOrder {
  trackingCode: string;
  items: ExtractedItem[];
  region?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  rawText?: string;
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
   * Extracts text from a PDF file or URL and parses it for Shopee order data.
   */
  static async extractOrderData(input: File | string): Promise<ExtractedOrder[]> {
    let arrayBuffer: ArrayBuffer;
    
    if (typeof input === 'string') {
      console.log(`[PDFService] Fetching PDF from URL: ${input}`);
      try {
        const response = await fetch(input);
        if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);
        arrayBuffer = await response.arrayBuffer();
      } catch (error) {
        console.error('[PDFService] URL fetch error (CORS?):', error);
        throw new Error('Không thể tải file PDF từ máy chủ (Lỗi CORS hoặc kết nối). Vui lòng thử tải lại trang.');
      }
    } else {
      arrayBuffer = await input.arrayBuffer();
    }

    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    const startTime = Date.now();
    const TIMEOUT_MS = 60000;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];
      
      // Sort items by position
      items.sort((a, b) => {
        if (Math.abs(a.transform[5] - b.transform[5]) < 5) {
          return a.transform[4] - b.transform[4];
        }
        return b.transform[5] - a.transform[5];
      });

      let pageText = `--- TRANG ${i} ---\n`;
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        const nextItem = items[j + 1];
        pageText += item.str;
        
        if (nextItem) {
          const isSameLine = Math.abs(item.transform[5] - nextItem.transform[5]) < 5;
          if (isSameLine) {
            const gap = nextItem.transform[4] - (item.transform[4] + (item.width || 0));
            if (gap > 2.5) pageText += ' ';
          } else {
            pageText += '\n';
          }
        }
      }
      fullText += pageText + '\n';
    }

    // Gửi dữ liệu thô sang Gemini bóc tách
    try {
      const extractedOrders = await this.parseWithGemini(fullText);
      // Attach raw text to each order for Supabase storage
      return extractedOrders.map(order => ({
        ...order,
        rawText: fullText
      }));
    } catch (error: any) {
      console.error('[PDFService] Gemini Parsing Error:', error);
      if (error.message === 'MISSING_API_KEY') {
        throw new Error('Lỗi kết nối AI - VUI LÒNG KIỂM TRA LẠI API KEY');
      }
      throw new Error(`Lỗi kết nối AI - Vui lòng kiểm tra lại API Key (${error.message})`);
    }
  }

  private static async parseWithGemini(text: string): Promise<ExtractedOrder[]> {
    const ai = GeminiService.getInstance();
    if (!ai) throw new Error('MISSING_API_KEY');

    const prompt = `DƯỚI ĐÂY LÀ NỘI DUNG VĂN BẢN TRÍCH XUẤT TỪ FILE VẬN ĐƠN HOẶC HÓA ĐƠN (PDF):
    ---
    ${text}
    ---
    NHIỆM VỤ: Trích xuất danh sách các đơn hàng hoặc sản phẩm nhập kho.
    
    YÊU CẦU:
    1. Trích xuất Mã vận đơn (Tracking Code) hoặc Mã hóa đơn.
    2. Trích xuất Mã SKU, Màu sắc/Phân loại và Số lượng cho từng sản phẩm.
    3. Trích xuất Giá nhập (Cost Price) và Giá bán (Selling Price) nếu có trong văn bản.
       - Giá nhập thường đi kèm từ khóa: 'Giá nhập', 'Chi phí', 'Cost', 'Unit Price'.
       - Giá bán thường đi kèm từ khóa: 'Giá bán niêm yết', 'Price', 'Selling Price'.
    4. Trích xuất Mã vùng (Region) nếu có.
    5. Trích xuất Thông tin người nhận nếu là vận đơn.
    6. Trả về kết quả dưới dạng mảng JSON các đối tượng ExtractedOrder.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              trackingCode: { type: Type.STRING },
              region: { type: Type.STRING },
              recipientName: { type: Type.STRING },
              recipientPhone: { type: Type.STRING },
              recipientAddress: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sku: { type: Type.STRING },
                    color: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    costPrice: { type: Type.NUMBER },
                    sellingPrice: { type: Type.NUMBER }
                  },
                  required: ["sku", "quantity"]
                }
              }
            },
            required: ["trackingCode", "items"]
          }
        }
      }
    });

    const result = JSON.parse(response.text || "[]");
    return result as ExtractedOrder[];
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
    
    if (!allProducts || allProducts.length === 0) {
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

    const removeAccents = (str: string) => {
      return str.normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D');
    };

    const normalize = (s: any) => {
      const str = String(s || '');
      return removeAccents(str).toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const normExtractedSku = normalize(sku);
    const normExtractedColor = normalize(color);
    const normExtractedCombined = normalize(sku + color);

    console.log(`[PDFService] Normalizing for match: SKU="${sku}"->"${normExtractedSku}", Color="${color}"->"${normExtractedColor}"`);

    // 1. Exact match (normalized)
    let matchedProduct = allProducts.find(p => {
      return normalize(p.sku) === normExtractedSku && normalize(p.variant) === normExtractedColor;
    });

    // 2. Combined match (SKU+Variant in one field)
    if (!matchedProduct) {
      matchedProduct = allProducts.find(p => normalize(p.sku) === normExtractedCombined);
    }

    // 3. SKU match + partial variant match
    if (!matchedProduct) {
      const skuMatches = allProducts.filter(p => normalize(p.sku) === normExtractedSku);
      if (skuMatches.length > 0) {
        matchedProduct = skuMatches.find(p => {
          const v = normalize(p.variant);
          return v.includes(normExtractedColor) || normExtractedColor.includes(v);
        }) || skuMatches[0];
      }
    }

    // 4. Partial SKU match
    if (!matchedProduct) {
      matchedProduct = allProducts.find(p => {
        const pSku = normalize(p.sku);
        return pSku.includes(normExtractedSku) || normExtractedSku.includes(pSku);
      });
    }

    if (matchedProduct && !matchedProduct.ref && matchedProduct.id) {
      matchedProduct.ref = doc(db, 'inventory', matchedProduct.id);
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
  static async processOrder(file: File, order: ExtractedOrder, preFetchedProducts?: any[], preFetchedConfig?: any, preUploadedUrl?: string): Promise<{ productNames: string[] }> {
    const { trackingCode, items } = order;
    console.log(`[PDFService] Processing order: ${trackingCode} with ${items.length} items`);

    if (!db) {
      console.error('[PDFService] CRITICAL: Firestore database instance is undefined in processOrder');
      throw new Error('Hệ thống cơ sở dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.');
    }

    try {
      const processedOrderRef = doc(db, 'processed_orders', trackingCode);
      const orderRef = doc(db, 'orders', trackingCode);
      const shippingLabelRef = doc(db, 'shipping_labels', trackingCode);
      const inventoryLogsRef = collection(db, 'inventory_logs');
      const productNames: string[] = [];

      // Use pre-fetched products if available, otherwise fetch once
      let allProducts = preFetchedProducts;
      if (!allProducts || allProducts.length === 0) {
        console.log('[PDFService] No pre-fetched products, fetching from Firestore...');
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
      console.log(`[PDFService] Total products in inventory for matching: ${allProducts.length}`);

      // 1. Skip PDF Upload to Storage to avoid CORS errors
      let downloadURL = preUploadedUrl || '';

      // 1.5 Use pre-fetched config if available, otherwise fetch
      let config = preFetchedConfig;
      if (!config) {
        const configSnap = await getDoc(doc(db, 'profit_configs', auth.currentUser?.uid || ''));
        config = configSnap.exists() ? configSnap.data() as any : { packagingCostBottle: 6500, packagingCostCup: 8200 };
      }

      // 2. Perform atomic transaction for the entire order
      console.log(`[PDFService] Starting transaction for order ${trackingCode}...`);
      await runTransaction(db, async (transaction) => {
        // Check for duplicate order in processed_orders collection
        const tProcessedSnap = await transaction.get(processedOrderRef);
        if (tProcessedSnap.exists()) {
          console.warn(`[PDFService] Order ${trackingCode} already processed.`);
          throw new Error(`Đơn hàng [${trackingCode}] đã được xử lý trước đó, không thể trừ kho thêm lần nữa`);
        }

        const inventoryUpdates: { ref: any, newStock: number, status: string, log: any }[] = [];
        const processedItems: any[] = [];

        for (const item of items) {
          const { sku, color, quantity, costPrice: extCost, sellingPrice: extSell } = item;
          console.log(`[PDFService] Matching item: SKU=${sku}, Color=${color}, Qty=${quantity}`);
          
          const matchedProduct = await PDFService.findMatchedProduct(sku, color, allProducts);

          if (!matchedProduct) {
            console.log(`[PDFService] NEW SKU FOUND: ${sku} (${color}). Creating new inventory entry...`);
            
            const newProductRef = doc(collection(db, 'inventory'));
            const initialStock = Number(quantity);
            const status = initialStock > 10 ? 'in_stock' : (initialStock > 0 ? 'low_stock' : 'out_of_stock');
            
            const newProductData = {
              userId: auth.currentUser?.uid,
              sku: sku,
              variant: color || 'Mặc định',
              name: `Sản phẩm mới (${sku})`,
              stock: initialStock,
              status: status,
              costPrice: Number(extCost || 0),
              sellingPrice: Number(extSell || 0),
              category: 'General',
              image: 'https://picsum.photos/seed/new/200/200',
              createdAt: new Date().toISOString()
            };

            transaction.set(newProductRef, newProductData);
            
            // Log the new product creation
            const newLogRef = doc(inventoryLogsRef);
            transaction.set(newLogRef, {
              userId: auth.currentUser?.uid,
              sku: sku,
              productName: newProductData.name,
              variant: newProductData.variant,
              change: initialStock,
              type: 'addition',
              trackingCode: trackingCode,
              timestamp: Timestamp.now(),
              details: 'Tạo mới từ PDF'
            });

            productNames.push(newProductData.name);
            processedItems.push({
              sku: sku,
              variant: color || 'Mặc định',
              quantity,
              productName: newProductData.name,
              productId: newProductRef.id,
              category: 'General',
              costPrice: Number(extCost || 0),
              sellingPrice: Number(extSell || 0)
            });

            continue;
          }

          console.log(`[PDFService] MATCH FOUND: ${matchedProduct.sku} (${matchedProduct.variant}) - ID: ${matchedProduct.id}`);

          const productRef = matchedProduct.ref || doc(db, 'inventory', matchedProduct.id);
          
          // Get latest stock in transaction
          const tProductSnap = await transaction.get(productRef);
          if (!tProductSnap.exists()) {
            console.error(`[PDFService] Product document ${productRef.id} not found in transaction!`);
            continue;
          }
          
          const productDataInTransaction = tProductSnap.data() as any;
          const currentStock = Number(productDataInTransaction?.stock || 0);
          const deductQty = Number(quantity);
          const newStock = currentStock - deductQty;
          const status = newStock > 10 ? 'in_stock' : (newStock > 0 ? 'low_stock' : 'out_of_stock');

          console.log(`[PDFService] Transaction Update: ${matchedProduct.sku} | Stock: ${currentStock} -> ${newStock}`);

          const updateData: any = {
            stock: newStock,
            status: status,
            updatedAt: new Date().toISOString()
          };

          // Update prices if provided in PDF
          if (extCost) updateData.costPrice = Number(extCost);
          if (extSell) updateData.sellingPrice = Number(extSell);

          transaction.update(productRef, updateData);
          
          // Create log
          const newLogRef = doc(inventoryLogsRef);
          transaction.set(newLogRef, {
            userId: auth.currentUser?.uid,
            sku: matchedProduct.sku,
            productName: matchedProduct.name,
            variant: matchedProduct.variant || '',
            change: -deductQty,
            type: 'deduction',
            trackingCode: trackingCode,
            timestamp: Timestamp.now(),
            details: (extCost || extSell) ? 'Cập nhật giá từ PDF' : ''
          });

          productNames.push(matchedProduct.name);
          
          processedItems.push({
            sku: matchedProduct.sku,
            variant: matchedProduct.variant || '',
            quantity,
            productName: matchedProduct.name,
            productId: productRef.id,
            category: matchedProduct.category || '',
            costPrice: Number(extCost || matchedProduct.costPrice || 0),
            sellingPrice: Number(extSell || matchedProduct.sellingPrice || 0)
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

        // Infer destination from region
        let destination = 'Chưa xác định';
        const region = order.region || '';
        if (region.toUpperCase().startsWith('HN')) destination = 'Hà Nội';
        else if (region.toUpperCase().startsWith('SG') || region.toUpperCase().startsWith('HCM')) destination = 'Hồ Chí Minh';

        transaction.set(orderRef, {
          trackingCode,
          processedAt: now.toISOString(),
          expiryDate: expiryDate.toISOString(),
          items: processedItems,
          region: region,
          destination,
          userId: auth.currentUser?.uid,
          pdfUrl: downloadURL || '',
          totalRevenue,
          totalCost,
          packagingFee,
          recipientName: order.recipientName || '',
          recipientPhone: order.recipientPhone || '',
          recipientAddress: order.recipientAddress || ''
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
          pdfUrl: downloadURL || '',
          uploadDate: now.toISOString(),
          expiryDate: expiryDate.toISOString(),
          userId: auth.currentUser?.uid,
          region: order.region || '',
          items: processedItems.map(i => `${i.sku} (${i.quantity})`).join(', ')
        });
      });

      // 3. Save to Supabase as requested by user
      try {
        const supabase = getSupabase();
        if (supabase) {
          const supabaseData = order.items.map(item => ({
            tracking_number: trackingCode,
            product_name: `${item.sku} ${item.color || ''}`.trim(),
            quantity: item.quantity,
            raw_pdf_content: order.rawText || '',
            user_id: auth.currentUser?.uid,
            created_at: new Date().toISOString()
          }));

          const { error: supabaseError } = await supabase
            .from('orders')
            .insert(supabaseData);

          if (supabaseError) {
            console.error('[PDFService] Supabase insertion error:', supabaseError);
          } else {
            console.log('[PDFService] Order successfully saved to Supabase.');
          }
        }
      } catch (err) {
        console.error('[PDFService] Supabase fatal error:', err);
      }

      console.log(`[PDFService] Order ${trackingCode} processed successfully.`);
      return { productNames };
    } catch (error: any) {
      console.error(`[PDFService] Error processing order ${trackingCode}:`, error);
      if (error.message.includes('đã được xử lý')) throw error;
      if (error.message.includes('Không tìm thấy bất kỳ sản phẩm nào')) throw error;
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
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) {
        throw new Error('Bạn cần đăng nhập để thực hiện thao tác này.');
      }

      // Find any associated returns first (cannot query inside transaction)
      const returnsRef = collection(db, 'returns');
      const q = query(returnsRef, where('trackingCode', '==', trackingCode), where('userId', '==', currentUserId));
      const returnSnapshot = await getDocs(q);
      const returnRefs = returnSnapshot.docs.map(d => d.ref);

      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', trackingCode);
        const processedOrderRef = doc(db, 'processed_orders', trackingCode);
        const shippingLabelRef = doc(db, 'shipping_labels', trackingCode);
        const inventoryLogsRef = collection(db, 'inventory_logs');
        
        const orderSnap = await transaction.get(orderRef);
        
        if (!orderSnap.exists()) {
          // If order record is missing, we still try to delete other records if they exist
          // But we need the items to revert stock. If order is missing, we can't revert stock.
          // However, we should still delete the other records to be "clean".
          transaction.delete(orderRef);
          transaction.delete(processedOrderRef);
          transaction.delete(shippingLabelRef);
          return;
        }

        const data = orderSnap.data();
        const items = data.items || [];

        for (const item of items) {
          if (item.productId) {
            const productRef = doc(db, 'inventory', item.productId);
            const productSnap = await transaction.get(productRef);
            
            if (productSnap.exists()) {
              transaction.update(productRef, {
                stock: increment(item.quantity)
              });

              // Add log for reversion
              const newLogRef = doc(inventoryLogsRef);
              transaction.set(newLogRef, {
                userId: currentUserId,
                sku: item.sku,
                productName: item.productName || 'Sản phẩm (Hoàn tác)',
                variant: item.variant || '',
                change: item.quantity,
                type: 'manual_edit',
                trackingCode: `REVERT_${trackingCode}`,
                timestamp: Timestamp.now()
              });
            } else {
              console.warn(`[PDFService] Product ${item.productId} not found for order ${trackingCode}, skipping stock revert.`);
            }
          }
        }

        // Delete records
        transaction.delete(orderRef);
        transaction.delete(processedOrderRef);
        transaction.delete(shippingLabelRef);
        
        // Delete associated returns
        for (const rRef of returnRefs) {
          transaction.delete(rRef);
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `revert/${trackingCode}`);
    }
  }

  /**
   * Clears all orders for the current user.
   */
  static async clearAllOrders(userId: string): Promise<{ success: number, failed: number }> {
    try {
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);
      
      let success = 0;
      let failed = 0;
      
      for (const docSnap of snapshot.docs) {
        try {
          const trackingCode = docSnap.id;
          await this.revertOrder(trackingCode);
          success++;
        } catch (err) {
          console.error(`Failed to revert order ${docSnap.id}:`, err);
          failed++;
        }
      }
      return { success, failed };
    } catch (error) {
      console.error('Clear All Orders Error:', error);
      throw error;
    }
  }
}
