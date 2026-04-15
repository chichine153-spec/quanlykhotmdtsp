import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieChartIcon, 
  BarChart as BarChartIcon, 
  Settings, 
  Save, 
  Loader2, 
  AlertCircle,
  Package,
  ShoppingCart,
  ArrowRight,
  ChevronRight,
  Plus,
  Minus,
  RefreshCw,
  Clock,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { ProfitService } from './services/profitService';
import { InventoryService, OrderRecord } from './services/inventoryService';
import { ProfitConfig, ReturnRecord } from './types';
import FinanceSettings from './components/FinanceSettings';

const TIME_TABS = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' }
];

const COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'];

export default function ProfitDashboard() {
  const { user } = useAuth();
  const { orders, returns, config: globalConfig, loading: dataLoading, refreshData, lastUpdated } = useData();
  const [activeTab, setActiveTab] = React.useState<'today' | 'week' | 'month'>('today');
  const [config, setConfig] = React.useState<ProfitConfig>({
    platformFeePercent: 12,
    platformFeeCup: 25,
    platformFeeBottle: 20,
    taxPercent: 1.5,
    packagingCostBottle: 6000,
    packagingCostCup: 8000,
    marketingCost: 0,
    otherCosts: 0,
    cutoffHour: 15,
    dailyMarketingCosts: {},
    lastUpdated: new Date().toISOString()
  });
  const [loading, setLoading] = React.useState(true);
  const [showConfig, setShowConfig] = React.useState(false);

  React.useEffect(() => {
    if (globalConfig) setConfig(globalConfig);
  }, [globalConfig]);

  React.useEffect(() => {
    setLoading(dataLoading);
  }, [dataLoading]);

  // No local listeners needed anymore, using global data from DataContext
  /*
  React.useEffect(() => {
    if (!user) return;

    const unsubConfig = ProfitService.listenToConfig(user.uid, (data) => {
      if (data) setConfig(data);
    });

    const unsubOrders = InventoryService.listenToOrders(user.uid, (data) => {
      setOrders(data);
    });

    const unsubReturns = ProfitService.listenToReturns(user.uid, (data) => {
      setReturns(data);
      setLoading(false);
    });

    return () => {
      unsubConfig();
      unsubOrders();
      unsubReturns();
    };
  }, [user]);
  */

  const stats = ProfitService.calculateProfitStats(orders, returns, config, activeTab);

  const chartData = [
    { name: 'Doanh thu', value: stats.revenue, fill: '#22c55e' },
    { name: 'Chi phí', value: stats.totalCosts, fill: '#ef4444' }
  ];

  const pieData = [
    { name: 'Giá vốn', value: stats.costOfGoods },
    { name: 'Phí sàn', value: stats.platformFees },
    { name: 'Thuế (1.5%)', value: stats.taxFees },
    { name: 'Đóng gói', value: stats.packagingFees },
    { name: 'Marketing', value: stats.marketingFees },
    { name: 'Khác', value: stats.otherFees }
  ].filter(d => d.value > 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-primary" size={48} />
        <p className="font-bold text-secondary">Đang tải báo cáo lợi nhuận...</p>
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
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2">Phân tích lợi nhuận</h1>
          <div className="flex items-center gap-2">
            <p className="text-secondary font-medium">Báo cáo doanh thu, chi phí và lợi nhuận thực tế.</p>
            {lastUpdated && (
              <span className="text-[10px] bg-surface-container px-2 py-0.5 rounded-full text-secondary font-mono">
                Cập nhật: {lastUpdated.toLocaleTimeString('vi-VN')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={refreshData}
            disabled={dataLoading}
            className="p-3 rounded-2xl bg-surface-container-lowest border border-surface-container text-secondary hover:bg-surface-container transition-all disabled:opacity-50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw size={20} className={dataLoading ? 'animate-spin' : ''} />
          </button>
          <div className="bg-surface-container-low p-1 rounded-2xl flex gap-1">
            {TIME_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === tab.id 
                    ? 'bg-white text-primary shadow-sm' 
                    : 'text-secondary hover:text-on-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setShowConfig(true)}
            className="p-3 rounded-2xl bg-surface-container-lowest border border-surface-container text-secondary hover:bg-surface-container transition-all"
          >
            <Settings size={24} />
          </button>
        </div>
      </header>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-surface-container flex flex-col gap-4">
          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center text-green-600">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Doanh thu thực tế</p>
            <p className="text-3xl font-black text-on-surface">{stats.revenue.toLocaleString()}đ</p>
            <p className="text-xs text-secondary mt-1">Từ {stats.orderCount} đơn hàng</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-surface-container flex flex-col gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-red-600">
            <TrendingDown size={24} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Tổng chi phí</p>
            <p className="text-3xl font-black text-on-surface">{stats.totalCosts.toLocaleString()}đ</p>
            <p className="text-xs text-secondary mt-1">Tỷ lệ: {stats.revenue > 0 ? ((stats.totalCosts / stats.revenue) * 100).toFixed(1) : 0}%</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-3xl shadow-xl shadow-green-100 flex flex-col gap-4 text-white">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/80 font-bold mb-1">Lợi nhuận ròng</p>
            <p className="text-3xl font-black">{stats.netProfit.toLocaleString()}đ</p>
            <p className="text-xs text-white/80 mt-1">Biên lợi nhuận: {stats.revenue > 0 ? ((stats.netProfit / stats.revenue) * 100).toFixed(1) : 0}%</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-surface-container flex flex-col gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <RefreshCw size={24} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Hàng hoàn / Lỗi</p>
            <p className="text-3xl font-black text-on-surface">{stats.returnCount} đơn</p>
            <p className="text-xs text-secondary mt-1">Đã khấu trừ khỏi doanh thu</p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-surface-container">
          <div className="flex items-center gap-3 mb-8">
            <BarChartIcon className="text-primary" size={20} />
            <h3 className="text-xl font-bold text-on-surface tracking-tight">So sánh Doanh thu & Chi phí</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600 }} tickFormatter={(value) => `${((value || 0) / 1000000).toFixed(1)}M`} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value.toLocaleString()}đ`, '']}
                />
                <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={60}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-surface-container">
          <div className="flex items-center gap-3 mb-8">
            <PieChartIcon className="text-primary" size={20} />
            <h3 className="text-xl font-bold text-on-surface tracking-tight">Cơ cấu Chi phí</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value.toLocaleString()}đ`, '']}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Products Section */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-surface-container overflow-hidden">
        <div className="p-8 border-b border-surface-container flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="text-primary" size={20} />
            <h3 className="text-xl font-bold text-on-surface tracking-tight">Top 5 sản phẩm lợi nhuận cao nhất</h3>
          </div>
          <span className="text-xs font-bold text-secondary uppercase tracking-widest">Sắp xếp theo Lợi nhuận</span>
        </div>
        <div className="divide-y divide-surface-container">
          {stats.topProducts.length === 0 ? (
            <div className="p-20 text-center text-secondary">
              <ShoppingCart size={48} className="mx-auto mb-4 opacity-20" />
              <p className="font-bold">Chưa có dữ liệu bán hàng để phân tích.</p>
            </div>
          ) : (
            stats.topProducts.map((product, index) => (
              <div key={index} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-primary font-black text-xl">
                    {index + 1}
                  </div>
                  <div>
                    <h4 className="font-bold text-on-surface group-hover:text-primary transition-colors">{product.name}</h4>
                    <p className="text-xs text-secondary">
                      Phân loại: {product.variant || 'Mặc định'} | 
                      Đã bán: <span className="font-bold text-on-surface">{product.count}</span> | 
                      Phí sàn: <span className="font-bold text-primary">{product.feePercent}%</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-green-600">+{product.profit.toLocaleString()}đ</p>
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Lợi nhuận gộp</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-surface-container overflow-hidden">
        <div className="p-8 border-b border-surface-container flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="text-primary" size={20} />
            <h3 className="text-xl font-bold text-on-surface tracking-tight">Đơn hàng gần đây</h3>
          </div>
          <span className="text-xs font-bold text-secondary uppercase tracking-widest">Hiển thị phí sàn & thuế</span>
        </div>
        <div className="divide-y divide-surface-container">
          {orders.length === 0 ? (
            <div className="p-20 text-center text-secondary">
              <Package size={48} className="mx-auto mb-4 opacity-20" />
              <p className="font-bold">Chưa có đơn hàng nào được xử lý.</p>
            </div>
          ) : (
            orders
              .filter(o => {
                const cutoffHour = config.cutoffHour ?? 15;
                const now = new Date();
                
                if (activeTab === 'today') {
                  const { start, end } = ProfitService.getSessionBounds(now, cutoffHour);
                  const orderDate = new Date(o.processedAt);
                  return orderDate >= start && orderDate < end;
                } else if (activeTab === 'week') {
                  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                  return new Date(o.processedAt) >= startDate;
                } else {
                  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                  return new Date(o.processedAt) >= startDate;
                }
              })
              .sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime())
              .slice(0, 10)
              .map((order, index) => (
                <div key={index} className="p-6 flex flex-col md:flex-row md:items-center justify-between hover:bg-slate-50 transition-colors gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-secondary">
                      <ShoppingCart size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-on-surface">{order.trackingCode}</h4>
                      <p className="text-xs text-secondary">
                        {new Date(order.processedAt).toLocaleString('vi-VN')} | 
                        {order.items.length} sản phẩm
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-6 text-right">
                    <div>
                      <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">Doanh thu</p>
                      <p className="font-black text-on-surface">{(order.totalRevenue || 0).toLocaleString()}đ</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">Phí sàn</p>
                      <p className="font-black text-primary">
                        {(order.platformFee || 0).toLocaleString()}đ
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">Thuế</p>
                      <p className="font-black text-amber-600">
                        {(order.taxFee || 0).toLocaleString()}đ
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">Lợi nhuận</p>
                      <p className="font-black text-green-600">
                        {((order.totalRevenue || 0) - (order.totalCost || 0) - (order.platformFee || 0) - (order.taxFee || 0) - (order.packagingFee || 0)).toLocaleString()}đ
                      </p>
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Config Modal */}
      <AnimatePresence>
        {showConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-surface-container"
            >
              <div className="p-8 border-b border-surface-container flex items-center justify-between bg-surface-container-low/50">
                <div>
                  <h2 className="text-2xl font-bold text-on-surface tracking-tight">Cấu hình Chi phí</h2>
                  <p className="text-secondary text-sm">Thiết lập các loại phí để tính lợi nhuận chính xác.</p>
                </div>
                <button 
                  onClick={() => setShowConfig(false)}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8">
                <FinanceSettings 
                  initialConfig={config} 
                  onClose={() => setShowConfig(false)} 
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
