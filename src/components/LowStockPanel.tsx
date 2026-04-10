import React from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  PackageSearch, 
  ArrowRight, 
  ShoppingCart,
  Clock,
  ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ForecastItem {
  id: string;
  product_name: string;
  sku: string;
  stock_quantity: number;
  daily_velocity: number;
  days_until_empty: number;
  suggested_restock_qty: number;
}

export default function LowStockPanel() {
  const { user } = useAuth();
  const [data, setData] = React.useState<ForecastItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchData = async () => {
    if (!user) return;
    const supabase = getSupabase();
    if (!supabase) return;

    setLoading(true);
    try {
      // Sử dụng view restock_forecast đã tạo ở bước trước
      // View này đã tính toán: daily_velocity (10 ngày), days_until_empty, suggested_restock_qty
      const { data: forecastData, error } = await supabase
        .from('restock_forecast')
        .select('*')
        .eq('user_id', user.uid)
        .order('days_until_empty', { ascending: true });

      if (error) throw error;
      
      // Lọc các sản phẩm có tốc độ bán hoặc tồn kho thấp
      setData(forecastData?.filter(item => item.daily_velocity > 0 || item.stock_quantity < 10) || []);
    } catch (err) {
      console.error('Error fetching forecast:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-40 bg-surface-container/50 animate-pulse rounded-[2rem]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl text-primary">
            <TrendingUp size={20} />
          </div>
          <h3 className="text-lg font-black text-on-surface tracking-tight uppercase">Dự báo nhập hàng thông minh</h3>
        </div>
        <button 
          onClick={fetchData}
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          Cập nhật dự báo <ChevronRight size={14} />
        </button>
      </div>

      {data.length === 0 ? (
        <div className="glass-morphism rounded-[2rem] p-12 text-center border border-dashed border-surface-container">
          <PackageSearch size={48} className="mx-auto text-secondary opacity-20 mb-4" />
          <p className="text-secondary font-bold">Chưa có đủ dữ liệu bán hàng để tính toán vận tốc.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.map((item) => {
            const isUrgent = item.days_until_empty < 3;
            const days = Math.round(item.days_until_empty);
            
            return (
              <motion.div
                key={item.id}
                whileHover={{ y: -5 }}
                className={`glass-morphism rounded-[2rem] p-5 border transition-all flex flex-col justify-between ${
                  isUrgent ? 'border-error/30 bg-error/5 shadow-lg shadow-error/5' : 'border-surface-container'
                }`}
              >
                <div className="space-y-1 mb-4">
                  <div className="flex justify-between items-start">
                    <h4 className="font-black text-on-surface line-clamp-1 text-xs uppercase tracking-tight">{item.product_name}</h4>
                    {isUrgent && <AlertTriangle size={14} className="text-error animate-pulse" />}
                  </div>
                  <p className="text-[9px] font-bold text-secondary opacity-60">SKU: {item.sku || 'N/A'}</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div className="space-y-0.5">
                      <p className="text-[8px] font-black text-secondary uppercase">Tồn kho</p>
                      <p className="text-xl font-black text-on-surface">{item.stock_quantity}</p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <p className="text-[8px] font-black text-secondary uppercase">Vận tốc</p>
                      <p className="text-sm font-bold text-primary">{item.daily_velocity.toFixed(1)}/ngày</p>
                    </div>
                  </div>

                  <div className={`px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-2 ${
                    isUrgent ? 'bg-error/10 text-error border border-error/20' : 'bg-surface-container text-secondary'
                  }`}>
                    <Clock size={12} />
                    <span>Dự kiến hết sau {days > 99 ? '>99' : days} ngày</span>
                  </div>

                  {item.suggested_restock_qty > 0 && (
                    <div className="space-y-2">
                      <div className="px-3 py-2 bg-primary text-white rounded-xl font-black text-[10px] flex items-center justify-between shadow-md">
                        <div className="flex items-center gap-1.5">
                          <ShoppingCart size={12} />
                          <span>Gợi ý nhập: +{item.suggested_restock_qty}</span>
                        </div>
                        <ArrowRight size={12} />
                      </div>
                      <p className="text-[8px] text-error font-bold italic px-1">
                        * Mẹo: Cần nhập = (Tốc độ bán × 15) - Tồn kho
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
