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
  ArrowRightCircle,
  Star,
  BarChart3,
  PieChart,
  ShieldCheck,
  RefreshCw,
  Clock,
  X,
  Zap,
  Navigation,
  Activity,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { InventoryService, OrderRecord } from './services/inventoryService';
import LowStockPanel from './components/LowStockPanel';
import { getSupabase } from './lib/supabase';
import { Screen } from './types';

interface DashboardProps {
  onScreenChange?: (screen: Screen) => void;
}

export default function Dashboard({ onScreenChange }: DashboardProps) {
  const { user, login, error, clearError, role, expiryDate, isSubscriptionValid } = useAuth();
  const { inventory, orders, problematicOrders, loading: dataLoading, refreshData, quotaExceeded } = useData();
  const [loading, setLoading] = React.useState(false);
  const [selectedOrder, setSelectedOrder] = React.useState<OrderRecord | null>(null);
  const [showTrackingModal, setShowTrackingModal] = React.useState(false);
  const getLocalDateString = (date: Date | string) => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return '';
    }
  };

  const [selectedDate, setSelectedDate] = React.useState(getLocalDateString(new Date()));
  const [showOrderDetails, setShowOrderDetails] = React.useState(false);
  const [showProblematicModal, setShowProblematicModal] = React.useState(false);
  const [showTopSellersModal, setShowTopSellersModal] = React.useState(false);
  const [topSellersTimeframe, setTopSellersTimeframe] = React.useState<'today' | '7days' | '30days'>('today');

  // Get last 10 days in local time
  const last10Days = React.useMemo(() => {
    const dates = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(getLocalDateString(d));
    }
    return dates;
  }, []);

  React.useEffect(() => {
    setLoading(dataLoading);
  }, [dataLoading]);

  // Derived stats with robust local date comparison
  const dailyOrders = React.useMemo(() => {
    return orders.filter(o => {
      if (!o.processedAt) return false;
      return getLocalDateString(o.processedAt) === selectedDate;
    });
  }, [orders, selectedDate]);

  const shippingCount = React.useMemo(() => {
    return dailyOrders.length;
  }, [dailyOrders]);

  const lowStockItems = React.useMemo(() => {
    return InventoryService.getLowStockItems(inventory, 5);
  }, [inventory]);

  const salesByCategory = React.useMemo(() => {
    return InventoryService.getSalesByCategory(dailyOrders, inventory);
  }, [dailyOrders, inventory]);

  const totalItemsToday = React.useMemo(() => {
    return (Object.values(salesByCategory) as number[]).reduce((a, b) => a + b, 0);
  }, [salesByCategory]);

  const netProfitToday = React.useMemo(() => {
    return dailyOrders.reduce((sum, o) => {
      const revenue = Number(o.actualRevenue || o.totalRevenue || 0);
      const cost = Number(o.totalCost || 0);
      const fees = Number(o.platformFee || 0) + Number(o.taxFee || 0) + Number(o.packagingFee || 0);
      return sum + (revenue - cost - fees);
    }, 0);
  }, [dailyOrders]);

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
          <h2 className="text-2xl font-black text-on-surface mb-2 uppercase tracking-tight font-headline">ZENITH OMS - Vui lòng đăng nhập</h2>
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
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-surface-container pb-6 mb-8 group">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/20 group-hover:scale-110 transition-all">
            <Zap size={32} />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-on-surface font-headline leading-tight uppercase">ZENITH OMS - BẢNG ĐIỀU KHIỂN</h2>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-success/10 text-success rounded-full text-[10px] font-black uppercase tracking-widest border border-success/20">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Đã kết nối thời gian thực (Supabase)
              </div>
              <span className="text-[10px] font-bold text-secondary flex items-center gap-1 opacity-60">
                <Clock size={12} />
                Cập nhật lúc: {new Date().toLocaleTimeString('vi-VN')}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={refreshData}
            className="flex items-center gap-2 px-5 py-2.5 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-2xl font-bold text-sm transition-all border border-surface-container shadow-sm"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới dữ liệu</span>
          </button>
        </div>
      </header>

      {quotaExceeded && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 bg-amber-50 border border-amber-200 rounded-3xl flex items-center gap-3 text-amber-800"
        >
          <div className="p-2 bg-amber-100 rounded-xl">
            <AlertCircle size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black uppercase tracking-tight">Hạn mức hệ thống tạm thời hết lượt</p>
            <p className="text-[10px] font-bold opacity-80">Firebase Quota đã đạt giới hạn miễn phí hôm nay. Bạn vẫn có thể xem dữ liệu cũ từ bộ nhớ đệm.</p>
          </div>
          <button 
            onClick={refreshData}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-amber-700 transition-all"
          >
            Thử tải lại
          </button>
        </motion.div>
      )}

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

      {/* Smart Insights & Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Warning */}
        {lowStockItems.length > 0 && (
          <motion.div 
            variants={item}
            className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-[32px] flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg">
                <AlertTriangle size={28} />
              </div>
              <div>
                <h4 className="text-lg font-black text-amber-600 uppercase tracking-tight">Cảnh báo: Tồn kho thấp</h4>
                <p className="text-amber-700/70 text-sm font-medium">Có {lowStockItems.length} sản phẩm sắp hết hàng.</p>
              </div>
            </div>
            <button 
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 text-white rounded-2xl font-black text-xs hover:scale-105 transition-all shadow-lg shadow-amber-600/20"
              onClick={() => onScreenChange?.('inventory')}
            >
              <span>Kiểm bản kho</span>
              <ArrowRightCircle size={16} />
            </button>
          </motion.div>
        )}

        {/* Problematic Orders Alert - Only if exists */}
        {problematicOrders.length > 0 ? (
          <motion.div 
            variants={item}
            className="p-6 bg-error/10 border border-error/20 rounded-[32px] flex items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-error text-white flex items-center justify-center shadow-lg animate-pulse">
                <AlertTriangle size={28} />
              </div>
              <div>
                <h4 className="text-lg font-black text-error uppercase tracking-tight font-headline">Đơn hàng gặp sự cố</h4>
                <p className="text-error/70 text-sm font-medium">{problematicOrders.length} đơn hàng cần xử lý ngay.</p>
              </div>
            </div>
            <button 
              className="flex items-center gap-2 px-6 py-2.5 bg-error text-white rounded-2xl font-black text-xs hover:scale-105 transition-all shadow-lg shadow-error/30"
              onClick={() => setShowProblematicModal(true)}
            >
              <span>Xử lý ngay</span>
              <Navigation size={16} />
            </button>
          </motion.div>
        ) : (
          <motion.div 
            variants={item}
            className="p-6 bg-success/10 border border-success/20 rounded-[32px] flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-success text-white flex items-center justify-center shadow-lg">
                <ShieldCheck size={28} />
              </div>
              <div>
                <h4 className="text-lg font-black text-success uppercase tracking-tight">Hệ thống an toàn</h4>
                <p className="text-success/70 text-sm font-medium">Tất cả vận hành đều đang ở trạng thái tốt.</p>
              </div>
            </div>
            <div className="px-5 py-2.5 bg-success/5 text-success rounded-2xl font-black text-[10px] uppercase tracking-widest border border-success/10">
              Perfect Status
            </div>
          </motion.div>
        )}
      </div>

      {/* Main Stats Summary Bento */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Net Profit Summary */}
        <motion.div 
          variants={item}
          onClick={() => onScreenChange?.('profit')}
          className="glass-morphism rounded-[32px] p-8 shadow-sm border border-white/10 flex flex-col justify-between cursor-pointer hover:bg-white/40 transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden bg-gradient-to-br from-green-500/10 to-transparent"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity text-green-600">
            <TrendingUp size={80} />
          </div>
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-green-600">Lợi nhuận ròng (Tạm tính)</span>
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 group-hover:bg-green-600 group-hover:text-white transition-all">
                <ChevronRight size={16} />
              </div>
            </div>
            <h3 className="text-4xl font-black text-green-700 font-headline">
              {loading ? (
                <Loader2 className="animate-spin text-green-600" size={32} />
              ) : (
                `${netProfitToday.toLocaleString()}đ`
              )}
            </h3>
            <p className="text-secondary mt-2 font-black text-xs uppercase tracking-tight">Hôm nay ({new Date().toLocaleDateString('vi-VN')})</p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-green-600 font-black text-[10px] uppercase tracking-widest bg-green-50 w-fit px-3 py-1 rounded-full border border-green-100">
            <span>Biên: {netProfitToday > 0 ? ((netProfitToday / (dailyOrders.reduce((s, o) => s + (o.actualRevenue || o.totalRevenue || 0), 0) || 1)) * 100).toFixed(1) : '0'}%</span>
            <ArrowUpRight size={14} />
          </div>
        </motion.div>

        {/* Total Processed Today */}
        <motion.div 
          variants={item}
          onClick={() => setShowOrderDetails(true)}
          className="glass-morphism rounded-[32px] p-8 shadow-sm border border-white/10 flex flex-col justify-between cursor-pointer hover:bg-white/40 transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
            <Activity size={80} />
          </div>
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Đơn xử lý (PDF/AI)</span>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                <ChevronRight size={16} />
              </div>
            </div>
            {loading ? (
              <Loader2 className="animate-spin text-primary" size={32} />
            ) : (
              <h3 className="text-5xl font-black text-on-surface font-headline">{dailyOrders.length.toLocaleString()}</h3>
            )}
            <p className="text-secondary mt-2 font-black text-xs uppercase tracking-tight">Hôm nay ({new Date().toLocaleDateString('vi-VN')})</p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest bg-primary/5 w-fit px-3 py-1 rounded-full">
            <span>Live Analysis</span>
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          </div>
        </motion.div>

        {/* Smart Restock Forecast Summary */}
        <motion.div 
          variants={item}
          onClick={() => {
            const el = document.getElementById('forecast-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="glass-morphism rounded-[32px] p-8 shadow-sm border border-white/10 flex flex-col justify-between cursor-pointer hover:bg-white/40 transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
            <TrendingUp size={80} />
          </div>
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Dự báo nhập hàng</span>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                <ChevronRight size={16} />
              </div>
            </div>
            <h3 className="text-4xl font-black text-on-surface font-headline uppercase leading-none">Smart Forecast</h3>
            <p className="text-secondary mt-2 font-black text-xs uppercase tracking-tight">Best-seller & Low-stock</p>
          </div>
          <div className="mt-8 flex items-center gap-2">
            <div className="flex -space-x-2">
              {inventory.filter(p => p.stock < 5).slice(0, 3).map((p, i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-surface-container border-2 border-white flex items-center justify-center text-[10px] font-black text-primary">
                  {p.sku.slice(0, 2)}
                </div>
              ))}
              {inventory.filter(p => p.stock < 5).length > 3 && (
                <div className="w-8 h-8 rounded-full bg-primary text-white border-2 border-white flex items-center justify-center text-[10px] font-black">
                  +{inventory.filter(p => p.stock < 5).length - 3}
                </div>
              )}
            </div>
            <span className="text-[10px] font-bold text-secondary">Cần nhập sớm</span>
          </div>
        </motion.div>

        {/* Total Successful Sales */}
        <motion.div 
          variants={item}
          className="glass-morphism rounded-[32px] p-8 shadow-sm border border-white/10 flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="absolute top-[-20px] left-[-20px] w-40 h-40 bg-gradient-to-br from-tertiary/10 to-transparent rounded-full blur-3xl group-hover:scale-150 transition-all" />
          <div className="flex justify-between items-start z-10">
            <div className="w-12 h-12 rounded-2xl bg-tertiary-fixed flex items-center justify-center text-tertiary shadow-lg shadow-tertiary/20">
              <Sparkles size={24} />
            </div>
            <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest">Sức bán</span>
          </div>
          <div className="z-10">
            <h3 className="text-4xl font-black text-on-surface font-headline mt-6">{totalItemsToday.toLocaleString()}</h3>
            <p className="text-secondary font-black text-xs uppercase tracking-tight">Vật phẩm đã xuất kho</p>
          </div>
        </motion.div>

        {/* Best Seller Featured */}
        <motion.div 
          variants={item}
          className="md:col-span-2 lg:col-span-2 glass-morphism rounded-[32px] p-8 shadow-sm border border-white/10 overflow-hidden group"
        >
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                <Star className="fill-primary" size={16} />
                Sản phẩm nổi bật (Best Seller)
              </h3>
              <button 
                onClick={() => setShowTopSellersModal(true)}
                className="text-[10px] font-black text-secondary hover:text-primary transition-colors underline underline-offset-4"
              >
                XEM TẤT CẢ
              </button>
            </div>
            
            {bestSeller ? (
              <div className="flex items-center gap-8">
                <div className="relative">
                  <div className="w-28 h-28 rounded-3xl bg-surface-container flex items-center justify-center border-2 border-white shadow-xl relative z-10">
                    <Package size={48} className="text-primary" />
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-black text-xs shadow-lg group-hover:scale-110 transition-all">
                      {bestSeller.count}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-110 -z-10 animate-pulse" />
                </div>
                
                <div className="space-y-3 flex-1">
                  <div>
                    <h4 className="text-2xl font-black text-on-surface leading-tight font-headline uppercase">{bestSeller.name}</h4>
                    <p className="text-sm font-bold text-secondary">{bestSeller.variant} • SKU: {bestSeller.sku}</p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Hiệu suất 24h</span>
                      <div className="flex items-center gap-1.5 text-success font-black text-lg">
                        <TrendingUp size={18} />
                        <span>+{Math.round(bestSeller.count / 2)} đơn/ngày</span>
                      </div>
                    </div>
                    <div className="w-px h-8 bg-surface-container" />
                    <button 
                      onClick={() => {
                        const el = document.getElementById('forecast-section');
                        el?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                    >
                      Dự báo kho tiếp theo
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 opacity-40">
                <Package size={40} className="text-secondary mb-3" />
                <p className="text-sm font-bold text-secondary uppercase tracking-widest">Chưa có dữ liệu giao dịch</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Smart Category & Stock Analysis Visualizer */}
      <motion.div 
        variants={item}
        className="glass-morphism rounded-[40px] p-10 shadow-sm border border-white/10 min-h-[450px] flex flex-col relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <BarChart3 size={200} />
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-12 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg">
                <PieChart size={24} />
              </div>
              <h3 className="text-2xl font-black text-on-surface font-headline uppercase leading-none">Phân tích danh mục</h3>
            </div>
            <p className="text-secondary body-md">Bóc tách dữ liệu bán ra từ PDF vs. Tồn kho thực tế (Supabase)</p>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <div className="bg-white/50 backdrop-blur-md p-4 rounded-3xl border border-white/20 shadow-sm min-w-[150px] relative overflow-hidden">
              <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">Cốc giữ nhiệt</p>
              <div className="flex items-end justify-between gap-4">
                <span className="text-2xl font-black text-primary">{salesByCategory['Cốc giữ nhiệt']}</span>
                <span className="text-[10px] font-bold text-secondary pb-1">Đã bán</span>
              </div>
              <div className={`mt-2 px-2 py-1 rounded-lg text-[9px] font-black flex items-center gap-1 w-fit ${
                inventory.filter(p => (p.category || '').toLowerCase().includes('cốc') || (p.name || '').toLowerCase().includes('cốc')).reduce((acc, p) => acc + (p.stock || 0), 0) < 500 
                ? 'bg-error text-white animate-pulse' 
                : 'bg-success/10 text-success'
              }`}>
                <Package size={10} />
                Tồn: {inventory.filter(p => (p.category || '').toLowerCase().includes('cốc') || (p.name || '').toLowerCase().includes('cốc')).reduce((acc, p) => acc + (p.stock || 0), 0).toLocaleString()}
              </div>
            </div>
            
            <div className="bg-white/50 backdrop-blur-md p-4 rounded-3xl border border-white/20 shadow-sm min-w-[150px] relative overflow-hidden">
              <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">Bình giữ nhiệt</p>
              <div className="flex items-end justify-between gap-4">
                <span className="text-2xl font-black text-tertiary">{salesByCategory['Bình giữ nhiệt']}</span>
                <span className="text-[10px] font-bold text-secondary pb-1">Đã bán</span>
              </div>
              <div className={`mt-2 px-2 py-1 rounded-lg text-[9px] font-black flex items-center gap-1 w-fit ${
                inventory.filter(p => (p.category || '').toLowerCase().includes('bình') || (p.name || '').toLowerCase().includes('bình')).reduce((acc, p) => acc + (p.stock || 0), 0) < 500 
                ? 'bg-error text-white animate-pulse' 
                : 'bg-success/10 text-success'
              }`}>
                <Package size={10} />
                Tồn: {inventory.filter(p => (p.category || '').toLowerCase().includes('bình') || (p.name || '').toLowerCase().includes('bình')).reduce((acc, p) => acc + (p.stock || 0), 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10 items-end">
          {/* Cốc giữ nhiệt Bar Group */}
          <div className="space-y-6">
            <div className="relative flex items-end justify-center h-56 gap-2">
              <div className="w-16 bg-surface-container rounded-2xl overflow-hidden h-full shadow-inner relative">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.min(100, (salesByCategory['Cốc giữ nhiệt'] / (totalItemsToday || 1)) * 100)}%` }}
                  className="absolute bottom-0 left-0 right-0 bg-primary flex items-start justify-center pt-3"
                >
                  <span className="text-xs font-black text-white">{salesByCategory['Cốc giữ nhiệt']}</span>
                </motion.div>
              </div>
              <div className="w-6 bg-surface-container/30 rounded-full h-full relative group">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: '70%' }}
                  className="absolute bottom-0 left-0 right-0 bg-primary/20 rounded-full transition-all group-hover:bg-primary/40"
                />
              </div>
            </div>
            <div className="text-center">
              <h4 className="text-sm font-black text-on-surface uppercase tracking-tight">Cốc giữ nhiệt</h4>
              <p className="text-[10px] font-bold text-primary mt-1">Xu hướng: TĂNG TRƯỞNG</p>
            </div>
          </div>

          {/* Bình giữ nhiệt Bar Group */}
          <div className="space-y-6">
            <div className="relative flex items-end justify-center h-56 gap-2">
              <div className="w-16 bg-surface-container rounded-2xl overflow-hidden h-full shadow-inner relative">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.min(100, (salesByCategory['Bình giữ nhiệt'] / (totalItemsToday || 1)) * 100)}%` }}
                  className="absolute bottom-0 left-0 right-0 bg-tertiary flex items-start justify-center pt-3"
                >
                  <span className="text-xs font-black text-white">{salesByCategory['Bình giữ nhiệt']}</span>
                </motion.div>
              </div>
              <div className="w-6 bg-surface-container/30 rounded-full h-full relative group">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: '40%' }}
                  className="absolute bottom-0 left-0 right-0 bg-tertiary/20 rounded-full transition-all group-hover:bg-tertiary/40"
                />
              </div>
            </div>
            <div className="text-center">
              <h4 className="text-sm font-black text-on-surface uppercase tracking-tight">Bình giữ nhiệt</h4>
              <p className="text-[10px] font-bold text-tertiary mt-1">Xu hướng:ỔN ĐỊNH</p>
            </div>
          </div>

          {/* Khác Bar Group */}
          <div className="space-y-6">
            <div className="relative flex items-end justify-center h-56 gap-2">
              <div className="w-16 bg-surface-container rounded-2xl overflow-hidden h-full shadow-inner relative">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.min(100, (salesByCategory['Khác'] / (totalItemsToday || 1)) * 100)}%` }}
                  className="absolute bottom-0 left-0 right-0 bg-secondary flex items-start justify-center pt-3"
                >
                  <span className="text-xs font-black text-white">{salesByCategory['Khác']}</span>
                </motion.div>
              </div>
              <div className="w-6 bg-surface-container/30 rounded-full h-full relative group">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: '15%' }}
                  className="absolute bottom-0 left-0 right-0 bg-secondary/20 rounded-full transition-all group-hover:bg-secondary/40"
                />
              </div>
            </div>
            <div className="text-center">
              <h4 className="text-sm font-black text-on-surface uppercase tracking-tight">Danh mục khác</h4>
              <p className="text-[10px] font-bold text-secondary mt-1">Xu hướng: ĐI NGANG</p>
            </div>
          </div>
        </div>

        <div className="mt-12 p-6 bg-primary/5 rounded-[2rem] border border-primary/10 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Navigation size={24} />
            </div>
            <div>
              <h5 className="font-black text-on-surface uppercase tracking-tight">Sẵn sàng điều phối kho hàng?</h5>
              <p className="text-xs text-secondary font-medium">Báo cáo bóc tách PDF giúp bạn nắm bắt 95% dòng chảy sản phẩm.</p>
            </div>
          </div>
          <button 
            onClick={() => onScreenChange?.('upload')}
            className="px-8 py-3 bg-on-surface text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-110 active:scale-95 transition-all shadow-xl"
          >
            Tải lên đơn hàng mới
          </button>
        </div>
      </motion.div>

      {/* Smart Restock Forecast Section */}
      <motion.div variants={item} id="forecast-section">
        <LowStockPanel onScreenChange={onScreenChange} />
      </motion.div>

      {/* Order Details Modal */}
      <AnimatePresence>
        {showOrderDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 no-print">
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
                            {Array.isArray(order.items) && order.items.map((item, idx) => (
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 no-print">
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 no-print">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 no-print">
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
                        <div className="text-right flex flex-col items-end gap-2">
                          <div>
                            <div className="text-lg font-black text-primary">{product.count}</div>
                            <div className="text-[10px] font-bold text-secondary uppercase tracking-widest">Đơn hàng</div>
                          </div>
                          <button 
                            onClick={() => {
                              setShowTopSellersModal(false);
                              setTimeout(() => {
                                const element = document.getElementById('forecast-section');
                                element?.scrollIntoView({ behavior: 'smooth' });
                              }, 300);
                            }}
                            className="px-3 py-1 bg-primary text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-primary-dark transition-all"
                          >
                            Dự báo nhập
                          </button>
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
    </motion.div>
  );
}
