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
    if (!customKey && this.instance) return this.instance;

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

    const apiKey = customKey ||
                   localStorage.getItem('gemini_api_key') || 
                   sharedKey ||
                   localStorage.getItem('global_gemini_key') || 
                   GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[GeminiService] No API Key found.');
      return null;
    }

    if (customKey) {
      // Don't cache the test instance
      return new GoogleGenAI({ apiKey });
    }

    if (this.instance) return this.instance;
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
