import React from 'react';
import { Key, CheckCircle2, XCircle, Loader2, AlertCircle, Settings } from 'lucide-react';
import { ShopeeService } from '../services/shopeeService';

export default function ApiKeyManager() {
  const [geminiKey, setGeminiKey] = React.useState('');
  const [ghnToken, setGhnToken] = React.useState('');
  const [supabaseUrl, setSupabaseUrl] = React.useState('');
  const [supabaseKey, setSupabaseKey] = React.useState('');
  const [isValidating, setIsValidating] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'valid' | 'invalid'>('idle');
  const [showInput, setShowInput] = React.useState(false);

  React.useEffect(() => {
    const savedGemini = localStorage.getItem('gemini_api_key');
    const savedGhn = localStorage.getItem('ghn_token');
    const savedSbUrl = localStorage.getItem('supabase_url');
    const savedSbKey = localStorage.getItem('supabase_anon_key');
    
    if (savedGemini) setGeminiKey(savedGemini);
    if (savedGhn) setGhnToken(savedGhn);
    if (savedSbUrl) setSupabaseUrl(savedSbUrl);
    if (savedSbKey) setSupabaseKey(savedSbKey);

    if (savedGemini && savedSbKey) {
      setStatus('valid');
    } else {
      setShowInput(true);
    }
  }, []);

  const handleSave = async () => {
    setIsValidating(true);
    
    // Validate Gemini Key
    const isGeminiValid = await ShopeeService.validateApiKey(geminiKey);
    
    if (isGeminiValid && supabaseKey) {
      localStorage.setItem('gemini_api_key', geminiKey);
      localStorage.setItem('ghn_token', ghnToken);
      localStorage.setItem('supabase_url', supabaseUrl || 'https://pdqhkeewyvimykvyexgo.supabase.co');
      localStorage.setItem('supabase_anon_key', supabaseKey);
      setStatus('valid');
      setTimeout(() => setShowInput(false), 2000);
      window.location.reload(); // Reload to re-initialize Supabase client
    } else {
      setStatus('invalid');
    }
    setIsValidating(false);
  };

  return (
    <div className="relative">
      {(!geminiKey || !supabaseKey) && !showInput ? (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 animate-pulse">
          <AlertCircle size={18} />
          <span className="text-xs font-bold uppercase tracking-tight">VUI LÒNG CẤU HÌNH API ĐỂ SỬ DỤNG</span>
          <button 
            onClick={() => setShowInput(true)}
            className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-[10px] font-black hover:bg-red-700 transition-colors"
          >
            CẤU HÌNH
          </button>
        </div>
      ) : (
        <button 
          onClick={() => setShowInput(!showInput)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border ${
            status === 'valid' 
              ? 'bg-green-50 border-green-200 text-green-600' 
              : 'bg-surface-container border-surface-container text-secondary'
          }`}
        >
          <Key size={18} />
          <span className="text-xs font-bold">
            {status === 'valid' ? 'Hệ thống: Đã kết nối' : 'Cấu hình API'}
          </span>
        </button>
      )}

      {showInput && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-surface-container p-6 z-[100] animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <span className="text-sm font-black text-on-surface uppercase tracking-widest">Cấu hình hệ thống</span>
              {status === 'valid' && <CheckCircle2 size={20} className="text-green-500" />}
              {status === 'invalid' && <XCircle size={20} className="text-red-500" />}
            </div>

            {/* Gemini Section */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Gemini API Key</label>
              <input 
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Dán Gemini API Key..."
                className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
              />
            </div>

            {/* GHN Token Section */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-secondary uppercase tracking-widest">GHN API Token</label>
              <input 
                type="password"
                value={ghnToken}
                onChange={(e) => setGhnToken(e.target.value)}
                placeholder="Dán GHN Token..."
                className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
              />
            </div>

            {/* Supabase Section */}
            <div className="space-y-4 pt-2 border-t border-surface-container">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Supabase URL (Tùy chọn)</label>
                <input 
                  type="text"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Supabase Anon Key</label>
                <input 
                  type="password"
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="Dán Supabase Anon Key..."
                  className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
                />
              </div>
            </div>

            <button 
              onClick={handleSave}
              disabled={isValidating || !geminiKey || !supabaseKey}
              className="w-full py-4 bg-primary text-white rounded-xl font-black text-sm shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isValidating ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              LƯU CẤU HÌNH
            </button>

            <button 
              onClick={() => {
                setShowInput(false);
                // The user can navigate via sidebar
              }}
              className="w-full py-2 bg-surface-container rounded-xl text-[10px] font-black text-secondary uppercase hover:bg-surface-container-high transition-all flex items-center justify-center gap-2"
            >
              <Settings size={12} /> Cấu hình chi tiết
            </button>

            <p className="text-[10px] text-secondary opacity-60 leading-relaxed text-center">
              Dữ liệu được lưu an toàn trong trình duyệt của bạn.<br/>
              Tính năng In lại yêu cầu kết nối Supabase để lưu trữ ảnh vận đơn.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
