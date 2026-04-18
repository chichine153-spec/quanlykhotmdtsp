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
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { GeminiService } from '../services/gemini';
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
  status?: string;
  tracking_log?: any[];
  carrier?: string;
}

export default function RePrintModule() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';
  const [searchQuery, setSearchQuery] = React.useState('');
  const [labels, setLabels] = React.useState<PrintHistoryRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [orderToPrint, setOrderToPrint] = React.useState<any>(null);
  const [imageToPrint, setImageToPrint] = React.useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);
  const [isIframe, setIsIframe] = React.useState(false);
  const printRef = React.useRef<HTMLDivElement>(null);
  const imagePrintRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setIsIframe(window.self !== window.top);
  }, []);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Vận đơn ${orderToPrint?.trackingCode || ''}`,
    onAfterPrint: () => setOrderToPrint(null),
  });

  const handleImagePrint = useReactToPrint({
    contentRef: imagePrintRef,
    documentTitle: `Vận đơn Hình ảnh`,
    onAfterPrint: () => setImageToPrint(null),
  });

  React.useEffect(() => {
    if (orderToPrint) {
      const timer = setTimeout(() => {
        console.log('[RePrintModule] Triggering thermal print...');
        handlePrint();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [orderToPrint, handlePrint]);

  React.useEffect(() => {
    if (imageToPrint) {
      const timer = setTimeout(() => {
        console.log('[RePrintModule] Triggering image print...');
        handleImagePrint();
      }, 1000); // Increased delay for image loading
      return () => clearTimeout(timer);
    }
  }, [imageToPrint, handleImagePrint]);

  React.useEffect(() => {
    if (!user) return;

    const fetchHistory = async () => {
      const supabase = getSupabase();
      
      setLoading(true);
      setError(null);
      
      try {
        let historyData: PrintHistoryRecord[] = [];
        
        if (supabase) {
          let sbQuery = supabase
            .from('print_history')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

          if (!isAdmin) {
            sbQuery = sbQuery.eq('user_id', user.uid);
          }

          const { data, error: sbError } = await sbQuery;

          if (!sbError) {
            historyData = data || [];
          } else {
            console.warn('[RePrintModule] Supabase fetch error, falling back to Firestore:', sbError);
          }
        }

        // If Supabase failed or returned empty, try fetching from Firestore as fallback
        if (historyData.length === 0) {
          console.log('[RePrintModule] Fetching history from Firestore fallback...');
          const ordersRef = collection(db, 'orders');
          let fsQuery;
          
          if (isAdmin) {
            fsQuery = query(
              ordersRef,
              orderBy('processedAt', 'desc'),
              limit(50)
            );
          } else {
            fsQuery = query(
              ordersRef,
              where('userId', '==', user.uid),
              orderBy('processedAt', 'desc'),
              limit(50)
            );
          }
          
          const querySnap = await getDocs(fsQuery);
          const firestoreOrders = querySnap.docs.map(doc => {
            const data = doc.data() as any;
            return {
              id: doc.id,
              tracking_number: data.trackingCode,
              product_name: Array.isArray(data.items) 
                ? data.items.map((i: any) => `${i.sku} (${i.quantity})`).join(', ')
                : 'Đơn hàng (Bóc tách)',
              image_url: data.image_url || data.pdfUrl || '',
              is_cup: false,
              created_at: data.processedAt,
              user_id: data.userId || user.uid
            } as PrintHistoryRecord;
          });
          
          historyData = firestoreOrders;
        }

        setLabels(historyData);
      } catch (err: any) {
        console.error('[RePrintModule] History fetch error:', err);
        setError('Không thể tải lịch sử in. Vui lòng kiểm tra kết nối.');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    // Real-time subscription
    const supabase = getSupabase();
    let channel: any = null;
    
    if (supabase) {
      let filter = `user_id=eq.${user.uid}`;
      if (isAdmin) filter = ''; // Listen to all changes if admin

      channel = supabase
        .channel('print_history_changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'print_history',
          ...(isAdmin ? {} : { filter: `user_id=eq.${user.uid}` })
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
    setLoading(true);
    
    try {
      const supabase = getSupabase();
      let foundLabel: PrintHistoryRecord | null = null;

      // 1. Try Supabase Search first
      if (supabase) {
        let sbQuery = supabase
          .from('print_history')
          .select('*')
          .eq('tracking_number', queryStr)
          .limit(1);
        
        // Only restrict by user_id if not admin
        if (!isAdmin) {
          sbQuery = sbQuery.eq('user_id', user.uid);
        }

        const { data, error } = await sbQuery;

        if (!error && data && data.length > 0) {
          foundLabel = data[0];
        }
      }

      // 2. If not found in Supabase, try Firestore Search
      if (!foundLabel) {
        const cleanQuery = queryStr.trim().toUpperCase();
        console.log(`[RePrintModule] Tracking not found in Supabase, searching in Firestore for: ${cleanQuery}`);
        
        // Try direct lookup first
        let orderSnap = await getDoc(doc(db, 'orders', cleanQuery));
        
        // If not found by ID, try a query as backup (sometimes IDs might be different)
        if (!orderSnap.exists()) {
          let fsQuery = query(
            collection(db, 'orders'), 
            where('trackingCode', '==', cleanQuery)
          );
          
          // Only restrict by userId if not admin
          if (!isAdmin) {
            fsQuery = query(fsQuery, where('userId', '==', user.uid));
          }
          
          const qSnap = await getDocs(fsQuery);
          if (!qSnap.empty) {
            orderSnap = qSnap.docs[0];
          }
        }
        
        if (orderSnap.exists()) {
          const data = orderSnap.data();
          // Allow access if admin OR if it's the owner
          if (data && (isAdmin || data.userId === user.uid || !data.userId)) {
            foundLabel = {
              id: orderSnap.id,
              tracking_number: data.trackingCode || cleanQuery,
              product_name: Array.isArray(data.items) 
                ? data.items.map((i: any) => `${i.sku} (${i.quantity})`).join(', ')
                : (data.productName || 'Đơn hàng'),
              image_url: data.image_url || data.pdfUrl || '', // Support both fields
              is_cup: false,
              created_at: data.processedAt || new Date().toISOString(),
              user_id: data.userId || user.uid
            } as PrintHistoryRecord;
          }
        }
      }

      if (foundLabel) {
        handleQuickPrint(foundLabel);
      } else {
        alert('Không tìm thấy đơn hàng này trong hệ thống.');
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('Lỗi khi tìm kiếm đơn hàng.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPrint = async (label: PrintHistoryRecord) => {
    console.log('[RePrintModule] Quick print for:', label);
    
    const isImageUrl = label.image_url && (
      label.image_url.toLowerCase().includes('.jpg') || 
      label.image_url.toLowerCase().includes('.jpeg') || 
      label.image_url.toLowerCase().includes('.png') ||
      label.image_url.toLowerCase().includes('.webp') ||
      label.image_url.includes('supabase.co/storage/v1/object/public/shipping-labels/') // Likely our images
    ) && !label.image_url.toLowerCase().includes('.pdf');

    if (isImageUrl) {
      // Clean up URL in case it's corrupted with JSON fragments
      let cleanUrl = label.image_url;
      if (typeof cleanUrl === 'string') {
        // Remove any trailing JSON-like fragments (e.g., ?is_cup":1)
        cleanUrl = cleanUrl.split('?')[0].split('"')[0].split('}')[0].trim();
        
        // Ensure it's an absolute URL
        if (cleanUrl.startsWith('/') && !cleanUrl.startsWith('//')) {
          const supabaseUrl = localStorage.getItem('supabase_url');
          if (supabaseUrl) {
            const baseUrl = supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl;
            cleanUrl = `${baseUrl}/storage/v1/object/public/shipping-labels/${cleanUrl.startsWith('/') ? cleanUrl.slice(1) : cleanUrl}`;
          }
        }
      }
      
      console.log('[RePrintModule] Final Image URL:', cleanUrl);
      setImageToPrint(cleanUrl);
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
    setDeleteConfirm(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm;
    setDeleteConfirm(null);

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
      {/* Print Guide for Iframe */}
      {isIframe && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-start gap-3"
        >
          <AlertCircle className="text-primary shrink-0" size={20} />
          <div className="space-y-1">
            <p className="text-sm font-bold text-primary">Lưu ý quan trọng cho việc in ấn</p>
            <p className="text-xs text-secondary leading-relaxed">
              Trình duyệt đang chặn cửa sổ in trong chế độ xem thử. Để in được vận đơn, vui lòng nhấn vào biểu tượng 
              <strong className="mx-1 inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-surface-container"><ExternalLink size={10} /> Mở trong tab mới</strong> 
              ở góc trên bên phải màn hình trước khi nhấn nút "In lại".
            </p>
          </div>
        </motion.div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface font-headline leading-none">Tra Cứu & In Lại</h2>
          <p className="text-secondary mt-2 body-md">Quản lý và in lại vận đơn trong vòng 15 ngày qua.</p>
        </div>
        {isIframe && (
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg hover:scale-105 transition-all animate-pulse"
          >
            <Printer size={18} />
            In lại (Mở trang mới)
          </button>
        )}
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
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-secondary">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="font-bold">Đang tải dữ liệu...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={3} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 text-error max-w-md mx-auto">
                      <AlertCircle size={48} />
                      <p className="text-lg font-bold">{error}</p>
                      <button 
                        onClick={handleRefresh}
                        className="px-6 py-2 bg-primary text-white rounded-xl font-bold text-sm"
                      >
                        Thử lại
                      </button>
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
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => {
                            if (label.image_url) {
                              // Clean up URL in case it's corrupted with JSON fragments
                              let cleanUrl = label.image_url;
                              if (typeof cleanUrl === 'string') {
                                cleanUrl = cleanUrl.split('?')[0].split('"')[0].split('}')[0].trim();
                                
                                // Ensure it's an absolute URL
                                if (cleanUrl.startsWith('/') && !cleanUrl.startsWith('//')) {
                                  const supabaseUrl = localStorage.getItem('supabase_url');
                                  if (supabaseUrl) {
                                    const baseUrl = supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl;
                                    cleanUrl = `${baseUrl}/storage/v1/object/public/shipping-labels/${cleanUrl.startsWith('/') ? cleanUrl.slice(1) : cleanUrl}`;
                                  }
                                }
                              }
                              window.open(cleanUrl, '_blank');
                            } else {
                              handleQuickPrint(label);
                            }
                          }}
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
                    <div className="flex flex-col items-center gap-4 opacity-50 max-w-md mx-auto">
                      <RotateCcw size={48} className="text-secondary" />
                      <p className="text-lg font-bold text-secondary">Chưa có đơn hàng nào trong 15 ngày qua</p>
                      <p className="text-xs text-secondary">
                        Lưu ý: Tính năng này yêu cầu bạn đã tạo bucket <strong className="text-primary">"shipping-labels"</strong> (chế độ Public) trong Supabase Storage và chạy SQL Script trong phần Cấu hình.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Hidden Print Container */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={printRef}>
          {orderToPrint && <ThermalLabel order={orderToPrint} />}
        </div>
        <div ref={imagePrintRef}>
          {imageToPrint && (
            <div className="w-full h-full flex items-center justify-center bg-white p-4">
              <img 
                src={imageToPrint} 
                alt="Shipping Label" 
                className="max-w-full max-h-full object-contain"
                style={{ width: '100mm', height: '150mm' }}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface-container-lowest rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-white/10"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="p-4 bg-error/10 rounded-full text-error">
                  <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-black text-on-surface">Xác nhận xóa</h3>
                <p className="text-secondary text-sm">
                  Bạn có chắc chắn muốn xóa đơn hàng này khỏi lịch sử in? Hành động này không thể hoàn tác.
                </p>
                <div className="flex gap-3 w-full mt-4">
                  <button 
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 py-3 bg-surface-container rounded-xl font-bold text-sm hover:bg-surface-container-high transition-all"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="flex-1 py-3 bg-error text-white rounded-xl font-bold text-sm shadow-lg hover:bg-error/90 transition-all"
                  >
                    Xác nhận xóa
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ThermalLabel({ order }: { order: any }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN');
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  // If there's an original image scan, use it!
  const imageSource = order.image_url || order.pdfUrl;
  const isImage = imageSource && (
    imageSource.match(/\.(jpeg|jpg|gif|png|webp)/i) || 
    imageSource.includes('supabase.co/storage/v1/object/public') ||
    imageSource.startsWith('data:image/')
  );
  
  if (isImage) {
    return (
      <div className="thermal-label-container bg-white flex items-center justify-center p-0 overflow-hidden" style={{ width: '100mm', height: '150mm' }}>
        <img 
          src={imageSource} 
          alt="Original Shipping Label" 
          className="w-[100%] h-[100%] object-contain"
          referrerPolicy="no-referrer"
          onError={(e) => {
            console.error('Image load error in ThermalLabel');
          }}
        />
        <style>
          {`
            @media print {
              @page { size: 100mm 150mm; margin: 0; }
              body { margin: 0; padding: 0; }
              .thermal-label-container { 
                width: 100mm !important; 
                height: 150mm !important; 
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              img { 
                width: 100% !important; 
                height: 100% !important; 
                display: block !important; 
                object-fit: contain !important;
              }
            }
          `}
        </style>
      </div>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  
  // Format phone number to avoid "null"
  const rawPhone = String(order.recipientPhone || '');
  const displayPhone = (rawPhone && rawPhone !== 'null' && rawPhone !== 'undefined') 
    ? rawPhone 
    : '';

  return (
    <div className="thermal-label text-black font-sans bg-white" style={{ 
      width: '100mm', 
      height: '150mm', 
      padding: '4mm',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      fontSize: '12pt'
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
              padding: 0;
              -webkit-print-color-adjust: exact;
            }
            .thermal-label {
              width: 100mm !important;
              height: 150mm !important;
              padding: 4mm !important;
            }
          }
          .thermal-label table td {
             border-top: 1px solid black;
          }
        `}
      </style>
      
      {/* Top Header */}
      <div className="flex justify-between items-start mb-1">
        <div className="text-[10px] font-bold">Vận đơn: {order.trackingCode}</div>
        <div className="text-[10px] font-bold">{timeStr} {dateStr}</div>
      </div>

      {/* Main Header */}
      <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-2">
        <div className="text-4xl font-black italic tracking-tighter">Shopee</div>
        <div className="text-right flex flex-col items-end">
          <div className="text-[10px] font-bold uppercase leading-tight">Ngày đặt: {dateStr}</div>
          <div className="text-2xl font-black leading-none">{order.region || 'HCM-7'}</div>
        </div>
      </div>

      {/* Barcode Section */}
      <div className="flex flex-col items-center py-2 border-b-2 border-black">
        <Barcode 
          value={order.trackingCode} 
          width={2.2} 
          height={60} 
          fontSize={16} 
          margin={0}
          displayValue={true}
        />
      </div>

      {/* QR and Recipient Info */}
      <div className="grid grid-cols-4 gap-4 py-2 border-b-2 border-black">
        <div className="col-span-1 flex items-center justify-center">
          <QRCodeSVG value={order.trackingCode} size={90} />
        </div>
        <div className="col-span-3 space-y-1">
          <div className="text-[10px] font-black uppercase">Người nhận:</div>
          <div className="text-sm font-black leading-tight uppercase">
            {order.recipientName || 'KHÁCH HÀNG'} {displayPhone ? `(${displayPhone})` : ''}
          </div>
          <div className="text-[11px] leading-tight font-medium">
            {order.recipientAddress || 'Vui lòng xem địa chỉ chi tiết trên vận đơn gốc'}
          </div>
        </div>
      </div>

      {/* Item List Section */}
      <div className="mt-2 flex-grow overflow-hidden">
        <div className="text-[10px] font-black uppercase mb-1 flex justify-between">
          <span>Sản phẩm</span>
          <span>Số lượng</span>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={idx} className="border-t border-black/20">
                <td className="py-1 pr-2 align-top text-[11px]">
                  <div className="font-bold">{item.sku}</div>
                  <div className="text-[10px] opacity-80">{item.variant || ''}</div>
                </td>
                <td className="py-1 text-center align-top font-black text-sm w-12 border-l border-black/20">
                  {item.quantity}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr className="border-t border-black/20">
                <td colSpan={2} className="py-2 text-[11px] italic text-center">
                  Xem chi tiết trên ứng dụng Shopee
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-2 border-t-2 border-black flex justify-between items-center bg-white">
        <div className="text-[8px] italic opacity-60">Generated by Zenith OMS</div>
        <div className="flex items-center gap-2">
           <div className="text-[10px] font-bold">SPX Express</div>
           <div className="text-lg font-black border-2 border-black px-4 py-1">SPX</div>
        </div>
      </div>
    </div>
  );
}
