import { GoogleGenAI } from "@google/genai";
import { logErrorToSupabase } from "../lib/error-logging";
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'react-hot-toast';

// Safe access to environment variables in both Node and Browser
const GEMINI_API_KEY = (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') || '';

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
      apiKey = customKey;
    } else {
      // 1. Check direct localStorage
      apiKey = localStorage.getItem('gemini_api_key') || '';
      
      // 2. Check global config cache from DataContext
      if (!apiKey) {
        try {
          const cachedGlobal = localStorage.getItem('cache_global_config');
          if (cachedGlobal) {
            const parsed = JSON.parse(cachedGlobal);
            apiKey = parsed.geminiApiKey || '';
          }
        } catch (e) {}
      }

      // 3. Fallback to other possible names or env
      if (!apiKey) {
        apiKey = localStorage.getItem('global_gemini_key') || GEMINI_API_KEY;
      }
    }

    if (!apiKey) {
      console.warn('[GeminiService] No API Key found.');
      return null;
    }

    if (customKey) {
      // Return a fresh instance for testing, don't cache
      return new GoogleGenAI({ apiKey });
    }

    // Cache the standard instance
    console.log('[GeminiService] Initializing new instance with key source:', customKey ? 'custom' : 'stored');
    this.instance = new GoogleGenAI({ apiKey });
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

    const useKey = shopKey || fallbackKey || GEMINI_API_KEY;
    
    if (!useKey) {
      throw new Error('MISSING_API_KEY');
    }

    // Proxy call function using fetch for better control over error handling
    const callProxy = async (apiKey: string) => {
      try {
        const response = await fetch('/api/gemini/proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiKey,
            model: "gemini-3-flash-preview",
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

        // Parse detailed error body if possible
        const errorData = await response.json().catch(() => ({}));
        const errorContent = JSON.stringify(errorData);

        // Handle specific error codes for fallback or retry
        if (response.status === 429 || errorContent.includes('429') || errorContent.includes('RESOURCE_EXHAUSTED')) {
          throw new Error('GEMINI_QUOTA_EXCEEDED');
        }
        
        if (response.status === 503 || errorContent.includes('503') || errorContent.includes('UNAVAILABLE')) {
          throw new Error('GEMINI_SERVICE_UNAVAILABLE');
        }

        if (response.status === 404 || response.status >= 500) {
          console.warn(`[GeminiService] Server Proxy returned ${response.status}. Switching to direct client-side call.`);
          return await callDirect(apiKey);
        }

        const errorMsg = errorData.error || `Proxy error ${response.status}`;
        throw new Error(errorMsg);
      } catch (err: any) {
        if (err.message === 'GEMINI_QUOTA_EXCEEDED' || err.message === 'GEMINI_SERVICE_UNAVAILABLE') {
          throw err;
        }
        // If it was a network error (failed to fetch), try fallback
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
          console.warn('[GeminiService] Network error to proxy. Switching to direct client-side call.');
          return await callDirect(apiKey);
        }
        throw err;
      }
    };

    // Extract content call logic to reusable function
    const callDirect = async (apiKey: string) => {
      try {
        const genAI = new GoogleGenAI({ apiKey });
        
        const result = await genAI.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: typeof prompt === 'string' ? [{ role: 'user', parts: [{ text: prompt }]}] : prompt as any,
          config: {
            systemInstruction: typeof systemInstruction === 'string' ? systemInstruction : undefined,
            responseMimeType: responseMimeType as any,
            responseSchema
          }
        });

        return result.text || '';
      } catch (directErr: any) {
        console.error('[GeminiService] Direct client-side call also failed:', directErr);
        const errStr = directErr.message || '';
        if (errStr.includes('429') || errStr.includes('Quota') || errStr.includes('RESOURCE_EXHAUSTED')) {
          throw new Error('GEMINI_QUOTA_EXCEEDED');
        }
        if (errStr.includes('503') || errStr.includes('UNAVAILABLE')) {
          throw new Error('GEMINI_SERVICE_UNAVAILABLE');
        }
        if (errStr.includes('API_KEY_INVALID')) {
          throw new Error('API_KEY_INVALID');
        }
        throw directErr;
      }
    };
    
    // Main execution loop with retries and model rotation
    const maxRetries = 3;
    let attempt = 0;
    let currentKey = useKey;
    
    // Model rotation: Try flash-preview first, then stable flash
    const models = ["gemini-3-flash-preview", "gemini-1.5-flash", "gemini-2.0-flash-exp"];
    let modelIdx = 0;

    while (attempt < maxRetries) {
      const currentModel = models[modelIdx];
      
      try {
        // Wrap callProxy to include the model
        const callWithModel = async (apiKey: string, model: string) => {
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

        const callDirectWithModel = async (apiKey: string, model: string) => {
          try {
            const genAI = new GoogleGenAI({ apiKey });
            const modelToUse = model.replace('-preview', ''); // Some clients don't like -preview in SDK
            const result = await genAI.models.generateContent({
              model: modelToUse,
              contents: typeof prompt === 'string' ? [{ role: 'user', parts: [{ text: prompt }]}] : prompt as any,
              config: {
                systemInstruction: typeof systemInstruction === 'string' ? systemInstruction : undefined,
                responseMimeType: responseMimeType as any,
                responseSchema
              }
            });
            return result.text || '';
          } catch (directErr: any) {
            const errStr = directErr.message || '';
            if (errStr.includes('429') || errStr.includes('Quota') || errStr.includes('RESOURCE_EXHAUSTED')) throw new Error('GEMINI_QUOTA_EXCEEDED');
            if (errStr.includes('503') || errStr.includes('UNAVAILABLE')) throw new Error('GEMINI_SERVICE_UNAVAILABLE');
            if (errStr.includes('API_KEY_INVALID')) throw new Error('API_KEY_INVALID');
            throw directErr;
          }
        };

        return await callWithModel(currentKey, currentModel);
      } catch (err: any) {
        const errorMsg = err.message || '';
        const isQuotaError = errorMsg === 'GEMINI_QUOTA_EXCEEDED';
        const isServiceBusy = errorMsg === 'GEMINI_SERVICE_UNAVAILABLE';
        const isAuthError = errorMsg === 'API_KEY_INVALID' || errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('INVALID_ARGUMENT');
        
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
        if (isQuotaError) {
          throw new Error("Lượt sử dụng AI hôm nay của bạn đã hết. Vui lòng nâng cấp gói hoặc thử lại vào ngày mai.");
        }
        if (isServiceBusy) {
          throw new Error("Dịch vụ Google AI đang quá tải. Vui lòng thử lại sau vài giây.");
        }
        if (isAuthError) {
          throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại cấu hình trong phần Quản lý tài khoản.");
        }

        throw err;
      }
    }

    throw new Error("Hệ thống không thể xử lý yêu cầu sau nhiều lần thử. Vui lòng thử lại sau.");
  }
}
