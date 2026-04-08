import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Key, X, CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { ShopeeService } from '../services/shopeeService';
import { GeminiService } from '../services/gemini';

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GeminiKeyModal({ isOpen, onClose }: GeminiKeyModalProps) {
  const [apiKey, setApiKey] = React.useState(localStorage.getItem('gemini_api_key') || '');
  const [isValidating, setIsValidating] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = React.useState('');

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setErrorMessage('Vui lòng nhập API Key');
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
        GeminiService.resetInstance();
        setStatus('success');
        setTimeout(() => {
          onClose();
          setStatus('idle');
        }, 1500);
      } else {
        setStatus('error');
        setErrorMessage('API Key không hợp lệ hoặc đã hết hạn.');
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
    GeminiService.resetInstance();
    setApiKey('');
    setStatus('idle');
    onClose();
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
                  <h2 className="text-xl font-black text-on-surface tracking-tight">Cấu hình Gemini AI</h2>
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Yêu cầu để bóc tách Shopee</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-surface-container rounded-full transition-colors text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Gemini API Key</label>
                <div className="relative">
                  <input 
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Dán mã API Key của bạn vào đây..."
                    className="w-full px-6 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono text-sm"
                  />
                  {status === 'success' && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500">
                      <CheckCircle2 size={20} />
                    </div>
                  )}
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

              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                <p className="text-xs text-on-surface font-medium leading-relaxed">
                  API Key được dùng để bóc tách dữ liệu từ Shopee bằng AI. Bạn có thể lấy mã miễn phí tại:
                </p>
                <div className="flex flex-wrap gap-4 mt-2">
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary font-black text-[10px] uppercase tracking-wider hover:underline"
                  >
                    Google AI Studio <ExternalLink size={12} />
                  </a>
                  <a 
                    href={`mailto:chichine153@gmail.com?subject=${encodeURIComponent('[Hệ thống kho TMĐT] - Yêu cầu kích hoạt mới từ ' + (localStorage.getItem('user_email') || 'Người dùng'))}&body=${encodeURIComponent('Chào bạn,\n\nTôi muốn yêu cầu kích hoạt tài khoản cho hệ thống quản lý kho TMĐT.\n\nEmail của tôi: ' + (localStorage.getItem('user_email') || ''))}`}
                    className="inline-flex items-center gap-1.5 text-secondary font-black text-[10px] uppercase tracking-wider hover:underline"
                  >
                    Yêu cầu kích hoạt <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleRemove}
                  className="flex-1 py-4 border border-surface-container rounded-2xl font-bold text-secondary text-xs hover:bg-surface-container transition-all"
                >
                  Gỡ bỏ mã
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isValidating || !apiKey}
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
