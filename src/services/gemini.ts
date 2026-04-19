import { GoogleGenAI } from "@google/genai";
import axios from "axios";
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

    // Proxy call function to follow security guidelines (executing on server side)
    const callProxy = async (apiKey: string) => {
      const resp = await axios.post('/api/gemini/proxy', {
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
      });
      return resp.data.text;
    };
    
    try {
      // 1. First Attempt with Primary Key
      const text = await callProxy(useKey);

      return text || '';
    } catch (err: any) {
      const errorStr = (err.response?.data?.error || err.message || '').toString();
      const isQuotaError = errorStr.includes('429') || errorStr.includes('Quota') || errorStr.includes('RESOURCE_EXHAUSTED');
      const isAuthError = errorStr.includes('401') || errorStr.includes('Unauthorized') || errorStr.includes('API_KEY_INVALID') || errorStr.includes('INVALID_ARGUMENT');

      // Failover logic: Trigger fallback only for non-free plans if primary key fails
      if ((isQuotaError || isAuthError) && fallbackKey && shopPlan !== 'free' && shopKey) {
        console.log(`[GeminiService] Failover triggered via Proxy for user ${userId}.`);
        
        // Show notification to user
        toast("Hạn mức cá nhân của bạn đã hết (hoặc lỗi Key), hệ thống đang tạm thời sử dụng tài nguyên dự phòng của Quản trị viên để xử lý", {
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

        try {
          const fallbackText = await callProxy(fallbackKey);

          return fallbackText || '';
        } catch (fallbackErr) {
          throw fallbackErr;
        }
      }

      // Specific error message as requested by user if key fails and no failover
      if (isQuotaError || isAuthError) {
        throw new Error("API Key của bạn không hợp lệ hoặc hết hạn. Vui lòng kiểm tra lại tại Google AI Studio hoặc nâng cấp gói Foot để sử dụng Key dự phòng của hệ thống");
      }

      throw err;
    }
  }
}
