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

    const ai = new GoogleGenAI({ apiKey: useKey });
    
    try {
      // Logic for request
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: responseMimeType as any,
          responseSchema
        }
      });

      // Increment usage count for the shop
      const userRef = doc(db, 'users', userId);
      updateDoc(userRef, {
        dailyOrderCount: increment(1),
        lastUsedAt: new Date().toISOString()
      }).catch(e => console.error('Failed to update usage count:', e));

      return response.text || '';
    } catch (err: any) {
      const errorStr = err.message || '';
      const isQuotaError = errorStr.includes('429') || errorStr.includes('Quota') || errorStr.includes('RESOURCE_EXHAUSTED');
      const isAuthError = errorStr.includes('401') || errorStr.includes('Unauthorized') || errorStr.includes('API_KEY_INVALID');

      if ((isQuotaError || isAuthError) && fallbackKey && shopPlan !== 'free') {
        console.log(`[GeminiService] Failover triggered for user ${userId} using system fallback key.`);
        
        // Show notification to user
        toast("Hạn mức cá nhân của bạn đã hết, hệ thống đang tạm thời sử dụng tài nguyên dự phòng của Quản trị viên để xử lý đơn hàng", {
          icon: '🛡️',
          duration: 6000,
          style: {
            borderRadius: '16px',
            background: '#333',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 'bold'
          }
        });
        logErrorToSupabase(
          new Error(`Failover used: ${isQuotaError ? 'Quota' : 'Auth'} error on shop key.`),
          feature,
          userId,
          'Đã dùng dự phòng' // Custom tag/label
        );

        const fallbackAi = new GoogleGenAI({ apiKey: fallbackKey });
        const fallbackResponse = await fallbackAi.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: responseMimeType as any,
            responseSchema
          }
        });

        // Increment usage count even for fallback
        const userRef = doc(db, 'users', userId);
        updateDoc(userRef, {
          dailyOrderCount: increment(1),
          usedFallback: true
        }).catch(e => console.error('Failed to update fallback usage:', e));

        return fallbackResponse.text || '';
      }

      // Re-throw if no failover possible
      throw err;
    }
  }
}
