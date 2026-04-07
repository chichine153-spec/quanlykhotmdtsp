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

    const apiKey = localStorage.getItem('gemini_api_key') || GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[GeminiService] No API Key found in LocalStorage or Constant.');
      return null;
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
    return !!(localStorage.getItem('gemini_api_key') || GEMINI_API_KEY);
  }
}
