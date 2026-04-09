import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Key, X, CheckCircle2, AlertTriangle, ExternalLink, Loader2, Settings } from 'lucide-react';
import { ShopeeService } from '../services/shopeeService';
import { GeminiService } from '../services/gemini';

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GeminiKeyModal({ isOpen, onClose }: GeminiKeyModalProps) {
  const [apiKey, setApiKey] = React.useState(localStorage.getItem('gemini_api_key') || '');
  const [supabaseUrl, setSupabaseUrl] = React.useState(localStorage.getItem('supabase_url') || '');
  const [supabaseKey, setSupabaseKey] = React.useState(localStorage.getItem('supabase_anon_key') || '');
  const [isValidating, setIsValidating] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = React.useState('');

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setErrorMessage('Vui lòng nhập Gemini API Key');
      setStatus('error');
      return;
    }

    if (!supabaseKey.trim()) {
      setErrorMessage('Vui lòng nhập Supabase Anon Key');
      setStatus('error');
      return;
    }

    setIsValidating(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      const isValid = await ShopeeService.validateApiKey(apiKey.trim());
      if (isValid) {
        localStorage.setItem('gemini_api_key', apiKey.trim());
        localStorage.setItem('supabase_url', supabaseUrl.trim() || 'https://pdqhkeewyvimykvyexgo.supabase.co');
        localStorage.setItem('supabase_anon_key', supabaseKey.trim());
        
        GeminiService.resetInstance();
        setStatus('success');
        setTimeout(() => {
          onClose();
          setStatus('idle');
          window.location.reload(); // Reload to re-initialize Supabase client
        }, 1500);
      } else {
        setStatus('error');
        setErrorMessage('Gemini API Key không hợp lệ hoặc đã hết hạn.');
      }
    } catch (error: any) {
      setStatus('error');
      setErrorMessage(error.message || 'Lỗi khi xác thực API Key');
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemove = () => {
    localStorage.removeItem('gemini_api_key');
    localStorage.removeItem('supabase_url');
    localStorage.removeItem('supabase_anon_key');
    GeminiService.resetInstance();
    setApiKey('');
    setSupabaseUrl('');
    setSupabaseKey('');
    setStatus('idle');
    onClose();
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-surface-container"
          >
            <div className="p-8 border-b border-surface-container flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Key size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-on-surface tracking-tight">Cấu hình Hệ thống</h2>
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Gemini AI & Supabase Storage</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-surface-container rounded-full transition-colors text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Gemini Section */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Gemini API Key</label>
                <div className="relative">
                  <input 
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Dán mã Gemini API Key..."
                    className="w-full px-6 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono text-sm"
                  />
                </div>
              </div>

              {/* Supabase Section */}
              <div className="space-y-4 pt-4 border-t border-surface-container">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Supabase URL</label>
                  <input 
                    type="text"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://your-project.supabase.co"
                    className="w-full px-6 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Supabase Anon Key</label>
                  <input 
                    type="password"
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    placeholder="Dán mã Supabase Anon Key..."
                    className="w-full px-6 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono text-sm"
                  />
                </div>
              </div>

              {status === 'error' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-4 bg-error/10 border border-error/20 rounded-2xl flex items-center gap-3 text-error text-xs font-bold"
                >
                  <AlertTriangle size={18} />
                  {errorMessage}
                </motion.div>
              )}

              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-3">
                <p className="text-[10px] text-on-surface font-medium leading-relaxed">
                  <strong>Lưu ý:</strong> Tính năng <strong>In lại đơn hàng</strong> yêu cầu Supabase để lưu trữ ảnh vận đơn.
                </p>
                <button 
                  onClick={() => {
                    onClose();
                    // We need a way to trigger the screen change in App.tsx
                    // Since we don't have a global state for activeScreen here, 
                    // we can use a custom event or just tell the user to use the sidebar.
                    // But wait, Layout.tsx handles the sidebar.
                    // Let's just add a button that says "Go to full settings"
                  }}
                  className="w-full py-2 bg-white border border-primary/20 rounded-xl text-[10px] font-black text-primary uppercase hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
                >
                  <Settings size={12} /> Xem cấu hình chi tiết
                </button>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleRemove}
                  className="flex-1 py-4 border border-surface-container rounded-2xl font-bold text-secondary text-xs hover:bg-surface-container transition-all"
                >
                  Gỡ bỏ
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isValidating || !apiKey || !supabaseKey}
                  className="flex-[2] py-4 bg-primary text-white rounded-2xl font-bold text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isValidating ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  <span>{isValidating ? 'Đang xác thực...' : 'Lưu & Kích hoạt'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
