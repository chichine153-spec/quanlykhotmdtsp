import { GoogleGenAI } from "@google/genai";
import { logErrorToSupabase } from "../lib/error-logging";
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'react-hot-toast';

/**
 * Centralized Gemini API configuration and initialization.
 */
export class GeminiService {
  private static instance: GoogleGenAI | null = null;

  /**
   * Gets or initializes the Gemini instance.
   * @returns The GoogleGenAI instance or null if no API key is set.
   */
  static getInstance(customKey?: string): GoogleGenAI | null {
    // If not a custom key check and we have an instance, use it
    if (!customKey && this.instance) return this.instance;

    // Resolve which key to use
    let apiKey = '';

    if (customKey) {
      apiKey = customKey.trim();
    } else {
      // 1. Check direct localStorage
      apiKey = (localStorage.getItem('gemini_api_key') || '').trim();
      
      // 2. Check global config cache from DataContext
      if (!apiKey) {
        try {
          const cachedGlobal = localStorage.getItem('cache_global_config');
          if (cachedGlobal) {
            const parsed = JSON.parse(cachedGlobal);
            apiKey = (parsed.geminiApiKey || '').trim();
          }
        } catch (e) {}
      }

      // 3. Fallback to other possible names or env
      if (!apiKey) {
        apiKey = (localStorage.getItem('global_gemini_key') || process.env.GEMINI_API_KEY || '').trim();
      }
    }

    if (!apiKey) {
      console.warn('[GeminiService] No API Key found.');
      return null;
    }

    if (customKey) {
      // Return a fresh instance for testing, don't cache
      return new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }

    // Cache the standard instance
    console.log('[GeminiService] Initializing new instance with key source:', customKey ? 'custom' : 'stored');
    this.instance = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    return this.instance;
  }

  /**
   * Resets the instance (useful when API key changes).
   */
  static resetInstance() {
    console.log('[GeminiService] Instance reset requested.');
    this.instance = null;
  }

  /**
   * Checks if an API key is configured.
   */
  static hasApiKey(): boolean {
    return this.getInstance() !== null;
  }

  /**
   * Small sleep utility
   */
  private static async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Executes an AI request with automatic failover logic.
   */
  static async handleAIRequest(params: {
    prompt: string;
    systemInstruction?: string;
    shopKey: string | null;
    fallbackKey: string | null;
    shopPlan: string;
    userId: string;
    feature: string;
    responseMimeType?: string;
    responseSchema?: any;
  }): Promise<string> {
    const { 
      prompt, 
      systemInstruction, 
      shopKey, 
      fallbackKey, 
      shopPlan, 
      userId, 
      feature,
      responseMimeType,
      responseSchema 
    } = params;

    const useKey = shopKey || fallbackKey || process.env.GEMINI_API_KEY || '';
    
    if (!useKey) {
      throw new Error('MISSING_API_KEY');
    }
    
    // Main execution loop with retries and model rotation
    const maxRetries = 3;
    let attempt = 0;
    let currentKey = useKey;
    
    // Model rotation: Use Gemini 3 series as per new documentation
    const models = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
    let modelIdx = 0;

    while (attempt < maxRetries) {
      const currentModel = models[modelIdx];
      console.log(`[GeminiService] Attempt ${attempt + 1}: Using model ${currentModel}`);
      
      try {
        // Wrap callProxy to include the model
        const callWithModel = async (apiKey: string, model: string) => {
          console.log(`[GeminiService] Calling proxy with model: ${model}`);
          try {
            const response = await fetch('/api/gemini/proxy', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                apiKey,
                model,
                contents: prompt,
                systemInstruction,
                config: {
                  generationConfig: {
                    responseMimeType: responseMimeType as any,
                    responseSchema
                  }
                }
              }),
            });

            if (response.ok) {
              const data = await response.json();
              return data.text;
            }

            const errorData = await response.json().catch(() => ({}));
            const errorContent = JSON.stringify(errorData);

            if (response.status === 429 || errorContent.includes('429') || errorContent.includes('RESOURCE_EXHAUSTED')) {
              throw new Error('GEMINI_QUOTA_EXCEEDED');
            }
            if (response.status === 503 || errorContent.includes('503') || errorContent.includes('UNAVAILABLE')) {
              throw new Error('GEMINI_SERVICE_UNAVAILABLE');
            }
            if (response.status === 404 || response.status >= 500) {
              return await callDirectWithModel(apiKey, model);
            }
            throw new Error(errorData.error || `Proxy error ${response.status}`);
          } catch (err: any) {
            if (err.message === 'GEMINI_QUOTA_EXCEEDED' || err.message === 'GEMINI_SERVICE_UNAVAILABLE') throw err;
            if (err.name === 'TypeError' && err.message === 'Failed to fetch') return await callDirectWithModel(apiKey, model);
            throw err;
          }
        };

        const callDirectWithModel = async (apiKey: string, modelName: string) => {
          console.log(`[GeminiService] Calling direct with model: ${modelName}`);
          
          const ai = new GoogleGenAI({ 
            apiKey: apiKey.trim(),
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              }
            }
          });

          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction,
                responseMimeType: responseMimeType as any,
                responseSchema
              }
            });

            return response.text || '';
          } catch (error: any) {
             const msg = error.message || '';
             console.error(`[GeminiService] Direct call failed for ${modelName}:`, msg);
             
             if (msg.includes('429') || msg.includes('Quota')) throw new Error('GEMINI_QUOTA_EXCEEDED');
             if (msg.includes('503') || msg.includes('UNAVAILABLE')) throw new Error('GEMINI_SERVICE_UNAVAILABLE');
             if (msg.includes('401') || msg.includes('403')) throw new Error('API_KEY_INVALID');
             
             throw error;
          }
        };

        return await callWithModel(currentKey, currentModel);
      } catch (err: any) {
        const errorMsg = err.message || '';
        const isQuotaError = errorMsg === 'GEMINI_QUOTA_EXCEEDED';
        const isServiceBusy = errorMsg === 'GEMINI_SERVICE_UNAVAILABLE';
        const isAuthError = 
          errorMsg === 'API_KEY_INVALID' || 
          errorMsg.includes('401') || 
          errorMsg.includes('Unauthorized') || 
          errorMsg.includes('INVALID_ARGUMENT') ||
          errorMsg.includes('API key not valid') ||
          errorMsg.includes('not authorized') ||
          errorMsg.includes('API_KEY_EXPIRED');
        
        // If Quota Error, try next model first before retrying same model
        if (isQuotaError && modelIdx < models.length - 1) {
          modelIdx++;
          console.warn(`[GeminiService] Model ${currentModel} reached quota. Trying ${models[modelIdx]}...`);
          await this.sleep(1000);
          continue;
        }

        // Retryable errors
        if ((isQuotaError || isServiceBusy) && attempt < maxRetries - 1) {
          attempt++;
          modelIdx = 0; // Reset model index when retrying with backoff
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 2000;
          console.warn(`[GeminiService] Attempt ${attempt} failed: ${errorMsg}. Retrying in ${Math.round(delay)}ms...`);
          await this.sleep(delay);
          continue;
        }

        // Failover logic (only if we haven't already switched to fallbackKey)
        if ((isQuotaError || isServiceBusy || isAuthError) && currentKey === shopKey && fallbackKey && shopPlan !== 'free') {
          console.log(`[GeminiService] Failover to backup key for user ${userId}.`);
          toast.success("Hệ thống chuyển sang dự phòng...", { icon: '🛡️', duration: 2000 });
          currentKey = fallbackKey;
          attempt = 0;
          modelIdx = 0;
          continue;
        }

        // Final specific error messages
        const cleanError = (msg: string) => {
          try {
            const parsed = JSON.parse(msg);
            return parsed.error?.message || msg;
          } catch (e) {
            return msg;
          }
        };

        const finalMsg = cleanError(errorMsg);

        if (isQuotaError) {
          throw new Error("Lượt sử dụng AI hôm nay của bạn đã hết (429 Quota). Vui lòng nâng cấp gói hoặc thử lại vào ngày mai.");
        }
        if (isServiceBusy) {
          throw new Error("Dịch vụ Google AI đang quá tải (503). Vui lòng thử lại sau vài giây.");
        }
        if (isAuthError) {
          throw new Error(`API Key lỗi xác thực: ${finalMsg}. Vui lòng kiểm tra lại mã Key.`);
        }

        throw new Error(`Lỗi kết nối AI (${finalMsg}). Vui lòng thử lại.`);
      }
    }

    throw new Error("Hệ thống không thể xử lý yêu cầu sau nhiều lần thử. Vui lòng thử lại sau.");
  }
}
