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
  matchedSku?: string;
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
  isCup?: boolean; // Note for "Cốc giữ nhiệt"
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
  static async extractOrderData(
    input: File | string, 
    userId: string,
    shopKey: string | null,
    fallbackKey: string | null,
    shopPlan: string
  ): Promise<ExtractedOrder[]> {
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
            if (gap > 50) pageText += '    [GAP]    '; // Dấu hiệu phân tách cột/nhãn dán
            else if (gap > 2.5) pageText += ' ';
          } else {
            pageText += '\n';
          }
        }
      }
      fullText += pageText + '\n';
    }

    // Gửi dữ liệu thô sang Gemini bóc tách
    try {
      const extractedOrders = await this.parseWithGemini(
        fullText, 
        userId, 
        shopKey, 
        fallbackKey, 
        shopPlan
      );
      
      // Check for "Cốc giữ nhiệt" category
      const cupKeywords = ['cốc', 'ly', 'giữ nhiệt', 'costa', 'tumbler', 'cup', 'bình'];
      const processedOrders = extractedOrders.map(order => {
        const isCup = order.items.some(item => 
          cupKeywords.some(kw => 
            (item.sku?.toLowerCase().includes(kw) || 
             item.productName?.toLowerCase().includes(kw) ||
             item.color?.toLowerCase().includes(kw))
          )
        );
        return {
          ...order,
          rawText: fullText,
          isCup
        };
      });

      return processedOrders;
    } catch (error: any) {
      console.error('[PDFService] Gemini Parsing Error:', error);
      
      const errorStr = error.message || JSON.stringify(error);
      const isQuota = errorStr.includes('429') || 
                      errorStr.includes('quota') || 
                      errorStr.includes('RESOURCE_EXHAUSTED');
      
      if (error.message === 'MISSING_API_KEY') {
        throw new Error('MISSING_API_KEY');
      }
      
      if (isQuota) {
        throw new Error('GEMINI_QUOTA_EXCEEDED');
      }
      
      throw new Error(`GEMINI_ERROR: ${error.message}`);
    }
  }

  private static async parseWithGemini(
    text: string,
    userId: string,
    shopKey: string | null,
    fallbackKey: string | null,
    shopPlan: string
  ): Promise<ExtractedOrder[]> {
    const prompt = `DƯỚI ĐÂY LÀ NỘI DUNG VĂN BẢN TRÍCH XUẤT TỪ FILE VẬN ĐƠN (SHIPPING LABEL) HOẶC HÓA ĐƠN CỦA SHOPEE:
    ---
    ${text}
    ---
    NHIỆM VỤ: Trích xuất danh sách các đơn hàng chính xác từ văn bản này.
    
    YÊU CẦU QUAN TRỌNG VỀ ĐỊNH DANH (IDENTIFICATION):
    1. Mã vận đơn (Tracking Code): Thường bắt đầu bằng SPXVN..., VN..., dùng làm neo để nhóm sản phẩm.
    2. Tên sản phẩm (Product Name): Trích xuất Tên đầy đủ của sản phẩm. Ví dụ: "Bình giữ nhiệt Costa BGN07", "Cốc giữ nhiệt Zana 334".
    3. Mã SKU (QUAN TRỌNG NHẤT):
       - SKU thường là một mã số (ví dụ: 334, 335, 336, 338, 315) hoặc mã chữ số (ví dụ: BGN01, BGN-07).
       - SKU KHÔNG phải là tên phân loại màu sắc (ví dụ: "Màu Cam", "Màu Hồng-600ml").
       - SKU là mã của sản phẩm chính, không phải thuộc tính.
       - Ví dụ: Trong "Cốc giữ nhiệt 334 - Màu Cam", SKU là "334", Màu sắc là "Màu Cam".
       - QUY TẮC VÀNG: Phần mã số/ký hiệu đứng ĐẦU TIÊN (trước dấu gạch ngang "-" hoặc khoảng trắng) trong tên phân loại thường là SKU. 
       - Đặc biệt lưu ý các tiền tố: 334, 335, 336, 338, BGN. Nếu thấy các số này, chúng CHẮC CHẮN là SKU.
       - TUYỆT ĐỐI BỎ QUA các mã vận hành: "MBA-...", "HUB-...", "POST-...", "Standard-...", "Hà Nội - ...", "HCM - ...".
    4. Màu sắc/Phân loại (Color/Variant): Mô tả màu sắc, kích thước. Ví dụ: "Màu Cam", "900ml", "Size M". Nếu SKU cũng chứa thông tin màu sắc (như trong "334-Màu Cam"), hãy trích xuất đúng phần mô tả màu vào trường này.
    
    YÊU CẦU VỀ SỐ LƯỢNG (QUANTITY):
    - TUYỆT ĐỐI KHÔNG để quantity > 1 trong một dòng items.
    - Nếu đơn có 2 sản phẩm giống nhau, hãy tạo 2 đối tượng item riêng biệt với quantity = 1.
    
    Trả về mảng JSON các đối tượng ExtractedOrder.`;

    const textResponse = await GeminiService.handleAIRequest({
      prompt,
      systemInstruction: "Bạn là chuyên gia bóc tách dữ liệu vận đơn Shopee. Luôn trả về JSON chính xác theo schema.",
      shopKey,
      fallbackKey,
      shopPlan,
      userId,
      feature: "pdf_extraction",
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
                  productName: { type: Type.STRING },
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
    });

    const rawResult = JSON.parse(textResponse || "[]") as ExtractedOrder[];
    
    // Sanitize results: convert strings like "null" or "undefined" to empty strings
    const result = rawResult.map(order => ({
      ...order,
      trackingCode: (order.trackingCode && String(order.trackingCode).toLowerCase() !== 'null') ? String(order.trackingCode).toUpperCase() : '',
      recipientName: (order.recipientName && String(order.recipientName).toLowerCase() !== 'null') ? order.recipientName : '',
      recipientPhone: (order.recipientPhone && String(order.recipientPhone).toLowerCase() !== 'null') ? order.recipientPhone : '',
      recipientAddress: (order.recipientAddress && String(order.recipientAddress).toLowerCase() !== 'null') ? order.recipientAddress : '',
      region: (order.region && String(order.region).toLowerCase() !== 'null') ? order.region : '',
    }));
    
    // Split items with quantity > 1 into multiple items with quantity 1
    // as requested: "hệ thống phải tạo ra 2 dòng thực thi trừ kho riêng biệt, mỗi dòng có SL = 1"
    const splitResult = result.map(order => ({
      ...order,
      items: order.items.flatMap(item => {
        const qty = Number(item.quantity || 1);
        if (qty > 1) {
          // If the color field contains multiple variants (e.g. "Tím, Đỏ"), 
          // we try to split them if possible, otherwise we clone.
          const parts = item.color ? item.color.split(/[,&/+\n;]| và /).map(c => c.trim()).filter(Boolean) : [];
          
          if (parts.length === qty) {
            return parts.map(p => {
              // Try to detect if there's a new SKU in the part (e.g. "336 - Màu Hồng" or "334 - Màu Tím")
              const skuMatch = p.match(/\b(BGN\d*|315|330|334|335|336|338|\d{3,10})\b/i);
              if (skuMatch) {
                const newSku = skuMatch[1];
                const newColor = p.replace(newSku, '').replace(/^[\s\-]+/, '').trim();
                return { ...item, sku: newSku, color: newColor, quantity: 1 };
              }
              return { ...item, color: p, quantity: 1 };
            });
          }
          
          return Array(qty).fill(null).map(() => ({ ...item, quantity: 1 }));
        }
        return [{ ...item, quantity: qty }];
      })
    }));

    return splitResult;
  }

  /**
   * Generates images for each page of the PDF and uploads them to Supabase Storage.
   * Also saves order metadata to print_history table.
   */
  static async generateAndUploadImages(file: File, orders: ExtractedOrder[], userId: string) {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[PDFService] Supabase client not available for image storage.');
      return;
    }

    try {
      // 0. Pre-check: Verify if print_history table is accessible
      const { error: tableCheckError } = await supabase.from('print_history').select('id').limit(1);
      if (tableCheckError) {
        console.error('[PDFService] print_history table is not accessible. Did you run the SQL script?', tableCheckError);
        // We continue anyway, maybe it's just empty
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      console.log(`[PDFService] Generating images for ${pdf.numPages} pages...`);

      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          console.log(`[PDFService] Processing page ${i}...`);
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) {
            console.error(`[PDFService] Could not get canvas context for page ${i}`);
            continue;
          }

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ 
            canvasContext: context, 
            viewport,
            // @ts-ignore
            canvas: canvas 
          }).promise;
          
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
          if (!blob) {
            console.error(`[PDFService] Could not generate blob for page ${i}`);
            continue;
          }

          const timestamp = Date.now();
          const fileName = `${userId}/${timestamp}_page_${i}.jpg`;
          
          console.log(`[PDFService] Uploading page ${i} to Supabase Storage: ${fileName}...`);
          // 1. Upload to Storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('shipping-labels')
            .upload(fileName, blob, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (uploadError) {
            console.error(`[PDFService] Storage upload error (page ${i}):`, uploadError);
            if (uploadError.message.includes('Bucket not found')) {
              console.error('[PDFService] CRITICAL: Bucket "shipping-labels" not found. Please create it in Supabase Storage and set to PUBLIC.');
            }
            continue;
          }

          const { data } = supabase.storage
            .from('shipping-labels')
            .getPublicUrl(fileName);
          
          const publicUrl = data?.publicUrl || '';

          console.log(`[PDFService] Page ${i} uploaded. Public URL: ${publicUrl}`);

          // 2. Identify which order this page belongs to
          const textContent = await page.getTextContent();
          const rawPageText = textContent.items.map((it: any) => it.str).join(' ');
          const normalizedPageText = rawPageText.replace(/\s+/g, '').toUpperCase();
          
          console.log(`[PDFService] Page ${i} normalized text length: ${normalizedPageText.length}`);

          const matchingOrder = orders.find(o => {
            const normalizedTracking = o.trackingCode.replace(/\s+/g, '').toUpperCase();
            // Try exact match first
            if (normalizedPageText.includes(normalizedTracking)) {
              console.log(`[PDFService] Found exact match for page ${i}: ${o.trackingCode}`);
              return true;
            }
            
            // Try partial match (last 6 digits of tracking code)
            const partialTracking = normalizedTracking.slice(-6);
            if (partialTracking.length >= 6 && normalizedPageText.includes(partialTracking)) {
              console.log(`[PDFService] Found partial match for page ${i}: ${o.trackingCode} (via ${partialTracking})`);
              return true;
            }
            
            return false;
          });
          
          if (matchingOrder) {
            const productNames = matchingOrder.items.map(item => 
              `${item.sku}${item.color ? ` (${item.color})` : ''}`
            ).join(', ');

            // Manually detect if it's a cup for the tag
            const isCup = productNames.toLowerCase().includes('cốc') || 
                          productNames.toLowerCase().includes('cup') ||
                          productNames.toLowerCase().includes('bình') ||
                          matchingOrder.items.some(item => item.sku?.startsWith('338') || item.sku?.startsWith('330'));

            const totalQuantity = matchingOrder.items.reduce((sum, item) => sum + item.quantity, 0);

            console.log(`[PDFService] Saving metadata to print_history for ${matchingOrder.trackingCode}...`);
            // 3. Save to print_history table
            const { error: dbError } = await supabase
              .from('print_history')
              .insert({
                user_id: userId,
                tracking_number: matchingOrder.trackingCode,
                product_name: productNames,
                quantity: totalQuantity,
                image_url: publicUrl,
                is_cup: isCup,
                created_at: new Date().toISOString()
              });

            if (dbError) {
              console.error(`[PDFService] DB insert error (page ${i}):`, dbError);
              if (dbError.message?.includes('Forbidden use of secret API key')) {
                console.error('[PDFService] CRITICAL: You are using a Service Role Key in the browser. Please switch to the Anon Key in Settings.');
              }
            } else {
            console.log(`[PDFService] Successfully saved ${matchingOrder.trackingCode} to print_history.`);

            // 4. ALSO update the main Firestore 'orders' collection if possible
            // This ensures "Tra cứu" via Firestore fallback also gets the image_url
            try {
              const orderRef = doc(db, 'orders', matchingOrder.trackingCode);
              const orderDoc = await getDoc(orderRef);
              
              if (orderDoc.exists()) {
                await updateDoc(orderRef, { image_url: publicUrl });
                console.log(`[PDFService] Updated Firestore order ${matchingOrder.trackingCode} with image_url.`);
              } else {
                // Try searching by trackingCode field if ID is different
                const ordersQuery = query(
                  collection(db, 'orders'), 
                  where('trackingCode', '==', matchingOrder.trackingCode)
                );
                const orderDocs = await getDocs(ordersQuery);
                if (!orderDocs.empty) {
                  const firstDocRef = doc(db, 'orders', orderDocs.docs[0].id);
                  await updateDoc(firstDocRef, { image_url: publicUrl });
                  console.log(`[PDFService] Updated Firestore order ${matchingOrder.trackingCode} (via query) with image_url.`);
                }
              }
            } catch (fsErr) {
              console.error(`[PDFService] Failed to update Firestore order with image_url:`, fsErr);
            }
          }
        } else {
          console.warn(`[PDFService] No matching order found for page ${i}. Page text snippet: ${normalizedPageText.substring(0, 100)}...`);
        }
        } catch (pageErr) {
          console.error(`[PDFService] Error processing page ${i}:`, pageErr);
        }
      }
      console.log('[PDFService] Image generation and upload completed.');
    } catch (err) {
      console.error('[PDFService] Fatal error in generateAndUploadImages:', err);
    }
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

    // 4. Partial SKU match (prioritize color match among partial SKU matches)
    if (!matchedProduct) {
      const partialSkuMatches = allProducts.filter(p => {
        const pSku = normalize(p.sku);
        const pName = normalize(p.name);
        // Check if SKU is inside extracted SKU OR vice versa
        // OR check if extracted SKU is actually a part of the product name (e.g. "334" in "Cốc 334")
        return pSku.includes(normExtractedSku) || 
               normExtractedSku.includes(pSku) ||
               pName.includes(normExtractedSku);
      });
      
      if (partialSkuMatches.length > 0) {
        // Find best color match among these partial SKU matches
        matchedProduct = partialSkuMatches.find(p => {
          const v = normalize(p.variant);
          const c = normExtractedColor;
          return (v && c) && (v.includes(c) || c.includes(v));
        }) || partialSkuMatches[0];
      }
    }

    if (matchedProduct && !matchedProduct.ref && matchedProduct.id) {
      matchedProduct.ref = doc(db, 'inventory', matchedProduct.id);
    }

    return matchedProduct;
  }

  /**
   * Checks if a product is in stock and returns product details including prices
   */
  static async checkStockStatus(sku: string, color: string, preFetchedProducts?: any[]): Promise<{ 
    inStock: boolean, 
    currentStock: number, 
    productName?: string, 
    realSku?: string,
    category?: string,
    costPrice?: number,
    sellingPrice?: number
  }> {
    try {
      const matchedProduct = await this.findMatchedProduct(sku, color, preFetchedProducts);
      if (!matchedProduct) return { inStock: false, currentStock: 0 };
      
      return { 
        inStock: matchedProduct.stock > 0, 
        currentStock: matchedProduct.stock,
        productName: matchedProduct.name,
        realSku: matchedProduct.sku,
        category: matchedProduct.category,
        costPrice: matchedProduct.costPrice,
        sellingPrice: matchedProduct.sellingPrice
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
      
      // PRE-MATCH PRODUCTS: Find all matched products BEFORE the transaction
      // to avoid "Firestore transactions require all reads to be performed before any writes"
      const itemsWithMatchedProducts = await Promise.all(items.map(async (item) => {
        const matchedProduct = await PDFService.findMatchedProduct(item.sku, item.color, allProducts);
        return { ...item, matchedProduct };
      }));

      const finalizedItems: any[] = [];

      await runTransaction(db, async (transaction) => {
        // A. ALL READS FIRST
        
        // Check for duplicate order in processed_orders collection
        const tProcessedSnap = await transaction.get(processedOrderRef);
        if (tProcessedSnap.exists()) {
          console.warn(`[PDFService] Order ${trackingCode} already processed.`);
          throw new Error(`Đơn hàng [${trackingCode}] đã được xử lý trước đó, không thể trừ kho thêm lần nữa`);
        }

        // Get current stock for all matched products
        const productSnaps = new Map<string, any>();
        for (const item of itemsWithMatchedProducts) {
          if (item.matchedProduct) {
            const productRef = item.matchedProduct.ref || doc(db, 'inventory', item.matchedProduct.id);
            if (!productSnaps.has(productRef.id)) {
              const snap = await transaction.get(productRef);
              if (snap.exists()) {
                productSnaps.set(productRef.id, snap.data());
              }
            }
          }
        }

        // B. ALL WRITES SECOND
        const processedItems: any[] = [];
        const currentStockMap = new Map<string, number>(); // Track stock changes within the transaction for multiple items of same product

        for (const item of itemsWithMatchedProducts) {
          const { sku, color, quantity, costPrice: extCost, sellingPrice: extSell, matchedProduct } = item;
          
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
            const newItem = {
              sku: sku,
              variant: color || 'Mặc định',
              quantity,
              productName: newProductData.name,
              productId: newProductRef.id,
              category: 'General',
              costPrice: Number(extCost || 0),
              sellingPrice: Number(extSell || 0)
            };
            processedItems.push(newItem);
            finalizedItems.push(newItem);

            continue;
          }

          const productRef = matchedProduct.ref || doc(db, 'inventory', matchedProduct.id);
          const productDataInTransaction = productSnaps.get(productRef.id);
          
          if (!productDataInTransaction) {
            console.error(`[PDFService] Product document ${productRef.id} not found in pre-fetched snaps!`);
            continue;
          }
          
          const initialStock = Number(productDataInTransaction.stock || 0);
          const currentStock = currentStockMap.has(productRef.id) ? currentStockMap.get(productRef.id)! : initialStock;
          
          const deductQty = Number(quantity);
          const newStock = currentStock - deductQty;
          currentStockMap.set(productRef.id, newStock); // Update local map for next item
          
          const status = newStock > 10 ? 'in_stock' : (newStock > 0 ? 'low_stock' : 'out_of_stock');

          console.log(`[PDFService] Transaction Update: ${matchedProduct.sku} | Stock: ${currentStock} -> ${newStock}`);

          const updateData: any = {
            stock: newStock,
            status: status,
            updatedAt: new Date().toISOString()
          };

          if (extCost) updateData.costPrice = Number(extCost);
          if (extSell) updateData.sellingPrice = Number(extSell);

          transaction.update(productRef, updateData);
          
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
          
          const processedItem = {
            sku: matchedProduct.sku,
            variant: matchedProduct.variant || '',
            quantity,
            productName: matchedProduct.name,
            productId: productRef.id,
            category: matchedProduct.category || '',
            costPrice: Number(extCost || matchedProduct.costPrice || 0),
            sellingPrice: Number(extSell || matchedProduct.sellingPrice || 0)
          };
          processedItems.push(processedItem);
          finalizedItems.push(processedItem);
        }

        // Save order record
        const now = new Date();
        const expiryDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
        
        const totalRevenue = processedItems.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
        const totalCost = processedItems.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);
        
        // Calculate platform fee and tax fee based on item category
        let platformFee = 0;
        let taxFee = 0;
        const taxPercent = config?.taxPercent || 1.5;

        processedItems.forEach(item => {
          const feePercent = ProfitService.getPlatformFeePercent(item.sku, item.productName || '', config);
          platformFee += (item.sellingPrice * (feePercent / 100)) * item.quantity;
          taxFee += (item.sellingPrice * (taxPercent / 100)) * item.quantity;
        });

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
          platformFee,
          taxFee,
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

      // 3. Save to Supabase (PRIORITY STORAGE)
      try {
        const supabase = getSupabase();
        if (supabase) {
          console.log(`[PDFService] Writing order ${trackingCode} to Supabase...`);
          
          // A. Insert Order into Supabase
          const { error: orderError } = await supabase
            .from('orders')
            .upsert({
              user_id: auth.currentUser?.uid,
              tracking_code: trackingCode,
              shop_name: 'Zenith Store', // Default or from config
              platform: 'Shopee',
              customer_name: order.recipientName || 'Khách hàng Shopee',
              total_amount: processedItems.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0),
              profit: processedItems.reduce((sum, item) => sum + ((item.sellingPrice - item.costPrice) * item.quantity), 0),
              status: 'Processed',
              items: processedItems,
              image_url: downloadURL || '',
              processed_at: new Date().toISOString()
            });

          if (orderError) {
            console.error('[PDFService] Supabase Order Insert Error:', orderError.message);
          }

          // B. Update Products Stock in Supabase
          for (const item of finalizedItems) {
            try {
              // Get current stock
              const { data: currentProd, error: fetchError } = await supabase
                .from('products')
                .select('stock_quantity, id')
                .eq('sku', item.sku)
                .maybeSingle();

              if (!fetchError && currentProd) {
                const newQty = Number(currentProd.stock_quantity || 0) - Number(item.quantity);
                await supabase
                  .from('products')
                  .update({ 
                    stock_quantity: newQty,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', currentProd.id);
                
                console.log(`[PDFService] Supabase stock updated for ${item.sku}: ${currentProd.stock_quantity} -> ${newQty}`);
              } else if (!currentProd) {
                // If product doesn't exist in Supabase yet, create it
                console.log(`[PDFService] Creating new product in Supabase: ${item.sku}`);
                await supabase
                  .from('products')
                  .insert({
                    user_id: auth.currentUser?.uid,
                    sku: item.sku,
                    name: item.productName || `Sản phẩm ${item.sku}`,
                    stock_quantity: 0 - Number(item.quantity), // Start negative if unknown
                    cost_price: item.costPrice,
                    selling_price: item.sellingPrice,
                    updated_at: new Date().toISOString()
                  });
              }
            } catch (err) {
              console.error(`[PDFService] Supabase Inventory Update Error for ${item.sku}:`, err);
            }
          }

          // C. Update print_history
          const printData = {
            user_id: auth.currentUser?.uid,
            tracking_number: trackingCode,
            product_name: processedItems.map(i => `${i.sku} (${i.quantity})`).join(', '),
            quantity: processedItems.reduce((sum, i) => sum + i.quantity, 0),
            image_url: downloadURL || '',
            is_cup: order.isCup || false,
            created_at: new Date().toISOString()
          };

          await supabase.from('print_history').insert(printData);
        }
      } catch (err) {
        console.error('[PDFService] Supabase Global Error:', err);
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
          transaction.delete(orderRef);
          transaction.delete(processedOrderRef);
          transaction.delete(shippingLabelRef);
          return;
        }

        const data = orderSnap.data();
        const items = data.items || [];

        // 1. COLLECT ALL READS FIRST
        const productRefs = items
          .filter((item: any) => item.productId)
          .map((item: any) => doc(db, 'inventory', item.productId));
        
        // Remove duplicates to minimize reads
        const uniqueProductIds = Array.from(new Set(productRefs.map((r: any) => r.id)));
        const uniqueProductRefs = uniqueProductIds.map(id => doc(db, 'inventory', id as string));

        const productSnaps = new Map<string, any>();
        for (const ref of uniqueProductRefs) {
          const snap = await transaction.get(ref);
          if (snap.exists()) {
            productSnaps.set(ref.id, snap.data());
          }
        }

        // 2. ALL WRITES SECOND
        for (const item of (items as any[])) {
          if (item.productId && productSnaps.has(item.productId)) {
            const productRef = doc(db, 'inventory', item.productId as string);
            
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
