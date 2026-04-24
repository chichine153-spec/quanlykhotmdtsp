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
  platformFee?: number;
  taxFee?: number;
  profit?: number;
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
  recipient_address?: string;
  rawText?: string;
  isCup?: boolean; // Note for "Cốc giữ nhiệt"
  job_id?: string;
  shop_id?: string;
  orderId?: string;
  platform?: string;
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
    shopPlan: string,
    inventoryData: any[] = [],
    profitConfig: any = null
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

      // BACKUP REGEX EXTRACTION for job_id and shop_id
      const docJobIdMatch = fullText.match(/job_id[:=]\s*(\d+)/i);
      const docShopIdMatch = fullText.match(/shop_id[:=]\s*(\d+)/i);
      const docJobId = docJobIdMatch ? docJobIdMatch[1] : null;
      const docShopId = docShopIdMatch ? docShopIdMatch[1] : null;

      // Check for "Cốc giữ nhiệt" category
      const cupKeywords = ['cốc', 'ly', 'giữ nhiệt', 'costa', 'tumbler', 'cup', 'bình'];
      const processedOrders = extractedOrders.map(order => {
        // Enforce IDs from backup if Gemini missed them
        const finalOrder = {
          ...order,
          job_id: (order.job_id && order.job_id !== 'null') ? order.job_id : (docJobId || ''),
          shop_id: (order.shop_id && order.shop_id !== 'null') ? order.shop_id : (docShopId || '')
        };

        const isCup = finalOrder.items.some(item => 
          cupKeywords.some(kw => 
            (item.sku?.toLowerCase().includes(kw) || 
             item.productName?.toLowerCase().includes(kw) ||
             item.color?.toLowerCase().includes(kw))
          )
        );
        return {
          ...finalOrder,
          rawText: fullText,
          isCup
        };
      });

      // Enrich with inventory data for instant profit calculation
      const enrichedOrders = await Promise.all(processedOrders.map(async (order) => {
        const enrichedItems = await Promise.all(order.items.map(async (item) => {
          const skuMatch = await this.findMatchedProduct(item.sku, item.color, inventoryData);
          
          if (skuMatch) {
            const costPrice = Number(item.costPrice || skuMatch.costPrice || 0);
            const sellingPrice = Number(item.sellingPrice || skuMatch.sellingPrice || 0);
            const quantity = Number(item.quantity || 1);
            
            const platformFeePercent = ProfitService.getPlatformFeePercent(skuMatch.sku, skuMatch.name, profitConfig);
            const taxPercent = Number(profitConfig?.taxPercent || 1.5);
            const packagingFee = ProfitService.calculatePackagingFee(skuMatch.sku, skuMatch.name, profitConfig);
            
            const pFee = (sellingPrice * (platformFeePercent / 100)) * quantity;
            const tFee = (sellingPrice * (taxPercent / 100)) * quantity;
            const packFee = packagingFee * quantity;
            const profit = (sellingPrice * quantity) - (costPrice * quantity) - pFee - tFee - packFee;

            return {
              ...item,
              matchedSku: skuMatch.sku,
              productName: skuMatch.name,
              currentStock: skuMatch.stock,
              costPrice,
              sellingPrice,
              packagingFee: packFee,
              platformFee: pFee,
              taxFee: tFee,
              profit,
              stockStatus: (skuMatch.stock > 10 ? 'in_stock' : (skuMatch.stock > 0 ? 'low_stock' : 'out_of_stock')) as 'in_stock' | 'out_of_stock' | 'low_stock' | 'checking'
            };
          } else {
            return {
              ...item,
              stockStatus: 'checking' as 'checking'
            };
          }
        }));

        return {
          ...order,
          items: enrichedItems
        };
      }));

      return enrichedOrders;
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
    2. Mã đơn hàng (Order ID): Một dãy số dài thường bắt đầu bằng số Shopee (ví dụ: 240524XAB...).
    3. Mã Job ID và Shop ID (PHỤC VỤ IN NHIỆT): 
       - Tìm kiếm trong văn bản các chuỗi có định dạng job_id=[SỐ] và shop_id=[SỐ] hoặc các tham số URL tương tự.
    4. Tên sản phẩm (Product Name): Trích xuất Tên đầy đủ của sản phẩm. Ví dụ: "Bình giữ nhiệt Costa BGN07", "Cốc giữ nhiệt Zana 334".
    5. Mã SKU / Mã mẫu (QUAN TRỌNG): 
       - SKU thường là mã số (315, 332, 334) hoặc mã ký hiệu (BGN01).
       - Nếu tên sản phẩm là "Cốc giữ nhiệt Costa 332", SKU/Mã mẫu là "332".
       - CHÚ Ý: SKU KHÔNG phải là màu sắc. SKU là mã định danh dòng sản phẩm.
    6. Màu sắc/Phân loại (Variant): Mô tả màu sắc, ví dụ: "Màu TRẮNG", "Màu XANH", "900ml".
       - Nếu SKU trong văn bản bao gồm cả tên màu (ví dụ: 332-TRANG), hãy bóc tách SKU là "332" và Màu là "TRẮNG".
    
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
            orderId: { type: Type.STRING, description: "Mã đơn hàng (Order ID), thường bắt đầu bằng số Shopee" },
            job_id: { type: Type.STRING, description: "Mã Job ID của đơn hàng in nhiệt (nếu có)" },
            shop_id: { type: Type.STRING, description: "Mã Shop ID của đơn hàng (nếu có)" },
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
      orderId: (order.orderId && String(order.orderId).toLowerCase() !== 'null') ? order.orderId : '',
      job_id: (order.job_id && String(order.job_id).toLowerCase() !== 'null') ? order.job_id : '',
      shop_id: (order.shop_id && String(order.shop_id).toLowerCase() !== 'null') ? order.shop_id : '',
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

            console.log(`[PDFService] Saving metadata to print_history and updating order for ${matchingOrder.trackingCode}...`);
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
            } else {
              // 4. ALSO update the 'orders' table so the image is available for Re-Print
              await supabase
                .from('orders')
                .update({ image_url: publicUrl })
                .eq('tracking_code', matchingOrder.trackingCode)
                .eq('user_id', userId);
              
              // 5. Update Firestore order for consistency
              try {
                const orderRef = doc(db, 'orders', matchingOrder.trackingCode);
                await updateDoc(orderRef, { image_url: publicUrl });
              } catch (err) {
                // Silently fail if firestore update fails
                console.warn('[PDFService] Firestore image_url update failed:', err);
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
    const combinedExtracted = normalize(sku + color);

    console.log(`[PDFService] Matching: SKU="${sku}", Color="${color}" | Combined="${combinedExtracted}"`);

    // 1. Priority Match: Try to find a product where (SKU+Variant) or (SKU) or (Variant) matches the combined target
    let matchedProduct = allProducts.find(p => {
      const pSkuNorm = normalize(p.sku);
      const pVarNorm = normalize(p.variant);
      const pCombNorm = normalize(decodeURIComponent(p.sku + (p.variant || '')));
      
      // Exact match for combined identification
      return pSkuNorm === combinedExtracted || 
             pVarNorm === combinedExtracted || 
             pCombNorm === combinedExtracted ||
             (pSkuNorm === normExtractedSku && pVarNorm === normExtractedColor);
    });

    // 2. Fallback: Match by SKU and then search for color within variant
    if (!matchedProduct) {
      const skuMatches = allProducts.filter(p => normalize(p.sku).includes(normExtractedSku) || normExtractedSku.includes(normalize(p.sku)));
      if (skuMatches.length > 0) {
        matchedProduct = skuMatches.find(p => {
          const v = normalize(p.variant);
          return v.includes(normExtractedColor) || normExtractedColor.includes(v);
        }) || skuMatches[0];
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
  static async processOrder(file: File, order: ExtractedOrder, preFetchedProducts?: any[], preFetchedConfig?: any, preUploadedUrl?: string): Promise<any> {
    const { trackingCode, items } = order;
    console.log(`[PDFService] Processing order: ${trackingCode} with ${items.length} items`);

    if (!db) {
      console.error('[PDFService] CRITICAL: Firestore database instance is undefined in processOrder');
      throw new Error('Hệ thống cơ sở dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.');
    }

    try {
      // Helper to safely parse numbers and strip common currency formats
      const safeNum = (val: any) => {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (!val) return 0;
        const str = String(val);
        if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
        
        let cleaned = str.replace(/[^\d.,-]/g, '');
        if ((cleaned.match(/[\.,]/g) || []).length > 1 || (cleaned.includes('.') && cleaned.length > 5)) {
          cleaned = cleaned.replace(/[\.,]/g, '');
        } else {
          cleaned = cleaned.replace(',', '.');
        }
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      };

      const orderRef = doc(db, 'orders', trackingCode);
      const inventoryLogsRef = collection(db, 'inventory_logs');
      const productNames: string[] = [];
      let processedItemsResult: any[] = [];
      let totalRevenueValue = 0;
      let totalCostValue = 0;
      let platformFeeValue = 0;
      let taxFeeValue = 0;
      let packagingFeeValue = 0;
      let destinationValue = 'Chưa xác định';
      const finalizedItemsResult: any[] = [];

      // Use pre-fetched products if available, otherwise fetch once
      let allProducts = preFetchedProducts;
      if (!allProducts || allProducts.length === 0) {
        console.log('[PDFService] No pre-fetched products, fetching fresh data...');
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase
            .from('products')
            .select('*')
            .eq('user_id', auth.currentUser?.uid);
          
          if (data) {
            allProducts = data.map(p => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              stock: Number(p.stock_quantity || 0),
              variant: p.variant || '',
              costPrice: Number(p.cost_price || 0),
              sellingPrice: Number(p.selling_price || 0),
              category: p.category || ''
            }));
          }
        }

        // Always merge with Firestore or use Firestore as fallback
        if (!allProducts || allProducts.length === 0) {
          console.log('[PDFService] Fetching from Firestore...');
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
      const itemsWithMatchedProducts = await Promise.all(items.map(async (item) => {
        const matchedProduct = await PDFService.findMatchedProduct(item.sku, item.color, allProducts);
        return { ...item, matchedProduct };
      }));

      await runTransaction(db, async (transaction) => {
        // A. ALL READS FIRST
        
        // Check for duplicate order in orders collection instead of processed_orders
        const tOrderSnap = await transaction.get(orderRef);
        if (tOrderSnap.exists()) {
          console.warn(`[PDFService] Order ${trackingCode} already processed.`);
          throw new Error(`Đơn hàng [${trackingCode}] đã được xử lý trước đó, không thể trừ kho thêm lần nữa`);
        }

        // Get current stock for all matched products
        const productSnaps = new Map<string, any>();
        for (const item of itemsWithMatchedProducts) {
          if (item.matchedProduct) {
            const productRef = item.matchedProduct.ref || doc(db, 'inventory', item.matchedProduct.id);
            if (!productSnaps.has(productRef.id)) {
              try {
                const snap = await transaction.get(productRef);
                if (snap && snap.exists()) {
                  productSnaps.set(productRef.id, snap.data());
                }
              } catch (e) {
                console.warn(`[PDFService] Could not pre-fetch snap for product ${productRef.id}:`, e);
              }
            }
          }
        }

        // B. ALL WRITES SECOND
        const processedItems: any[] = [];
        const currentStockMap = new Map<string, number>();

        console.log(`[PDFService] Starting processing for ${itemsWithMatchedProducts.length} items...`);

        for (const item of itemsWithMatchedProducts) {
          const { sku, color, quantity, costPrice: extCost, sellingPrice: extSell, matchedProduct } = item;
          
          if (!matchedProduct) {
            console.error(`[PDFService] SKU NOT FOUND ERROR: ${sku} (${color}).`);
            throw new Error(`Mã SKU [${sku}] không tồn tại trong kho hoặc chưa được khai báo. Vui lòng sử dụng tính năng "Nhập kho nhanh" hoặc thêm SKU này vào kho để có đủ dữ liệu tính toán.`);
          }

          const productRef = matchedProduct.ref || doc(db, 'inventory', matchedProduct.id);
          const productDataInTransaction = productSnaps.get(productRef.id);
          
          const itemQuantity = safeNum(quantity);
          const itemCostPrice = safeNum(extCost || matchedProduct.costPrice);
          const itemSellingPrice = safeNum(extSell || matchedProduct.sellingPrice);

          const processedItem = {
            sku: matchedProduct.sku,
            variant: matchedProduct.variant !== undefined && matchedProduct.variant !== null ? matchedProduct.variant : (color || 'Mặc định'),
            quantity: itemQuantity,
            productName: matchedProduct.name,
            productId: matchedProduct.id, 
            category: matchedProduct.category || '',
            costPrice: itemCostPrice,
            sellingPrice: itemSellingPrice
          };
          
          processedItems.push(processedItem);
          finalizedItemsResult.push(processedItem);
          productNames.push(matchedProduct.name);

          if (!productDataInTransaction) {
            // FALLBACK: If not in Firestore but matched (likely from Supabase), we still need to record the sale
            console.warn(`[PDFService] Product ${matchedProduct.sku} matched but NOT in Firestore snaps. Proceeding without Firestore stock deduction for this item.`);
            continue;
          }
          
          const initialStock = Number(productDataInTransaction.stock || 0);
          const currentStock = currentStockMap.has(productRef.id) ? currentStockMap.get(productRef.id)! : initialStock;
          
          const deductQty = itemQuantity;
          const newStock = currentStock - deductQty;
          currentStockMap.set(productRef.id, newStock);
          
          // User request: < 5 is "NHẬP GẤP" / "SẮP HẾT HÀNG"
          const status = newStock >= 10 ? 'in_stock' : (newStock >= 5 ? 'low_stock' : 'out_of_stock');

          console.log(`[PDFService] Transaction Match: ${matchedProduct.sku} | Price: ${itemSellingPrice} | Cost: ${itemCostPrice}`);

          const updateData: any = {
            stock: newStock,
            status: status,
            updatedAt: new Date().toISOString()
          };

          if (extCost) updateData.costPrice = safeNum(extCost);
          if (extSell) updateData.sellingPrice = safeNum(extSell);

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
        }

        if (processedItems.length === 0) {
          console.error('[PDFService] Processed items list is empty for order:', trackingCode);
          throw new Error('Không có sản phẩm nào được xử lý cho đơn hàng này. Vui lòng kiểm tra lại file PDF.');
        }

        // Save order record
        const now = new Date();
        const expiryDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
        
        const totalRevenue = processedItems.reduce((sum, item) => sum + (safeNum(item.sellingPrice) * safeNum(item.quantity)), 0);
        const totalCost = processedItems.reduce((sum, item) => sum + (safeNum(item.costPrice) * safeNum(item.quantity)), 0);
        
        // Calculate platform fee and tax fee based on item category
        let platformFee = 0;
        let taxFee = 0;
        const profitConfig = config;
        const taxPercent = safeNum(profitConfig?.taxPercent || 1.5);

        processedItems.forEach(item => {
          const feePercent = ProfitService.getPlatformFeePercent(item.sku, item.productName || '', profitConfig);
          platformFee += (safeNum(item.sellingPrice) * (feePercent / 100)) * safeNum(item.quantity);
          taxFee += (safeNum(item.sellingPrice) * (taxPercent / 100)) * safeNum(item.quantity);
        });

        // Calculate packaging fee based on item category
        const packagingFee = processedItems.reduce((sum, item) => {
          const fee = ProfitService.calculatePackagingFee(item.sku, item.productName || '', profitConfig);
          return sum + (safeNum(item.quantity) * fee);
        }, 0);

        // Capture values for outside the transaction
        processedItemsResult = [...processedItems];
        totalRevenueValue = totalRevenue;
        totalCostValue = totalCost;
        platformFeeValue = platformFee;
        taxFeeValue = taxFee;
        packagingFeeValue = packagingFee;

        // Infer destination from region
        let destination = 'Chưa xác định';
        const region = order.region || '';
        if (region.toUpperCase().startsWith('HN')) destination = 'Hà Nội';
        else if (region.toUpperCase().startsWith('SG') || region.toUpperCase().startsWith('HCM')) destination = 'Hồ Chí Minh';
        
        destinationValue = destination; // Update outside variable

        transaction.set(orderRef, {
          trackingCode,
          processedAt: now.toISOString(),
          expiryDate: expiryDate.toISOString(),
          items: processedItems,
          region: region,
          destination,
          userId: auth.currentUser?.uid,
          pdfUrl: downloadURL || '',
          storagePath: order.rawText === 'TEMP_PATH_MARKER' ? `orders/${auth.currentUser?.uid}/${trackingCode}.pdf` : '',
          totalRevenue,
          totalCost,
          platformFee,
          taxFee,
          packagingFee,
          profit: totalRevenue - totalCost - platformFee - taxFee - packagingFee,
          recipientName: order.recipientName || '',
          recipientPhone: order.recipientPhone || '',
          recipientAddress: order.recipientAddress || '',
          orderId: order.orderId || '',
          job_id: order.job_id || '',
          shop_id: order.shop_id || ''
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
              order_id: order.orderId || '',
              job_id: order.job_id || '',
              shop_id: order.shop_id || '',
              shop_name: 'Zenith Store', 
              platform: order.platform || 'Shopee',
              customer_name: order.recipientName || 'Khách hàng Shopee',
              total_amount: Number(totalRevenueValue || 0),
              total_cost: Number(totalCostValue || 0),
              platform_fee: Number(platformFeeValue || 0),
              tax_fee: Number(taxFeeValue || 0),
              // packaging_fee: Number(packagingFeeValue || 0), // Removed as column doesn't exist in Supabase orders table
              profit: Number((totalRevenueValue || 0) - (totalCostValue || 0) - (platformFeeValue || 0) - (taxFeeValue || 0) - (packagingFeeValue || 0)),
              status: 'Processed',
              items: processedItemsResult, // Pass the array directly for JSONB column
              image_url: '', // Will be updated by background task generateAndUploadImages
              pdf_url: downloadURL || '',
              processed_at: new Date().toISOString(),
              recipient_name: order.recipientName || '',
              recipient_phone: order.recipientPhone || '',
              recipient_address: order.recipient_address || order.recipientAddress || '',
              region: order.region || ''
            });

          if (orderError) {
            console.error('[PDFService] Supabase Order Insert Error:', orderError.message);
          }

          // B. Update Products Stock in Supabase
          for (const item of finalizedItemsResult) {
            try {
              // 1. Precise match using ID if it looks like a Supabase ID (UUID)
              let currentProd = null;
              
              if (item.productId && item.productId.includes('-')) {
                const { data } = await supabase
                  .from('products')
                  .select('stock_quantity, id')
                  .eq('id', item.productId)
                  .maybeSingle();
                currentProd = data;
              }

              // 2. Fallback to SKU and VARIANT match
              if (!currentProd) {
                const { data: skuVarProd } = await supabase
                  .from('products')
                  .select('stock_quantity, id')
                  .eq('sku', item.sku)
                  .eq('variant', item.variant || '')
                  .maybeSingle();
                currentProd = skuVarProd;
              }

              if (!currentProd) {
                // 3. Fallback to SKU only
                const { data: skuOnlyProd } = await supabase
                  .from('products')
                  .select('stock_quantity, id')
                  .eq('sku', item.sku)
                  .limit(1)
                  .maybeSingle();
                currentProd = skuOnlyProd;
              }

              if (currentProd) {
                const newQty = Number(currentProd.stock_quantity || 0) - Number(item.quantity);
                await supabase
                  .from('products')
                  .update({ 
                    stock_quantity: newQty,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', currentProd.id);
                
                console.log(`[PDFService] Supabase stock updated for ${item.sku} (${item.variant}): ${currentProd.stock_quantity} -> ${newQty}`);

                // C. Insert Inventory Log into Supabase
                await supabase
                  .from('inventory_logs')
                  .insert({
                    user_id: auth.currentUser?.uid,
                    sku: item.sku,
                    product_name: item.productName || `Sản phẩm ${item.sku}`,
                    variant: item.variant || '',
                    quantity_change: 0 - Number(item.quantity),
                    type: 'deduction',
                    tracking_code: trackingCode,
                    timestamp: new Date().toISOString(),
                    details: `Trừ kho tự động Shopee: ${item.sku} - SL: ${item.quantity}`
                  });
              } else {
                // Final fallback: Create it if it really doesn't exist
                console.log(`[PDFService] Creating missing product in Supabase: ${item.sku}`);
                await supabase
                  .from('products')
                  .insert({
                    user_id: auth.currentUser?.uid,
                    sku: item.sku,
                    name: item.productName || `Sản phẩm ${item.sku}`,
                    variant: item.variant || '',
                    stock_quantity: 0 - Number(item.quantity),
                    cost_price: Number(item.costPrice || 0),
                    selling_price: Number(item.sellingPrice || 0),
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
            product_name: processedItemsResult.map(i => `${i.sku} (${i.quantity})`).join(', '),
            quantity: processedItemsResult.reduce((sum, i) => sum + i.quantity, 0),
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
      return { 
        productNames, 
        processedItems: processedItemsResult,
        totalProfit: totalRevenueValue - totalCostValue - platformFeeValue - taxFeeValue - packagingFeeValue
      };
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
      const ordersRef = collection(db, 'orders');
      const q = query(
        ordersRef, 
        where('userId', '==', userId),
        where('expiryDate', '<=', now)
      );
      const snapshot = await getDocs(q);
      
      let count = 0;
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        // 1. Delete from Storage if path exists
        if (data.storagePath) {
          try {
            const fileRef = ref(storage, data.storagePath);
            await deleteObject(fileRef);
          } catch (e) {
            // Likely already deleted or doesn't exist
          }
        }

        // 2. Delete from Firestore orders
        await deleteDoc(docSnap.ref);
        
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

      let itemsToRevert: any[] = [];
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', trackingCode);
        const inventoryLogsRef = collection(db, 'inventory_logs');
        
        const orderSnap = await transaction.get(orderRef);
        
        if (!orderSnap.exists()) {
          // If order record is missing, we still try to delete order record if it exists
          transaction.delete(orderRef);
          return;
        }

        const data = orderSnap.data();
        const items = data.items || [];
        itemsToRevert = items;

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
        
        // Delete associated returns
        for (const rRef of returnRefs) {
          transaction.delete(rRef);
        }
      });

      // 3. Update Supabase if available
      const supabase = getSupabase();
      if (supabase) {
        // Delete from orders
        await supabase.from('orders').delete().eq('tracking_code', trackingCode);
        // Delete from print history
        await supabase.from('print_history').delete().eq('tracking_number', trackingCode);
        
        // Update stock in Supabase for each item
        for (const item of itemsToRevert) {
           const { data: prod } = await supabase
            .from('products')
            .select('stock_quantity, id')
            .eq('sku', item.sku)
            .eq('variant', item.variant || 'Mặc định')
            .maybeSingle();
           if (prod) {
             await supabase.from('products').update({
               stock_quantity: Number(prod.stock_quantity || 0) + Number(item.quantity)
             }).eq('id', prod.id);
             
             // Log to Supabase
             await supabase.from('inventory_logs').insert({
               user_id: currentUserId,
               sku: item.sku,
               product_name: item.productName || `Sản phẩm ${item.sku}`,
               variant: item.variant || '',
               quantity_change: Number(item.quantity),
               type: 'addition',
               tracking_code: trackingCode,
               timestamp: new Date().toISOString(),
               details: 'Hoàn tác đơn hàng'
             });
           }
        }
      }
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
