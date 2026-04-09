import React from 'react';
import { 
  Search, 
  Printer, 
  Clock, 
  AlertCircle, 
  RotateCcw, 
  FileText,
  ChevronRight,
  Package,
  Calendar,
  X,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { GeminiService } from '../services/gemini';
import GeminiKeyModal from './GeminiKeyModal';
import { getDoc, doc, getDocs } from 'firebase/firestore';

import { getSupabase } from '../lib/supabase';

interface PrintHistoryRecord {
  id: string;
  tracking_number: string;
  product_name: string;
  image_url: string;
  is_cup: boolean;
  created_at: string;
  user_id: string;
}

export default function RePrintModule() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [labels, setLabels] = React.useState<PrintHistoryRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [showApiKeyModal, setShowApiKeyModal] = React.useState(false);
  const [orderToPrint, setOrderToPrint] = React.useState<any>(null);
  const [imageToPrint, setImageToPrint] = React.useState<string | null>(null);
  const printRef = React.useRef<HTMLDivElement>(null);
  const imagePrintRef = React.useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Vận đơn ${orderToPrint?.trackingCode || ''}`,
  });

  const handleImagePrint = useReactToPrint({
    contentRef: imagePrintRef,
    documentTitle: `Vận đơn Hình ảnh`,
  });

  React.useEffect(() => {
    if (orderToPrint) {
      const timer = setTimeout(() => {
        handlePrint();
        setOrderToPrint(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [orderToPrint, handlePrint]);

  React.useEffect(() => {
    if (imageToPrint) {
      const timer = setTimeout(() => {
        handleImagePrint();
        setImageToPrint(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [imageToPrint, handleImagePrint]);

  React.useEffect(() => {
    if (!user) return;

    const fetchHistory = async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('print_history')
          .select('*')
          .eq('user_id', user.uid)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        setLabels(data || []);
      } catch (err) {
        console.error('[RePrintModule] Supabase fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    // Real-time subscription
    const supabase = getSupabase();
    let channel: any = null;
    
    if (supabase) {
      channel = supabase
        .channel('print_history_changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'print_history',
          filter: `user_id=eq.${user.uid}`
        }, (payload) => {
          console.log('[RePrintModule] Real-time update:', payload);
          fetchHistory();
        })
        .subscribe();
    }

    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [user, refreshKey]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshKey(prev => prev + 1);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !user) return;

    const queryStr = searchQuery.trim();
    const supabase = getSupabase();
    if (!supabase) {
      alert('Supabase chưa được cấu hình.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('print_history')
        .select('*')
        .eq('user_id', user.uid)
        .eq('tracking_number', queryStr)
        .limit(1);

      if (error) throw error;
      if (data && data.length > 0) {
        handleQuickPrint(data[0]);
      } else {
        alert('Không tìm thấy đơn hàng trong lịch sử in.');
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('Lỗi khi tìm kiếm đơn hàng.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPrint = async (label: PrintHistoryRecord) => {
    if (label.image_url) {
      setImageToPrint(label.image_url);
      return;
    }

    setLoading(true);
    try {
      const orderSnap = await getDoc(doc(db, 'orders', label.tracking_number));
      
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        setOrderToPrint({
          ...orderData,
          trackingCode: label.tracking_number
        });
      } else {
        setOrderToPrint({
          trackingCode: label.tracking_number,
          region: 'N/A',
          items: label.product_name,
          destination: 'Chưa xác định',
          uploadDate: label.created_at
        });
      }
    } catch (error) {
      console.error('Print error:', error);
      alert('Lỗi khi tải dữ liệu in.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa đơn hàng này khỏi lịch sử in?')) return;

    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('print_history')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setLabels(prev => prev.filter(l => l.id !== id));
    } catch (error) {
      console.error('Delete error:', error);
      alert('Lỗi khi xóa đơn hàng.');
    }
  };

  const handleOpenPDF = (pdfUrl: string) => {
    if (!pdfUrl) {
      alert('Không tìm thấy URL file PDF cho đơn hàng này.');
      return;
    }
    window.open(pdfUrl, '_blank');
  };

  if (!user) return null;

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface font-headline leading-none">Tra Cứu & In Lại</h2>
          <p className="text-secondary mt-2 body-md">Quản lý và in lại vận đơn trong vòng 15 ngày qua.</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-morphism rounded-[2rem] p-8 border border-white/10 shadow-lg">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nhập mã vận đơn Shopee (ví dụ: SPX...)"
            className="w-full bg-surface-container-lowest border-2 border-surface-container focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl px-14 py-5 outline-none font-bold text-lg transition-all"
          />
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-secondary" size={24} />
          <button 
            type="submit"
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
          >
            Tra cứu
          </button>
        </form>
      </div>

      {/* Recent Orders Table */}
      <div className="glass-morphism rounded-[2rem] overflow-hidden border border-white/10 shadow-lg">
        <div className="p-6 border-b border-surface-container bg-surface-container-low/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleRefresh}
              className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all"
              title="Tải lại dữ liệu"
            >
              <RotateCcw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <h3 className="text-lg font-black text-on-surface tracking-tight">Đơn hàng mới tải lên (15 ngày qua)</h3>
          </div>
          <div className="px-4 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold">
            {labels.length} đơn hàng
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/20">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Ngày tải</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Mã vận đơn</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Sản phẩm</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-secondary">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="font-bold">Đang tải dữ liệu...</p>
                    </div>
                  </td>
                </tr>
              ) : labels.length > 0 ? (
                labels.map((label) => (
                  <tr 
                    key={label.id} 
                    className="hover:bg-primary/5 transition-all group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-secondary" />
                        <span className="text-sm font-medium text-on-surface">
                          {new Date(label.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-[#FF4500]">{label.tracking_number}</span>
                        {label.is_cup && (
                          <span className="text-[10px] font-black text-primary uppercase tracking-tighter flex items-center gap-1 mt-1">
                            <Package size={10} /> Cốc/Bình giữ nhiệt
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-medium text-secondary line-clamp-1 max-w-xs">
                        {label.product_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleQuickPrint(label)}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-xs shadow-lg hover:scale-105 active:scale-95 transition-all"
                        >
                          <Printer size={14} />
                          In lại
                        </button>
                        <button 
                          onClick={() => handleDelete(label.id)}
                          className="p-2 text-error hover:bg-error/10 rounded-xl transition-all"
                          title="Xóa khỏi lịch sử"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-50">
                      <RotateCcw size={48} className="text-secondary" />
                      <p className="text-lg font-bold text-secondary">Chưa có đơn hàng nào trong 15 ngày qua</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Hidden Print Container */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          {orderToPrint && <ThermalLabel order={orderToPrint} />}
        </div>
        <div ref={imagePrintRef}>
          {imageToPrint && (
            <div className="w-full h-full flex items-center justify-center bg-white">
              <img 
                src={imageToPrint} 
                alt="Shipping Label" 
                className="max-w-full max-h-full object-contain"
                style={{ width: '100mm', height: '150mm' }}
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>
      </div>

      <GeminiKeyModal 
        isOpen={showApiKeyModal} 
        onClose={() => setShowApiKeyModal(false)} 
      />
    </div>
  );
}

export function ThermalLabel({ order }: { order: any }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN');
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const items = Array.isArray(order.items) ? order.items : [];
  const totalQty = items.length > 0 
    ? items.reduce((acc: number, i: any) => acc + (i.quantity || 0), 0)
    : (order.quantity || 1);

  return (
    <div className="thermal-label text-black font-sans bg-white" style={{ 
      width: '100mm', 
      height: '150mm', 
      padding: '5mm',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <style>
        {`
          @media print {
            @page {
              size: 100mm 150mm;
              margin: 0;
            }
            body {
              margin: 0;
              -webkit-print-color-adjust: exact;
            }
            .thermal-label {
              width: 100mm !important;
              height: 150mm !important;
              padding: 5mm !important;
            }
          }
        `}
      </style>
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
        <div className="text-3xl font-black italic tracking-tighter">Shopee</div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase">Ngày đặt hàng: {dateStr}</div>
          <div className="text-sm font-black">{order.region || 'HCM-7'}</div>
        </div>
      </div>

      {/* Barcode Section */}
      <div className="flex flex-col items-center py-4 border-b-2 border-black">
        <Barcode 
          value={order.trackingCode} 
          width={2} 
          height={70} 
          fontSize={16} 
          margin={0}
          displayValue={true}
        />
      </div>

      {/* QR and Info */}
      <div className="grid grid-cols-3 gap-4 py-4 border-b-2 border-black">
        <div className="col-span-1 flex items-center justify-center">
          <QRCodeSVG value={order.trackingCode} size={100} />
        </div>
        <div className="col-span-2 space-y-1">
          <div className="text-[10px] font-black uppercase">Người nhận:</div>
          <div className="text-sm font-bold leading-tight">
            {order.recipientName || 'KHÁCH HÀNG'} {order.recipientPhone ? `(${order.recipientPhone})` : ''}
          </div>
          <div className="text-[10px] leading-tight">
            {order.recipientAddress || 'Vui lòng xem địa chỉ chi tiết trên vận đơn gốc'}
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div className="py-4 flex-grow overflow-hidden">
        <div className="text-[11px] font-black uppercase mb-2 border-b border-black pb-1">
          Nội dung hàng (Tổng SL: {totalQty})
        </div>
        <div className="space-y-2">
          {items.length > 0 ? items.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between items-start border-b border-dotted border-black/30 pb-1">
              <div className="flex-grow pr-2">
                <div className="text-[12px] font-black leading-tight">{item.productName}</div>
                <div className="text-[10px] font-bold text-gray-700">SKU: {item.sku} | Phân loại: {item.variant}</div>
              </div>
              <div className="text-sm font-black">x{item.quantity}</div>
            </div>
          )) : (
            <div className="text-[12px] font-black leading-tight">
              {order.items || 'Không có dữ liệu sản phẩm'}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-4 border-t-2 border-black flex justify-between items-end">
        <div className="text-[9px] italic">In bởi Lucid Inventory lúc {timeStr} {dateStr}</div>
        <div className="text-sm font-black border-2 border-black px-3 py-1">SPX</div>
      </div>
    </div>
  );
}
