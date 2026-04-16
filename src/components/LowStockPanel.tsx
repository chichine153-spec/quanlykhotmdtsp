import React from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  PackageSearch, 
  ArrowRight, 
  ShoppingCart,
  Clock,
  ChevronRight,
  Package,
  Filter,
  Info,
  CheckCircle2,
  AlertCircle,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { InventoryService } from '../services/inventoryService';
import { getSupabase } from '../lib/supabase';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { Screen } from '../types';

interface LowStockPanelProps {
  onScreenChange?: (screen: Screen) => void;
}

export default function LowStockPanel({ onScreenChange }: LowStockPanelProps) {
  const { user, role } = useAuth();
  const { inventory, orders, loading: dataLoading, refreshData } = useData();
  const [shippingOrders, setShippingOrders] = React.useState<any[]>([]);
  const [shippingLoading, setShippingLoading] = React.useState(false);
  const [selectedSupplier, setSelectedSupplier] = React.useState<string>('all');
  
  const fetchShippingOrders = React.useCallback(async () => {
    if (!user) return;
    const supabase = getSupabase();
    if (!supabase) return;

    setShippingLoading(true);
    try {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      const tenDaysAgoStr = tenDaysAgo.toISOString();

      const { data, error } = await supabase
        .from('print_history')
        .select('*')
        .eq('user_id', user.uid)
        .gte('created_at', tenDaysAgoStr);

      if (error) throw error;
      setShippingOrders(data || []);
    } catch (err) {
      console.error('Error fetching shipping orders for forecast:', err);
    } finally {
      setShippingLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    fetchShippingOrders();
  }, [fetchShippingOrders]);

  const forecastData = React.useMemo(() => {
    if (!inventory.length || !orders.length || !shippingOrders.length) return [];
    return InventoryService.calculateRestockForecast(orders, inventory, shippingOrders);
  }, [inventory, orders, shippingOrders]);

  // Get unique suppliers
  const suppliers = React.useMemo(() => {
    const s = new Set<string>();
    inventory.forEach(p => {
      if (p.supplier) s.add(p.supplier);
    });
    return Array.from(s).sort();
  }, [inventory]);

  // Filtered data
  const filteredData = React.useMemo(() => {
    if (selectedSupplier === 'all') return forecastData;
    return forecastData.filter(item => item.supplier === selectedSupplier);
  }, [forecastData, selectedSupplier]);

  // Only show for ADMIN
  if (role !== 'admin') return null;

  if (dataLoading || shippingLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-40 bg-surface-container/50 animate-pulse rounded-[2rem]" />
        ))}
      </div>
    );
  }

  const handleRefresh = async () => {
    await refreshData();
    await fetchShippingOrders();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl text-primary">
            <TrendingUp size={20} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-lg font-black text-on-surface tracking-tight uppercase">Dự báo nhập hàng Best-Seller & Low-Stock</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] font-black text-success uppercase tracking-widest">Đã kết nối thời gian thực (Supabase)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Supplier Filter */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-secondary">
              <Filter size={14} />
            </div>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="pl-9 pr-8 py-2 bg-surface-container border border-surface-container rounded-xl text-xs font-bold text-on-surface appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
            >
              <option value="all">Tất cả nhà cung cấp</option>
              {suppliers.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-secondary">
              <ChevronRight size={14} className="rotate-90" />
            </div>
          </div>

          <button 
            onClick={handleRefresh}
            className="p-2 bg-surface-container hover:bg-surface-container-high rounded-xl text-primary transition-all"
            title="Cập nhật dữ liệu"
          >
            <ChevronRight size={20} className="rotate-180" />
          </button>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="glass-morphism rounded-[2rem] p-12 text-center border border-dashed border-surface-container">
          <PackageSearch size={48} className="mx-auto text-secondary opacity-20 mb-4" />
          <p className="text-secondary font-bold mb-2">Không tìm thấy dữ liệu dự báo phù hợp.</p>
          <p className="text-xs text-secondary/60">Hệ thống cần dữ liệu đơn hàng "Success" trong 10 ngày qua hoặc tồn kho thấp.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <div className="overflow-x-auto pb-4">
            <table className="w-full border-separate border-spacing-y-3">
              <thead>
                <tr className="text-[10px] font-black text-secondary uppercase tracking-widest">
                  <th className="px-6 py-2 text-left">Sản phẩm & Xu hướng (10 ngày)</th>
                  <th className="px-4 py-2 text-center">Mức độ</th>
                  <th className="px-4 py-2 text-center">Đã bán (10đ)</th>
                  <th className="px-4 py-2 text-center">Tốc độ bán/ngày</th>
                  <th className="px-4 py-2 text-center">Kho</th>
                  <th className="px-4 py-2 text-center">Đang về</th>
                  <th className="px-4 py-2 text-center">Dự kiến bán (15đ)</th>
                  <th className="px-6 py-2 text-right">Cần nhập</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filteredData.map((item) => (
                    <motion.tr
                      layout
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group glass-morphism rounded-[1.5rem] overflow-hidden hover:bg-white/40 transition-all border border-transparent hover:border-primary/10"
                    >
                      <td className="px-6 py-4 rounded-l-[1.5rem]">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-10 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={item.sparklineData}>
                                <Line 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke={item.priority === 'Nhập gấp' ? '#ef4444' : item.priority === 'Cần chú ý' ? '#f59e0b' : '#3b82f6'} 
                                  strokeWidth={2} 
                                  dot={false} 
                                  isAnimationActive={false}
                                />
                                <YAxis hide domain={['dataMin', 'dataMax']} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-black text-on-surface uppercase tracking-tight truncate">{item.productName}</h4>
                              {item.currentStock === 0 && (
                                <AlertCircle size={14} className="text-error animate-bounce" />
                              )}
                            </div>
                            <p className="text-[9px] font-bold text-secondary opacity-60">SKU: {item.sku} • {item.variant} • {item.supplier}</p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-4 text-center">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                          item.priority === 'Nhập gấp' ? 'bg-error text-white animate-pulse shadow-lg shadow-error/30' : 
                          item.priority === 'Chờ hàng về' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' :
                          item.priority === 'Cần chú ý' ? 'bg-warning/10 text-warning' : 
                          'bg-success/10 text-success'
                        }`}>
                          {item.priority === 'Nhập gấp' ? <AlertCircle size={10} /> : 
                           item.priority === 'Chờ hàng về' ? <Clock size={10} /> :
                           item.priority === 'Cần chú ý' ? <Clock size={10} /> : 
                           <CheckCircle2 size={10} />}
                          {item.priority}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          <p className="text-[8px] font-bold text-secondary">
                            DOI: {typeof item.doi === 'number' ? (item.doi > 99 ? '>99' : item.doi.toFixed(1)) : '0'} ngày
                          </p>
                          {item.doi <= 3 && (
                            <p className="text-[7px] font-black text-error uppercase leading-tight">
                              Hết hàng trong {item.doi.toFixed(1)} ngày tới
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <span className="text-sm font-black text-on-surface">{item.sold10Days}</span>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-black text-primary">{item.avgDailySales.toFixed(1)}</span>
                          <span className="text-[8px] font-bold text-secondary uppercase">Đơn/ngày</span>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className={`text-sm font-black ${item.currentStock === 0 ? 'text-error animate-pulse' : item.currentStock <= 5 ? 'text-warning' : 'text-on-surface'}`}>
                            {item.currentStock}
                          </span>
                          {item.currentStock === 0 && <AlertCircle size={12} className="text-error" />}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <button 
                          onClick={() => onScreenChange?.('intransit')}
                          className={`group/edit flex items-center justify-center gap-1 px-3 py-1 rounded-lg transition-all ${item.inTransit > 0 ? 'bg-blue-50 text-blue-600' : 'hover:bg-surface-container'}`}
                          title="Quản lý hàng đang về"
                        >
                          <span className="text-sm font-black">{item.inTransit}</span>
                          <ArrowRight size={10} className="opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                        </button>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <span className="text-sm font-black text-secondary">{Math.ceil(item.expected15Days)}</span>
                      </td>

                      <td className="px-6 py-4 text-right rounded-r-[1.5rem]">
                        {item.restockQty > 0 ? (
                          <div 
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-black text-xs shadow-lg shadow-primary/20 cursor-help group/tooltip relative"
                            title={`Công thức: (Sức bán 15 ngày [${Math.ceil(item.expected15Days)}] - (Tồn kho [${item.currentStock}] + Đang về [${item.inTransit}]))`}
                          >
                            <ShoppingCart size={14} />
                            <span>+{item.restockQty}</span>
                            
                            {/* Custom Tooltip */}
                            <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-on-surface text-surface text-[9px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl font-medium">
                              Công thức: (Sức bán 15 ngày - (Tồn kho + Đang về))
                              <div className="mt-1 text-primary-container">
                                {Math.ceil(item.expected15Days)} - ({item.currentStock} + {item.inTransit}) = {item.restockQty}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-xl font-black text-xs border border-success/20">
                            <CheckCircle2 size={14} />
                            <span>Đủ hàng</span>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 px-6 py-4 bg-surface-container/30 rounded-2xl border border-surface-container">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-error animate-pulse" />
          <span className="text-[10px] font-bold text-secondary uppercase">Nhập gấp: Kho &lt; 5 & Ra đơn 48h</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[10px] font-bold text-secondary uppercase">Chờ hàng về: Kho &lt; 5 & Đang về &gt; 20</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-warning" />
          <span className="text-[10px] font-bold text-secondary uppercase">Cần chú ý: Kho 5-9</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-primary italic">
          <Info size={12} />
          <span>Lượng cần nhập = Dự kiến bán 15 ngày - (Tồn kho + Đang về)</span>
        </div>
      </div>
    </div>
  );
}



