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
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MOCK_PRODUCTS } from './types';
import { PDFService, ExtractedOrder } from './services/pdfService';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';
import { ProfitService } from './services/profitService';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { collection, query, limit, getDocs, onSnapshot, where, doc, getDoc, orderBy } from 'firebase/firestore';
import { db, storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ThermalLabel } from './components/RePrintModule';
import { OrderRecord } from './services/inventoryService';
import { Printer, X } from 'lucide-react';

export default function PDFUpload() {
  const { user, login, role } = useAuth();
  const { inventory, config: dataConfig, orders: allOrders, loading: dataLoading } = useData();
  const [isUploading, setIsUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const progressRef = React.useRef(0);
  
  const updateProgress = (val: number) => {
    progressRef.current = val;
    setProgress(val);
  };
  const [status, setStatus] = React.useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [processedOrders, setProcessedOrders] = React.useState<number>(0);
  const [totalOrders, setTotalOrders] = React.useState<number>(0);
  const [lastOrder, setLastOrder] = React.useState<ExtractedOrder | null>(null);
  const [uploadFailed, setUploadFailed] = React.useState(false);
  const [currentFileOrders, setCurrentFileOrders] = React.useState<(ExtractedOrder & { status: 'pending' | 'processing' | 'success' | 'error', error?: string })[]>([]);
  const [extractedOrdersForReview, setExtractedOrdersForReview] = React.useState<(ExtractedOrder & { 
    processedStatus?: 'already_processed' | 'new',
    items: (any & { stockStatus?: 'in_stock' | 'out_of_stock' | 'checking', currentStock?: number })[] 
  })[]>([]);
  const [isProcessingConfirmed, setIsProcessingConfirmed] = React.useState(false);
  const [showNegativeStockWarning, setShowNegativeStockWarning] = React.useState(false);
  const [currentFile, setCurrentFile] = React.useState<File | null>(null);
  const [recentDeductions, setRecentDeductions] = React.useState<OrderRecord[]>([]);
  const [confirmingRevert, setConfirmingRevert] = React.useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = React.useState(false);
  const [isReverting, setIsReverting] = React.useState(false);
  const [selectedOrderToPrint, setSelectedOrderToPrint] = React.useState<OrderRecord | null>(null);
  const [showPrintTemplate, setShowPrintTemplate] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isInventoryEmpty, setIsInventoryEmpty] = React.useState(false);
  const [profitConfig, setProfitConfig] = React.useState<any>(null);
  const [toasts, setToasts] = React.useState<{ id: string, message: string, type: 'success' | 'error' | 'info' }[]>([]);
  const abortControllerRef = React.useRef<boolean>(false);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // Calculate session stats
  const sessionStats = React.useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = allOrders.filter(o => o.processedAt && o.processedAt.startsWith(today));
    
    const totalDeducted = todayOrders.reduce((acc, order) => {
      if (order.items) {
        return acc + order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      }
      return acc + (order.quantity || 0);
    }, 0);

    return {
      pending: extractedOrdersForReview.length,
      processedToday: totalDeducted
    };
  }, [allOrders, extractedOrdersForReview]);

  // Sync with DataContext
  React.useEffect(() => {
    setIsInventoryEmpty(inventory.length === 0);
  }, [inventory]);

  React.useEffect(() => {
    if (dataConfig) setProfitConfig(dataConfig);
  }, [dataConfig]);

  React.useEffect(() => {
    setRecentDeductions(allOrders.slice(0, 10));
  }, [allOrders]);

  const handleRevertOrder = async (trackingCode: string) => {
    if (!trackingCode) {
      console.warn('[PDFUpload] No tracking code provided for revert.');
      return;
    }
    console.log(`[PDFUpload] Attempting to revert order: ${trackingCode}`);
    setIsReverting(true);
    try {
      await PDFService.revertOrder(trackingCode);
      console.log(`[PDFUpload] Successfully reverted order: ${trackingCode}`);
      setRecentDeductions(prev => prev.filter(item => (item.trackingCode || item.id) !== trackingCode));
      
      addToast('Đã hoàn tác đơn hàng và cộng lại kho.', 'success');
      
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
        message = parsed.userFriendlyMessage || parsed.error || err.message;
      } catch {
        message = err.message || 'Vui lòng thử lại.';
      }
      addToast(message, 'error');
    } finally {
      setIsReverting(false);
    }
  };

  const handleClearAllOrders = async () => {
    if (!user) return;
    
    setIsReverting(true);
    try {
      const result = await PDFService.clearAllOrders(user.uid);
      if (result.failed > 0) {
        addToast(`Đã xoá ${result.success} đơn. Có ${result.failed} đơn lỗi.`, 'info');
      } else {
        addToast(`Đã xoá và hoàn tác ${result.success} đơn hàng.`, 'success');
      }
      setRecentDeductions([]);
      setShowClearAllConfirm(false);
    } catch (err: any) {
      console.error('Clear All Error:', err);
      addToast('Lỗi khi xoá dữ liệu.', 'error');
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
          <h2 className="text-2xl font-black text-on-surface mb-2 uppercase tracking-tight font-headline">Zenith OMS - Vui lòng đăng nhập</h2>
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
      updateProgress(0);
      
      // Helper for smooth progress
      const animateProgress = (target: number, duration: number) => {
        return new Promise<void>((resolve) => {
          const startValue = progressRef.current;
          const startTime = Date.now();
          
          const step = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const ratio = Math.min(1, elapsed / duration);
            const current = startValue + (target - startValue) * ratio;
            
            updateProgress(Math.floor(current));
            
            if (elapsed < duration) {
              requestAnimationFrame(step);
            } else {
              updateProgress(target);
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      };

      await animateProgress(5, 500);
      setProcessedOrders(0);
      setCurrentFileOrders([]);
      setExtractedOrdersForReview([]);
      setCurrentFile(file);

      // 1. Extract all orders from PDF
      await animateProgress(15, 800);
      
      const orders = await PDFService.extractOrderData(file);

      setTotalOrders(orders.length);
      await animateProgress(25, 1000);

      // 2. Check which orders have already been processed
      const trackingCodes = orders.map(o => o.trackingCode);
      const processedStatusMap: Record<string, boolean> = {};
      
      for (let i = 0; i < trackingCodes.length; i += 30) {
        const batch = trackingCodes.slice(i, i + 30);
        const processedQuery = query(
          collection(db, 'processed_orders'),
          where('userId', '==', user.uid),
          where('trackingCode', 'in', batch)
        );
        const processedSnap = await getDocs(processedQuery);
        processedSnap.docs.forEach(doc => {
          processedStatusMap[doc.id] = true;
        });
        // Incremental progress during check (25% to 35%)
        await animateProgress(25 + Math.floor((i / trackingCodes.length) * 10), 200);
      }

      await animateProgress(35, 500);

      // 3. Check stock for each item
      const ordersWithStock = await Promise.all(orders.map(async (order) => {
        const isProcessed = !!processedStatusMap[order.trackingCode];
        
        const itemsWithStock = await Promise.all(order.items.map(async (item) => {
          const stockInfo = await PDFService.checkStockStatus(item.sku, item.color, inventory);
          const packagingFee = item.quantity * ProfitService.calculatePackagingFee(item.sku, stockInfo.productName || item.productName, profitConfig);

          return {
            ...item,
            stockStatus: stockInfo.inStock ? 'in_stock' : 'out_of_stock',
            currentStock: stockInfo.currentStock,
            productName: stockInfo.productName || item.productName,
            category: stockInfo.category,
            packagingFee
          };
        }));
        return { 
          ...order, 
          processedStatus: isProcessed ? 'already_processed' : 'new',
          items: itemsWithStock 
        };
      }));

      await animateProgress(40, 800);

      const alreadyProcessedCount = ordersWithStock.filter(o => o.processedStatus === 'already_processed').length;
      if (alreadyProcessedCount > 0) {
        console.log(`Found ${alreadyProcessedCount} already processed orders.`);
      }

      setExtractedOrdersForReview(ordersWithStock as any);
      // Stay at 40% for review
      setStatus('idle'); 
    } catch (err: any) {
      console.error('Processing Error:', err);
      let errMsg = 'Đã xảy ra lỗi khi xử lý file.';
      
      const errorStr = err.message || JSON.stringify(err);
      
      if (errorStr.includes('GEMINI_QUOTA_EXCEEDED') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        errMsg = 'Hạn mức AI đã hết (Quota Exceeded). Admin vui lòng cập nhật API Key mới hoặc quay lại sau.';
      } else if (errorStr.includes('MISSING_API_KEY')) {
        errMsg = 'Hệ thống chưa được cấu hình API Key. Admin vui lòng cài đặt trong Quản lý tài khoản.';
      } else if (errorStr.includes('GEMINI_ERROR')) {
        errMsg = `Lỗi từ AI: ${err.message.replace('GEMINI_ERROR: ', '')}`;
      } else {
        try {
          const parsed = JSON.parse(err.message);
          errMsg = parsed.userFriendlyMessage || parsed.error || err.message;
        } catch {
          errMsg = err.message || 'Đã xảy ra lỗi khi xử lý file.';
        }
      }
      
      setError(errMsg);
      setStatus('error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateReviewItem = async (orderIdx: number, itemIdx: number, field: string, value: any) => {
    // Create a deep-ish clone to ensure React detects changes in nested objects
    const updated = extractedOrdersForReview.map((order, oIdx) => {
      if (oIdx !== orderIdx) return order;
      return {
        ...order,
        items: order.items.map((item, iIdx) => {
          if (iIdx !== itemIdx) return item;
          return { ...item };
        })
      };
    });

    const item = updated[orderIdx].items[itemIdx];
    
    if (field === 'quantity') {
      item.quantity = Number(value);
      // Recalculate packaging fee
      item.packagingFee = item.quantity * ProfitService.calculatePackagingFee(item.sku, item.productName, profitConfig);
    } else {
      (item as any)[field] = value;
      
      // If SKU or Color changed, re-check stock
      if (field === 'sku' || field === 'color') {
        item.stockStatus = 'checking';
        // Update state immediately to show "checking"
        setExtractedOrdersForReview([...updated]);
        
        try {
          const stockInfo = await PDFService.checkStockStatus(item.sku, item.color, inventory);
          item.stockStatus = stockInfo.inStock ? 'in_stock' : 'out_of_stock';
          item.currentStock = stockInfo.currentStock;
          item.productName = stockInfo.productName || item.productName;
          item.category = stockInfo.category;
          
          // Recalculate packaging fee with new category
          item.packagingFee = item.quantity * ProfitService.calculatePackagingFee(item.sku, stockInfo.productName || item.productName, profitConfig);
        } catch (err) {
          console.error('Check stock error:', err);
          item.stockStatus = 'out_of_stock';
        }
      }
    }
    
    setExtractedOrdersForReview([...updated]);
  };

  const handleDeleteReviewItem = (orderIdx: number, itemIdx: number) => {
    const updated = [...extractedOrdersForReview];
    const order = { ...updated[orderIdx] };
    order.items = order.items.filter((_, i) => i !== itemIdx);
    
    if (order.items.length === 0) {
      // Remove the entire order if no items left
      updated.splice(orderIdx, 1);
    } else {
      updated[orderIdx] = order;
    }
    
    setExtractedOrdersForReview(updated);
  };

  const handleDeleteCurrentFileOrder = (idx: number) => {
    setCurrentFileOrders(prev => prev.filter((_, i) => i !== idx));
    // Also remove from extractedOrdersForReview to keep them in sync if processing hasn't reached it
    setExtractedOrdersForReview(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCancelReview = () => {
    setExtractedOrdersForReview([]);
    setCurrentFile(null);
    setStatus('idle');
    updateProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmProcess = async (force: boolean = false) => {
    if (!currentFile || extractedOrdersForReview.length === 0) return;

    // Filter out already processed orders to save quota and prevent errors
    const ordersToProcess = extractedOrdersForReview.filter(o => o.processedStatus !== 'already_processed');
    
    if (ordersToProcess.length === 0) {
      setError('Tất cả đơn hàng trong file này đã được xử lý trước đó.');
      setStatus('error');
      return;
    }

    // Check for negative stock
    const hasOutOfStock = ordersToProcess.some(order => 
      order.items.some(item => (item.currentStock || 0) < item.quantity)
    );

    if (hasOutOfStock && !force) {
      setShowNegativeStockWarning(true);
      return;
    }

    setShowNegativeStockWarning(false);
    setIsProcessingConfirmed(true);
    setStatus('processing');
    // Don't reset progress to 0, start from current (which is 40)
    setProcessedOrders(0);
    setCurrentFileOrders(ordersToProcess.map(o => ({ ...o, status: 'pending' })));
    abortControllerRef.current = false;

    const errors: string[] = [];
    let successCount = 0;

    // Use inventory and config from DataContext
    let preUploadedUrl: string | undefined = undefined;
    
    try {
      // 1. Skip PDF Upload to Storage to avoid CORS errors
      preUploadedUrl = '';
      setUploadFailed(false);

      // Trigger automated image generation and storage for reprint IMMEDIATELY
      // This allows the "Reprint" section to update in real-time as pages are processed
      if (currentFile && user) {
        console.log('[PDFUpload] Triggering automated image generation for reprint (Real-time mode)...');
        PDFService.generateAndUploadImages(currentFile, extractedOrdersForReview, user.uid)
          .catch(err => console.error('[PDFUpload] Image generation failed:', err));
      }

      for (let i = 0; i < ordersToProcess.length; i++) {
        // Check if aborted
        if (abortControllerRef.current) {
          console.log('Processing aborted by user');
          break;
        }

        const order = ordersToProcess[i];
        setCurrentFileOrders(prev => prev.map((o, idx) => idx === i ? { ...o, status: 'processing' } : o));
        
        try {
          // Progress from 40% to 100%
          const baseProgress = 40 + Math.floor((i / ordersToProcess.length) * 60);
          const nextBaseProgress = 40 + Math.floor(((i + 1) / ordersToProcess.length) * 60);
          
          // Start a small interval to simulate progress within an order
          const progressInterval = setInterval(() => {
            if (progressRef.current < nextBaseProgress - 1) {
              updateProgress(progressRef.current + 1);
            }
          }, 200);

          // Add a 30-second timeout per order to prevent hanging
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Hết thời gian xử lý đơn hàng (30s)')), 30000)
          );

          await Promise.race([
            PDFService.processOrder(currentFile!, order, inventory, profitConfig, preUploadedUrl),
            timeoutPromise
          ]);

          clearInterval(progressInterval);
          updateProgress(nextBaseProgress);

          successCount++;
          setProcessedOrders(successCount);
          setLastOrder(order);
          setCurrentFileOrders(prev => prev.map((o, idx) => idx === i ? { ...o, status: 'success' } : o));
        } catch (err: any) {
          console.error(`Error processing order ${order.trackingCode}:`, err);
          let errMsg = 'Lỗi không xác định';
          try {
            const parsed = JSON.parse(err.message);
            if (parsed.error?.includes('Quota limit exceeded')) {
              errMsg = 'Hết hạn mức truy cập (Quota).';
            } else {
              errMsg = parsed.userFriendlyMessage || parsed.error || err.message;
            }
          } catch {
            if (err.message?.includes('Quota limit exceeded')) {
              errMsg = 'Hết hạn mức truy cập (Quota).';
            } else {
              errMsg = err.message || 'Lỗi không xác định';
            }
          }
          errors.push(`${order.trackingCode}: ${errMsg}`);
          setCurrentFileOrders(prev => prev.map((o, idx) => idx === i ? { ...o, status: 'error', error: errMsg } : o));
        }
      }

      updateProgress(100);
      
      if (errors.length > 0) {
        if (successCount > 0) {
          setError(`Đã xử lý ${successCount}/${ordersToProcess.length} đơn. Một số đơn lỗi: ${errors.slice(0, 2).join(', ')}...`);
          setStatus('success');
        } else {
          setError(`Lỗi xử lý tất cả đơn hàng: ${errors[0]}`);
          setStatus('error');
        }
      } else if (abortControllerRef.current) {
        setError(`Đã dừng xử lý. Đã hoàn thành ${successCount} đơn.`);
        setStatus('idle');
      } else {
        setStatus('success');
      }
    } catch (err: any) {
      console.error('Batch processing fatal error:', err);
      setError(`Lỗi hệ thống: ${err.message}`);
      setStatus('error');
    } finally {
      setIsProcessingConfirmed(false);
      setExtractedOrdersForReview([]); // Clear review table
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
        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-on-surface mb-2 font-headline uppercase">Tải lên PDF</h1>
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
                className="flex flex-col gap-4"
              >
                <div className="p-4 bg-error-container text-on-error-container rounded-2xl flex items-center justify-between gap-3 border border-error/20">
                  <div className="flex items-center gap-3">
                    <AlertCircle size={20} className="flex-shrink-0" />
                    <span className="text-sm font-medium">{error}</span>
                  </div>
                  
                  {user && (error?.includes('API Key') || error?.includes('Quota')) && (
                    <button 
                      onClick={() => (window as any).location.hash = '#accounts'}
                      className="text-xs font-black uppercase tracking-widest bg-error text-white px-4 py-2 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-error/20 flex-shrink-0"
                    >
                      Cài đặt ngay
                    </button>
                  )}
                </div>
                
                {role === 'admin' && (error?.includes('API Key') || error?.includes('Quota')) && (
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                    <p className="text-xs text-secondary font-bold mb-2 uppercase tracking-wide">Hướng dẫn cho Admin:</p>
                    <ol className="text-xs text-secondary space-y-1 list-decimal ml-4">
                      <li>Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-primary underline">Google AI Studio</a> để tạo API Key mới.</li>
                      <li>Vào <b>Quản lý tài khoản</b> và dán mã mới vào mục <b>Cấu hình AI hệ thống</b>.</li>
                      <li>Mã mới sẽ có hiệu lực ngay lập tức cho toàn bộ người dùng.</li>
                    </ol>
                  </div>
                )}
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-6 bg-primary/5 text-primary rounded-3xl flex items-start gap-4 border border-primary/20 shadow-sm"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div className="text-sm space-y-1 w-full">
                  <p className="font-black text-lg leading-none mb-2">Xử lý hoàn tất!</p>
                  <p className="font-bold text-on-surface">Đã khấu trừ thành công {processedOrders}/{totalOrders} đơn hàng.</p>
                  
                  {uploadFailed && (
                    <div className="mt-2 p-2 bg-orange-50 text-orange-700 rounded-xl border border-orange-100 flex items-center gap-2">
                      <AlertTriangle size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-tight">Lưu ý: Không thể lưu file PDF vào bộ nhớ (Lỗi CORS), nhưng kho hàng đã được cập nhật.</span>
                    </div>
                  )}
                  
                  {lastOrder && (
                    <div className="mt-4 p-3 bg-white/50 rounded-xl border border-primary/20">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-primary mb-2">Đơn hàng cuối cùng:</p>
                      <p className="font-mono text-xs mb-2">{lastOrder.trackingCode}</p>
                      <div className="space-y-1">
                        {Array.isArray(lastOrder.items) && lastOrder.items.map((item, idx) => (
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
              
              {/* Cancel Button */}
              <div className="mt-6 flex justify-center">
                <button 
                  onClick={() => {
                    abortControllerRef.current = true;
                    setStatus('idle');
                    setIsUploading(false);
                    setIsProcessingConfirmed(false);
                    setError('Đã hủy bỏ quá trình xử lý.');
                  }}
                  className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2"
                >
                  <RotateCcw size={14} />
                  Hủy bỏ & Làm lại ngay
                </button>
              </div>
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
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">MÃ SKU</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">MÀU SẮC</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">SL</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">Giá Vốn/Bán</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">Phí ĐG</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">TRẠNG THÁI KHO</th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Sửa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container">
                      {extractedOrdersForReview.map((order, oIdx) => (
                        <React.Fragment key={oIdx}>
                          {order.items.map((item, iIdx) => (
                            <tr key={`${oIdx}-${iIdx}`} className={`transition-colors group ${order.processedStatus === 'already_processed' ? 'bg-orange-50/50 opacity-75' : 'hover:bg-primary/5'}`}>
                              <td className="px-4 py-3 font-mono text-[11px] text-on-surface">
                                <div className="flex flex-col">
                                  <span className={order.processedStatus === 'already_processed' ? 'line-through text-secondary' : ''}>{order.trackingCode}</span>
                                  {order.processedStatus === 'already_processed' && (
                                    <span className="text-[8px] font-black text-orange-600 uppercase tracking-tighter flex items-center gap-1">
                                      <AlertCircle size={8} /> Đã xử lý
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <input 
                                  type="text"
                                  value={item.sku}
                                  onChange={(e) => handleUpdateReviewItem(oIdx, iIdx, 'sku', e.target.value)}
                                  className="bg-surface-container-lowest border border-surface-container focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-2 py-1 outline-none font-bold text-[11px] text-on-surface w-full transition-all"
                                  placeholder="Mã SKU"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input 
                                  type="text"
                                  value={item.color}
                                  onChange={(e) => handleUpdateReviewItem(oIdx, iIdx, 'color', e.target.value)}
                                  className="bg-surface-container-lowest border border-surface-container focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-2 py-1 outline-none text-[11px] text-on-surface w-full transition-all"
                                  placeholder="Màu sắc"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input 
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateReviewItem(oIdx, iIdx, 'quantity', e.target.value)}
                                  className="bg-surface-container-lowest border border-surface-container focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-1 py-1 outline-none font-black text-primary text-xs w-14 text-center transition-all"
                                  min="1"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex flex-col gap-1">
                                  <input 
                                    type="number"
                                    value={item.costPrice || 0}
                                    onChange={(e) => handleUpdateReviewItem(oIdx, iIdx, 'costPrice', e.target.value)}
                                    className="bg-surface-container-lowest border border-surface-container focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-1 py-1 outline-none font-bold text-error text-[10px] w-20 text-center transition-all"
                                    placeholder="Giá vốn"
                                  />
                                  <input 
                                    type="number"
                                    value={item.sellingPrice || 0}
                                    onChange={(e) => handleUpdateReviewItem(oIdx, iIdx, 'sellingPrice', e.target.value)}
                                    className="bg-surface-container-lowest border border-surface-container focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-1 py-1 outline-none font-bold text-green-600 text-[10px] w-20 text-center transition-all"
                                    placeholder="Giá bán"
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-[10px] font-bold text-primary">
                                  {item.packagingFee?.toLocaleString()}đ
                                </span>
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
                                <div className="flex justify-end gap-1">
                                  <button 
                                    onClick={() => {
                                      const input = document.querySelector(`input[value="${item.sku}"]`) as HTMLInputElement;
                                      input?.focus();
                                    }}
                                    className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all"
                                    title="Chỉnh sửa dòng này"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteReviewItem(oIdx, iIdx)}
                                    className="p-2 text-error hover:bg-error/10 rounded-xl transition-all"
                                    title="Xóa dòng này"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
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
                    disabled={status === 'processing'}
                    className="w-full bg-gradient-to-br from-primary to-primary-container text-white py-4 rounded-2xl font-black shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
                  >
                    {status === 'processing' ? (
                      <Loader2 className="animate-spin" size={24} />
                    ) : (
                      <CheckCircle2 size={24} />
                    )}
                    XÁC NHẬN VÀ CẬP NHẬT KHO HÀNG
                  </button>
                  <button 
                    onClick={handleCancelReview}
                    className="w-full mt-3 text-xs font-bold text-secondary hover:text-error transition-colors py-2"
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
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container">
                      {currentFileOrders.map((order, idx) => (
                        <tr key={idx} className="hover:bg-surface-container-low/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-[11px] text-on-surface">{order.trackingCode}</td>
                          <td className="px-4 py-3">
                            <div className="space-y-2">
                              {Array.isArray(order.items) && order.items.map((item, iIdx) => (
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
                          <td className="px-4 py-3 text-right">
                            <button 
                              onClick={() => handleDeleteCurrentFileOrder(idx)}
                              disabled={order.status === 'processing'}
                              className="p-2 text-error hover:bg-error/10 rounded-xl transition-all disabled:opacity-30"
                              title="Xóa đơn này khỏi danh sách"
                            >
                              <Trash2 size={14} />
                            </button>
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
                    <p className="text-lg font-bold">{sessionStats.pending.toLocaleString()}</p>
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
                    <p className="text-lg font-bold">{sessionStats.processedToday.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="space-y-4 pt-4 border-t border-surface-container">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] uppercase tracking-widest font-extrabold text-secondary">Hoạt động gần đây</h4>
                {recentDeductions.length > 0 && (
                  <button 
                    onClick={() => setShowClearAllConfirm(true)}
                    disabled={isReverting}
                    className="text-[10px] font-bold text-error hover:underline disabled:opacity-50"
                  >
                    Xoá tất cả
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {recentDeductions.length === 0 ? (
                  <p className="text-xs text-secondary italic">Chưa có hoạt động nào.</p>
                ) : (
                  recentDeductions.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 p-3 bg-surface-container-lowest/50 rounded-xl border border-surface-container/50 group">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary flex-shrink-0">
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
                      <div className="flex items-center gap-1">
                        {item.pdfUrl && (
                          <button 
                            onClick={() => window.open(item.pdfUrl, '_blank')}
                            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"
                            title="In nhanh PDF gốc"
                          >
                            <Printer size={14} />
                          </button>
                        )}
                        {!item.pdfUrl && (
                          <button 
                            onClick={() => {
                              setSelectedOrderToPrint(item);
                              setShowPrintTemplate(true);
                            }}
                            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"
                            title="In nhiệt (mẫu hệ thống)"
                          >
                            <Printer size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => setConfirmingRevert(item.trackingCode || item.id)}
                          className="p-1.5 text-secondary hover:text-error hover:bg-error/10 rounded-lg transition-all"
                          title="Hoàn tác để tải lại"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
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

          {showClearAllConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-surface-container-lowest rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-error/20"
              >
                <div className="w-12 h-12 bg-error/10 rounded-2xl flex items-center justify-center text-error mb-4">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-lg font-bold text-on-surface mb-2">Xoá tất cả hoạt động?</h3>
                <p className="text-sm text-secondary mb-6 leading-relaxed">
                  Thao tác này sẽ <strong>hoàn tác tồn kho</strong> cho TẤT CẢ đơn hàng trong danh sách này và xoá vĩnh viễn dữ liệu. Bạn có chắc chắn?
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowClearAllConfirm(false)}
                    disabled={isReverting}
                    className="flex-1 px-4 py-2.5 rounded-xl font-bold text-secondary hover:bg-surface-container transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleClearAllOrders}
                    disabled={isReverting}
                    className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-error text-white hover:bg-error/90 transition-all flex items-center justify-center gap-2"
                  >
                    {isReverting ? <Loader2 className="animate-spin" size={16} /> : 'Xoá tất cả'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Print Template Modal */}
          {showPrintTemplate && selectedOrderToPrint && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPrintTemplate(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm no-print"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] no-print"
              >
                <div className="p-6 border-b border-surface-container flex justify-between items-center">
                  <h3 className="text-xl font-black text-on-surface tracking-tight">Xem trước bản in nhiệt</h3>
                  <button 
                    onClick={() => setShowPrintTemplate(false)}
                    className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-secondary hover:bg-error hover:text-white transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-grow overflow-y-auto p-8 bg-surface-container-low flex justify-center">
                  <div className="bg-white p-4 shadow-lg border border-surface-container" style={{ width: '100mm', minHeight: '150mm' }}>
                    <ThermalLabel order={selectedOrderToPrint} />
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
                    onClick={() => window.print()}
                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-black shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Printer size={20} />
                    IN NHIỆT NGAY
                  </button>
                </div>
              </motion.div>

              {/* Hidden Printable Area */}
              <div className="print-only fixed inset-0 bg-white z-[200]">
                <ThermalLabel order={selectedOrderToPrint} />
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={`pointer-events-auto px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px] border ${
                toast.type === 'success' ? 'bg-green-600 border-green-500 text-white' :
                toast.type === 'error' ? 'bg-error border-error-container text-white' :
                'bg-surface-container-highest border-surface-container text-on-surface'
              }`}
            >
              {toast.type === 'success' && <CheckCircle2 size={20} />}
              {toast.type === 'error' && <AlertCircle size={20} />}
              {toast.type === 'info' && <Info size={20} />}
              <span className="text-sm font-bold">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <style>{`
          @media print {
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            body { background: white !important; }
            @page { margin: 0; size: 100mm 150mm; }
          }
          .print-only { display: none; }
        `}</style>
      </div>
    </motion.div>
  );
}
