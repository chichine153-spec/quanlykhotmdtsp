import React from 'react';
import { 
  Search, 
  Barcode, 
  Truck, 
  History, 
  FileText, 
  ZoomIn, 
  Printer, 
  Download,
  CheckCircle2,
  Loader2,
  AlertCircle,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { useAuth } from './contexts/AuthContext';

interface OrderData {
  trackingCode: string;
  recipient?: string;
  phone?: string;
  address?: string;
  carrier?: string;
  processedAt: string;
  sku: string;
  quantity: number;
}

export default function OrderSearch() {
  const { user, login } = useAuth();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [order, setOrder] = React.useState<OrderData | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-primary-fixed/20 rounded-full flex items-center justify-center text-primary">
          <LogIn size={40} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-bold text-on-surface mb-2">Vui lòng đăng nhập</h2>
          <p className="text-secondary mb-8">Bạn cần đăng nhập để tìm kiếm và xem chi tiết thông tin đơn hàng.</p>
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setOrder(null);
    setPdfUrl(null);

    try {
      // 1. Fetch order from Firestore
      const orderRef = doc(db, 'orders', searchQuery.trim());
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error('Không tìm thấy đơn hàng này trong hệ thống.');
      }

      const data = orderSnap.data() as OrderData;
      setOrder(data);

      // 2. Fetch PDF URL from Storage
      try {
        const storageRef = ref(storage, `shipping_labels/${data.trackingCode}.pdf`);
        const url = await getDownloadURL(storageRef);
        setPdfUrl(url);
      } catch (storageErr) {
        console.warn('PDF not found in storage:', storageErr);
      }

    } catch (err: any) {
      setError(err.message || 'Lỗi khi tìm kiếm đơn hàng.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header Section */}
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-2 font-headline">Tìm kiếm đơn hàng</h1>
        <p className="text-secondary body-md">Truy xuất thông tin vận đơn và xem lại nhãn dán Shopee đã lưu trữ.</p>
      </section>

      {/* Search Bar Bento Card */}
      <div className="relative z-10">
        <div className="surface-container-lowest glass-morphism rounded-3xl p-6 shadow-sm flex flex-col md:flex-row gap-4 items-end border border-surface-container">
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2 ml-1">Mã vận đơn (Tracking Code)</label>
            <div className="relative flex items-center">
              <Barcode className="absolute left-4 text-slate-400" size={24} />
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-12 pr-4 py-4 bg-surface-container-high/50 border-0 border-b-2 border-transparent focus:border-primary focus:bg-surface-container-lowest transition-all rounded-xl text-on-surface font-medium placeholder:text-slate-400" 
                placeholder="Nhập mã vận đơn (Ví dụ: GYKP9QPE)..." 
                type="text"
              />
            </div>
          </div>
          <button 
            onClick={handleSearch}
            disabled={loading}
            className="w-full md:w-auto h-[56px] px-8 rounded-full bg-gradient-to-br from-primary to-primary-container text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-orange-200 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
            Tìm kiếm
          </button>
        </div>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-error-container text-on-error-container rounded-2xl flex items-center gap-3 border border-error/20"
          >
            <AlertCircle size={20} />
            <span className="text-sm font-medium">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Grid */}
      {order && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Result Details */}
          <div className="lg:col-span-4 space-y-6">
            {/* Order Status Card */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="flex justify-between items-start mb-6">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Thông tin đơn hàng</span>
                <span className="px-3 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-xs font-bold">Đã nhập kho</span>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Mã vận đơn</p>
                  <p className="font-bold text-on-surface font-mono">{order.trackingCode}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Sản phẩm (SKU)</p>
                  <p className="font-bold text-on-surface">{order.sku}</p>
                  <p className="text-sm text-secondary">Số lượng: {order.quantity}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Thời gian xử lý</p>
                  <p className="text-sm text-on-surface leading-relaxed">
                    {new Date(order.processedAt).toLocaleString('vi-VN')}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">Đơn vị vận chuyển</p>
                    <p className="font-bold text-primary">{order.carrier || 'Shopee Express'}</p>
                  </div>
                  <Truck className="text-slate-200" size={32} />
                </div>
              </div>
            </div>

            {/* Logistics History Card (Mocked for UI) */}
            <div className="bg-white/40 backdrop-blur-md rounded-3xl p-6 border border-white">
              <h3 className="text-sm font-bold text-on-surface mb-6 flex items-center gap-2">
                <History size={18} />
                Lịch sử hành trình
              </h3>
              <div className="relative space-y-6 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                <div className="relative pl-8">
                  <div className="absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white bg-primary">
                    <CheckCircle2 size={12} className="text-white" />
                  </div>
                  <p className="text-xs font-bold text-on-surface">Đã nhập kho Lucid</p>
                  <p className="text-[10px] text-slate-400">{new Date(order.processedAt).toLocaleTimeString('vi-VN')} - {new Date(order.processedAt).toLocaleDateString('vi-VN')}</p>
                </div>
                <div className="relative pl-8 opacity-50">
                  <div className="absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white bg-slate-200">
                    <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                  </div>
                  <p className="text-xs font-bold text-slate-600">Đang vận chuyển</p>
                  <p className="text-[10px] text-slate-400">--:--</p>
                </div>
              </div>
            </div>
          </div>

          {/* PDF Preview */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full min-h-[600px]">
              {/* Toolbar */}
              <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <FileText className="text-primary" size={18} />
                    {order.trackingCode}.pdf
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-600 font-bold uppercase">Lưu trữ</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 rounded-lg hover:bg-slate-200 transition-colors">
                    <ZoomIn size={20} />
                  </button>
                  <button className="p-2 rounded-lg hover:bg-slate-200 transition-colors">
                    <Printer size={20} />
                  </button>
                  {pdfUrl && (
                    <a 
                      href={pdfUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="ml-2 px-4 py-2 bg-white rounded-full border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                      <Download size={14} />
                      Tải về
                    </a>
                  )}
                </div>
              </div>
              
              {/* Preview Area */}
              <div className="flex-1 bg-slate-100 p-8 flex justify-center items-start overflow-y-auto custom-scrollbar">
                {pdfUrl ? (
                  <iframe 
                    src={pdfUrl} 
                    className="w-full h-full min-h-[500px] border-0 rounded-xl shadow-2xl"
                    title="PDF Preview"
                  />
                ) : (
                  <div className="w-full max-w-[500px] bg-white shadow-2xl p-12 text-center space-y-4">
                    <FileText className="mx-auto text-slate-200" size={64} />
                    <p className="text-secondary font-medium">Không thể hiển thị bản xem trước trực tiếp. Vui lòng tải về để xem.</p>
                    <button 
                      onClick={() => window.open(pdfUrl || '#')}
                      className="text-primary font-bold hover:underline"
                    >
                      Mở trong tab mới
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
