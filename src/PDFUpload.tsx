import React from 'react';
import { 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  Receipt, 
  Info,
  Clock,
  AlertCircle,
  Loader2,
  LogIn,
  Trash2,
  Edit2,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MOCK_PRODUCTS } from './types';
import { PDFService, ExtractedOrder } from './services/pdfService';
import { useAuth } from './contexts/AuthContext';
import { collection, query, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

export default function PDFUpload() {
  const { user, login } = useAuth();
  const [isUploading, setIsUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [status, setStatus] = React.useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [processedOrders, setProcessedOrders] = React.useState<number>(0);
  const [totalOrders, setTotalOrders] = React.useState<number>(0);
  const [lastOrder, setLastOrder] = React.useState<ExtractedOrder | null>(null);
  const [currentFileOrders, setCurrentFileOrders] = React.useState<(ExtractedOrder & { status: 'pending' | 'processing' | 'success' | 'error', error?: string })[]>([]);
  const [extractedOrdersForReview, setExtractedOrdersForReview] = React.useState<(ExtractedOrder & { items: (any & { stockStatus?: 'in_stock' | 'out_of_stock' | 'checking', currentStock?: number })[] })[]>([]);
  const [isProcessingConfirmed, setIsProcessingConfirmed] = React.useState(false);
  const [showNegativeStockWarning, setShowNegativeStockWarning] = React.useState(false);
  const [currentFile, setCurrentFile] = React.useState<File | null>(null);
  const [recentDeductions, setRecentDeductions] = React.useState<any[]>([]);
  const [confirmingRevert, setConfirmingRevert] = React.useState<string | null>(null);
  const [isReverting, setIsReverting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isInventoryEmpty, setIsInventoryEmpty] = React.useState(false);

  React.useEffect(() => {
    const checkInventory = async () => {
      const q = query(collection(db, 'inventory'), limit(1));
      const snap = await getDocs(q);
      setIsInventoryEmpty(snap.empty);
    };
    if (user) checkInventory();
  }, [user, status]);
  React.useEffect(() => {
    if (!user) return;

    // Listen to recent deductions from Firestore
    const q = query(collection(db, 'orders'), limit(10));
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort by processedAt descending client-side
      docs.sort((a: any, b: any) => {
        const dateA = a.processedAt ? new Date(a.processedAt).getTime() : 0;
        const dateB = b.processedAt ? new Date(b.processedAt).getTime() : 0;
        return dateB - dateA;
      });
      setRecentDeductions(docs);
    }, (err) => {
      console.error('Fetch Recent Error:', err);
    });

    return () => unsubscribe();
  }, [user]);

  const handleRevertOrder = async (trackingCode: string) => {
    setIsReverting(true);
    try {
      await PDFService.revertOrder(trackingCode);
      
      // Update local state immediately for better UX
      setRecentDeductions(prev => prev.filter(item => (item.trackingCode || item.id) !== trackingCode));
      
      // Reset status if the reverted order was the one just processed
      if (lastOrder?.trackingCode === trackingCode) {
        setStatus('idle');
        setLastOrder(null);
      }
      setConfirmingRevert(null);
    } catch (err: any) {
      console.error('Revert Error:', err);
      let message = 'Lỗi khi hoàn tác đơn hàng.';
      try {
        const parsed = JSON.parse(err.message);
        message += `\nChi tiết: ${parsed.error}`;
      } catch {
        message += `\n${err.message || 'Vui lòng thử lại.'}`;
      }
      setError(message);
      setStatus('error');
    } finally {
      setIsReverting(false);
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
          <p className="text-secondary mb-8">Bạn cần đăng nhập để thực hiện bóc tách vận đơn và cập nhật kho hàng.</p>
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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Vui lòng chọn file PDF.');
      setStatus('error');
      return;
    }

    try {
      setStatus('processing');
      setError(null);
      setIsUploading(true);
      setProgress(10);
      setProcessedOrders(0);
      setCurrentFileOrders([]);
      setExtractedOrdersForReview([]);
      setCurrentFile(file);

      // 1. Extract all orders from PDF
      setProgress(20);
      const orders = await PDFService.extractOrderData(file);
      setTotalOrders(orders.length);
      setProgress(60);

      // 2. Check stock for each item to show in review table
      const ordersWithStock = await Promise.all(orders.map(async (order) => {
        const itemsWithStock = await Promise.all(order.items.map(async (item) => {
          const stockInfo = await PDFService.checkStockStatus(item.sku, item.color);
          return {
            ...item,
            stockStatus: stockInfo.inStock ? 'in_stock' : 'out_of_stock',
            currentStock: stockInfo.currentStock,
            productName: stockInfo.productName || item.productName
          };
        }));
        return { ...order, items: itemsWithStock };
      }));

      setExtractedOrdersForReview(ordersWithStock);
      setProgress(100);
      setStatus('idle'); // Wait for user confirmation
    } catch (err: any) {
      console.error('Processing Error:', err);
      setError(err.message || 'Đã xảy ra lỗi khi xử lý file.');
      setStatus('error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateReviewItem = async (orderIdx: number, itemIdx: number, field: string, value: any) => {
    const updated = [...extractedOrdersForReview];
    const item = updated[orderIdx].items[itemIdx];
    
    if (field === 'quantity') {
      item.quantity = Number(value);
    } else {
      (item as any)[field] = value;
      
      // If SKU or Color changed, re-check stock
      if (field === 'sku' || field === 'color') {
        item.stockStatus = 'checking';
        const stockInfo = await PDFService.checkStockStatus(item.sku, item.color);
        item.stockStatus = stockInfo.inStock ? 'in_stock' : 'out_of_stock';
        item.currentStock = stockInfo.currentStock;
        item.productName = stockInfo.productName || item.productName;
      }
    }
    
    setExtractedOrdersForReview(updated);
  };

  const handleConfirmProcess = async (force: boolean = false) => {
    if (!currentFile || extractedOrdersForReview.length === 0) return;

    // Check for negative stock
    const hasOutOfStock = extractedOrdersForReview.some(order => 
      order.items.some(item => (item.currentStock || 0) < item.quantity)
    );

    if (hasOutOfStock && !force) {
      setShowNegativeStockWarning(true);
      return;
    }

    setShowNegativeStockWarning(false);
    setIsProcessingConfirmed(true);
    setStatus('processing');
    setProgress(0);
    setProcessedOrders(0);
    setCurrentFileOrders(extractedOrdersForReview.map(o => ({ ...o, status: 'pending' })));

    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < extractedOrdersForReview.length; i++) {
      const order = extractedOrdersForReview[i];
      setCurrentFileOrders(prev => prev.map((o, idx) => idx === i ? { ...o, status: 'processing' } : o));
      
      try {
        const orderWeight = 100 / extractedOrdersForReview.length;
        setProgress(Math.floor(i * orderWeight));
        
        await PDFService.processOrder(currentFile, order);
        successCount++;
        setProcessedOrders(successCount);
        setLastOrder(order);
        setCurrentFileOrders(prev => prev.map((o, idx) => idx === i ? { ...o, status: 'success' } : o));
      } catch (err: any) {
        console.error(`Error processing order ${order.trackingCode}:`, err);
        const errMsg = err.message || 'Lỗi không xác định';
        errors.push(`${order.trackingCode}: ${errMsg}`);
        setCurrentFileOrders(prev => prev.map((o, idx) => idx === i ? { ...o, status: 'error', error: errMsg } : o));
      }
    }

    setProgress(100);
    setIsProcessingConfirmed(false);
    setExtractedOrdersForReview([]); // Clear review table
    
    if (errors.length > 0) {
      if (successCount > 0) {
        setError(`Đã xử lý ${successCount}/${extractedOrdersForReview.length} đơn. Một số đơn lỗi: ${errors.slice(0, 2).join(', ')}...`);
        setStatus('success');
      } else {
        setError(`Lỗi xử lý tất cả đơn hàng: ${errors[0]}`);
        setStatus('error');
      }
    } else {
      setStatus('success');
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-on-surface mb-2">Tải lên PDF</h1>
        <p className="text-secondary text-sm">Hệ thống tự động bóc tách dữ liệu từ vận đơn Shopee để cập nhật tồn kho tức thì.</p>
      </div>

      {/* Bento Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Zone */}
        <div className="lg:col-span-2 space-y-6">
          {/* Drop Zone Card */}
          <div 
            onClick={triggerFileInput}
            className={`glass-morphism rounded-[1.5rem] p-8 border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer group ${
              status === 'error' ? 'border-error' : 'border-surface-container hover:border-primary'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept=".pdf"
            />
            <div className={`w-16 h-16 rounded-full mb-4 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ${
              status === 'error' ? 'bg-error-container text-error' : 'bg-primary-fixed text-primary'
            }`}>
              {status === 'processing' ? <Loader2 className="animate-spin" size={32} /> : <UploadCloud size={32} />}
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">
              {status === 'processing' ? 'Đang xử lý...' : 'Thả tệp tin PDF vào đây'}
            </h3>
            <p className="text-sm text-secondary mb-6 max-w-xs">
              Tải lên file vận đơn (.pdf) xuất từ kênh người bán Shopee để bắt đầu bóc tách dữ liệu.
            </p>
            <button className="bg-gradient-to-br from-primary to-primary-container text-white px-8 py-3 rounded-full font-semibold shadow-lg hover:shadow-primary/20 active:scale-95 transition-all">
              Chọn tệp từ máy tính
            </button>
          </div>

          {/* Status Feedback */}
          <AnimatePresence>
            {status === 'error' && (
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

            {status === 'success' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-6 bg-green-50 text-green-800 rounded-3xl flex items-start gap-4 border border-green-200 shadow-sm"
              >
                <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center text-green-600 flex-shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div className="text-sm space-y-1 w-full">
                  <p className="font-black text-lg leading-none mb-2">Xử lý hoàn tất!</p>
                  <p className="font-bold text-on-surface">Đã khấu trừ thành công {processedOrders}/{totalOrders} đơn hàng.</p>
                  
                  {lastOrder && (
                    <div className="mt-4 p-3 bg-white/50 rounded-xl border border-green-200">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-green-700 mb-2">Đơn hàng cuối cùng:</p>
                      <p className="font-mono text-xs mb-2">{lastOrder.trackingCode}</p>
                      <div className="space-y-1">
                        {lastOrder.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-[11px]">
                            <span>{item.sku} {item.color ? `(${item.color})` : ''}</span>
                            <span className="font-bold">-{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Progress Section */}
          {isUploading && status === 'processing' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="surface-container-lowest rounded-[1.5rem] p-6 shadow-sm border border-surface-container"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <FileText className="text-primary" size={20} />
                  <span className="text-sm font-semibold">
                    {isProcessingConfirmed ? 'Đang cập nhật kho hàng...' : 'Đang bóc tách file...'}
                  </span>
                </div>
                <span className="text-xs font-bold text-primary">{progress}%</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="bg-gradient-to-r from-primary to-primary-container h-full rounded-full"
                />
              </div>
              <p className="text-[10px] text-secondary mt-3 uppercase tracking-widest font-bold">
                {!isProcessingConfirmed ? (
                  <>
                    {progress < 20 && 'Đang tải file...'}
                    {progress >= 20 && progress < 60 && 'Đang bóc tách dữ liệu PDF...'}
                    {progress >= 60 && 'Đang kiểm tra tồn kho...'}
                  </>
                ) : (
                  <>Đang xử lý đơn hàng {processedOrders + 1}/{totalOrders}...</>
                )}
              </p>
            </motion.div>
          )}

          {/* Confirmation Table for Review */}
          <AnimatePresence>
            {extractedOrdersForReview.length > 0 && !isProcessingConfirmed && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="surface-container-lowest rounded-[1.5rem] overflow-hidden shadow-xl border border-primary/20"
              >
                <div className="p-6 border-b border-surface-container bg-primary/5 flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-black text-primary uppercase tracking-widest">Bảng xác nhận dữ liệu</h4>
                    <p className="text-[10px] text-secondary font-medium mt-1">Vui lòng kiểm tra và sửa lại nếu AI bóc tách sai trước khi trừ kho.</p>
                  </div>
                  <div className="px-3 py-1 bg-primary text-white rounded-full text-[10px] font-bold">
                    {extractedOrdersForReview.length} đơn hàng
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low/20">
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">Mã vận đơn</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">Mã SKU</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">Màu sắc</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">SL</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">Trạng thái kho</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Sửa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container">
                      {extractedOrdersForReview.map((order, oIdx) => (
                        <React.Fragment key={oIdx}>
                          {order.items.map((item, iIdx) => (
                            <tr key={`${oIdx}-${iIdx}`} className="hover:bg-primary/5 transition-colors group">
                              <td className="px-4 py-3 font-mono text-[11px] text-on-surface">{order.trackingCode}</td>
                              <td className="px-4 py-3">
                                <div className="relative">
                                  <input 
                                    type="text"
                                    id={`sku-${oIdx}-${iIdx}`}
                                    value={item.sku}
                                    onChange={(e) => handleUpdateReviewItem(oIdx, iIdx, 'sku', e.target.value)}
                                    className="bg-surface-container-low/50 border border-transparent focus:border-primary focus:bg-white rounded-lg px-2 py-1 outline-none font-bold text-[11px] text-secondary w-full transition-all"
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <input 
                                  type="text"
                                  id={`color-${oIdx}-${iIdx}`}
                                  value={item.color}
                                  onChange={(e) => handleUpdateReviewItem(oIdx, iIdx, 'color', e.target.value)}
                                  className="bg-surface-container-low/50 border border-transparent focus:border-primary focus:bg-white rounded-lg px-2 py-1 outline-none text-[11px] text-secondary w-full transition-all"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input 
                                  type="number"
                                  id={`qty-${oIdx}-${iIdx}`}
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateReviewItem(oIdx, iIdx, 'quantity', e.target.value)}
                                  className="bg-surface-container-low/50 border border-transparent focus:border-primary focus:bg-white rounded-lg px-2 py-1 outline-none font-black text-primary text-xs w-12 text-center transition-all"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                {item.stockStatus === 'checking' ? (
                                  <Loader2 className="animate-spin mx-auto text-secondary" size={14} />
                                ) : (
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                    item.stockStatus === 'in_stock' ? 'bg-green-100 text-green-700' : 'bg-error-container text-error'
                                  }`}>
                                    {item.stockStatus === 'in_stock' ? 'Còn hàng' : 'Hết hàng'}
                                  </span>
                                )}
                                <p className="text-[8px] text-secondary mt-0.5">Tồn: {item.currentStock || 0}</p>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button 
                                  onClick={() => document.getElementById(`sku-${oIdx}-${iIdx}`)?.focus()}
                                  className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-all"
                                  title="Chỉnh sửa dòng này"
                                >
                                  <Edit2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-6 bg-surface-container-low/30 border-t border-surface-container">
                  <button 
                    onClick={() => handleConfirmProcess()}
                    className="w-full bg-gradient-to-br from-primary to-primary-container text-white py-4 rounded-2xl font-black shadow-lg hover:shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                  >
                    <CheckCircle2 size={24} />
                    XÁC NHẬN VÀ CẬP NHẬT KHO HÀNG
                  </button>
                  <button 
                    onClick={() => setExtractedOrdersForReview([])}
                    className="w-full mt-3 text-xs font-bold text-secondary hover:text-error transition-colors"
                  >
                    Hủy bỏ và tải lại file khác
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Detailed Order List from Current File */}
          <AnimatePresence>
            {currentFileOrders.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="surface-container-lowest rounded-[1.5rem] overflow-hidden shadow-xl border border-surface-container"
              >
                <div className="p-6 border-b border-surface-container bg-surface-container-low/30">
                  <h4 className="text-sm font-black text-on-surface uppercase tracking-widest">Chi tiết tệp tin vừa tải</h4>
                  <p className="text-[10px] text-secondary font-medium mt-1">Danh sách {currentFileOrders.length} đơn hàng được bóc tách từ file PDF.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low/20">
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">Mã vận đơn</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">Sản phẩm (SKU - Màu)</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">SL</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container">
                      {currentFileOrders.map((order, idx) => (
                        <tr key={idx} className="hover:bg-surface-container-low/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-[11px] text-on-surface">{order.trackingCode}</td>
                          <td className="px-4 py-3">
                            <div className="space-y-2">
                              {order.items.map((item, iIdx) => (
                                <div key={iIdx} className="flex flex-col">
                                  <div className="text-[11px] font-bold text-secondary">
                                    {item.sku} {item.color ? ` - ${item.color}` : ''}
                                  </div>
                                  {item.productName && (
                                    <div className="text-[9px] text-on-surface-variant/60 italic leading-tight line-clamp-1 max-w-[200px]">
                                      {item.productName}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-black text-primary text-xs">
                            {order.items.reduce((acc, i) => acc + i.quantity, 0)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {order.status === 'pending' && <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Chờ...</span>}
                              {order.status === 'processing' && (
                                <div className="flex items-center gap-1.5 text-primary">
                                  <Loader2 className="animate-spin" size={12} />
                                  <span className="text-[10px] font-bold uppercase tracking-widest">Đang xử lý</span>
                                </div>
                              )}
                              {order.status === 'success' && (
                                <div className="flex items-center gap-1.5 text-green-600">
                                  <CheckCircle2 size={12} />
                                  <span className="text-[10px] font-bold uppercase tracking-widest">Thành công</span>
                                </div>
                              )}
                              {order.status === 'error' && (
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center gap-1.5 text-error">
                                    <AlertCircle size={12} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Lỗi</span>
                                  </div>
                                  <span className="text-[8px] text-error/70 max-w-[150px] truncate" title={order.error}>{order.error}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stats/Context Card */}
        <div className="lg:col-span-1 space-y-6">
          {isInventoryEmpty && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-primary-fixed/20 border border-primary/20 p-6 rounded-[1.5rem] space-y-3"
            >
              <div className="flex items-center gap-2 text-primary">
                <AlertCircle size={20} />
                <h4 className="font-black uppercase tracking-widest text-xs">Kho hàng trống</h4>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                Hệ thống chưa có dữ liệu sản phẩm. Vui lòng vào mục <strong>Kho hàng</strong> và nhấn <strong>Nạp dữ liệu mẫu</strong> để có thể thực hiện trừ kho tự động.
              </p>
            </motion.div>
          )}

          <div className="surface-container-low rounded-[1.5rem] p-6 space-y-6 h-full border border-surface-container">
            <h4 className="text-xs uppercase tracking-widest font-extrabold text-secondary">Tóm tắt phiên làm việc</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary">
                    <Receipt size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-secondary font-medium">Số đơn chờ duyệt</p>
                    <p className="text-lg font-bold">42</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-secondary font-medium">Đã khấu trừ hôm nay</p>
                    <p className="text-lg font-bold">1,204</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="space-y-4 pt-4 border-t border-surface-container">
              <h4 className="text-[10px] uppercase tracking-widest font-extrabold text-secondary">Hoạt động gần đây</h4>
              <div className="space-y-3">
                {recentDeductions.length === 0 ? (
                  <p className="text-xs text-secondary italic">Chưa có hoạt động nào.</p>
                ) : (
                  recentDeductions.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 p-3 bg-surface-container-lowest/50 rounded-xl border border-surface-container/50 group">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600 flex-shrink-0">
                          <Clock size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-on-surface truncate">
                            {item.items && item.items.length > 0 
                              ? `${item.items[0].productName}${item.items.length > 1 ? ` (+${item.items.length - 1} sp)` : ''}`
                              : (item.productName || item.sku)}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-secondary">
                            <span className="font-mono">{item.trackingCode || item.id}</span>
                            <span>•</span>
                            <span className="font-black text-primary">
                              -{item.items ? item.items.reduce((acc: number, i: any) => acc + i.quantity, 0) : item.quantity}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setConfirmingRevert(item.trackingCode || item.id)}
                        className="p-1.5 text-secondary hover:text-error hover:bg-error/10 rounded-lg transition-all"
                        title="Hoàn tác để tải lại"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="p-4 bg-tertiary/10 rounded-2xl">
              <div className="flex items-start gap-3">
                <Info className="text-tertiary mt-0.5" size={16} />
                <p className="text-xs text-on-tertiary-fixed-variant leading-relaxed">
                  Đảm bảo file PDF không bị mã hóa và chứa nội dung vận đơn chuẩn của Shopee. Hệ thống sẽ tự động bỏ qua các trang trắng.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Modal */}
        <AnimatePresence>
          {showNegativeStockWarning && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-surface-container-lowest rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-error/20"
              >
                <div className="w-12 h-12 bg-error/10 rounded-2xl flex items-center justify-center text-error mb-4">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-lg font-bold text-on-surface mb-2">Cảnh báo tồn kho</h3>
                <p className="text-sm text-secondary mb-6 leading-relaxed">
                  Bạn đang trừ kho cho sản phẩm đã hết hàng, số lượng tồn sẽ bị âm. Tiếp tục?
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowNegativeStockWarning(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl font-bold text-secondary hover:bg-surface-container transition-all"
                  >
                    Quay lại sửa
                  </button>
                  <button 
                    onClick={() => handleConfirmProcess(true)}
                    className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-error text-white hover:bg-error/90 transition-all"
                  >
                    Vẫn tiếp tục
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {confirmingRevert && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-surface-container-lowest rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-surface-container"
              >
                <div className="w-12 h-12 bg-error/10 rounded-2xl flex items-center justify-center text-error mb-4">
                  <AlertCircle size={24} />
                </div>
                <h3 className="text-lg font-bold text-on-surface mb-2">Xác nhận hoàn tác</h3>
                <p className="text-sm text-secondary mb-6 leading-relaxed">
                  Bạn có chắc chắn muốn hoàn tác đơn hàng này? Hệ thống sẽ cộng lại số lượng vào kho và xóa bản ghi để bạn có thể tải lại.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmingRevert(null)}
                    disabled={isReverting}
                    className="flex-1 px-4 py-2.5 rounded-xl font-bold text-secondary hover:bg-surface-container transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={() => handleRevertOrder(confirmingRevert)}
                    disabled={isReverting}
                    className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-error text-white hover:bg-error/90 transition-all flex items-center justify-center gap-2"
                  >
                    {isReverting ? <Loader2 className="animate-spin" size={16} /> : 'Xác nhận'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
