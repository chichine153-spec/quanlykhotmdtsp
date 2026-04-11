import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { doc, getDoc, setDoc, disableNetwork } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'user' | null;
  status: 'active' | 'inactive' | null;
  paymentStatus: 'none' | 'pending' | 'completed' | null;
  expiryDate: string | null;
  phone: string | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  isSubscriptionValid: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [status, setStatus] = useState<'active' | 'inactive' | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'none' | 'pending' | 'completed' | null>(null);
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
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            setRole(data.role);
            setStatus(data.status);
            setPaymentStatus(data.paymentStatus || 'none');
            setExpiryDate(data.expiryDate);
            setPhone(data.phone || null);

            // Update cache
            localStorage.setItem(`auth_role_${user.uid}`, data.role);
            localStorage.setItem(`auth_status_${user.uid}`, data.status);
            localStorage.setItem(`auth_payment_${user.uid}`, data.paymentStatus || 'none');
            if (data.expiryDate) localStorage.setItem(`auth_expiry_${user.uid}`, data.expiryDate);
            if (data.phone) localStorage.setItem(`auth_phone_${user.uid}`, data.phone);
          } else {
            // Create new profile for first-time login
            const isDefaultAdmin = user.email === 'chichine153@gmail.com';
            const newProfile = {
              uid: user.uid,
              email: user.email,
              role: isDefaultAdmin ? 'admin' : 'user',
              status: isDefaultAdmin ? 'active' : 'inactive',
              paymentStatus: isDefaultAdmin ? 'completed' : 'none',
              expiryDate: isDefaultAdmin ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString() : null,
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, newProfile);
            setRole(newProfile.role as any);
            setStatus(newProfile.status as any);
            setPaymentStatus(newProfile.paymentStatus as any);
            setExpiryDate(newProfile.expiryDate);
          }
        } catch (err: any) {
          console.error('Error fetching user role:', err);
          
          // If quota exceeded, we already have cached values or we use defaults
          const isQuotaError = err.message?.includes('Quota') || JSON.stringify(err).includes('Quota');
          
          if (isQuotaError) {
            setError('Hệ thống đã đạt giới hạn truy cập miễn phí (Quota Exceeded). Đang sử dụng dữ liệu tạm thời.');
          }

          if (!cachedRole) {
            // Fallback for default admin email if no cache
            if (user.email === 'chichine153@gmail.com') {
              setRole('admin');
              setStatus('active');
              setPaymentStatus('completed');
            } else {
              setRole('user');
              setStatus('inactive');
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
    if (role === 'admin') return true;
    if (status !== 'active') return false;
    if (!expiryDate) return false;
    return new Date(expiryDate) > new Date();
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    setError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Login failed:', err);
      if (err.code === 'auth/unauthorized-domain') {
        setError('Tên miền này chưa được ủy quyền trong Firebase Console. Vui lòng thêm tên miền vào danh sách "Authorized domains".');
      } else {
        setError(err.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
      }
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
    <AuthContext.Provider value={{ user, role, status, paymentStatus, expiryDate, phone, loading, error, login, logout, clearError, isSubscriptionValid }}>
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
