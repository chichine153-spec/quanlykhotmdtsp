import React from 'react';
import { 
  Barcode, 
  ArrowRight, 
  User, 
  Truck, 
  PlusCircle, 
  AlertCircle, 
  Printer,
  LogIn,
  Loader2,
  CheckCircle2,
  Package,
  Trash2,
  Search,
  History,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ReturnService } from './services/returnService';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function Returns() {
  const { user, login } = useAuth();
  const { returns: returnsHistory } = useData();
  const [barcode, setBarcode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [currentOrder, setCurrentOrder] = React.useState<any | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleScan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = barcode.trim();
    if (!code || !user) return;

    setLoading(true);
    try {
      const order = await ReturnService.searchOrder(code, user.uid);
      
      if (!order) {
        addToast('Không tìm thấy đơn hàng này trong hệ thống.', 'error');
        setCurrentOrder(null);
      } else {
        addToast('Đã tìm thấy đơn hàng!', 'success');
        setCurrentOrder(order);
      }
    } catch (error) {
      console.error('Scan Error:', error);
      addToast('Lỗi khi tìm kiếm đơn hàng.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessReturn = async () => {
    if (!currentOrder || !user) return;

    setIsProcessing(true);
    try {
      await ReturnService.processReturn(currentOrder, user.uid);
      addToast('Đã cộng kho và ghi nhận hàng hoàn thành công!', 'success');
      setBarcode('');
      setCurrentOrder(null);
    } catch (error) {
      console.error('Process Return Error:', error);
      addToast('Lỗi khi xử lý hàng hoàn.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteReturn = async () => {
    if (!confirmDeleteId) return;
    
    setIsDeleting(true);
    try {
      await ReturnService.deleteReturn(confirmDeleteId);
      addToast('Đã xoá bản ghi hàng hoàn.', 'info');
      setConfirmDeleteId(null);
    } catch (error) {
      console.error('Delete Return Error:', error);
      addToast('Lỗi khi xoá bản ghi.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-primary-fixed/20 rounded-full flex items-center justify-center text-primary">
          <LogIn size={40} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-bold text-on-surface mb-2">Vui lòng đăng nhập</h2>
          <p className="text-secondary mb-8">Bạn cần đăng nhập để thực hiện xử lý hàng hoàn và cập nhật kho hàng.</p>
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

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header Section */}
      <header>
        <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2">Hàng Hoàn</h1>
        <p className="text-secondary text-sm font-medium">Xử lý hàng hoàn từ khách hàng Shopee</p>
      </header>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Scanner Section */}
        <section className="lg:col-span-7 bg-surface-container-lowest glass-morphism rounded-[2rem] p-8 shadow-sm border border-surface-container">
          <div className="flex items-center gap-2 mb-6 text-primary">
            <Barcode size={20} />
            <span className="text-xs font-bold uppercase tracking-widest">Scanner Active</span>
          </div>
          <div className="relative group">
            <label className="absolute -top-3 left-6 bg-white px-2 text-[10px] font-bold text-secondary uppercase tracking-widest z-10">Mã vận đơn / Tracking Code</label>
            <form onSubmit={handleScan} className="flex items-center bg-surface-container-low rounded-3xl p-2 focus-within:ring-2 ring-primary transition-all">
              <input 
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                autoFocus 
                className="w-full bg-transparent border-none focus:ring-0 text-2xl font-bold py-6 px-6 placeholder:text-slate-300" 
                placeholder="Quét barcode hoặc nhập mã SPX..." 
                type="text"
              />
              <button 
                type="submit"
                disabled={loading}
                className="bg-primary text-white p-6 rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={24} /> : <Search size={24} />}
              </button>
            </form>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="bg-surface-container-high/40 rounded-2xl p-4 text-center">
              <p className="text-[10px] text-secondary font-bold uppercase mb-1">Hôm nay</p>
              <p className="text-2xl font-black text-on-surface">
                {returnsHistory.filter(r => r.returnedAt.startsWith(new Date().toISOString().split('T')[0])).length}
              </p>
            </div>
            <div className="bg-surface-container-high/40 rounded-2xl p-4 text-center">
              <p className="text-[10px] text-secondary font-bold uppercase mb-1">Đã xử lý</p>
              <p className="text-2xl font-black text-tertiary">{returnsHistory.length}</p>
            </div>
            <div className="bg-surface-container-high/40 rounded-2xl p-4 text-center">
              <p className="text-[10px] text-secondary font-bold uppercase mb-1">Chờ duyệt</p>
              <p className="text-2xl font-black text-primary">0</p>
            </div>
          </div>
        </section>

        {/* Order Details Section */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-surface-container-lowest glass-morphism rounded-[2rem] p-8 shadow-sm border border-surface-container">
            {!currentOrder ? (
              <div className="py-20 text-center text-secondary">
                <Truck className="mx-auto mb-4 opacity-20" size={48} />
                <p className="font-bold">Quét mã vận đơn để xem chi tiết đơn hàng hoàn.</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <span className="bg-tertiary-fixed text-on-tertiary-fixed text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter mb-2 inline-block">Đơn hàng hiện tại</span>
                    <h3 className="text-xl font-bold text-on-surface">#{currentOrder.trackingCode}</h3>
                  </div>
                  <Truck className="text-slate-300" size={40} />
                </div>
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-secondary-container flex items-center justify-center text-on-secondary-container">
                      <User size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Ngày xử lý</p>
                      <p className="font-bold text-on-surface">{new Date(currentOrder.processedAt).toLocaleString('vi-VN')}</p>
                    </div>
                  </div>
                  <div className="bg-surface-container-low rounded-2xl p-4">
                    <p className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-3">Sản phẩm hoàn trả</p>
                    <div className="space-y-4">
                      {currentOrder.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-white border border-surface-container flex items-center justify-center">
                            <Package className="text-secondary/20" size={32} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold line-clamp-1">{item.productName}</p>
                            <p className="text-xs text-secondary">SKU: {item.sku} | {item.variant}</p>
                            <div className="flex justify-between mt-1">
                              <span className="text-primary font-bold">x{item.quantity}</span>
                              <span className="text-xs font-bold text-on-surface">{(item.sellingPrice * item.quantity).toLocaleString()}đ</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Quick Process CTA */}
                <button 
                  onClick={handleProcessReturn}
                  disabled={isProcessing}
                  className="w-full mt-8 bg-primary text-white py-6 rounded-2xl shadow-xl shadow-primary/10 flex items-center justify-center gap-3 active:scale-95 transition-all group disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="animate-spin" size={28} />
                  ) : (
                    <>
                      <PlusCircle className="group-hover:rotate-90 transition-transform" size={28} />
                      <span className="text-lg font-bold tracking-tight">Xác nhận nhập kho hoàn</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 gap-4">
            <button className="bg-surface-container-lowest py-4 rounded-2xl text-secondary font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors border border-surface-container">
              <AlertCircle size={16} /> Khiếu nại
            </button>
            <button className="bg-surface-container-lowest py-4 rounded-2xl text-secondary font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors border border-surface-container">
              <Printer size={16} /> In tem
            </button>
          </div>
        </section>
      </div>

      {/* Return History Table */}
      <section className="bg-white rounded-[2.5rem] shadow-sm border border-surface-container overflow-hidden">
        <div className="p-8 border-b border-surface-container flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="text-primary" size={20} />
            <h3 className="text-xl font-bold text-on-surface tracking-tight">Lịch sử hàng hoàn</h3>
          </div>
          <span className="text-xs font-bold text-secondary uppercase tracking-widest">Sắp xếp theo Thời gian</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Ngày/Tháng</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Mã vận đơn</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Sản phẩm</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Số lượng</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {returnsHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Calendar className="opacity-20" size={48} />
                      <p className="font-bold">Chưa có lịch sử hàng hoàn nào.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                returnsHistory.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-on-surface">
                          {new Date(record.returnedAt).toLocaleDateString('vi-VN')}
                        </span>
                        <span className="text-[10px] text-secondary">
                          {new Date(record.returnedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono font-bold text-primary">{record.trackingCode}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {record.items.map((item: any, i: number) => (
                          <div key={i} className="text-xs">
                            <span className="font-bold">{item.productName}</span>
                            <span className="text-secondary ml-2">({item.sku} | {item.variant})</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-black text-on-surface">
                        {record.items.reduce((sum: number, i: any) => sum + i.quantity, 0)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setConfirmDeleteId(record.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Xoá bản ghi"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Toast Notifications */}
      <div className="fixed bottom-24 right-8 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={`pointer-events-auto px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px] border ${
                toast.type === 'success' ? 'bg-green-50 border-green-100 text-green-800' :
                toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' :
                'bg-blue-50 border-blue-100 text-blue-800'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : 
               toast.type === 'error' ? <AlertCircle size={20} /> : 
               <Package size={20} />}
              <span className="text-sm font-bold">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-surface-container"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mb-6 mx-auto">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-on-surface mb-2 text-center">Xác nhận xoá</h3>
              <p className="text-sm text-secondary mb-8 text-center leading-relaxed">
                Bạn có chắc chắn muốn xoá bản ghi hàng hoàn này? Hệ thống sẽ <strong>hoàn tác tồn kho</strong> và cập nhật trạng thái đơn hàng.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-secondary hover:bg-surface-container transition-all"
                >
                  Hủy
                </button>
                <button 
                  onClick={handleDeleteReturn}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                >
                  {isDeleting ? <Loader2 className="animate-spin" size={18} /> : 'Xác nhận xoá'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
