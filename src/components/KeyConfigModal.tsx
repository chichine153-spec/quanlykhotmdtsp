import React from 'react';
import { Key, Check, Save, Loader2, X, Shield, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { GeminiService } from '../services/gemini';
import { toast } from 'react-hot-toast';

interface KeyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyConfigModal({ isOpen, onClose }: KeyConfigModalProps) {
  const { user, geminiApiKey: initialKey, refreshUsage, setGeminiApiKey } = useAuth();
  const [apiKey, setApiKey] = React.useState(initialKey || '');
  const [supabaseUrl, setSupabaseUrl] = React.useState('');
  const [supabaseKey, setSupabaseKey] = React.useState('');
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<'idle' | 'success' | 'error'>('idle');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setApiKey(initialKey || '');
      setSupabaseUrl(localStorage.getItem('supabase_url') || '');
      setSupabaseKey(localStorage.getItem('supabase_anon_key') || '');
      setTestResult('idle');
    }
  }, [isOpen, initialKey]);

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Vui lòng nhập API Key');
      return;
    }

    setIsTesting(true);
    setTestResult('idle');
    
    try {
      // Use the service's handleAIRequest to test the key
      // We pass the key as shopKey directly to verify it
      const prompt = "Please respond with exactly one word: 'READY'";
      const result = await GeminiService.handleAIRequest({
        prompt,
        systemInstruction: "You are a test assistant. Always reply with READY.",
        shopKey: apiKey,
        fallbackKey: null,
        shopPlan: 'pro',
        userId: user?.uid || 'anonymous',
        feature: 'verify_key'
      });

      if (result.toUpperCase().includes('READY') || result.toUpperCase().includes('OK') || result.length > 0) {
        setTestResult('success');
        toast.success('[MÁY CHỦ AI] Kết nối thành công! Key hoạt động tốt.');
      } else {
        setTestResult('error');
        toast.error('Mô hình phản hồi không đúng định dạng. Vui lòng thử lại.');
      }
    } catch (error: any) {
      console.error('[KeyTest] Error:', error);
      setTestResult('error');
      
      let msg = 'Lỗi kết nối AI. Vui lòng kiểm tra lại mã API Key.';
      const errorStr = (error.response?.data?.error || error.message || '').toString();
      
      if (errorStr.includes('GEMINI_QUOTA_EXCEEDED') || errorStr.includes('429') || errorStr.includes('quota')) {
        msg = 'Hạn mức (Quota) của Key này đã hết. Vui lòng tạo API Key mới.';
      } else if (errorStr.includes('API_KEY_INVALID') || errorStr.includes('400')) {
        msg = 'Mã API Key không hợp lệ. Vui lòng kiểm tra lại tại Google AI Studio.';
      } else if (error.message) {
        msg = error.message;
      }
      
      toast.error(msg);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        geminiApiKey: apiKey.trim() || null,
        supabaseUrl: supabaseUrl.trim() || null,
        supabaseKey: supabaseKey.trim() || null
      });
      
      // Update local storage for immediate use
      localStorage.setItem('gemini_api_key', apiKey.trim());
      localStorage.setItem('supabase_url', supabaseUrl.trim());
      localStorage.setItem('supabase_anon_key', supabaseKey.trim());
      localStorage.setItem('global_supabase_url', supabaseUrl.trim());
      localStorage.setItem('global_supabase_key', supabaseKey.trim());
      
      setGeminiApiKey(apiKey.trim() || null);
      GeminiService.resetInstance();
      
      toast.success('Đã lưu cấu hình API');
      
      // Reload is necessary to re-init Supabase client correctly across context
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
      onClose();
    } catch (error) {
      console.error('[KeySave] Error:', error);
      toast.error('Lỗi khi lưu cấu hình');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-surface-container overflow-y-auto max-h-[95vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-surface-container bg-primary/5 flex justify-between items-center sticky top-0 bg-white/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-on-surface uppercase tracking-tight">Cấu hình API Key</h3>
                  <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Cá nhân hóa tài nguyên AI</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-8 space-y-6">
              <div className="p-4 bg-surface-container-low rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Shield size={16} />
                  <span className="text-xs font-black uppercase tracking-widest">Bảo mật đa lớp</span>
                </div>
                <p className="text-[11px] text-secondary leading-relaxed">
                  Thông tin của bạn được lưu trữ an toàn và xử lý qua <strong>Proxy máy chủ</strong>. 
                  Chúng tôi không bao giờ gọi trực tiếp API từ trình duyệt để tránh bị lộ Key.
                </p>
              </div>

              {/* Gemini Section */}
              <div className="space-y-2">
                <label className="text-xs font-black text-secondary uppercase tracking-widest ml-2">Gemini API Key của bạn</label>
                <div className="relative group">
                  <input 
                    type="password"
                    value={apiKey || ''}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Dán mã API Key tại đây..."
                    className="w-full bg-surface-container rounded-2xl px-5 py-4 text-sm font-mono border-2 border-transparent focus:border-primary outline-none transition-all group-hover:bg-surface-container-high"
                  />
                  {testResult === 'success' && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500">
                      <Check size={20} />
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center px-1">
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-primary hover:underline font-bold"
                  >
                    Lấy Key tại Google AI Studio →
                  </a>
                  <button 
                    onClick={handleTestKey}
                    disabled={isTesting || !apiKey}
                    className="text-[10px] font-black uppercase tracking-widest bg-surface-container-highest px-3 py-1.5 rounded-lg hover:bg-primary hover:text-white transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isTesting ? <Loader2 size={12} className="animate-spin" /> : 'Kiểm tra Key'}
                  </button>
                </div>
              </div>

              {/* Supabase Section */}
              <div className="pt-4 border-t border-surface-container space-y-4">
                <div className="flex items-center gap-2 text-tertiary">
                   <Globe size={16} />
                   <span className="text-xs font-black uppercase tracking-widest">Cấu hình Supabase</span>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-secondary uppercase tracking-widest ml-2">Supabase Project URL</label>
                  <input 
                    type="text"
                    value={supabaseUrl || ''}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://your-project.supabase.co"
                    className="w-full bg-surface-container rounded-2xl px-5 py-4 text-sm font-mono border-2 border-transparent focus:border-primary outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-secondary uppercase tracking-widest ml-2">Supabase Anon Key</label>
                  <input 
                    type="password"
                    value={supabaseKey || ''}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    placeholder="Dán mã Anon/Public Key..."
                    className="w-full bg-surface-container rounded-2xl px-5 py-4 text-sm font-mono border-2 border-transparent focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  onClick={onClose}
                  className="flex-1 py-4 text-sm font-bold text-secondary hover:bg-surface-container rounded-2xl transition-all"
                >
                  Hủy bỏ
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving || !apiKey || !supabaseKey}
                  className="flex-1 py-4 bg-primary text-white text-sm font-black rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  LƯU CẤU HÌNH
                </button>
              </div>
            </div>

            {/* Footer Tip */}
            <div className="p-4 bg-tertiary/5 text-center">
              <div className="flex items-center justify-center gap-2 text-[10px] text-tertiary font-bold uppercase tracking-tighter">
                <Globe size={12} />
                <span>Hệ thống ưu tiên sử dụng Key cá nhân của bạn</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
