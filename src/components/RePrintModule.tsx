import React from 'react';
import * as pdfjs from 'pdfjs-dist';

// Use the official legacy worker for better compatibility in restricted environments like AI Studio
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

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
  ExternalLink,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { GeminiService } from '../services/gemini';
import { getDoc, doc, getDocs } from 'firebase/firestore';
import { createPortal } from 'react-dom';
import { InventoryService } from '../services/inventoryService';
import { printComponent } from '../lib/printUtils';

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
  order_id?: string;
  job_id?: string;
  shop_id?: string;
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
  const [showPrintTemplate, setShowPrintTemplate] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);
  const [isIframe, setIsIframe] = React.useState(false);
  const printRef = React.useRef<HTMLDivElement>(null);

  const [isPrinting, setIsPrinting] = React.useState(false);

  const handleThermalPrint = async () => {
    if (!orderToPrint) {
      alert("Không tìm thấy thông tin đơn hàng để in.");
      return;
    }

    setIsPrinting(true);
    const { job_id, shop_id } = orderToPrint;

    // 1. Critical: Perform inventory update/deduction simultaneously
    try {
      console.log('[RePrintModule] Syncing inventory stock...');
      await InventoryService.updateInventory(user.uid, orderToPrint);
    } catch (err) {
      console.warn('[RePrintModule] Inventory sync non-blocking warning:', err);
    }

    // Shopee URL logic: If we have both IDs, try to open Shopee Print Page
    if (job_id && shop_id && job_id !== 'null' && shop_id !== 'null') {
      const shopee_print_url = `https://banhang.shopee.vn/api/v3/settings/print_awb/?job_id=${job_id}&shop_id=${shop_id}&lang=vi`;
      
      try {
        const newWindow = window.open(shopee_print_url, '_blank');
        
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          // If popup blocked, we continue to fallback so user can still print something
          console.warn("[RePrintModule] Popup blocked, using fallback template");
        } else {
          // Success
          setTimeout(() => {
            setShowPrintTemplate(false);
            setIsPrinting(false);
          }, 800);
          return;
        }
      } catch (err) {
        console.error("[RePrintModule] Opening Shopee print URL failed", err);
      }
    }

    // Fallback logic: Use system thermal template via iframe print utility
    console.log('[RePrintModule] Using hidden iframe for reliable thermal printing');
    
    try {
      await printComponent(
        <ThermalLabel order={orderToPrint} />,
        `Print-Label-${orderToPrint.trackingCode || orderToPrint.tracking_number}`
      );
    } catch (err) {
      console.error("[RePrintModule] Print utility failed", err);
      alert("Không thể thực hiện in ấn. Vui lòng thử lại.");
    } finally {
      setIsPrinting(false);
      setShowPrintTemplate(false);
    }
  };

  React.useEffect(() => {
    setIsIframe(window.self !== window.top);
  }, []);

  // Reset isPrinting when modal closes
  React.useEffect(() => {
    if (!showPrintTemplate) {
      setIsPrinting(false);
    }
  }, [showPrintTemplate]);

  // Auto-refresh when printing modal opens to catch background image_url updates
  React.useEffect(() => {
    if (showPrintTemplate && orderToPrint && user) {
      const refetch = async () => {
        try {
          const docRef = doc(db, 'orders', orderToPrint.trackingCode || orderToPrint.id);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            setOrderToPrint((prev: any) => ({
              ...prev,
              ...data,
              image_url: data.image_url || prev.image_url // Ensure we don't lose image_url if doc doesn't have it yet
            }));
          }
        } catch (e) {
          console.error("[RePrintModule] Refetch for print failed", e);
        }
      };
      refetch();
    }
  }, [showPrintTemplate]);

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
              user_id: data.userId || user.uid,
              order_id: data.orderId,
              job_id: data.job_id,
              shop_id: data.shop_id
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
              user_id: data.userId || user.uid,
              order_id: data.orderId,
              job_id: data.job_id,
              shop_id: data.shop_id
            } as PrintHistoryRecord;
          }
        }
      }

      if (foundLabel) {
        setOrderToPrint({
          ...foundLabel,
          trackingCode: foundLabel.tracking_number
        });
        setShowPrintTemplate(true);
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
    
    setLoading(true);
    try {
      const orderSnap = await getDoc(doc(db, 'orders', label.tracking_number));
      
      let finalOrder: any;
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        finalOrder = {
          ...orderData,
          trackingCode: label.tracking_number,
          image_url: orderData.image_url || label.image_url, // Preserve image_url from history if missing in doc
          job_id: orderData.job_id || label.job_id,
          shop_id: orderData.shop_id || label.shop_id,
          orderId: orderData.orderId || label.order_id
        };
      } else {
        finalOrder = {
          trackingCode: label.tracking_number,
          region: 'N/A',
          items: label.product_name,
          image_url: label.image_url,
          destination: 'Chưa xác định',
          uploadDate: label.created_at
        };
      }
      
      setOrderToPrint(finalOrder);
      setShowPrintTemplate(true);
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
                        {label.image_url && (
                          <span className="text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200 w-fit mt-1">
                            GỐC (IMG)
                          </span>
                        )}
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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

      {/* Print Template Modal */}
      <AnimatePresence>
        {showPrintTemplate && orderToPrint && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Modal Backdrop - Strictly no-print */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-md no-print" 
              onClick={() => setShowPrintTemplate(false)}
            />
            
            <motion.div 
               initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] no-print"
            >
              <div className="p-6 border-b border-surface-container flex justify-between items-center">
                <div className="flex flex-col">
                  <h3 className="text-xl font-black text-on-surface tracking-tight">Xem trước bản in nhiệt</h3>
                  <div className="flex gap-2 mt-1">
                    {orderToPrint?.orderId && (
                      <span className="text-[9px] font-bold text-secondary bg-surface-container px-2 py-0.5 rounded">ID: {orderToPrint.orderId}</span>
                    )}
                    {orderToPrint?.job_id && (
                      <span className="text-[9px] font-bold text-secondary bg-surface-container px-2 py-0.5 rounded">Job: {orderToPrint.job_id}</span>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => setShowPrintTemplate(false)}
                  className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-secondary hover:bg-error hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-surface-container-low flex justify-center">
                <div 
                  ref={printRef}
                  className="bg-white shadow-2xl border border-surface-container overflow-hidden sticky top-0 flex items-center justify-center p-0" 
                  style={{ width: '100mm', height: '150mm', minWidth: '100mm', minHeight: '150mm' }}
                >
                  {/* Use ThermalLabel for both preview and print for consistency and PDF rendering reliability */}
                  <ThermalLabel 
                    order={orderToPrint} 
                  />
                </div>
              </div>

              <div className="p-6 border-t border-surface-container flex gap-4">
                <button 
                  onClick={() => setShowPrintTemplate(false)}
                  className="flex-1 py-4 rounded-2xl font-bold text-secondary hover:bg-surface-container transition-all"
                >
                  Đóng
                </button>
                <button 
                  onClick={handleThermalPrint}
                  disabled={isPrinting}
                  className={`flex-1 py-4 rounded-2xl font-black shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${isPrinting ? 'bg-orange-400 text-white' : 'bg-[#FF4500] text-white'}`}
                >
                  {isPrinting ? <Loader2 className="animate-spin" size={20} /> : <Printer size={20} />}
                  {isPrinting ? 'ĐANG CHUẨN BỊ...' : 'IN NHIỆT NGAY'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ThermalLabel({ order, onReady }: { order: any, onReady?: () => void }) {
  const [imageError, setImageError] = React.useState(false);
  const [pdfRendering, setPdfRendering] = React.useState(false);
  const [forceFallback, setForceFallback] = React.useState(false);
  const [useIframe, setUseIframe] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const renderAttempted = React.useRef(false);
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN');
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  // Use all possible URL fields
  const imageSource = order.image_url || order.pdf_url || order.pdfUrl || order.tracking_label_url || order.pdf_path;
  const isImageString = typeof imageSource === 'string' && imageSource.length > 10;
  
  // Check if it's a valid Image URL or data URI
  const isImage = !forceFallback && isImageString && (
    imageSource.match(/\.(jpeg|jpg|gif|png|webp)/i) || 
    imageSource.includes('supabase.co/storage/v1/object/public') ||
    imageSource.startsWith('data:image/') ||
    imageSource.includes('firebasestorage.googleapis.com')
  );

  const isPDF = !forceFallback && isImageString && (
    imageSource.toLowerCase().includes('.pdf') || 
    imageSource.includes('blob:') || 
    imageSource.includes('application/pdf') ||
    (imageSource.includes('supabase.co') && !isImage) ||
    (imageSource.includes('banhang.shopee.vn') && imageSource.includes('print_awb'))
  );

  // Auto-detect if we should use iframe for PDF
  React.useEffect(() => {
    if (isPDF && !isImage && !imageError) {
      // For local blobs or trusted URLs, iframe is often better
      if (imageSource.startsWith('blob:') || imageSource.startsWith('http')) {
        setUseIframe(true);
        // Signal ready after a short delay for iframe to initialize
        const timer = setTimeout(() => {
          if (onReady) onReady();
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [isPDF, isImage, imageSource, imageError]);
  
  console.log('[ThermalLabel] rendering order:', order.trackingCode || order.tracking_number, { isImage, isPDF, useIframe, forceFallback, source: imageSource?.substring(0, 50) + '...' });

  // Effect to render PDF to canvas as fallback if iframe fails or is not supported
  React.useEffect(() => {
    if (isPDF && !isImage && !imageError && !useIframe && !renderAttempted.current) {
      const renderPdf = async () => {
        // Wait for canvas to exist in DOM
        if (!canvasRef.current) {
          setTimeout(renderPdf, 100);
          return;
        }

        try {
          console.log('[ThermalLabel] Starting PDF render for:', imageSource);
          setPdfRendering(true);
          renderAttempted.current = true;
          const pdfData = imageSource;
          
          let loadingTask;
          if (pdfData.startsWith('blob:') || pdfData.startsWith('data:application/pdf')) {
            loadingTask = pdfjs.getDocument(pdfData);
          } else {
            // Shopee URLs usually fail CORS, catch it
            const fetchUrl = pdfData.includes('?') ? `${pdfData}&t=${Date.now()}` : `${pdfData}?t=${Date.now()}`;
            loadingTask = pdfjs.getDocument({ 
              url: fetchUrl, 
              withCredentials: false,
              disableRange: true,
              disableAutoFetch: true
            });
          }
          
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          
          const canvas = canvasRef.current;
          if (!canvas) return;
          
          const context = canvas.getContext('2d');
          if (!context) return;
          
          const viewport = page.getViewport({ scale: 2.5 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;
          
          console.log('[ThermalLabel] PDF rendered to canvas successfully');
          if (onReady) onReady();
        } catch (err) {
          console.warn('[ThermalLabel] PDF render error (likely CORS for Shopee URL):', err);
          setImageError(true);
          setForceFallback(true);
          if (onReady) onReady(); // Still signal ready so it can print the fallback
        } finally {
          setPdfRendering(false);
        }
      };
      
      const timer = setTimeout(renderPdf, 200);
      return () => clearTimeout(timer);
    } else if (isImage && !imageError) {
      // For image mode, we just need to wait for it to load
      // We signal ready in the onLoad of the img tag
    } else {
      // Manual template mode, signal ready immediately
      if (onReady) onReady();
    }
  }, [isPDF, isImage, imageSource, imageError, forceFallback]);

  if ((isImage || (isPDF && !imageError)) && !imageError && !forceFallback) {
    return (
      <div className="thermal-label-container bg-white flex flex-col items-center justify-center p-0 overflow-hidden relative" 
           style={{ width: '100mm', height: '150mm' }}>
        {isImage ? (
          <img 
            src={imageSource} 
            alt="Original Shipping Label" 
            className="w-full h-full object-contain print:object-fill"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onLoad={() => {
              console.log('Image loaded successfully for print');
              if (onReady) onReady();
            }}
            onError={(e) => {
              console.error('Image load error in ThermalLabel for:', imageSource);
              setImageError(true);
              setForceFallback(true);
              if (onReady) onReady();
            }}
          />
        ) : useIframe ? (
          <iframe 
            src={`${imageSource}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`} 
            className="w-full h-full border-none"
            title="PDF Preview"
            onLoad={() => {
              console.log('Iframe loaded successfully for print');
              if (onReady) onReady();
            }}
          />
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            {pdfRendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                <span className="ml-3 text-xs font-bold font-sans text-black">Đang xử lý PDF gốc...</span>
              </div>
            )}
            <canvas ref={canvasRef} className="w-full h-full object-contain print:object-fill" />
          </div>
        )}
        
        {/* Helper to switch to template if image/pdf fails or is hard to see */}
        <button 
          onClick={() => setForceFallback(true)}
          className="absolute bottom-2 right-2 p-2 bg-black/10 hover:bg-black/20 rounded text-[8px] font-bold no-print"
        >
          Dùng mẫu in hệ thống
        </button>
      </div>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsString = typeof order.items === 'string' ? order.items : '';
  
  // Format phone number to avoid "null"
  const rawPhone = String(order.recipientPhone || '');
  const displayPhone = (rawPhone && rawPhone !== 'null' && rawPhone !== 'undefined') 
    ? rawPhone 
    : '';

  const barcodeValue = String(order.trackingCode || order.tracking_number || '').trim();

  return (
    <div className="thermal-label text-black font-sans bg-white relative" style={{ 
      width: '100mm', 
      height: '150mm', 
      padding: '6mm',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      fontSize: '12pt',
      color: 'black',
      backgroundColor: 'white'
    }}>
      <style>
        {`
          .thermal-label table td {
             border-top: 1px solid black;
          }
          @media print {
            body { background: white !important; }
          }
        `}
      </style>
      
      {/* Top Header */}
      <div className="flex justify-between items-start mb-0.5">
        <div className="text-[9px] font-bold">Vận đơn: {barcodeValue || 'N/A'}</div>
        <div className="text-[10px] font-black">{timeStr} {dateStr}</div>
      </div>

      <div className="flex justify-between items-end mb-1">
        <div>
          <div className="text-xl font-black tracking-tight leading-none">Shopee</div>
          <div className="text-[9px] font-bold mt-0.5">Ngày đặt: {dateStr}</div>
        </div>
        <div className="text-2xl font-black border-2 border-black px-3 py-1 bg-white">
          {order.region || 'Đồng Nai'}
        </div>
      </div>

      {/* Barcode Section */}
      <div className="flex flex-col items-center py-3 border-y-2 border-black mb-2 overflow-hidden">
        {barcodeValue ? (
          <>
            <div className="scale-x-[1.3] scale-y-[1.4] origin-center -my-1" style={{ display: 'block' }}>
              <Barcode 
                value={barcodeValue} 
                width={1.6} 
                height={45} 
                fontSize={12} 
                margin={0}
                displayValue={false}
              />
            </div>
            <div className="text-sm font-black tracking-[0.2em] mt-2">
              {barcodeValue}
            </div>
          </>
        ) : (
          <div className="text-xs italic py-2">Chưa có mã vận đơn</div>
        )}
      </div>

      {/* QR Code */}
      <div className="flex justify-center mb-3">
        {barcodeValue && <QRCodeSVG value={barcodeValue} size={120} />}
      </div>

      {/* Recipient Info */}
      <div className="border-t-2 border-black pt-2 mb-2">
        <div className="text-[10px] font-black uppercase opacity-60 mb-1">Người nhận:</div>
        <div className="text-lg font-black mb-0.5 leading-tight">{order.recipientName || 'KHÁCH HÀNG'}</div>
        {displayPhone && <div className="text-sm font-bold mb-1">{displayPhone}</div>}
        <div className="text-xs font-medium leading-tight mt-1 max-h-[3em] overflow-hidden">
          {order.recipientAddress || 'Vui lòng xem địa chỉ chi tiết trên vận đơn gốc'}
        </div>
      </div>

      {/* Item List Section */}
      <div className="mt-1 flex-grow overflow-hidden border-t border-black pt-1">
        <div className="text-[10px] font-black uppercase mb-1 flex justify-between">
          <span>Sản phẩm</span>
          <span>SL</span>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {items.length > 0 ? (
              items.slice(0, 5).map((item: any, idx: number) => (
                <tr key={idx} className="border-t border-black/10">
                  <td className="py-1 pr-2 align-top text-[11px]">
                    <div className="font-bold truncate max-w-[200px]">{item.sku}</div>
                    <div className="text-[10px] opacity-70 italic truncate max-w-[200px]">{item.variant || ''}</div>
                  </td>
                  <td className="py-1 text-right align-top font-black text-sm w-8">
                    {item.quantity}
                  </td>
                </tr>
              ))
            ) : itemsString ? (
              <tr className="border-t border-black/10">
                <td colSpan={2} className="py-2 text-[10px] font-bold leading-tight">
                  {itemsString}
                </td>
              </tr>
            ) : (
              <tr className="border-t border-black/20">
                <td colSpan={2} className="py-2 text-[10px] italic text-center">
                  Xem chi tiết trên ứng dụng Shopee
                </td>
              </tr>
            )}
            {items.length > 5 && (
              <tr>
                <td colSpan={2} className="text-[9px] italic pt-1">...và {items.length - 5} sản phẩm khác</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-2 border-t border-black/50 flex justify-between items-center opacity-60">
        <div className="text-[7px]">Generated by ZENITH OMS</div>
        <div className="flex items-center gap-1">
           <div className="text-[8px] font-bold">SPX Express</div>
           <div className="text-xs font-black border border-black px-2 py-0.5">SPX</div>
        </div>
      </div>
    </div>
  );
}
