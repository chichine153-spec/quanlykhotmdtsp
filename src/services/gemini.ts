import { GoogleGenAI } from "@google/genai";

// Cố định API Key để đảm bảo hệ thống luôn hoạt động
// Bạn có thể dán mã API của mình vào đây: const GEMINI_API_KEY = "MÃ_API_CỦA_BẠN";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/**
 * Centralized Gemini API configuration and initialization.
 */
export class GeminiService {
  private static instance: GoogleGenAI | null = null;

  /**
   * Gets or initializes the Gemini instance.
   * @returns The GoogleGenAI instance or null if no API key is set.
   */
  static getInstance(): GoogleGenAI | null {
    if (this.instance) return this.instance;

    // Get shared key from global config (synced via DataContext)
    let sharedKey = '';
    try {
      const cachedGlobal = localStorage.getItem('cache_global_config');
      if (cachedGlobal) {
        const parsed = JSON.parse(cachedGlobal);
        sharedKey = parsed.geminiApiKey || '';
      }
    } catch (e) {
      console.error('[GeminiService] Error reading global config cache:', e);
    }

    const apiKey = localStorage.getItem('gemini_api_key') || 
                   sharedKey ||
                   localStorage.getItem('global_gemini_key') || 
                   GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[GeminiService] No API Key found.');
      return null;
    }

    if (apiKey === sharedKey && sharedKey !== "") {
      console.info('[GeminiService] Using Global Shared API Key.');
    } else if (apiKey === GEMINI_API_KEY && GEMINI_API_KEY !== "") {
      console.info('[GeminiService] Using fallback community API Key.');
    }

    this.instance = new GoogleGenAI({ apiKey });
    return this.instance;
  }

  /**
   * Resets the instance (useful when API key changes).
   */
  static resetInstance() {
    this.instance = null;
  }

  /**
   * Checks if an API key is configured.
   */
  static hasApiKey(): boolean {
    let sharedKey = '';
    try {
      const cachedGlobal = localStorage.getItem('cache_global_config');
      if (cachedGlobal) {
        const parsed = JSON.parse(cachedGlobal);
        sharedKey = parsed.geminiApiKey || '';
      }
    } catch (e) {}

    return !!(localStorage.getItem('gemini_api_key') || 
              sharedKey ||
              localStorage.getItem('global_gemini_key') || 
              GEMINI_API_KEY);
  }
}
