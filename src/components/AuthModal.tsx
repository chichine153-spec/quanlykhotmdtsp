import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  LogIn, 
  Mail, 
  Lock, 
  UserPlus, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Chrome
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthMode = 'login' | 'signup' | 'forgot-password';

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { login, loginWithEmail, signupWithEmail, resetPassword, error, clearError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);

    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
        onClose();
        toast.success('Đăng nhập thành công!');
      } else if (mode === 'signup') {
        await signupWithEmail(email, password);
        onClose();
        toast.success('Đăng ký tài khoản thành công!');
      } else if (mode === 'forgot-password') {
        await resetPassword(email);
        setSuccess(true);
        toast.success('Đã gửi link đặt lại mật khẩu!');
      }
    } catch (err: any) {
      // Error is handled in context and displayed via toast or in-form error
      toast.error(error || 'Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await login();
      onClose();
      toast.success('Đăng nhập bằng Google thành công!');
    } catch (err) {
      toast.error('Đăng nhập Google thất bại');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-primary/10"
        >
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 hover:bg-surface-container rounded-full transition-colors z-10"
          >
            <X size={20} />
          </button>

          <div className="p-8 md:p-10">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto mb-4">
                {mode === 'login' ? <LogIn size={32} /> : mode === 'signup' ? <UserPlus size={32} /> : <Mail size={32} />}
              </div>
              <h2 className="text-2xl font-black text-on-surface uppercase tracking-tight">
                {mode === 'login' ? 'Đăng nhập' : mode === 'signup' ? 'Tạo tài khoản' : 'Quên mật khẩu'}
              </h2>
              <p className="text-sm text-secondary font-medium mt-1">
                {mode === 'login' 
                  ? 'Chào mừng bạn quay trở lại với Zenith OMS' 
                  : mode === 'signup' 
                  ? 'Bắt đầu quản lý kho chuyên nghiệp ngay hôm nay' 
                  : 'Chúng tôi sẽ gửi link cài lại mật khẩu qua email của bạn'}
              </p>
            </div>

            {success && mode === 'forgot-password' ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-6"
              >
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-lg font-bold text-on-surface mb-2">Đã gửi email thành công!</h3>
                <p className="text-sm text-secondary mb-8">
                  Vui lòng kiểm tra hộp thư đến (và thư rác) của Gmail <strong>{email}</strong> để nhận link cài lại mật khẩu.
                </p>
                <button 
                  onClick={() => {
                    setMode('login');
                    setSuccess(false);
                  }}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Quay lại đăng nhập
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-4 bg-error/10 border border-error/20 rounded-2xl flex items-center gap-3 text-error text-xs font-bold">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-primary transition-colors" size={18} />
                    <input 
                      type="email"
                      required
                      placeholder="Địa chỉ Gmail..."
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-surface-container-lowest border-2 border-primary/5 focus:border-primary rounded-2xl outline-none transition-all font-bold text-sm"
                    />
                  </div>

                  {mode !== 'forgot-password' && (
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-primary transition-colors" size={18} />
                      <input 
                        type="password"
                        required
                        placeholder="Mật khẩu..."
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-surface-container-lowest border-2 border-primary/5 focus:border-primary rounded-2xl outline-none transition-all font-bold text-sm"
                      />
                    </div>
                  )}
                </div>

                {mode === 'login' && (
                  <div className="flex justify-end">
                    <button 
                      type="button"
                      onClick={() => setMode('forgot-password')}
                      className="text-xs font-black text-primary uppercase tracking-widest hover:opacity-70 transition-opacity"
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : (
                    mode === 'login' ? 'Đăng nhập ngay' : mode === 'signup' ? 'Tạo tài khoản' : 'Gửi link reset'
                  )}
                  {!loading && <ArrowRight size={20} />}
                </button>

                {mode === 'login' && (
                  <div className="space-y-6">
                    <div className="relative py-4">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-surface-container"></div></div>
                      <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest text-secondary bg-white px-4">Hoặc</div>
                    </div>

                    <button 
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={loading}
                      className="w-full py-4 bg-white border-2 border-surface-container text-on-surface rounded-2xl font-black uppercase tracking-widest hover:bg-surface-container transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                    >
                      <Chrome size={20} className="text-[#4285F4]" />
                      Tiếp tục với Google
                    </button>
                  </div>
                )}

                <div className="text-center pt-6">
                  <p className="text-xs text-secondary font-bold">
                    {mode === 'login' ? 'Chưa có tài khoản?' : mode === 'signup' ? 'Đã có tài khoản?' : 'Quay lại?'}
                    <button 
                      type="button"
                      onClick={() => {
                        if (mode === 'login') setMode('signup');
                        else setMode('login');
                      }}
                      className="ml-2 text-primary font-black uppercase tracking-widest hover:opacity-70 transition-opacity"
                    >
                      {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
                    </button>
                  </p>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
