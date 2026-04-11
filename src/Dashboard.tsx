import React from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  AlertCircle,
  Truck, 
  History,
  Plus,
  Loader2,
  LogIn,
  ChevronRight,
  Calendar,
  Package,
  CheckCircle2,
  ChevronLeft,
  Search,
  ArrowRight,
  Star,
  BarChart3,
  PieChart,
  ShieldCheck,
  RefreshCw,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { InventoryService, OrderRecord } from './services/inventoryService';
import { TrackingService } from './services/trackingService';
import LowStockPanel from './components/LowStockPanel';
import { getSupabase } from './lib/supabase';

export default function Dashboard() {
  const { user, login, error, clearError, role, expiryDate, isSubscriptionValid } = useAuth();
  const { inventory, orders, problematicOrders, loading: dataLoading } = useData();
  const [loading, setLoading] = React.useState(false);
  const [isTracking, setIsTracking] = React.useState(false);
  const [selectedOrder, setSelectedOrder] = React.useState<OrderRecord | null>(null);
  const [showTrackingModal, setShowTrackingModal] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [showOrderDetails, setShowOrderDetails] = React.useState(false);
  const [showProblematicModal, setShowProblematicModal] = React.useState(false);
  const [showTopSellersModal, setShowTopSellersModal] = React.useState(false);
  const [topSellersTimeframe, setTopSellersTimeframe] = React.useState<'today' | '7days' | '30days'>('today');
  const [shippingOrders, setShippingOrders] = React.useState<any[]>([]);
  const [showShippingModal, setShowShippingModal] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [trackingProgress, setTrackingProgress] = React.useState({ current: 0, total: 0 });
  const [selectedShippingOrder, setSelectedShippingOrder] = React.useState<any | null>(null);
  const [isFetchingTimeline, setIsFetchingTimeline] = React.useState(false);
  const [trackingTimeline, setTrackingTimeline] = React.useState<any[]>([]);

  // Get last 10 days
  const last10Days = React.useMemo(() => {
    const dates = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, []);

  React.useEffect(() => {
    setLoading(dataLoading);
  }, [dataLoading]);

  // Auto-track orders periodically
  React.useEffect(() => {
    if (!user || isTracking) return;

    const runTracking = async () => {
      setIsTracking(true);
      try {
        await TrackingService.processTrackingBatch(user.uid);
      } catch (err) {
        console.error('Auto-tracking error:', err);
      } finally {
        setIsTracking(false);
      }
    };

    // Run once on mount, then every 30 minutes
    runTracking();
    const interval = setInterval(runTracking, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  // Fetch shipping orders from Supabase
  const fetchShippingOrders = React.useCallback(async () => {
    if (!user) return;
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from('print_history')
        .select('*')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setShippingOrders(data || []);
    } catch (err) {
      console.error('Error fetching shipping orders:', err);
    }
  }, [user]);

  React.useEffect(() => {
    fetchShippingOrders();
  }, [fetchShippingOrders]);

  const handleRefreshDelivery = async () => {
    if (!user || isRefreshing) return;
    setIsRefreshing(true);
    setTrackingProgress({ current: 0, total: 0 });
    try {
      const result = await TrackingService.refreshDeliveryStatus(user.uid, (current, total) => {
        setTrackingProgress({ current, total });
      });
      if (result.success) {
        await fetchShippingOrders();
      }
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setIsRefreshing(false);
      setTrackingProgress({ current: 0, total: 0 });
    }
  };

  const handleTrackOrder = async (order: any) => {
    setSelectedShippingOrder(order);
    setTrackingTimeline(order.tracking_log || []);
    
    // Always prioritize fresh fetch when opening modal, unless already final
    const isFinalStatus = order.status === 'Success' || order.status === 'Issue';
    
    setIsFetchingTimeline(true);
    try {
      // Pass forceFetch=true to ignore cache
      const result = await TrackingService.fetchSingleTracking(order.id, order.tracking_number, order.status, !isFinalStatus);
      if (result.success) {
        setTrackingTimeline(result.data);
        // Update the local list to refresh dashboard counts immediately
        if (!result.cached) {
          setShippingOrders(prev => prev.map(o => 
            o.id === order.id ? { ...o, status: result.status, tracking_log: result.data, last_checked_at: new Date().toISOString() } : o
          ));
          // Still fetch from server to be sure
          await fetchShippingOrders();
        }
      }
    } catch (err) {
      console.error('Fetch timeline error:', err);
    } finally {
      setIsFetchingTimeline(false);
    }
  };

  // Derived stats
  const dailyOrders = React.useMemo(() => {
    return orders.filter(o => o.processedAt.split('T')[0] === selectedDate);
  }, [orders, selectedDate]);

  const shippingCount = React.useMemo(() => {
    return shippingOrders.filter(o => o.status === 'Giao hàng' || o.status === 'Đang giao' || !o.status).length;
  }, [shippingOrders]);

  const successCount = React.useMemo(() => {
    return shippingOrders.filter(o => o.status === 'Success').length;
  }, [shippingOrders]);

  const issueCount = React.useMemo(() => {
    return shippingOrders.filter(o => o.status === 'Issue').length;
  }, [shippingOrders]);

  const successRate = React.useMemo(() => {
    if (shippingOrders.length === 0) return 0;
    return Math.round((successCount / shippingOrders.length) * 100);
  }, [shippingOrders.length, successCount]);

  const lowStockItems = React.useMemo(() => {
    return InventoryService.getLowStockItems(inventory, 5);
  }, [inventory]);

  const salesByCategory = React.useMemo(() => {
    return InventoryService.getSalesByCategory(dailyOrders, inventory);
  }, [dailyOrders, inventory]);

  const totalItemsToday = React.useMemo(() => {
    return (Object.values(salesByCategory) as number[]).reduce((a, b) => a + b, 0);
  }, [salesByCategory]);

  const topSellers = React.useMemo(() => {
    return InventoryService.getTopSellers(orders, topSellersTimeframe);
  }, [orders, topSellersTimeframe]);

  const bestSeller = topSellers[0] || null;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-primary-fixed/20 rounded-full flex items-center justify-center text-primary">
          <LogIn size={40} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-black text-on-surface mb-2 uppercase tracking-tight font-headline">Zenith OMS - Vui lòng đăng nhập</h2>
          <p className="text-secondary mb-8">Bạn cần đăng nhập bằng tài khoản quản trị để xem báo cáo và quản lý kho hàng.</p>
          <button 
            onClick={login}
            className="bg-primary text-white px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-all"
          >
            Đăng nhập ngay
          </button>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm font-medium"
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={16} />
                <span className="font-bold">Lỗi đăng nhập</span>
              </div>
              <p>{error}</p>
              <button 
                onClick={clearError}
                className="mt-2 text-xs font-bold uppercase tracking-widest hover:underline"
              >
                Đóng
              </button>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-12"
    >
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-on-surface font-headline leading-none uppercase">CHÀO MỪNG TRỞ LẠI, {role === 'admin' ? 'ADMIN' : user?.displayName?.toUpperCase()}</h2>
          <p className="text-secondary mt-2 body-md">Zenith OMS - Hệ thống quản lý kho chuyên nghiệp.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-6 py-2 bg-gradient-to-br from-primary to-primary-container text-white rounded-full font-medium text-sm transition-all hover:shadow-lg active:scale-95 flex items-center gap-2">
            <Plus size={18} />
            Tạo đơn hàng mới
          </button>
        </div>
      </header>

      {/* Date Selector for 10-Day Report */}
      <div className="flex items-center gap-4 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
        <div className="flex items-center gap-2 bg-white/50 p-1 rounded-2xl border border-surface-container shadow-sm">
          {last10Days.map((date) => {
            const isSelected = selectedDate === date;
            const d = new Date(date);
            const dayName = d.toLocaleDateString('vi-VN', { weekday: 'short' });
            const dayNum = d.getDate();
            
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center justify-center min-w-[64px] h-16 rounded-xl transition-all ${
                  isSelected 
                    ? 'bg-primary text-white shadow-md scale-105' 
                    : 'hover:bg-surface-container text-secondary'
                }`}
              >
                <span className="text-[10px] font-bold uppercase">{dayName}</span>
                <span className="text-lg font-black">{dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Problematic Orders Alert */}
      {problematicOrders.length > 0 && (
        <motion.div 
          variants={item}
          className="p-6 bg-error/10 border border-error/20 rounded-[32px] flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-error text-white flex items-center justify-center shadow-lg animate-pulse">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h4 className="text-lg font-black text-error uppercase tracking-tight">Cảnh báo: Đơn giao vấn đề</h4>
              <p className="text-error/70 text-sm font-medium">Có {problematicOrders.length} đơn hàng đang gặp sự cố vận chuyển (Sai địa chỉ, Nhận lỗi, Trả hàng...)</p>
            </div>
          </div>
          <button 
            className="px-6 py-2 bg-error text-white rounded-full font-bold text-xs hover:scale-105 transition-all"
            onClick={() => setShowProblematicModal(true)}
          >
            Xử lý ngay
          </button>
        </motion.div>
      )}

      {/* Bento Grid Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {/* Main Summary Stats - Clickable for details */}
        <motion.div 
          variants={item}
          onClick={() => setShowOrderDetails(true)}
          className="md:col-span-2 lg:col-span-1 glass-morphism rounded-3xl p-8 shadow-sm border border-white/10 flex flex-col justify-between cursor-pointer hover:bg-white/40 transition-all group"
        >
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Tổng đơn xử lý</span>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                <ChevronRight size={16} />
              </div>
            </div>
            {loading ? (
              <Loader2 className="animate-spin text-primary" size={32} />
            ) : (
              <h3 className="text-5xl font-black text-on-surface font-headline">{dailyOrders.length.toLocaleString()}</h3>
            )}
            <p className="text-secondary mt-2 font-medium">Ngày {new Date(selectedDate).toLocaleDateString('vi-VN')}</p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-tertiary font-bold text-sm">
            <TrendingUp size={18} />
            <span>Chi tiết đơn hàng</span>
          </div>
        </motion.div>

        {/* Delivered Stats */}
        <motion.div 
          variants={item}
          className="glass-morphism rounded-3xl p-8 shadow-sm border border-white/10 flex flex-col justify-between cursor-pointer hover:scale-[1.02] transition-all"
          onClick={() => setShowShippingModal(true)}
        >
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-success">Giao thành công</span>
              <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <h3 className="text-5xl font-black text-on-surface font-headline">{successCount}</h3>
            <p className="text-secondary mt-2 font-medium">Tổng đơn đã xác nhận giao thành công</p>
            <p className="text-[10px] text-secondary mt-1 italic">Dựa trên dữ liệu hành trình đã kiểm tra</p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-success font-bold text-sm">
            <ShieldCheck size={18} />
            <span>Tỉ lệ thành công: {successRate}%</span>
          </div>
        </motion.div>

        {/* Total Processed (Shipping) */}
        <motion.div 
          variants={item}
          className="glass-morphism rounded-3xl p-8 shadow-sm border border-white/10 flex flex-col justify-between cursor-pointer hover:scale-[1.02] transition-all"
          onClick={() => {
            setShowShippingModal(true);
            handleRefreshDelivery();
          }}
        >
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-2xl bg-tertiary-fixed flex items-center justify-center text-tertiary">
              <Truck size={24} />
            </div>
            {isRefreshing && <Loader2 size={16} className="animate-spin text-primary" />}
          </div>
          <div>
            <h3 className="text-3xl font-black text-on-surface font-headline mt-6">{shippingCount}</h3>
            <p className="text-secondary font-medium">Đang giao hàng</p>
            <p className="text-[10px] text-secondary mt-1 italic">Nhấn để kiểm tra hành trình</p>
          </div>
        </motion.div>

        {/* Subscription Status Card */}
        {role !== 'admin' && (
          <motion.div 
            variants={item}
            className={`glass-morphism rounded-3xl p-8 border flex flex-col justify-between ${
              isSubscriptionValid() ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${
                isSubscriptionValid() ? 'bg-green-500' : 'bg-red-500'
              }`}>
                <ShieldCheck size={24} />
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                isSubscriptionValid() ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {isSubscriptionValid() ? 'Đã kích hoạt' : 'Hết hạn'}
              </span>
            </div>
            <div>
              <h3 className={`text-lg font-black font-headline mt-6 ${
                isSubscriptionValid() ? 'text-green-900' : 'text-red-900'
              }`}>
                Gói Foot
              </h3>
              <p className="text-xs font-bold text-secondary opacity-80">
                Hết hạn: {expiryDate ? new Date(expiryDate).toLocaleDateString('vi-VN') : 'N/A'}
              </p>
              {!isSubscriptionValid() && (
                <p className="text-[10px] text-red-600 mt-2 font-bold italic">Vui lòng liên hệ Admin để kích hoạt</p>
              )}
            </div>
          </motion.div>
        )}

        {/* Best Seller Analysis */}
        <motion.div 
          variants={item}
          className="md:col-span-3 lg:col-span-1 lg:row-span-2 glass-morphism rounded-3xl p-6 shadow-sm border border-white/10 overflow-hidden flex flex-col"
        >
          <h3 className="text-lg font-bold text-on-surface mb-6 flex items-center gap-2">
            <Star className="text-primary" size={20} />
            Sản phẩm bán chạy
          </h3>
          
          {bestSeller ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-primary-container p-1 shadow-lg">
                <div className="w-full h-full rounded-[20px] bg-white flex items-center justify-center text-primary">
                  <Package size={40} />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Top 1 {topSellersTimeframe === 'today' ? 'Hôm nay' : topSellersTimeframe === '7days' ? '7 Ngày' : '30 Ngày'}</p>
                <h4 className="text-lg font-black text-on-surface leading-tight">{bestSeller.name}</h4>
                <p className="text-sm text-secondary font-medium mt-1">{bestSeller.variant}</p>
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full font-bold text-sm">
                  <span>{bestSeller.count} đơn hàng</span>
                </div>
                <p className="text-[10px] text-secondary mt-2 font-mono">SKU: {bestSeller.sku}</p>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-center opacity-50">
              <Package size={48} className="text-secondary mb-4" />
              <p className="text-sm font-medium text-secondary">Chưa có dữ liệu bán hàng</p>
            </div>
          )}
          
          <button 
            onClick={() => setShowTopSellersModal(true)}
            className="mt-6 text-primary text-xs font-bold uppercase tracking-widest hover:underline text-center"
          >
            XEM BÁO CÁO
          </button>
        </motion.div>

        {/* Category Analysis Visualizer */}
        <motion.div 
          variants={item}
          className="md:col-span-2 lg:col-span-3 glass-morphism rounded-3xl p-8 shadow-sm border border-white/10 min-h-[350px] flex flex-col"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h3 className="text-lg font-bold text-on-surface">Phân tích danh mục kinh doanh</h3>
              <p className="text-xs text-secondary mt-1">Dữ liệu bán ra ngày {new Date(selectedDate).toLocaleDateString('vi-VN')}</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-tertiary/10 text-tertiary rounded-full text-[10px] font-bold">
                <span className="w-2 h-2 rounded-full bg-tertiary"></span>
                Bình giữ nhiệt: {salesByCategory['Bình giữ nhiệt']} cái
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                Cốc giữ nhiệt: {salesByCategory['Cốc giữ nhiệt']} cái
              </div>
            </div>
          </div>
          
          <div className="flex-grow flex items-end justify-center gap-12 md:gap-24">
            {/* Bình giữ nhiệt Bar */}
            <div className="flex flex-col items-center gap-4 flex-1 max-w-[120px]">
              <div className="relative w-full h-48 bg-surface-container rounded-2xl overflow-hidden">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.min(100, (salesByCategory['Bình giữ nhiệt'] / (totalItemsToday || 1)) * 100)}%` }}
                  className="absolute bottom-0 left-0 right-0 bg-tertiary rounded-t-xl flex items-start justify-center pt-2"
                >
                  <span className="text-[10px] font-bold text-white">{salesByCategory['Bình giữ nhiệt']}</span>
                </motion.div>
              </div>
              <div className="text-center">
                <span className="text-xs font-black text-on-surface uppercase block">Bình giữ nhiệt</span>
                <span className="text-[10px] text-secondary font-bold">Tồn kho: {inventory.filter(p => (p.category || '').toLowerCase().includes('bình')).reduce((acc, p) => acc + p.stock, 0)} cái</span>
              </div>
            </div>

            {/* Cốc giữ nhiệt Bar */}
            <div className="flex flex-col items-center gap-4 flex-1 max-w-[120px]">
              <div className="relative w-full h-48 bg-surface-container rounded-2xl overflow-hidden">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.min(100, (salesByCategory['Cốc giữ nhiệt'] / (totalItemsToday || 1)) * 100)}%` }}
                  className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-xl flex items-start justify-center pt-2"
                >
                  <span className="text-[10px] font-bold text-white">{salesByCategory['Cốc giữ nhiệt']}</span>
                </motion.div>
              </div>
              <div className="text-center">
                <span className="text-xs font-black text-on-surface uppercase block">Cốc giữ nhiệt</span>
                <span className="text-[10px] text-secondary font-bold">Tồn kho: {inventory.filter(p => (p.category || '').toLowerCase().includes('cốc')).reduce((acc, p) => acc + p.stock, 0)} cái</span>
              </div>
            </div>

            {/* Other Bar */}
            <div className="flex flex-col items-center gap-4 flex-1 max-w-[120px]">
              <div className="relative w-full h-48 bg-surface-container rounded-2xl overflow-hidden">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.min(100, (salesByCategory['Khác'] / (totalItemsToday || 1)) * 100)}%` }}
                  className="absolute bottom-0 left-0 right-0 bg-secondary rounded-t-xl flex items-start justify-center pt-2"
                >
                  <span className="text-[10px] font-bold text-white">{salesByCategory['Khác']}</span>
                </motion.div>
              </div>
              <div className="text-center">
                <span className="text-xs font-black text-on-surface uppercase block">Khác</span>
                <span className="text-[10px] text-secondary font-bold">Tồn kho: {inventory.filter(p => !(p.category || '').toLowerCase().includes('bình') && !(p.category || '').toLowerCase().includes('cốc')).reduce((acc, p) => acc + p.stock, 0)} cái</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Smart Restock Forecast Section */}
      <motion.div variants={item}>
        <LowStockPanel />
      </motion.div>

      {/* Order Details Modal */}
      <AnimatePresence>
        {showOrderDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowOrderDetails(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-surface-container flex justify-between items-center bg-gradient-to-r from-primary/5 to-transparent">
                <div>
                  <h3 className="text-2xl font-black text-on-surface tracking-tight">Chi tiết đơn hàng đã xử lý</h3>
                  <p className="text-secondary font-medium mt-1">Ngày {new Date(selectedDate).toLocaleDateString('vi-VN')} • {dailyOrders.length} đơn hàng</p>
                </div>
                <button 
                  onClick={() => setShowOrderDetails(false)}
                  className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary hover:bg-primary hover:text-white transition-all"
                >
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-8 custom-scrollbar">
                {dailyOrders.length > 0 ? (
                  <div className="space-y-4">
                    {dailyOrders.map((order) => (
                      <div key={order.trackingCode} className="p-6 bg-surface-container-low rounded-3xl border border-surface-container hover:border-primary/30 transition-all group">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm border border-surface-container">
                              <Package size={24} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Mã vận đơn</p>
                              <h4 className="text-lg font-black text-on-surface font-mono">{order.trackingCode}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-xs text-secondary">Xử lý lúc: {new Date(order.processedAt).toLocaleTimeString('vi-VN')}</p>
                                <span className="text-xs text-secondary">•</span>
                                <p className="text-xs font-bold text-primary">Nơi đến: {order.destination || 'Chưa xác định'}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-surface-container shadow-sm">
                                <div className="w-2 h-2 rounded-full bg-primary"></div>
                                <div className="flex-grow">
                                  <p className="text-xs font-bold text-on-surface truncate max-w-[200px]">{item.productName}</p>
                                  <p className="text-[10px] text-secondary">{item.variant} • SKU: {item.sku}</p>
                                </div>
                                <div className="text-xs font-black text-primary">x{item.quantity}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
                    <History size={64} className="text-secondary mb-4" />
                    <p className="text-lg font-bold text-secondary">Không có đơn hàng nào được xử lý trong ngày này</p>
                  </div>
                )}
              </div>

              <div className="p-8 bg-surface-container-low border-t border-surface-container flex justify-end">
                <button 
                  onClick={() => setShowOrderDetails(false)}
                  className="px-8 py-3 bg-on-surface text-white rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Problematic Orders Modal */}
      <AnimatePresence>
        {showProblematicModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProblematicModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-error/20 flex justify-between items-center bg-gradient-to-r from-error/5 to-transparent">
                <div>
                  <h3 className="text-2xl font-black text-error tracking-tight flex items-center gap-3">
                    <AlertTriangle size={28} />
                    Danh sách đơn hàng có vấn đề
                  </h3>
                  <p className="text-error/70 font-medium mt-1">Cần kiểm tra lại địa chỉ hoặc liên hệ khách hàng ({problematicOrders.length} đơn)</p>
                </div>
                <button 
                  onClick={() => setShowProblematicModal(false)}
                  className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center text-error hover:bg-error hover:text-white transition-all"
                >
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-8 custom-scrollbar">
                <div className="space-y-4">
                  {problematicOrders.map((order) => (
                    <div key={order.id} className="p-6 bg-error/5 rounded-3xl border border-error/10 hover:border-error/30 transition-all group">
                      <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-error shadow-sm border border-error/10">
                            <AlertTriangle size={24} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-error uppercase tracking-widest mb-1">Mã vận đơn</p>
                            <h4 className="text-lg font-black text-on-surface font-mono">{order.trackingCode}</h4>
                            <div className="mt-2 p-3 bg-white rounded-xl border border-error/10">
                              <p className="text-xs font-bold text-error">Lý do: {order.reason}</p>
                              <p className="text-[10px] text-secondary mt-1">Trạng thái gốc: {order.status}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 min-w-[250px]">
                          <div className="bg-white p-4 rounded-2xl border border-surface-container shadow-sm">
                            <p className="text-[10px] font-bold text-secondary uppercase mb-2">Thông tin nhận hàng</p>
                            <p className="text-xs font-bold text-on-surface">{order.recipient || 'N/A'}</p>
                            <p className="text-[10px] text-secondary mt-1">{order.phone || 'N/A'}</p>
                          </div>
                          <button 
                            className="w-full py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-dark transition-all"
                            onClick={() => {
                              // Logic to open tracking or contact
                              window.open(`https://tracking.ghn.dev/?order_code=${order.trackingCode}`, '_blank');
                            }}
                          >
                            Kiểm tra hành trình GHN
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-8 bg-surface-container-low border-t border-surface-container flex justify-end">
                <button 
                  onClick={() => setShowProblematicModal(false)}
                  className="px-8 py-3 bg-on-surface text-white rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tracking Details Modal */}
      <AnimatePresence>
        {showTrackingModal && selectedOrder && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTrackingModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[32px] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black text-on-surface">Hành trình đơn hàng</h3>
                  <p className="text-xs text-secondary font-mono mt-1">{selectedOrder.trackingCode}</p>
                </div>
                <button 
                  onClick={() => setShowTrackingModal(false)}
                  className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-secondary"
                >
                  <Plus className="rotate-45" size={18} />
                </button>
              </div>

              <div className="space-y-6">
                {selectedOrder.deliveryHistory && selectedOrder.deliveryHistory.length > 0 ? (
                  <div className="relative pl-6 space-y-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-container">
                    {selectedOrder.deliveryHistory.map((step, idx) => (
                      <div key={idx} className="relative">
                        <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${idx === 0 ? 'bg-primary' : 'bg-secondary'}`}></div>
                        <p className="text-xs font-black text-on-surface">{step.status}</p>
                        <p className="text-[10px] text-secondary mt-0.5">{step.time} {step.location && `• ${step.location}`}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Truck size={40} className="mx-auto text-secondary opacity-20 mb-4" />
                    <p className="text-sm font-bold text-secondary">Đang cập nhật hành trình từ nhà vận chuyển...</p>
                    <p className="text-[10px] text-secondary mt-1">Lần kiểm tra cuối: {selectedOrder.lastChecked ? new Date(selectedOrder.lastChecked).toLocaleString('vi-VN') : 'Chưa kiểm tra'}</p>
                  </div>
                )}
              </div>

              <button 
                onClick={() => setShowTrackingModal(false)}
                className="w-full mt-8 py-3 bg-on-surface text-white rounded-2xl font-bold text-sm"
              >
                Đóng
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Top Sellers Modal */}
      <AnimatePresence>
        {showTopSellersModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTopSellersModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-surface-container flex justify-between items-center bg-gradient-to-r from-primary/5 to-transparent">
                <div>
                  <h3 className="text-2xl font-black text-on-surface tracking-tight flex items-center gap-2">
                    <Star className="text-primary" size={24} />
                    Báo cáo sản phẩm bán chạy
                  </h3>
                  <p className="text-secondary font-medium mt-1">Xếp hạng Top 7 biến thể sản phẩm</p>
                </div>
                <button 
                  onClick={() => setShowTopSellersModal(false)}
                  className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary hover:bg-primary hover:text-white transition-all"
                >
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              <div className="p-6 bg-surface-container-low flex gap-2">
                {[
                  { id: 'today', label: 'Hôm nay' },
                  { id: '7days', label: '7 ngày qua' },
                  { id: '30days', label: '30 ngày qua' }
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTopSellersTimeframe(t.id as any)}
                    className={`flex-1 py-3 rounded-2xl font-bold transition-all ${
                      topSellersTimeframe === t.id 
                        ? 'bg-primary text-white shadow-lg' 
                        : 'bg-white text-secondary hover:bg-surface-container'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex-grow overflow-y-auto p-8 custom-scrollbar">
                {topSellers.length > 0 ? (
                  <div className="space-y-3">
                    {topSellers.map((product, index) => (
                      <div 
                        key={`${product.sku}_${product.variant}`}
                        className={`flex items-center gap-4 p-4 rounded-3xl border transition-all ${
                          index === 0 
                            ? 'bg-primary/5 border-primary/20 shadow-sm' 
                            : 'bg-white border-surface-container'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg ${
                          index === 0 ? 'bg-primary text-white' : 'bg-surface-container text-secondary'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex-grow">
                          <h4 className="font-bold text-on-surface leading-tight">{product.name} - {product.sku} - {product.variant}</h4>
                          <p className="text-xs text-secondary mt-0.5">Mã SKU: {product.sku} • Màu: {product.variant}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-black text-primary">{product.count}</div>
                          <div className="text-[10px] font-bold text-secondary uppercase tracking-widest">Đơn hàng</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
                    <Package size={64} className="text-secondary mb-4" />
                    <p className="text-lg font-bold text-secondary">Chưa có dữ liệu bán hàng cho mốc thời gian này</p>
                  </div>
                )}
              </div>

              <div className="p-8 bg-surface-container-low border-t border-surface-container flex justify-end">
                <button 
                  onClick={() => setShowTopSellersModal(false)}
                  className="px-8 py-3 bg-on-surface text-white rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Shipping Orders Modal */}
      <AnimatePresence>
        {showShippingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShippingModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-surface-container flex justify-between items-center bg-gradient-to-r from-primary/5 to-transparent">
                <div>
                  <h3 className="text-2xl font-black text-on-surface tracking-tight flex items-center gap-2">
                    <Truck className="text-primary" size={24} />
                    Theo dõi hành trình vận chuyển
                  </h3>
                  <p className="text-secondary font-medium mt-1">Đồng bộ dữ liệu từ print_history (Supabase)</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleRefreshDelivery}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isRefreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                    Làm mới trạng thái
                  </button>
                  <button 
                    onClick={() => setShowShippingModal(false)}
                    className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary hover:bg-primary hover:text-white transition-all"
                  >
                    <Plus className="rotate-45" size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Progress Bar for Batch Update */}
                {isRefreshing && trackingProgress.total > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 p-6 bg-primary/5 rounded-[32px] border border-primary/10 shadow-sm"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin text-primary" />
                        <span className="text-sm font-black text-primary uppercase tracking-tight">Đang quét hành trình hàng loạt...</span>
                      </div>
                      <span className="text-sm font-black text-primary">{trackingProgress.current}/{trackingProgress.total} đơn</span>
                    </div>
                    <div className="w-full h-3 bg-surface-container rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(trackingProgress.current / trackingProgress.total) * 100}%` }}
                        className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                      />
                    </div>
                    <p className="text-[10px] text-secondary mt-3 italic font-medium">Hệ thống đang kiểm tra trạng thái từ nhà vận chuyển (GHN/SPX) với độ trễ 300ms để đảm bảo an toàn.</p>
                  </motion.div>
                )}

                {/* In Transit Section */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-6 bg-primary rounded-full"></div>
                    <h4 className="text-lg font-black text-on-surface uppercase tracking-tight">Đang giao hàng ({shippingCount})</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shippingOrders.filter(o => o.status === 'Giao hàng' || o.status === 'Đang giao' || !o.status).map((order) => (
                      <div 
                        key={order.id} 
                        onClick={() => handleTrackOrder(order)}
                        className="p-5 bg-surface-container-low rounded-3xl border border-surface-container hover:border-primary/30 transition-all group cursor-pointer active:scale-95"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-xs font-black text-primary font-mono">{order.tracking_number}</span>
                          <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase">
                            {(order.tracking_number || '').toUpperCase().startsWith('SPX') || (order.tracking_number || '').toUpperCase().startsWith('SPXVN') ? 'SPX' : (order.carrier || 'GHN')}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-on-surface line-clamp-1 mb-2">{order.product_name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-secondary">
                          <Clock size={12} />
                          <span className="line-clamp-1">Cập nhật: {order.tracking_log?.[0]?.description || order.tracking_log?.[0]?.status || 'Đang chờ lấy hàng...'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Successfully Delivered Section */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-6 bg-success rounded-full"></div>
                    <h4 className="text-lg font-black text-on-surface uppercase tracking-tight">Giao thành công ({successCount})</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shippingOrders.filter(o => o.status === 'Success').map((order) => (
                      <div 
                        key={order.id} 
                        onClick={() => handleTrackOrder(order)}
                        className="p-5 bg-success/5 rounded-3xl border border-success/20 transition-all cursor-pointer hover:bg-success/10 active:scale-95"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-xs font-black text-success font-mono">{order.tracking_number}</span>
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-success/10 text-success rounded-full text-[10px] font-bold uppercase">
                              {(order.tracking_number || '').toUpperCase().startsWith('SPX') || (order.tracking_number || '').toUpperCase().startsWith('SPXVN') ? 'SPX' : (order.carrier || 'GHN')}
                            </span>
                            <CheckCircle2 size={16} className="text-success" />
                          </div>
                        </div>
                        <p className="text-sm font-bold text-on-surface line-clamp-1 mb-2">{order.product_name}</p>
                        <p className="text-[10px] text-success font-bold">Đã giao thành công</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Delivery Issues Section */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-6 bg-error rounded-full"></div>
                    <h4 className="text-lg font-black text-on-surface uppercase tracking-tight">Đơn giao gặp vấn đề ({issueCount})</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shippingOrders.filter(o => o.status === 'Issue').map((order) => (
                      <div 
                        key={order.id} 
                        onClick={() => handleTrackOrder(order)}
                        className="p-5 bg-error/5 rounded-3xl border border-error/20 transition-all cursor-pointer hover:bg-error/10 active:scale-95"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-xs font-black text-error font-mono">{order.tracking_number}</span>
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-error/10 text-error rounded-full text-[10px] font-bold uppercase">
                              {(order.tracking_number || '').toUpperCase().startsWith('SPX') || (order.tracking_number || '').toUpperCase().startsWith('SPXVN') ? 'SPX' : (order.carrier || 'GHN')}
                            </span>
                            <AlertCircle size={16} className="text-error" />
                          </div>
                        </div>
                        <p className="text-sm font-bold text-on-surface line-clamp-1 mb-2">{order.product_name}</p>
                        <p className="text-[10px] text-error font-bold">Vấn đề: {order.tracking_log?.[0]?.status || 'Chuyển hoàn/Hủy'}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Tracking Timeline Modal */}
      <AnimatePresence>
        {selectedShippingOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedShippingOrder(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-surface-container bg-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-on-surface">Chi tiết hành trình</h3>
                  <p className="text-xs text-secondary font-mono mt-1">{selectedShippingOrder.tracking_number}</p>
                </div>
                <button 
                  onClick={() => setSelectedShippingOrder(null)}
                  className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-secondary hover:bg-primary hover:text-white transition-all"
                >
                  <Plus className="rotate-45" size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-white">
                {/* Status Stepper */}
                <div className="flex justify-between items-center mb-12 relative px-4">
                  <div className="absolute top-5 left-12 right-12 h-0.5 bg-surface-container -z-0"></div>
                  
                  {[
                    { label: 'Chờ lấy hàng', icon: Package, active: true },
                    { label: 'Đang vận chuyển', icon: Truck, active: selectedShippingOrder.status !== 'Giao hàng' },
                    { label: 'Đang giao hàng', icon: Truck, active: selectedShippingOrder.status === 'Success' || selectedShippingOrder.status === 'Issue' },
                    { label: 'Đã giao hàng', icon: CheckCircle2, active: selectedShippingOrder.status === 'Success' }
                  ].map((step, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-2 relative z-10">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                        step.active ? 'bg-white border-[#FF4500] text-[#FF4500]' : 'bg-white border-surface-container text-secondary'
                      }`}>
                        <step.icon size={18} />
                      </div>
                      <span className={`text-[10px] font-bold text-center w-20 ${step.active ? 'text-[#FF4500]' : 'text-secondary'}`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Timeline */}
                <div className="space-y-8">
                  {isFetchingTimeline ? (
                    <div className="space-y-6">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="flex gap-4 animate-pulse">
                          <div className="w-24 h-4 bg-surface-container rounded"></div>
                          <div className="flex-1 h-4 bg-surface-container rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : trackingTimeline && trackingTimeline.length > 0 ? (
                    <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-container">
                      {trackingTimeline.map((step, idx) => (
                        <div key={idx} className="relative flex gap-6">
                          <div className={`absolute -left-[29px] top-1.5 w-4 h-4 rounded-full border-4 border-white shadow-sm ${idx === 0 ? 'bg-[#FF4500]' : 'bg-surface-container'}`}></div>
                          <div className="w-24 shrink-0">
                            <p className="text-[10px] font-black text-on-surface">{new Date(step.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                            <p className="text-[9px] text-secondary font-bold">{new Date(step.time).toLocaleDateString('vi-VN')}</p>
                          </div>
                          <div className="flex-1">
                            <p className={`text-xs font-bold leading-relaxed ${idx === 0 ? 'text-[#FF4500]' : 'text-secondary'}`}>
                              {step.status}
                            </p>
                            {step.location && <p className="text-[10px] text-secondary mt-1">{step.location}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <Truck size={40} className="mx-auto text-secondary opacity-20 mb-4" />
                      <p className="text-sm font-bold text-secondary">Không có lịch sử hành trình chi tiết</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-surface-container bg-surface-container-low flex justify-center">
                <p className="text-[10px] text-secondary font-medium">Đăng nhập to see more details.</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
