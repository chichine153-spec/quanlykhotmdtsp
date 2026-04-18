import React from 'react';
import { 
  Package, 
  Plus, 
  History, 
  Calendar, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  LogIn,
  ChevronRight,
  ArrowDownCircle,
  Filter,
  Search,
  Clock,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { Product, InTransitLog } from './types';
import { logErrorToSupabase, FRIENDLY_ERROR_MESSAGE } from './lib/error-logging';
import { InventoryService } from './services/inventoryService';
import { classifyError } from './lib/errorUtils';

export default function InTransitManagement() {
  const { user, login } = useAuth();
  const { inventory: products, loading: dataLoading, quotaExceeded } = useData();
  const [inTransitLogs, setInTransitLogs] = React.useState<InTransitLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [quotaError, setQuotaError] = React.useState(false);

  // Form State
  const [selectedProductId, setSelectedProductId] = React.useState('');
  const [selectedVariantId, setSelectedVariantId] = React.useState('');
  const [quantity, setQuantity] = React.useState<number | ''>('');
  const [expectedDate, setExpectedDate] = React.useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  
  // Filter State
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'in_transit' | 'completed'>('all');

  React.useEffect(() => {
    setLoading(dataLoading);
  }, [dataLoading]);

  const fetchLogs = async () => {
    if (!user || quotaExceeded) return;
    
    setLoading(true);
    try {
      const logsQuery = query(
        collection(db, 'in_transit_logs'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(logsQuery);
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InTransitLog[];
      setInTransitLogs(logs);
      setQuotaError(false);
    } catch (error: any) {
      const classified = classifyError(error, 'Firebase');
      if (classified.isQuota) {
        setQuotaError(true);
      } else {
        console.error('InTransit logs error:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchLogs();
  }, [user, quotaExceeded]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-600">
          <LogIn size={40} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-black text-on-surface mb-2 uppercase tracking-tight font-headline">Zenith OMS - Vui lòng đăng nhập</h2>
          <p className="text-secondary mb-8">Bạn cần đăng nhập để quản lý hàng đang về từ xưởng.</p>
          <button 
            onClick={login}
            className="bg-blue-600 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-all"
          >
            Đăng nhập ngay
          </button>
        </div>
      </div>
    );
  }

  const uniqueProductNames = Array.from(new Set(products.map(p => p.name)));
  const selectedProductName = products.find(p => p.id === selectedProductId)?.name || '';
  const variants = products.filter(p => p.name === selectedProductName);

  const handleAddInTransit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariantId || !quantity || quantity <= 0 || !expectedDate) {
      setError('Vui lòng điền đầy đủ thông tin sản phẩm, số lượng và ngày dự kiến.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const variantProduct = products.find(p => p.id === selectedVariantId);
      if (!variantProduct) throw new Error('Không tìm thấy thông tin sản phẩm.');

      await InventoryService.addInTransitLog({
        productId: selectedVariantId,
        productName: variantProduct.name,
        sku: variantProduct.sku,
        variant: variantProduct.variant || 'Mặc định',
        quantity: Number(quantity),
        expectedArrival: expectedDate,
        status: 'in_transit',
        userId: user.uid
      });

      setSuccessMessage(`Đã ghi nhận lô hàng ${quantity} sản phẩm đang về!`);
      setQuantity('');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Add In-Transit Error:', err);
      logErrorToSupabase(err, 'in_transit_add', user?.uid);
      setError(FRIENDLY_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (log: InTransitLog) => {
    const newStatus = log.status === 'in_transit' ? 'completed' : 'in_transit';
    
    // Confirm before moving to stock
    if (newStatus === 'completed') {
      if (!window.confirm(`Xác nhận lô hàng này đã về kho? \n- Cộng ${log.quantity} vào tồn kho thực tế \n- Trừ ${log.quantity} khỏi hàng đang về`)) {
        return;
      }
    }

    try {
      await InventoryService.toggleInTransitStatus(log, newStatus);
    } catch (err) {
      console.error('Toggle Status Error:', err);
      logErrorToSupabase(err, 'in_transit_toggle', user?.uid);
    }
  };

  const filteredLogs = inTransitLogs.filter(log => {
    if (statusFilter === 'all') return true;
    return log.status === statusFilter;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-20"
    >
      {/* Header Section */}
      <section>
        <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2 font-headline uppercase text-blue-600">Quản lý Hàng đang về (Stock In-transit)</h1>
        <p className="text-secondary body-md">Theo dõi các lô hàng đã chốt với xưởng nhưng chưa nhập kho thực tế.</p>
      </section>

      {/* Quota Error Alert */}
      {(quotaExceeded || quotaError) && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-600"
        >
          <AlertCircle size={20} />
          <div className="flex-grow">
            <p className="text-sm font-bold">Hết hạn mức truy cập (Quota Exceeded)</p>
            <p className="text-[10px] opacity-80">Hệ thống đã đạt giới hạn truy cập miễn phí trong ngày. Một số dữ liệu có thể không được cập nhật thời gian thực.</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Section */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-blue-500/10 border border-blue-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 opacity-50" />
            
            <h2 className="text-xl font-black text-on-surface mb-8 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <Plus size={20} />
              </div>
              Thêm hàng đang về
            </h2>

            <form onSubmit={handleAddInTransit} className="space-y-6 relative z-10">
              {/* Product Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Sản phẩm</label>
                <div className="relative">
                  <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500/40" size={20} />
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      setSelectedVariantId('');
                    }}
                    className="w-full pl-12 pr-4 py-4 bg-blue-500/5 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-on-surface appearance-none"
                  >
                    <option value="">-- Chọn sản phẩm --</option>
                    {uniqueProductNames.map(name => {
                      const firstVariant = products.find(p => p.name === name);
                      return (
                        <option key={firstVariant?.id} value={firstVariant?.id}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500/40 rotate-90" size={20} />
                </div>
              </div>

              {/* Variant Selection */}
              <AnimatePresence>
                {selectedProductId && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Màu sắc / Phân loại</label>
                    <div className="relative">
                      <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500/40" size={20} />
                      <select
                        value={selectedVariantId}
                        onChange={(e) => setSelectedVariantId(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-blue-500/5 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-on-surface appearance-none"
                      >
                        <option value="">-- Chọn màu sắc --</option>
                        {variants.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.variant || 'Mặc định'} (Tồn: {v.stock}, Đang về: {v.inTransit || 0})
                          </option>
                        ))}
                      </select>
                      <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500/40 rotate-90" size={20} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-2 gap-4">
                {/* Quantity */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Số lượng</label>
                  <div className="relative">
                    <ArrowDownCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500/40" size={20} />
                    <input 
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="SL"
                      className="w-full pl-12 pr-4 py-4 bg-blue-500/5 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-on-surface text-lg"
                    />
                  </div>
                </div>

                {/* Expected Date */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Dự kiến về</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500/40" size={20} />
                    <input 
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-blue-500/5 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-on-surface text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Messages */}
              <AnimatePresence>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3 border border-red-100 text-sm font-bold"
                  >
                    <AlertCircle size={18} />
                    {error}
                  </motion.div>
                )}
                {successMessage && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-blue-50 text-blue-600 rounded-2xl flex items-center gap-3 border border-blue-100 text-sm font-bold"
                  >
                    <CheckCircle2 size={18} />
                    {successMessage}
                  </motion.div>
                )}
              </AnimatePresence>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full py-5 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={24} /> : <ArrowDownCircle size={24} />}
                XÁC NHẬN HÀNG ĐANG ĐI
              </button>
            </form>
          </div>
        </div>

        {/* List Section */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col h-full">
            <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-on-surface tracking-tight">Lịch sử hàng đang về</h3>
                  <p className="text-[10px] uppercase tracking-widest text-secondary font-bold">Quản lý trạng thái lô hàng xưởng</p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200">
                {(['all', 'in_transit', 'completed'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                      statusFilter === s ? 'bg-blue-600 text-white shadow-md' : 'text-secondary hover:bg-slate-50'
                    }`}
                  >
                    {s === 'all' ? 'Tất cả' : s === 'in_transit' ? 'Đang về' : 'Đã về'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-grow overflow-x-auto">
              {loading ? (
                <div className="p-20 flex flex-col items-center justify-center text-secondary gap-4">
                  <Loader2 className="animate-spin text-blue-600" size={48} />
                  <p className="font-bold">Đang tải dữ liệu...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-20 flex flex-col items-center justify-center text-secondary gap-4 opacity-40">
                  <Search size={64} />
                  <p className="font-bold">Chưa có lô hàng nào được ghi nhận.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Ngày đặt / Dự kiến</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Sản phẩm</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary text-center">Số lượng</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-blue-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-on-surface">
                              {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString('vi-VN') : 'Vừa xong'}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] text-blue-600 font-bold">
                              <Clock size={10} />
                              <span>Dự kiến: {new Date(log.expectedArrival).toLocaleDateString('vi-VN')}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-black text-on-surface line-clamp-1">{log.productName}</p>
                          <p className="text-[10px] font-mono text-secondary">{log.sku} • {log.variant}</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-black text-blue-600">{log.quantity}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter ${
                              log.status === 'in_transit' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {log.status === 'in_transit' ? 'Hàng đang về' : 'Đã vào kho'}
                            </span>
                            
                            {/* Toggle Switch */}
                            <button
                              onClick={() => handleToggleStatus(log)}
                              className={`w-10 h-5 rounded-full relative transition-all ${
                                log.status === 'completed' ? 'bg-green-500' : 'bg-slate-300'
                              }`}
                            >
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${
                                log.status === 'completed' ? 'left-6' : 'left-1'
                              }`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
