import React from 'react';
import { 
  Users, 
  ShieldCheck, 
  Zap, 
  AlertTriangle, 
  Settings, 
  RefreshCw,
  Bell,
  Sliders,
  DollarSign,
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './contexts/AuthContext';
import { AdminService, ShopStats } from './services/adminService';
import { logErrorToSupabase } from './lib/error-logging';

export default function SuperAdminDashboard() {
  const { user, role } = useAuth();
  const [shops, setShops] = React.useState<ShopStats[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [globalConfig, setGlobalConfig] = React.useState<any>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'active' | 'error'>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [shopsData, configData] = await Promise.all([
        AdminService.getAllShops(),
        AdminService.getGlobalConfig()
      ]);
      setShops(shopsData);
      setGlobalConfig(configData || {});
    } catch (err: any) {
      console.error('Fetch shops error:', err);
      logErrorToSupabase(err, 'admin_dashboard', user?.uid);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (role === 'super_admin') {
      fetchData();
    }
  }, [role]);

  if (role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck size={40} />
          </div>
          <h1 className="text-2xl font-black text-on-surface uppercase">Truy cập bị từ chối</h1>
          <p className="text-secondary max-w-sm">Chỉ duy nhất Super Admin mới có quyền truy cập vào khu vực quản trị tối cao này.</p>
        </div>
      </div>
    );
  }

  const handleUpdateGlobal = async (key: string, value: any) => {
    setIsUpdating(true);
    try {
      await AdminService.updateGlobalConfig({ [key]: value, updatedBy: user?.email });
      setGlobalConfig((prev: any) => ({ ...prev, [key]: value }));
    } catch (err) {
      console.error('Update global error:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateShop = async (uid: string, key: string, value: any) => {
    try {
      await AdminService.updateShopConfig(uid, { [key]: value });
      setShops(prev => prev.map(s => s.uid === uid ? { ...s, [key]: value } as any : s));
    } catch (err) {
      console.error('Update shop error:', err);
    }
  };

  const filteredShops = shops.filter(s => {
    const matchesSearch = s.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'active' && s.status === 'active') || (filter === 'error' && s.errorCount > 0);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-8 pb-20 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-line pb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-on-surface uppercase font-headline">Zenith Super Admin</h1>
          <p className="text-secondary font-mono text-xs uppercase tracking-widest mt-1">Hệ thống giám sát & Điều phối API dự phòng</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchData}
            disabled={loading}
            className="p-3 bg-surface border border-line rounded-2xl hover:bg-on-surface hover:text-surface transition-all disabled:opacity-50"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="bg-primary-fixed/20 text-primary px-6 py-3 rounded-2xl font-black flex items-center gap-2">
            <Users size={20} />
            <span>{shops.length} SHOPS</span>
          </div>
        </div>
      </section>

      {/* Quick Configs */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white border border-line rounded-[2rem] space-y-4">
          <div className="flex items-center gap-3 text-primary">
            <Sliders size={20} />
            <h3 className="font-black uppercase text-xs tracking-widest">Tốc độ bán hàng mặc định</h3>
          </div>
          <input 
            type="number"
            value={globalConfig?.defaultSalesVelocity || 0}
            onChange={(e) => handleUpdateGlobal('defaultSalesVelocity', Number(e.target.value))}
            className="w-full p-4 bg-primary/5 border-2 border-transparent focus:border-primary rounded-2xl outline-none font-bold text-xl"
          />
        </div>
        <div className="p-6 bg-white border border-line rounded-[2rem] space-y-4">
          <div className="flex items-center gap-3 text-secondary">
            <DollarSign size={20} />
            <h3 className="font-black uppercase text-xs tracking-widest">Phí sàn Shop mặc định (%)</h3>
          </div>
          <input 
            type="number"
            value={globalConfig?.defaultFloorFee || 0}
            onChange={(e) => handleUpdateGlobal('defaultFloorFee', Number(e.target.value))}
            className="w-full p-4 bg-secondary/5 border-2 border-transparent focus:border-secondary rounded-2xl outline-none font-bold text-xl"
          />
        </div>
        <div className="p-6 bg-white border border-line rounded-[2rem] space-y-4">
          <div className="flex items-center gap-3 text-error">
            <Zap size={20} />
            <h3 className="font-black uppercase text-xs tracking-widest">Hệ thống khóa API Dự phòng</h3>
          </div>
          <input 
            type="password"
            placeholder="Super Admin Gemini API Key..."
            value={globalConfig?.fallbackGeminiApiKey || ''}
            onChange={(e) => handleUpdateGlobal('fallbackGeminiApiKey', e.target.value)}
            className="w-full p-4 bg-error/5 border-2 border-transparent focus:border-error rounded-2xl outline-none font-bold text-sm"
          />
        </div>
      </section>

      {/* Main Table */}
      <section className="bg-white border border-line rounded-[2.5rem] overflow-hidden">
        <div className="p-8 border-b border-line flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative flex-grow max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary" size={20} />
            <input 
              type="text"
              placeholder="Tìm kiếm Shop (email)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-surface border border-line rounded-2xl outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2 p-1 bg-surface rounded-2xl border border-line">
            {(['all', 'active', 'error'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === t ? 'bg-on-surface text-surface' : 'text-secondary hover:text-on-surface'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface">
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-secondary italic">Shop/Email</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-secondary italic">Trạng thái API</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-secondary italic">Gói/Giới hạn</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-secondary italic">Dự phòng</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-secondary italic">Lỗi hệ thống</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-secondary italic text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredShops.map((shop) => (
                <tr key={shop.uid} className="hover:bg-primary/5 transition-all group">
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="font-black text-on-surface text-sm uppercase tracking-tight">{shop.email.split('@')[0]}</span>
                      <span className="text-[10px] font-mono text-secondary">{shop.email}</span>
                      <span className={`text-[8px] font-black mt-1 px-1.5 py-0.5 rounded inline-block w-fit ${shop.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {shop.status.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${shop.apiStatus === 'active' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className="text-[10px] font-black uppercase tracking-tighter">
                        {shop.apiStatus === 'active' ? 'Hoạt động' : 'Lỗi/Hết hạn'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-black text-secondary">
                        <span>{shop.planType.toUpperCase()}</span>
                        <span>{shop.dailyOrderCount}/{shop.orderLimit}</span>
                      </div>
                      <div className="h-1.5 w-32 bg-surface rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${shop.dailyOrderCount >= shop.orderLimit ? 'bg-error' : 'bg-primary'}`}
                          style={{ width: `${Math.min((shop.dailyOrderCount / shop.orderLimit) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                     <button
                        onClick={() => handleUpdateShop(shop.uid, 'failoverEnabled', !shop.failoverEnabled)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${shop.failoverEnabled ? 'bg-primary text-white' : 'bg-surface text-secondary'}`}
                      >
                        {shop.failoverEnabled ? 'ON' : 'OFF'}
                      </button>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] ${shop.errorCount > 0 ? 'bg-error/10 text-error' : 'bg-green-50 text-green-700'}`}>
                        {shop.errorCount > 0 ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                        {shop.errorCount} LỖI
                      </div>
                      {shop.lastLog && (
                        <span className="text-[8px] font-mono text-secondary opacity-60">
                          {new Date(shop.lastLog).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        className="p-3 bg-surface rounded-2xl text-secondary hover:text-primary transition-all group/btn"
                        title="Gửi nhắc nhở"
                      >
                        <Bell size={18} className="group-hover/btn:animate-ring" />
                      </button>
                      <button 
                        onClick={() => {
                          const newLimit = prompt('Nhập giới hạn đơn hàng mới:', String(shop.orderLimit));
                          if (newLimit) handleUpdateShop(shop.uid, 'orderLimit', Number(newLimit));
                        }}
                        className="p-3 bg-on-surface text-surface rounded-2xl hover:bg-primary transition-all"
                        title="Điều chỉnh giới hạn"
                      >
                        <Settings size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredShops.length === 0 && (
            <div className="p-20 text-center space-y-4 text-secondary opacity-40">
              <Search size={64} className="mx-auto" />
              <p className="font-black uppercase tracking-widest">Không tìm thấy dữ liệu phù hợp</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
