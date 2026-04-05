import React from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
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
  PieChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './contexts/AuthContext';
import { InventoryService, OrderRecord } from './services/inventoryService';
import { Product } from './types';

export default function Dashboard() {
  const { user, login, error, clearError } = useAuth();
  const [orders, setOrders] = React.useState<OrderRecord[]>([]);
  const [inventory, setInventory] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [showOrderDetails, setShowOrderDetails] = React.useState(false);
  const [showTopSellersModal, setShowTopSellersModal] = React.useState(false);
  const [topSellersTimeframe, setTopSellersTimeframe] = React.useState<'today' | '7days' | '30days'>('today');

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
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Listen to inventory
    const inventoryUnsub = InventoryService.listenToInventory((products) => {
      setInventory(products);
    });

    // Listen to orders
    const ordersUnsub = InventoryService.listenToOrders((allOrders) => {
      setOrders(allOrders);
      setLoading(false);
    });

    return () => {
      inventoryUnsub();
      ordersUnsub();
    };
  }, [user]);

  // Derived stats
  const dailyOrders = React.useMemo(() => {
    return orders.filter(o => o.processedAt.split('T')[0] === selectedDate);
  }, [orders, selectedDate]);

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
          <h2 className="text-2xl font-bold text-on-surface mb-2">Vui lòng đăng nhập</h2>
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
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface font-headline leading-none">Chào mừng trở lại, Admin</h2>
          <p className="text-secondary mt-2 body-md">Hôm nay là một ngày tuyệt vời để tối ưu hóa kho hàng của bạn.</p>
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

      {/* Bento Grid Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {/* Main Summary Stats - Clickable for details */}
        <motion.div 
          variants={item}
          onClick={() => setShowOrderDetails(true)}
          className="md:col-span-2 lg:col-span-2 glass-morphism rounded-3xl p-8 shadow-sm border border-white/10 flex flex-col justify-between cursor-pointer hover:bg-white/40 transition-all group"
        >
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Tổng đơn hàng đã xử lý</span>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                <ChevronRight size={16} />
              </div>
            </div>
            {loading ? (
              <Loader2 className="animate-spin text-primary" size={32} />
            ) : (
              <h3 className="text-5xl font-black text-on-surface font-headline">{dailyOrders.length.toLocaleString()}</h3>
            )}
            <p className="text-secondary mt-2 font-medium">Đơn hàng bóc tách ngày {new Date(selectedDate).toLocaleDateString('vi-VN')}</p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-tertiary font-bold text-sm">
            <TrendingUp size={18} />
            <span>Xem chi tiết danh sách đơn hàng</span>
          </div>
        </motion.div>

        {/* Low Stock Alert - Connected to Inventory */}
        <motion.div 
          variants={item}
          className="glass-morphism rounded-3xl p-8 bg-primary-fixed/30 border border-primary-fixed flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white">
              <AlertTriangle size={24} />
            </div>
            <span className="px-3 py-1 bg-white/80 rounded-full text-[10px] font-bold text-primary">Cảnh báo</span>
          </div>
          <div>
            <h3 className="text-3xl font-black text-on-primary-fixed font-headline mt-6">{lowStockItems.length}</h3>
            <p className="text-on-primary-fixed-variant font-semibold">Sản phẩm sắp hết hàng (&lt;5)</p>
            
            {lowStockItems.length > 0 && (
              <div className="mt-4 space-y-2 max-h-24 overflow-y-auto pr-2 custom-scrollbar">
                {lowStockItems.slice(0, 3).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-[10px] font-bold text-primary bg-white/40 px-2 py-1 rounded-lg">
                    <span className="truncate max-w-[100px]">{p.name}</span>
                    <span>{p.stock} cái</span>
                  </div>
                ))}
                {lowStockItems.length > 3 && (
                  <p className="text-[8px] text-center italic opacity-70">Và {lowStockItems.length - 3} sản phẩm khác...</p>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Total Processed (Shipping) */}
        <motion.div 
          variants={item}
          className="glass-morphism rounded-3xl p-8 shadow-sm border border-white/10 flex flex-col justify-between"
        >
          <div className="w-12 h-12 rounded-2xl bg-tertiary-fixed flex items-center justify-center text-tertiary">
            <Truck size={24} />
          </div>
          <div>
            <h3 className="text-3xl font-black text-on-surface font-headline mt-6">{orders.length.toLocaleString()}</h3>
            <p className="text-secondary font-medium">Đang giao hàng</p>
            <p className="text-[10px] text-secondary mt-1 italic">Tổng đơn đã khấu trừ kho</p>
          </div>
        </motion.div>

        {/* Best Seller Analysis */}
        <motion.div 
          variants={item}
          className="md:col-span-3 lg:col-span-1 lg:row-span-2 glass-morphism rounded-3xl p-6 shadow-sm border border-white/10 overflow-hidden flex flex-col"
        >
          <h3 className="text-lg font-bold text-on-surface mb-6 flex items-center gap-2">
            <Star className="text-orange-600" size={20} />
            Sản phẩm bán chạy
          </h3>
          
          {bestSeller ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-orange-400 p-1 shadow-lg">
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
            className="mt-6 text-orange-600 text-xs font-bold uppercase tracking-widest hover:underline text-center"
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
                              <p className="text-xs text-secondary mt-1">Xử lý lúc: {new Date(order.processedAt).toLocaleTimeString('vi-VN')}</p>
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
              <div className="p-8 border-b border-surface-container flex justify-between items-center bg-gradient-to-r from-orange-50 to-transparent">
                <div>
                  <h3 className="text-2xl font-black text-on-surface tracking-tight flex items-center gap-2">
                    <Star className="text-orange-600" size={24} />
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
                            ? 'bg-orange-50 border-orange-200 shadow-sm' 
                            : 'bg-white border-surface-container'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg ${
                          index === 0 ? 'bg-orange-500 text-white' : 'bg-surface-container text-secondary'
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
    </motion.div>
  );
}
