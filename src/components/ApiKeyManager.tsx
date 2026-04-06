import React from 'react';
import { Key, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { ShopeeService } from '../services/shopeeService';

export default function ApiKeyManager() {
  const [apiKey, setApiKey] = React.useState('');
  const [isValidating, setIsValidating] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'valid' | 'invalid'>('idle');
  const [showInput, setShowInput] = React.useState(false);

  React.useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setStatus('valid');
    }
  }, []);

  const handleValidate = async (key: string) => {
    if (!key) {
      setStatus('idle');
      return;
    }

    setIsValidating(true);
    const isValid = await ShopeeService.validateApiKey(key);
    setIsValidating(false);

    if (isValid) {
      localStorage.setItem('gemini_api_key', key);
      setStatus('valid');
      setTimeout(() => setShowInput(false), 2000);
    } else {
      setStatus('invalid');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setApiKey(value);
    if (status !== 'idle') setStatus('idle');
  };

  return (
    <div className="relative">
      {!apiKey && !showInput ? (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 animate-pulse">
          <AlertCircle size={18} />
          <span className="text-xs font-bold uppercase tracking-tight">VUI LÒNG NHẬP API KEY ĐỂ SỬ DỤNG</span>
          <button 
            onClick={() => setShowInput(true)}
            className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-[10px] font-black hover:bg-red-700 transition-colors"
          >
            NHẬP MÃ
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
            {status === 'valid' ? 'API Key: Đã kích hoạt' : 'Cấu hình API Key'}
          </span>
        </button>
      )}

      {showInput && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-surface-container p-4 z-[100] animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-secondary uppercase tracking-widest">Gemini API Key</span>
              {status === 'valid' && <CheckCircle2 size={16} className="text-green-500" />}
              {status === 'invalid' && <XCircle size={16} className="text-red-500" />}
            </div>
            <div className="relative">
              <input 
                type="password"
                value={apiKey}
                onChange={handleChange}
                placeholder="Dán API Key của bạn vào đây..."
                className={`w-full pl-4 pr-12 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 transition-all ${
                  status === 'valid' ? 'border-green-500/20 focus:border-green-500' :
                  status === 'invalid' ? 'border-red-500/20 focus:border-red-500' :
                  'border-transparent focus:border-primary'
                }`}
              />
              <button 
                onClick={() => handleValidate(apiKey)}
                disabled={isValidating || !apiKey}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-primary hover:bg-primary/10 rounded-lg disabled:opacity-50"
              >
                {isValidating ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              </button>
            </div>
            <p className="text-[10px] text-secondary opacity-60 leading-relaxed">
              Mã API Key được lưu an toàn trong trình duyệt của bạn (LocalStorage). 
              Bạn có thể lấy mã miễn phí tại <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-primary hover:underline">Google AI Studio</a>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
