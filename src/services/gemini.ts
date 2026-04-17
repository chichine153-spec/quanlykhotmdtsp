import { GoogleGenAI } from "@google/genai";

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
}
