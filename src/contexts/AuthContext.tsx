import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { logErrorToSupabase, FRIENDLY_ERROR_MESSAGE } from '../lib/error-logging';
import { UsageService } from '../services/usageService';

interface AuthContextType {
  user: User | null;
  role: 'super_admin' | 'admin' | 'user' | null;
  status: 'active' | 'inactive' | null;
  paymentStatus: 'none' | 'pending' | 'completed' | null;
  planType: 'free' | 'pro' | 'enterprise' | null;
  geminiApiKey: string | null;
  fallbackGeminiApiKey: string | null;
  failoverEnabled: boolean;
  dailyOrderCount: number;
  orderLimit: number;
  expiryDate: string | null;
  phone: string | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signupWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  isSubscriptionValid: () => boolean;
  refreshUsage: () => Promise<void>;
  incrementDailyCount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'super_admin' | 'admin' | 'user' | null>(null);
  const [status, setStatus] = useState<'active' | 'inactive' | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'none' | 'pending' | 'completed' | null>(null);
  const [planType, setPlanType] = useState<'free' | 'pro' | 'enterprise' | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState<string | null>(null);
  const [fallbackGeminiApiKey, setFallbackGeminiApiKey] = useState<string | null>(null);
  const [failoverEnabled, setFailoverEnabled] = useState(false);
  const [dailyOrderCount, setDailyOrderCount] = useState(0);
  const [orderLimit, setOrderLimit] = useState(10);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        localStorage.setItem('user_email', user.email || '');
        
        // Try to load from cache first for immediate UI update
        const cachedRole = localStorage.getItem(`auth_role_${user.uid}`);
        const cachedStatus = localStorage.getItem(`auth_status_${user.uid}`);
        const cachedPayment = localStorage.getItem(`auth_payment_${user.uid}`);
        const cachedExpiry = localStorage.getItem(`auth_expiry_${user.uid}`);
        const cachedPhone = localStorage.getItem(`auth_phone_${user.uid}`);

        if (cachedRole) setRole(cachedRole as any);
        if (cachedStatus) setStatus(cachedStatus as any);
        if (cachedPayment) setPaymentStatus(cachedPayment as any);
        if (cachedExpiry) setExpiryDate(cachedExpiry);
        if (cachedPhone) setPhone(cachedPhone);

        // Fetch/Create profile from Firestore
        try {
          // Fetch Global Config first - Integrated into the system
          const configDoc = await getDoc(doc(db, 'global_configs', 'settings'));
          if (configDoc.exists()) {
            const configData = configDoc.data();
            setFallbackGeminiApiKey(configData.fallbackGeminiApiKey || configData.geminiApiKey || null);
            // Sync to localStorage as fallback for services that don't use context
            if (configData.geminiApiKey) localStorage.setItem('global_gemini_key', configData.geminiApiKey);
            if (configData.supabase_url) localStorage.setItem('global_supabase_url', configData.supabase_url);
            if (configData.supabase_anon_key) localStorage.setItem('global_supabase_key', configData.supabase_anon_key);
            if (configData.fb_web_api_key) localStorage.setItem('global_fb_api_key', configData.fb_web_api_key);
            if (configData.fb_web_project_id) localStorage.setItem('global_fb_project_id', configData.fb_web_project_id);
          }

          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            setRole(data.role);
            setStatus(data.status);
            setPaymentStatus(data.paymentStatus || 'none');
            setPlanType(data.planType || (data.role === 'admin' ? 'pro' : 'free'));
            setGeminiApiKey(data.geminiApiKey || null);
            setFailoverEnabled(data.failoverEnabled || false);
            setExpiryDate(data.expiryDate);
            
            // Sync Daily usage
            try {
              const dbUsage = await UsageService.getDailyUsage(user.uid);
              setDailyOrderCount(dbUsage);
              setOrderLimit(data.orderLimit || 100); 
            } catch (err) {
              setDailyOrderCount(data.dailyOrderCount || 0);
              setOrderLimit(data.orderLimit || (data.planType === 'pro' ? 1000 : 10));
            }
            setPhone(data.phone || null);

            // Update cache
            localStorage.setItem(`auth_role_${user.uid}`, data.role);
            localStorage.setItem(`auth_status_${user.uid}`, data.status);
            localStorage.setItem(`auth_payment_${user.uid}`, data.paymentStatus || 'none');
            if (data.expiryDate) localStorage.setItem(`auth_expiry_${user.uid}`, data.expiryDate);
            if (data.phone) localStorage.setItem(`auth_phone_${user.uid}`, data.phone);
          } else {
            // Create new profile for first-time login
            const isSuperAdmin = user.email === 'chichine153@gmail.com';
            const newProfile = {
              uid: user.uid,
              email: user.email,
              role: isSuperAdmin ? 'super_admin' : 'user',
              status: isSuperAdmin ? 'active' : 'inactive',
              paymentStatus: isSuperAdmin ? 'completed' : 'none',
              planType: isSuperAdmin ? 'enterprise' : 'free',
              dailyOrderCount: 0,
              orderLimit: isSuperAdmin ? 999999 : 10,
              expiryDate: isSuperAdmin ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString() : null,
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, newProfile);
            setRole(newProfile.role as any);
            setStatus(newProfile.status as any);
            setPaymentStatus(newProfile.paymentStatus as any);
            setPlanType(newProfile.planType as any);
            setDailyOrderCount(0);
            setOrderLimit(newProfile.orderLimit);
            setExpiryDate(newProfile.expiryDate);
          }
        } catch (err: any) {
          console.warn('Auth profile fetch error (likely quota):', err.message);
          
          const errorMsg = err.message || '';
          const isQuotaError = errorMsg.includes('Quota') || errorMsg.includes('limit exceeded') || errorMsg.includes('INTERNAL ASSERTION FAILED');
          
          if (isQuotaError) {
            setError('Hệ thống đang quá tải hoặc hết hạn mức truy cập. Đang sử dụng dữ liệu tạm thời.');
          }

          // Ensure we have some role even on error
          if (!role && !cachedRole) {
            if (user.email === 'chichine153@gmail.com') {
              setRole('admin');
              setStatus('active');
            } else {
              setRole('user');
            }
          }
        }
      } else {
        localStorage.removeItem('user_email');
        setRole(null);
        setStatus(null);
        setExpiryDate(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const isSubscriptionValid = () => {
    if (role === 'super_admin' || role === 'admin') return true;
    if (status !== 'active') return false;
    if (!expiryDate) return false;
    return new Date(expiryDate) > new Date();
  };

  const refreshUsage = async () => {
    if (!user) return;
    try {
      const [usage, limit] = await Promise.all([
        UsageService.getDailyUsage(user.uid),
        UsageService.getShopLimit(user.uid)
      ]);
      setDailyOrderCount(usage);
      setOrderLimit(prev => limit || prev);
    } catch (e) {
      console.warn("Usage refresh failed");
    }
  };

  const incrementDailyCount = async () => {
    if (!user) return;
    try {
      await UsageService.incrementUsage(user.uid);
      setDailyOrderCount(prev => prev + 1);
      
      // Also potentially update Firestore for backup/listing
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        dailyOrderCount: dailyOrderCount + 1
      });
    } catch (e) {
      console.error("Increment failed", e);
    }
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    setError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Login failed:', err);
      logErrorToSupabase(err, 'auth_google', user?.uid);
      if (err.code === 'auth/unauthorized-domain') {
        setError('Tên miền này chưa được ủy quyền trong Firebase Console. Vui lòng thêm tên miền vào danh sách "Authorized domains".');
      } else {
        setError(FRIENDLY_ERROR_MESSAGE);
      }
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      console.error('Email login failed:', err);
      logErrorToSupabase(err, 'auth_email', user?.uid);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Email hoặc mật khẩu không chính xác.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Tài khoản đã bị tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau.');
      } else {
        setError(FRIENDLY_ERROR_MESSAGE);
      }
      throw err;
    }
  };

  const signupWithEmail = async (email: string, pass: string) => {
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      console.error('Signup failed:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Email này đã được sử dụng.');
      } else if (err.code === 'auth/weak-password') {
        setError('Mật khẩu quá yếu. Vui lòng dùng ít nhất 6 ký tự.');
      } else {
        setError(err.message || 'Đăng ký thất bại.');
      }
      throw err;
    }
  };

  const resetPassword = async (email: string) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      console.error('Password reset failed:', err);
      if (err.code === 'auth/user-not-found') {
        setError('Không tìm thấy tài khoản với email này.');
      } else {
        setError(err.message || 'Gửi yêu cầu cài lại mật khẩu thất bại.');
      }
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      console.error('Logout failed:', err);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{ 
      user, role, status, paymentStatus, planType, geminiApiKey, fallbackGeminiApiKey, 
      failoverEnabled, dailyOrderCount, orderLimit, expiryDate, phone, loading, error, 
      login, loginWithEmail, signupWithEmail, resetPassword, logout, clearError, isSubscriptionValid,
      refreshUsage, incrementDailyCount
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
