import { Type } from "@google/genai";
import { GeminiService } from "./gemini";
import { collection, addDoc, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Product } from '../types';

export interface ScannedProduct {
  name: string;
  sku: string;
  variant: string;
  stock: number;
  image: string;
  category: string;
  sellingPrice: number;
  costPrice: number;
}

export class ShopeeService {
  static async validateApiKey(key: string): Promise<boolean> {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const tempAi = new GoogleGenAI({ apiKey: key });
      
      await tempAi.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "test",
        config: { maxOutputTokens: 1 }
      });
      return true;
    } catch (error: any) {
      console.error("API Key Validation Error:", error);
      // The error structure might be different in this SDK
      const errorStr = JSON.stringify(error);
      if (errorStr.includes('API_KEY_INVALID') || error.message?.includes('API_KEY_INVALID')) {
        throw new Error('Sai API Key');
      }
      if (errorStr.includes('model') && errorStr.includes('not found')) {
        throw new Error('Model AI không được hỗ trợ');
      }
      throw new Error(error.message || 'Lỗi kết nối AI');
    }
  }

  static async scanShop(shopUrl: string, rawText?: string, apiKey?: string): Promise<ScannedProduct[]> {
    try {
      const ai = GeminiService.getInstance();
      if (!ai) throw new Error('MISSING_API_KEY');
      const prompt = rawText 
        ? `DƯỚI ĐÂY LÀ DỮ LIỆU VĂN BẢN THÔ TỪ TRANG SẢN PHẨM HOẶC CỬA HÀNG SHOPEE:
           ---
           ${rawText}
           ---
           NHIỆM VỤ: Trích xuất danh sách sản phẩm thực tế.
           LƯU Ý QUAN TRỌNG: 
           - Nếu đây là một trang sản phẩm đơn lẻ có NHIỀU PHÂN LOẠI (ví dụ: nhiều màu sắc, nhiều kích thước), hãy tách MỖI PHÂN LOẠI thành một đối tượng riêng biệt trong mảng kết quả.
           - Mỗi đối tượng phải có SKU riêng (ví dụ: PITI-RED-01, PITI-BLUE-02).
           - Trích xuất đúng số lượng tồn kho thực tế của từng phân loại đó.
           - Tên sản phẩm nên bao gồm tên gốc + tên phân loại nếu cần thiết để phân biệt.`
        : `TRUY CẬP VÀ TRÍCH XUẤT DỮ LIỆU THỰC TẾ từ cửa hàng Shopee tại URL: ${shopUrl}.
        
        YÊU CẦU NGHIÊM NGẶT:
        1. CHỈ trích xuất các sản phẩm thực tế đang hiển thị trên trang web này. 
        2. KHÔNG ĐƯỢC tự tạo ra dữ liệu giả định hoặc dữ liệu mẫu nếu không đọc được nội dung trang.
        3. Nếu trang web không cho phép truy cập nội dung sản phẩm hoặc trống, hãy trả về mảng trống [].
        4. Tên shop mục tiêu là: "piti.store". Hãy đảm bảo các sản phẩm thuộc về shop này.
        
        Thông tin cần lấy:
        - Tên sản phẩm: Tên đầy đủ hiển thị trên Shopee.
        - SKU: Tìm mã SKU trong tên hoặc mô tả. Nếu không có, hãy tạo mã theo định dạng: PITI-[Tên viết tắt]-[Số ngẫu nhiên].
        - Phân loại: Các biến thể màu sắc/kích thước.
        - Tồn kho: Số lượng còn lại thực tế.
        - Hình ảnh: URL ảnh sản phẩm thực tế.
        - Danh mục: Loại sản phẩm (ví dụ: Phụ kiện, Thời trang...).
        
        Trả về kết quả dưới dạng mảng JSON các đối tượng.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: rawText ? [] : [{ urlContext: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Tên sản phẩm" },
                sku: { type: Type.STRING, description: "Mã SKU nội bộ" },
                variant: { type: Type.STRING, description: "Phân loại sản phẩm" },
                stock: { type: Type.NUMBER, description: "Số lượng tồn kho" },
                image: { type: Type.STRING, description: "Link hình ảnh sản phẩm" },
                category: { type: Type.STRING, description: "Danh mục sản phẩm" },
                sellingPrice: { type: Type.NUMBER, description: "Giá bán hiện tại (VNĐ)" },
                costPrice: { type: Type.NUMBER, description: "Giá vốn ước tính (VNĐ)" }
              },
              required: ["name", "sku", "variant", "stock", "category", "sellingPrice", "costPrice"]
            }
          }
        }
      });

      const products = JSON.parse(response.text || "[]") as ScannedProduct[];
      
      if (products.length === 0) {
        throw new Error(rawText 
          ? "Không tìm thấy sản phẩm nào trong văn bản bạn dán vào. Vui lòng copy toàn bộ trang shop."
          : "Shopee đang chặn truy cập tự động từ link này. Vui lòng sử dụng tính năng 'Dán văn bản' để tiếp tục.");
      }

      // Fallback images if not found
      return products.map(p => ({
        ...p,
        image: p.image || `https://picsum.photos/seed/${encodeURIComponent(p.name)}/200/200`
      }));
    } catch (error: any) {
      console.error("Shopee Scan Error:", error);
      throw new Error(error.message || "Không thể quét dữ liệu. Vui lòng thử lại sau.");
    }
  }

  static async saveToInventory(userId: string, products: ScannedProduct[]): Promise<void> {
    const inventoryRef = collection(db, 'inventory');
    
    for (const product of products) {
      // Check if SKU already exists for this user
      const q = query(
        inventoryRef, 
        where("userId", "==", userId),
        where("sku", "==", product.sku)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // Add new product
        await addDoc(inventoryRef, {
          userId,
          sku: product.sku,
          name: product.name,
          stock: product.stock,
          variant: product.variant,
          category: product.category,
          image: product.image,
          sellingPrice: product.sellingPrice,
          costPrice: product.costPrice,
          status: product.stock > 10 ? 'in_stock' : product.stock > 0 ? 'low_stock' : 'out_of_stock',
          createdAt: new Date().toISOString()
        });
      } else {
        // Update existing product stock
        const docId = querySnapshot.docs[0].id;
        await updateDoc(doc(db, 'inventory', docId), {
          stock: product.stock,
          status: product.stock > 10 ? 'in_stock' : product.stock > 0 ? 'low_stock' : 'out_of_stock',
          updatedAt: new Date().toISOString()
        });
      }
    }
  }
}
