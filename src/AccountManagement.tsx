import React from 'react';
import { 
  Users, 
  Search, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  CreditCard,
  Loader2,
  Filter,
  ArrowRightCircle,
  ShieldCheck,
  BrainCircuit,
  Save,
  TrendingUp,
  AlertTriangle,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  getDocs,
  doc, 
  updateDoc, 
  addDoc,
  serverTimestamp,
  orderBy,
  getDoc,
  setDoc,
  limit,
  where
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './contexts/AuthContext';
import { UserProfile, PaymentHistory } from './types';
import { useData } from './contexts/DataContext';
import { toast } from 'react-hot-toast';

import { GeminiService } from './services/gemini';

const PACKAGES = [
  { id: '1_month', label: '1 Tháng', months: 1, price: 199000, discount: '0%' },
  { id: '6_months', label: '6 Tháng', months: 6, price: 990000, discount: '17%' },
  { id: '1_year', label: '1 Năm', months: 12, price: 1690000, discount: '30%' }
];

export default function AccountManagement() {
  const { 
    user: currentUser, 
    role, 
    status: currentStatus,
    expiryDate: currentExpiryDate,
    geminiApiKey: currentShopKey, 
    dailyOrderCount, 
    orderLimit, 
    planType,
    fallbackGeminiApiKey 
  } = useAuth();
  const { globalConfig, refreshData } = useData();
  const [users, setUsers] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isUpdating, setIsUpdating] = React.useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = React.useState<string>('1_month');
  const [geminiKey, setGeminiKey] = React.useState('');
  const [shopKey, setShopKey] = React.useState('');
  const [isSavingKey, setIsSavingKey] = React.useState(false);
  const [isTestLoading, setIsTestLoading] = React.useState(false);
  const [isKeyValid, setIsKeyValid] = React.useState<boolean | null>(null);
  const [editingLimit, setEditingLimit] = React.useState<string | null>(null);
  const [limitValue, setLimitValue] = React.useState<number>(100);

  React.useEffect(() => {
    if (role === 'super_admin' && globalConfig?.geminiApiKey) {
      setGeminiKey(globalConfig.geminiApiKey);
    } else if (role === 'admin' && currentShopKey) {
      setShopKey(currentShopKey);
    }
  }, [globalConfig, currentShopKey, role]);

  const fetchUsers = async () => {
    if (role !== 'super_admin' && role !== 'admin') return;
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      // Always fetch all users for management roles
      const usersQuery = query(usersRef, orderBy('createdAt', 'desc'), limit(100));

      const snapshot = await getDocs(usersQuery);
      const usersList = snapshot.docs.map(doc => doc.data()) as UserProfile[];
      setUsers(usersList);
    } catch (error: any) {
      console.error('Fetch users error:', error);
      if (error.message?.includes('Quota')) {
        toast.error('Hết hạn mức truy cập dữ liệu người dùng.');
      }
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (role === 'super_admin' || role === 'admin') {
      fetchUsers();
    }
  }, [role]);

  const handleActivate = async (user: UserProfile) => {
    const pkg = PACKAGES.find(p => p.id === selectedPackage);
    if (!pkg) return;

    setIsUpdating(user.uid);
    try {
      const userRef = doc(db, 'users', user.uid);
      
      // Calculate new expiry date
      const currentExpiry = user.expiryDate ? new Date(user.expiryDate) : new Date();
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(baseDate);
      newExpiry.setMonth(newExpiry.getMonth() + pkg.months);

      await updateDoc(userRef, {
        status: 'active',
        paymentStatus: 'completed',
        expiryDate: newExpiry.toISOString()
      });

      // Log payment
      await addDoc(collection(db, 'payment_history'), {
        email: user.email,
        amount: pkg.price,
        package: pkg.label,
        activatedAt: new Date().toISOString(),
        userId: user.uid,
        adminId: currentUser?.uid
      });

      // Success toast would be nice, but we'll rely on UI update
    } catch (error) {
      console.error('Activation error:', error);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdateGeminiKey = async () => {
    if (!geminiKey.trim()) {
      toast.error('Vui lòng nhập API Key');
      return;
    }

    setIsSavingKey(true);
    try {
      const configRef = doc(db, 'global_configs', 'settings');
      await setDoc(configRef, {
        geminiApiKey: geminiKey,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.uid
      }, { merge: true });
      
      GeminiService.resetInstance();
      await refreshData();
      toast.success('Đã lưu API Key hệ thống');
    } catch (error) {
      console.error('Save Gemini Key error:', error);
      toast.error('Lỗi khi lưu API Key');
    } finally {
      setIsSavingKey(false);
    }
  };

  const testGeminiKey = async () => {
    if (!geminiKey.trim()) {
      toast.error('Vui lòng nhập API Key để test');
      return;
    }

    setIsTestLoading(true);
    try {
      const ai = GeminiService.getInstance(geminiKey);
      if (!ai) throw new Error('Không thể khởi tạo Gemini instance');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Hello, are you active? Reply with OK only.",
      });
      
      const text = response.text || '';
      
      if (text.includes('OK')) {
        toast.success('API Key hoạt động tốt!');
      } else {
        toast.error(`Kết quả không mong đợi: ${text}`);
      }
    } catch (error: any) {
      console.error('Test Gemini Key error:', error);
      let errorMsg = error.message || 'Lỗi không xác định';
      if (errorMsg.includes('429') || errorMsg.includes('quota')) {
        errorMsg = 'API Key này đã HẾT HẠN MỨC (429 Quota Exceeded). Hãy tạo mã mới!';
      } else if (errorMsg.includes('400') || errorMsg.includes('API_KEY_INVALID')) {
        errorMsg = 'API Key KHÔNG HỢP LỆ. Vui lòng kiểm tra lại.';
      }
      toast.error(`Lỗi: ${errorMsg}`);
    } finally {
      setIsTestLoading(false);
    }
  };

  const handleUpdateShopKey = async () => {
    if (!currentUser) return;
    setIsSavingKey(true);
    setIsKeyValid(null);

    try {
      // Perform ping test first
      const ai = GeminiService.getInstance(shopKey);
      let isValid = false;
      
      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: "hi",
          });
          if (response.text) isValid = true;
        } catch (e) {
          isValid = false;
        }
      }

      setIsKeyValid(isValid);

      if (!isValid) {
        toast.error('Key không hợp lệ. Vui lòng kiểm tra lại.');
        setIsSavingKey(false);
        return;
      }

      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        geminiApiKey: shopKey,
        updatedAt: new Date().toISOString()
      });
      toast.success('Đã cấu hình & Kích hoạt Key Shop!');
    } catch (error) {
      console.error('Save Shop Key error:', error);
      toast.error('Lỗi khi lưu API Key Shop');
    } finally {
      setIsSavingKey(false);
    }
  };

  const testKey = async (key: string) => {
    if (!key.trim()) {
      toast.error('Vui lòng nhập API Key để test');
      return;
    }

    setIsTestLoading(true);
    try {
      const ai = GeminiService.getInstance(key);
      if (!ai) throw new Error('Không thể khởi tạo Gemini instance');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Hello, are you active? Reply with OK only.",
      });
      
      const text = response.text || '';
      
      if (text.includes('OK')) {
        toast.success('API Key hoạt động tốt!');
      } else {
        toast.error(`Kết quả không mong đợi: ${text}`);
      }
    } catch (error: any) {
      console.error('Test API Key error:', error);
      let errorMsg = error.message || 'Lỗi không xác định';
      if (errorMsg.includes('429') || errorMsg.includes('quota')) {
        errorMsg = 'API Key này đã HẾT HẠN MỨC (429 Quota Exceeded). Hãy tạo mã mới!';
      } else if (errorMsg.includes('400') || errorMsg.includes('API_KEY_INVALID')) {
        errorMsg = 'API Key KHÔNG HỢP LỆ. Vui lòng kiểm tra lại.';
      }
      toast.error(`Lỗi: ${errorMsg}`);
    } finally {
      setIsTestLoading(false);
    }
  };

  const handleDeactivate = async (userId: string) => {
    setIsUpdating(userId);
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'inactive'
      });
    } catch (error) {
      console.error('Deactivation error:', error);
    } finally {
      setIsUpdating(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingCount = users.filter(u => u.paymentStatus === 'pending').length;

  if (role !== 'super_admin' && role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="w-20 h-20 bg-error/10 rounded-full flex items-center justify-center text-error mb-6">
          <ShieldCheck size={40} />
        </div>
        <h2 className="text-2xl font-black text-on-surface mb-2 uppercase">Truy cập bị từ chối</h2>
        <p className="text-secondary max-w-md">Bạn không có quyền truy cập vào trang quản lý tài khoản.</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-20"
    >
      {/* Header Section */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2 font-headline uppercase flex items-center gap-3">
            {role === 'super_admin' ? 'Quản trị hệ thống' : 'Quản lý tài khoản'}
            {role === 'super_admin' && pendingCount > 0 && (
              <span className="flex h-4 w-4 rounded-full bg-error animate-pulse items-center justify-center text-[10px] text-white">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-secondary body-md">
            {role === 'super_admin' 
              ? 'Kích hoạt gói Foot và quản lý trạng thái người dùng toàn hệ thống.' 
              : 'Thiết lập API riêng, xem hạn mức sử dụng và thông tin gói cước của Shop.'}
          </p>
        </div>
        
        {role === 'super_admin' && (
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40" size={20} />
              <input 
                type="text"
                placeholder="Tìm kiếm Gmail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-6 py-3 bg-white border-2 border-primary/10 focus:border-primary rounded-2xl outline-none transition-all font-bold w-full md:w-80 shadow-sm"
              />
            </div>
          </div>
        )}
      </section>

      {/* AI Config Section: System key for Super Admin, Shop key for Admin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Usage Stats (New feature - for both) */}
        <section className="bg-white border-2 border-primary/10 p-8 rounded-[2.5rem] shadow-xl shadow-primary/5">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
              <TrendingUp size={28} />
            </div>
            <div>
              <h2 className="text-xl font-black text-on-surface uppercase tracking-tight font-headline">Hạn mức đơn hàng</h2>
              <p className="text-xs text-secondary font-bold uppercase tracking-widest">Thống kê trong ngày</p>
            </div>
          </div>

          <div className="p-6 bg-white rounded-3xl border-2 border-primary/5 space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Số lượng đã dùng</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-primary font-headline">{dailyOrderCount}</span>
                  <span className="text-secondary font-black text-xl">/ {orderLimit}</span>
                  <span className="text-[10px] text-secondary font-bold uppercase ml-2">đơn hàng hôm nay</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-secondary mb-1">Gói cước</p>
                <span className="px-4 py-2 bg-primary text-white text-xs font-black rounded-xl uppercase shadow-md shadow-primary/10">
                  {planType?.toUpperCase() || 'FREE'}
                </span>
              </div>
            </div>

            <div className="relative h-4 w-full bg-primary/10 rounded-full overflow-hidden border border-primary/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((dailyOrderCount / orderLimit) * 100, 100)}%` }}
                className="h-full bg-gradient-to-r from-primary to-primary-container shadow-[0_0_15px_rgba(255,77,0,0.4)]"
              />
            </div>
            {dailyOrderCount >= orderLimit && (
              <div className="px-4 py-2 bg-error/10 text-error rounded-xl flex items-center gap-2">
                <AlertTriangle size={14} className="animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-tight">Cảnh báo: Đã vượt quá hạn mức sử dụng</span>
              </div>
            )}
          </div>
        </section>

        {/* API Config (New/Old Hybrid) */}
        {role === 'super_admin' ? (
          <section className="bg-white border-2 border-primary/20 p-8 rounded-[2.5rem] shadow-xl shadow-primary/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 -mr-16 -mt-16 rounded-full blur-3xl group-hover:bg-primary/10 transition-all" />
            
            <div className="flex items-center gap-4 mb-6 relative">
              <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
                <BrainCircuit size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black text-on-surface uppercase tracking-tight font-headline">Cấu hình Hệ thống</h2>
                <p className="text-xs text-secondary font-bold uppercase tracking-widest">System Gemini Key (Backup)</p>
              </div>
            </div>

            <div className="space-y-4 relative">
              <div className="relative">
                <input 
                  type="password"
                  placeholder="Nhập Global AI Key..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full pl-6 pr-6 py-4 bg-primary/5 border-2 border-transparent focus:border-primary rounded-2xl outline-none transition-all font-mono text-sm shadow-inner"
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => testKey(geminiKey)}
                  className="px-6 py-4 bg-white border-2 border-primary text-primary rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-primary/5 transition-all shadow-sm"
                >
                  Kiểm tra mã
                </button>
                <button 
                  onClick={handleUpdateGeminiKey}
                  className="flex-1 px-8 py-4 bg-primary text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Lưu cấu hình hệ thống
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="bg-white border-2 border-primary/20 p-8 rounded-[2.5rem] shadow-xl shadow-primary/10">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
                <BrainCircuit size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black text-on-surface uppercase tracking-tight font-headline">API Key Cửa hàng</h2>
                <p className="text-xs text-secondary font-bold uppercase tracking-widest">Tối ưu hóa hiệu suất AI</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <input 
                  type="password"
                  placeholder="Dán Gemini API Key của riêng bạn..."
                  value={shopKey}
                  onChange={(e) => {
                    setShopKey(e.target.value);
                    setIsKeyValid(null);
                  }}
                  className="w-full pl-6 pr-6 py-4 bg-primary/5 border-2 border-transparent focus:border-primary rounded-2xl outline-none transition-all font-mono text-sm"
                />
                {isKeyValid !== null && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {isKeyValid ? (
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-200">
                        <CheckCircle2 size={12} />
                        Đang hoạt động
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase text-error bg-error/5 px-2 py-1 rounded-lg border border-error/20">
                        <XCircle size={12} />
                        Key không hợp lệ
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="px-2">
                <p className="text-[10px] font-bold text-secondary">
                  Chưa có Key? <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary-container">Bấm vào đây</a> để lấy Gemini API Key miễn phí từ Google (Chỉ mất 30s)
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => testKey(shopKey)}
                  className="px-6 py-4 bg-white border-2 border-primary text-primary rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-primary/5 transition-all shadow-sm"
                >
                  Test mã
                </button>
                <button 
                  onClick={handleUpdateShopKey}
                  className="flex-1 px-8 py-4 bg-primary text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Lưu cấu hình Shop
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Old Features: Pricing Packages */}
      <section className="space-y-6">
        <h2 className="text-xl font-black text-on-surface uppercase flex items-center gap-3">
          <CreditCard size={24} className="text-primary" />
          Gói sản phẩm (Old Feature)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PACKAGES.map((pkg) => (
            <div 
              key={pkg.id}
              onClick={() => setSelectedPackage(pkg.id)}
              className={`p-6 rounded-[2rem] border-2 transition-all cursor-pointer relative overflow-hidden group ${
                selectedPackage === pkg.id 
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' 
                  : 'border-surface-container bg-white hover:border-primary/30'
              }`}
            >
              {pkg.discount !== '0%' && (
                <div className="absolute top-4 right-4 bg-primary text-white text-[10px] font-black px-2 py-1 rounded-full">
                  TIẾT KIỆM {pkg.discount}
                </div>
              )}
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  selectedPackage === pkg.id ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                }`}>
                  <CreditCard size={24} />
                </div>
                <div>
                  <h3 className="font-black text-on-surface font-headline uppercase">{pkg.label}</h3>
                  <p className="text-xs text-primary font-bold uppercase tracking-widest">Gói {pkg.id === '1_month' ? 'Cơ bản' : 'Tiết kiệm'}</p>
                </div>
              </div>
              <p className="text-2xl font-black text-primary font-headline">{pkg.price.toLocaleString()}đ</p>
            </div>
          ))}
        </div>
      </section>

      {/* Old Features: Users Management Table */}
      <section className="space-y-6">
        <h2 className="text-xl font-black text-on-surface uppercase flex items-center gap-3">
          <Users size={24} className="text-primary" />
          Quản lý danh sách (Old Feature)
        </h2>
        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-primary/5 border border-primary/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-primary/10">
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-primary">Người dùng</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-primary text-center">Hạn đơn/ngày</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-primary">Ngày đăng ký</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-primary">Thanh toán</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-primary">Trạng thái</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-primary">Ngày hết hạn</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-primary text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <Loader2 className="animate-spin mx-auto text-primary mb-4" size={40} />
                      <p className="font-bold text-secondary">Đang tải...</p>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <Users className="mx-auto text-primary/20 mb-4" size={64} />
                      <p className="font-bold text-secondary">Trống.</p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isExpired = u.expiryDate ? new Date(u.expiryDate) < new Date() : true;
                    const isActive = u.status === 'active' && !isExpired;
                    const currentLimit = u.orderLimit || 100;

                    const handleUpdateLimit = async (uid: string) => {
                      try {
                        const userRef = doc(db, 'users', uid);
                        await updateDoc(userRef, {
                          orderLimit: limitValue
                        });
                        
                        // Also update Supabase if secondary DB is used for fast checks
                        try {
                          const { UsageService } = await import('./services/usageService');
                          await UsageService.updateDailyLimit(uid, limitValue);
                        } catch (e) {
                          console.error("Supabase sync failed", e);
                        }
                        
                        setUsers(prev => prev.map(user => user.uid === uid ? { ...user, orderLimit: limitValue } : user));
                        setEditingLimit(null);
                        toast.success('Đã cập nhật giới hạn đơn hàng');
                      } catch (err) {
                        toast.error('Lỗi khi cập nhật giới hạn');
                      }
                    };

                    return (
                      <tr key={u.uid} className="hover:bg-primary/5 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black">
                              {u.email[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-black text-on-surface">{u.email}</p>
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                u.role === 'super_admin' ? 'bg-secondary text-white' : u.role === 'admin' ? 'bg-primary text-white' : 'bg-secondary/10 text-secondary'
                              }`}>
                                {u.role}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {editingLimit === u.uid ? (
                            <div className="flex items-center justify-center gap-2">
                              <input 
                                type="number"
                                value={limitValue}
                                onChange={(e) => setLimitValue(Number(e.target.value))}
                                className="w-20 px-2 py-2 border-2 border-primary rounded-xl text-xs font-bold text-center outline-none shadow-sm"
                                autoFocus
                              />
                              <button 
                                onClick={() => handleUpdateLimit(u.uid)}
                                className="p-2 bg-primary text-white rounded-xl hover:scale-110 active:scale-95 transition-all shadow-md shadow-primary/20"
                              >
                                <Save size={14} />
                              </button>
                              <button 
                                onClick={() => setEditingLimit(null)}
                                className="p-2 bg-secondary/10 text-secondary rounded-xl hover:scale-110 active:scale-95 transition-all"
                              >
                                <XCircle size={14} />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingLimit(u.uid);
                                setLimitValue(currentLimit);
                              }}
                              className="px-4 py-2 bg-primary/5 hover:bg-primary/10 text-primary rounded-xl text-xs font-black transition-all border border-transparent hover:border-primary/20 flex items-center gap-2 mx-auto"
                            >
                              {currentLimit === 999999 ? '∞ Đơn' : `${currentLimit} Đơn`}
                              <Edit2 size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-secondary">
                          {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            u.paymentStatus === 'completed' ? 'bg-green-100 text-green-700' : u.paymentStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {u.paymentStatus === 'completed' ? 'Đã thanh toán' : u.paymentStatus === 'pending' ? 'Chờ duyệt' : 'Chưa có'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            isActive ? 'bg-green-100 text-green-700' : 'bg-error/10 text-error'
                          }`}>
                            {isActive ? 'Đã kích hoạt' : isExpired ? 'Hết hạn' : 'Chưa kích hoạt'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-on-surface">
                          {u.expiryDate ? new Date(u.expiryDate).toLocaleDateString('vi-VN') : 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {u.status === 'active' && (
                              <button onClick={() => handleDeactivate(u.uid)} className="px-3 py-1.5 bg-error/10 text-error rounded-lg text-[10px] font-black uppercase hover:bg-error hover:text-white transition-all">Hủy</button>
                            )}
                            <button onClick={() => handleActivate(u)} className="px-3 py-1.5 bg-primary text-white rounded-lg text-[10px] font-black uppercase shadow-sm">Kích hoạt</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
