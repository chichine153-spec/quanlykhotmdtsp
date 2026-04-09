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
  ArrowUpCircle,
  Filter,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  runTransaction, 
  doc, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { Product, InventoryLog } from './types';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';

export default function StockIn() {
  const { user, login } = useAuth();
  const { inventory: products, loading: dataLoading } = useData();
  const [historyLogs, setHistoryLogs] = React.useState<InventoryLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Form State
  const [selectedProductId, setSelectedProductId] = React.useState('');
  const [selectedVariantId, setSelectedVariantId] = React.useState('');
  const [quantity, setQuantity] = React.useState<number | ''>('');
  
  // Filter State
  const [dateFilter, setDateFilter] = React.useState(new Date().toISOString().split('T')[0]);

  React.useEffect(() => {
    setLoading(dataLoading);
  }, [dataLoading]);

  React.useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // No local inventory listener needed anymore, using global data from DataContext
    /*
    const inventoryQuery = query(
      collection(db, 'inventory'),
      where('userId', '==', user.uid)
    );
    
    const unsubInventory = onSnapshot(inventoryQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });
    */

    // Listen to history logs
    const logsQuery = query(
      collection(db, 'inventory_logs'),
      where('userId', '==', user.uid),
      where('type', '==', 'addition'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryLog[];
      setHistoryLogs(logs);
    }, (error) => {
      console.error('StockIn logs error:', error);
      // Don't throw here to avoid crashing the app
    });

    return () => {
      // unsubInventory();
      unsubLogs();
    };
  }, [user]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary">
          <LogIn size={40} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-black text-on-surface mb-2 uppercase tracking-tight font-headline">Zenith OMS - Vui lòng đăng nhập</h2>
          <p className="text-secondary mb-8">Bạn cần đăng nhập để thực hiện nhập kho hàng về.</p>
          <button 
            onClick={login}
            className="bg-primary text-white px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-all"
          >
            Đăng nhập ngay
          </button>
        </div>
      </div>
    );
  }

  // Group products by name for the first dropdown
  const uniqueProductNames = Array.from(new Set(products.map(p => p.name)));
  
  // Get variants for the selected product name
  const selectedProductName = products.find(p => p.id === selectedProductId)?.name || '';
  const variants = products.filter(p => p.name === selectedProductName);

  const handleStockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariantId || !quantity || quantity <= 0) {
      setError('Vui lòng chọn sản phẩm, phân loại và nhập số lượng hợp lệ.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const variantProduct = products.find(p => p.id === selectedVariantId);
      if (!variantProduct) throw new Error('Không tìm thấy thông tin sản phẩm.');

      const productRef = doc(db, 'inventory', selectedVariantId);
      const logRef = doc(collection(db, 'inventory_logs'));

      await runTransaction(db, async (transaction) => {
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) {
          throw new Error("Sản phẩm không tồn tại trong kho.");
        }

        const currentStock = productDoc.data().stock || 0;
        const newStock = currentStock + Number(quantity);
        const status = newStock > 10 ? 'in_stock' : (newStock > 0 ? 'low_stock' : 'out_of_stock');

        // 1. Update Inventory
        transaction.update(productRef, { 
          stock: newStock,
          status: status,
          updatedAt: serverTimestamp()
        });

        // 2. Log History
        transaction.set(logRef, {
          timestamp: serverTimestamp(),
          sku: variantProduct.sku,
          productName: variantProduct.name,
          variant: variantProduct.variant || 'Mặc định',
          change: Number(quantity),
          type: 'addition',
          userId: user.uid,
          performer: user.displayName || 'Admin'
        });
      });

      setSuccessMessage(`Đã cộng ${quantity} sản phẩm vào kho thành công!`);
      setQuantity('');
      // Keep product selection for potentially adding more variants of the same product
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Stock In Error:', err);
      setError(err.message || 'Lỗi khi cập nhật kho hàng.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredHistory = historyLogs.filter(log => {
    if (!dateFilter) return true;
    const logDate = log.timestamp?.toDate ? log.timestamp.toDate().toISOString().split('T')[0] : '';
    return logDate === dateFilter;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-20"
    >
      {/* Header Section */}
      <section>
        <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2 font-headline uppercase">Nhập kho hàng về (Stock In)</h1>
        <p className="text-secondary body-md">Cập nhật số lượng hàng mới về và theo dõi lịch sử biến động kho.</p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Quick Stock Entry Form */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-primary/10 border border-primary/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 opacity-50" />
            
            <h2 className="text-xl font-black text-on-surface mb-8 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <Plus size={20} />
              </div>
              Nhập hàng nhanh
            </h2>

            <form onSubmit={handleStockIn} className="space-y-6 relative z-10">
              {/* Product Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Sản phẩm</label>
                <div className="relative">
                  <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40" size={20} />
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      setSelectedVariantId(''); // Reset variant when product changes
                    }}
                    className="w-full pl-12 pr-4 py-4 bg-primary/5 border-2 border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all font-bold text-on-surface appearance-none"
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
                  <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/40 rotate-90" size={20} />
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
                      <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40" size={20} />
                      <select
                        value={selectedVariantId}
                        onChange={(e) => setSelectedVariantId(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-primary/5 border-2 border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all font-bold text-on-surface appearance-none"
                      >
                        <option value="">-- Chọn màu sắc --</option>
                        {variants.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.variant || 'Mặc định'} (Hiện có: {v.stock})
                          </option>
                        ))}
                      </select>
                      <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/40 rotate-90" size={20} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quantity Input */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Số lượng nhập về</label>
                <div className="relative">
                  <ArrowUpCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40" size={20} />
                  <input 
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ví dụ: 50"
                    className="w-full pl-12 pr-4 py-4 bg-primary/5 border-2 border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all font-bold text-on-surface text-xl"
                  />
                </div>
              </div>

              {/* Error/Success Messages */}
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
                    className="p-4 bg-primary/5 text-primary rounded-2xl flex items-center gap-3 border border-primary/20 text-sm font-bold"
                  >
                    <CheckCircle2 size={18} />
                    {successMessage}
                  </motion.div>
                )}
              </AnimatePresence>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full py-5 bg-gradient-to-br from-primary to-primary-container text-white rounded-2xl font-black text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle2 size={24} />}
                XÁC NHẬN NHẬP KHO
              </button>
            </form>
          </div>
        </div>

        {/* History Table Section */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col h-full">
            <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-on-surface tracking-tight">Lịch sử nhập hàng</h3>
                  <p className="text-[10px] uppercase tracking-widest text-secondary font-bold">Dữ liệu biến động kho gần đây</p>
                </div>
              </div>

              {/* Date Filter */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            <div className="flex-grow overflow-x-auto">
              {loading ? (
                <div className="p-20 flex flex-col items-center justify-center text-secondary gap-4">
                  <Loader2 className="animate-spin text-primary" size={48} />
                  <p className="font-bold">Đang tải lịch sử...</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="p-20 flex flex-col items-center justify-center text-secondary gap-4 opacity-40">
                  <Search size={64} />
                  <p className="font-bold">Không có dữ liệu nhập hàng trong ngày này.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Ngày nhập</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Sản phẩm</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Phân loại</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary text-center">Số lượng</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredHistory.map((log) => (
                      <tr key={log.id} className="hover:bg-primary/5 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-on-surface">
                              {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong'}
                            </span>
                            <span className="text-[10px] text-secondary">
                              {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString('vi-VN') : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-black text-on-surface line-clamp-1">{log.productName}</p>
                          <p className="text-[10px] font-mono text-secondary">{log.sku}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-secondary">{log.variant}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-black text-green-600">+{log.change}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-[10px] font-black uppercase tracking-tighter">
                            <CheckCircle2 size={10} />
                            Thành công
                          </span>
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
