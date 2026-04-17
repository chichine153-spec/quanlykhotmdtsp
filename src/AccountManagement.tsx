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
  Save
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
  limit
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
  const { user: currentUser, role } = useAuth();
  const { globalConfig, refreshData } = useData();
  const [users, setUsers] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isUpdating, setIsUpdating] = React.useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = React.useState<string>('1_month');
  const [geminiKey, setGeminiKey] = React.useState('');
  const [isSavingKey, setIsSavingKey] = React.useState(false);
  const [isTestLoading, setIsTestLoading] = React.useState(false);

  React.useEffect(() => {
    if (globalConfig?.geminiApiKey) {
      setGeminiKey(globalConfig.geminiApiKey);
    }
  }, [globalConfig]);

  const fetchUsers = async () => {
    if (role !== 'admin') return;
    setLoading(true);
    try {
      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100));
      const snapshot = await getDocs(usersQuery);
      const usersList = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as UserProfile[];
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
    if (role === 'admin') {
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
        model: "gemini-1.5-flash",
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

  if (role !== 'admin') {
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
            Quản lý tài khoản
            {pendingCount > 0 && (
              <span className="flex h-4 w-4 rounded-full bg-error animate-pulse items-center justify-center text-[10px] text-white">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-secondary body-md">Kích hoạt gói Foot và quản lý trạng thái người dùng hệ thống.</p>
        </div>
        
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
      </section>

      {/* Global AI Config (Admin only) */}
      <section className="bg-primary-fixed/20 border border-primary/20 p-8 rounded-[2.5rem]">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-on-surface uppercase tracking-tight">Cấu hình AI hệ thống</h2>
            <p className="text-xs text-secondary font-medium">API Key này sẽ được dùng chung cho tất cả người dùng để bóc tách PDF.</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="relative">
            <input 
              type="password"
              placeholder="Nhập Google Gemini API Key..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full pl-6 pr-6 py-4 bg-white border-2 border-primary/10 focus:border-primary rounded-2xl outline-none transition-all font-mono text-sm shadow-sm"
            />
          </div>
          <div className="flex flex-col md:flex-row gap-4">
            <button 
              onClick={testGeminiKey}
              disabled={isTestLoading || !geminiKey}
              className="px-6 py-4 bg-white border-2 border-primary text-primary rounded-2xl font-black uppercase tracking-widest hover:bg-primary/5 transition-all flex items-center justify-center gap-3 disabled:opacity-50 flex-1 md:flex-none"
            >
              {isTestLoading ? <Loader2 className="animate-spin" size={20} /> : <BrainCircuit size={20} />}
              Kiểm tra mã
            </button>
            <button 
              onClick={handleUpdateGeminiKey}
              disabled={isSavingKey}
              className="flex-1 px-8 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isSavingKey ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Lưu cấu hình hệ thống
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Info Cards */}
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
                <h3 className="font-black text-on-surface">{pkg.label}</h3>
                <p className="text-xs text-secondary font-bold uppercase tracking-widest">Gói Foot</p>
              </div>
            </div>
            <p className="text-2xl font-black text-primary">{pkg.price.toLocaleString()}đ</p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-primary/5 border border-primary/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-primary/5">
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-secondary">Người dùng</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-secondary">Ngày đăng ký</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-secondary">Thanh toán</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-secondary">Trạng thái</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-secondary">Ngày hết hạn</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Loader2 className="animate-spin mx-auto text-primary mb-4" size={40} />
                    <p className="font-bold text-secondary">Đang tải danh sách người dùng...</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Users className="mx-auto text-primary/20 mb-4" size={64} />
                    <p className="font-bold text-secondary">Không tìm thấy người dùng nào.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isExpired = u.expiryDate ? new Date(u.expiryDate) < new Date() : true;
                  const isActive = u.status === 'active' && !isExpired;

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
                              u.role === 'admin' ? 'bg-primary text-white' : 'bg-secondary/10 text-secondary'
                            }`}>
                              {u.role}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 text-xs font-bold text-secondary">
                            <Calendar size={14} />
                            {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                          </div>
                          {u.phone && (
                            <div className="flex items-center gap-2 text-[10px] font-bold text-primary mt-1">
                              <Filter size={10} />
                              {u.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          u.paymentStatus === 'completed' 
                            ? 'bg-green-100 text-green-700' 
                            : u.paymentStatus === 'pending'
                            ? 'bg-yellow-100 text-yellow-700 animate-pulse'
                            : 'bg-secondary/10 text-secondary'
                        }`}>
                          {u.paymentStatus === 'completed' ? 'Đã thanh toán' : u.paymentStatus === 'pending' ? 'Chờ duyệt' : 'Chưa có'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          isActive 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-error/10 text-error'
                        }`}>
                          {isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {isActive ? 'Đã kích hoạt' : isExpired ? 'Hết hạn' : 'Chưa kích hoạt'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-on-surface">
                          <Clock size={14} className={isExpired ? 'text-error' : 'text-primary'} />
                          {u.expiryDate ? new Date(u.expiryDate).toLocaleDateString('vi-VN') : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {u.status === 'active' ? (
                            <button 
                              onClick={() => handleDeactivate(u.uid)}
                              disabled={isUpdating === u.uid}
                              className="px-4 py-2 bg-error/10 text-error hover:bg-error hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                              Hủy kích hoạt
                            </button>
                          ) : null}
                          <button 
                            onClick={() => handleActivate(u)}
                            disabled={isUpdating === u.uid}
                            className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                          >
                            {isUpdating === u.uid ? <Loader2 className="animate-spin" size={12} /> : <ArrowRightCircle size={12} />}
                            Kích hoạt
                          </button>
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
    </motion.div>
  );
}
