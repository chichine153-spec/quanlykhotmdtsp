import { GoogleGenAI, Type } from "@google/genai";

export interface MarketingContent {
  title: string;
  description: string;
  tiktokScript: string;
}

export class MarketingService {
  private static ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
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
        }
      });

      return JSON.parse(response.text || '{}');
    } catch (error) {
      console.error("Marketing Service Error:", error);
      throw new Error("Không thể tạo nội dung Marketing lúc này.");
    }
  }
}
