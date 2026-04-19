import { Type } from "@google/genai";
import { GeminiService } from "./gemini";

export interface MarketingContent {
  title: string;
  description: string;
  tiktokScript: string;
}

export class MarketingService {
  static async generateMarketingContent(product: { name: string; sku: string; variant?: string; category?: string }): Promise<MarketingContent> {
    const prompt = `
      Bạn là một chuyên gia Marketing thực chiến trên Shopee và TikTok. 
      Nhiệm vụ: Tạo nội dung bán hàng cực kỳ hấp dẫn cho sản phẩm sau:
      - Tên: ${product.name}
      - SKU: ${product.sku}
      - Phân loại: ${product.variant || 'Mặc định'}
      - Ngành hàng: ${product.category || 'Chưa phân loại'}

      Yêu cầu:
      1. Tiêu đề (Title): Chuẩn SEO Shopee, chứa từ khóa hot, giật tít thu hút click.
      2. Mô tả (Description): Hấp dẫn, nêu bật lợi ích (Benefits), có CTA mạnh mẽ.
      3. Kịch bản TikTok (TikTok Script): Kịch bản 30 giây thu hút trong 3 giây đầu, có lời thoại và chỉ dẫn hành động.

      Hãy phản hồi bằng định dạng JSON.
    `;

    try {
      // Use GeminiService to avoid crashes if API key is missing
      const resultText = await GeminiService.handleAIRequest({
        prompt,
        shopKey: null,
        fallbackKey: null,
        shopPlan: 'free',
        userId: 'system',
        feature: 'marketing',
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            tiktokScript: { type: Type.STRING }
          },
          required: ["title", "description", "tiktokScript"]
        }
      });

      return JSON.parse(resultText || '{}');
    } catch (error: any) {
      console.error("Marketing Service Error:", error);
      if (error.message === 'MISSING_API_KEY') {
        throw new Error("Chưa cấu hình API Key cho Gemini. Vui lòng kiểm tra mục cài đặt.");
      }
      throw new Error("Không thể tạo nội dung Marketing lúc này.");
    }
  }
}
