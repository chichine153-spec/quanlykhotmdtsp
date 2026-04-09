import React from 'react';
import { Settings, Save, Loader2, Package } from 'lucide-react';
import { ProfitConfig } from '../types';
import { ProfitService } from '../services/profitService';
import { useAuth } from '../contexts/AuthContext';

interface FinanceSettingsProps {
  onClose: () => void;
  initialConfig: ProfitConfig;
}

export default function FinanceSettings({ onClose, initialConfig }: FinanceSettingsProps) {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = React.useState(false);
  const [config, setConfig] = React.useState<ProfitConfig>({
    cutoffHour: 15,
    dailyMarketingCosts: {},
    ...initialConfig
  });
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [tempMarketingCost, setTempMarketingCost] = React.useState(0);

  const handleAddMarketingCost = () => {
    if (!selectedDate) return;
    setConfig(prev => ({
      ...prev,
      dailyMarketingCosts: {
        ...(prev.dailyMarketingCosts || {}),
        [selectedDate]: tempMarketingCost
      }
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    try {
      await ProfitService.saveConfig(user.uid, config);
      onClose();
    } catch (error) {
      console.error('Save Config Error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Settings size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-on-surface uppercase tracking-tight">CẤU HÌNH CHI PHÍ VẬN HÀNH</h2>
          <p className="text-secondary text-xs">Thiết lập phí đóng gói và các chi phí vận hành khác.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Basic Fees */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Phí đóng gói Bình (vnđ)</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-primary transition-colors">
                <Package size={18} />
              </div>
              <input 
                type="number"
                value={config.packagingCostBottle}
                onChange={(e) => setConfig({...config, packagingCostBottle: parseInt(e.target.value) || 0})}
                className="w-full pl-12 pr-4 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-lg"
                placeholder="Ví dụ: 6000"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Phí đóng gói Cốc (vnđ)</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-primary transition-colors">
                <Package size={18} />
              </div>
              <input 
                type="number"
                value={config.packagingCostCup}
                onChange={(e) => setConfig({...config, packagingCostCup: parseInt(e.target.value) || 0})}
                className="w-full pl-12 pr-4 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-lg"
                placeholder="Ví dụ: 8000"
                required
              />
            </div>
          </div>
        </div>

        {/* Platform Fees */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Phí sàn Cốc giữ nhiệt (%)</label>
            <input 
              type="number"
              step="0.1"
              value={config.platformFeeCup}
              onChange={(e) => setConfig({...config, platformFeeCup: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-lg"
              placeholder="Ví dụ: 25"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Phí sàn Bình giữ nhiệt (%)</label>
            <input 
              type="number"
              step="0.1"
              value={config.platformFeeBottle}
              onChange={(e) => setConfig({...config, platformFeeBottle: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-lg"
              placeholder="Ví dụ: 20"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Phí sàn mặc định (%)</label>
            <input 
              type="number"
              step="0.1"
              value={config.platformFeePercent}
              onChange={(e) => setConfig({...config, platformFeePercent: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Thuế kinh doanh (%)</label>
            <input 
              type="number"
              step="0.1"
              value={config.taxPercent}
              onChange={(e) => setConfig({...config, taxPercent: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Phí Marketing (VNĐ)</label>
            <input 
              type="number"
              value={config.marketingCost}
              onChange={(e) => setConfig({...config, marketingCost: parseInt(e.target.value) || 0})}
              className="w-full px-4 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Chi phí khác (VNĐ)</label>
            <input 
              type="number"
              value={config.otherCosts}
              onChange={(e) => setConfig({...config, otherCosts: parseInt(e.target.value) || 0})}
              className="w-full px-4 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Giờ cắt đơn (0-23h)</label>
            <input 
              type="number"
              min="0"
              max="23"
              value={config.cutoffHour ?? 15}
              onChange={(e) => setConfig({...config, cutoffHour: parseInt(e.target.value) || 0})}
              className="w-full px-4 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
              required
            />
          </div>
        </div>

        {/* Daily Marketing Costs */}
        <div className="space-y-4 pt-6 border-t border-surface-container">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest">Chi phí Marketing theo ngày</h3>
            <span className="text-[10px] text-secondary font-medium italic">* Chi phí sẽ được chia theo tỷ lệ đơn hàng trước/sau giờ cắt đơn</span>
          </div>
          
          <div className="bg-surface-container-lowest p-6 rounded-3xl border border-surface-container space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Ngày áp dụng</label>
                <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl outline-none focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Số tiền (VNĐ)</label>
                <div className="flex gap-2">
                  <input 
                    type="number"
                    value={tempMarketingCost}
                    onChange={(e) => setTempMarketingCost(parseInt(e.target.value) || 0)}
                    className="flex-1 px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl outline-none font-bold focus:ring-2 focus:ring-primary/10"
                    placeholder="0"
                  />
                  <button 
                    type="button"
                    onClick={handleAddMarketingCost}
                    className="px-6 py-3 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-container transition-all"
                  >
                    Thêm/Sửa
                  </button>
                </div>
              </div>
            </div>

            {config.dailyMarketingCosts && Object.keys(config.dailyMarketingCosts).length > 0 && (
              <div className="pt-4 space-y-2">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Danh sách đã nhập (gần đây):</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(config.dailyMarketingCosts)
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .slice(0, 5)
                    .map(([date, cost]) => (
                      <div key={date} className="flex items-center gap-2 px-3 py-1.5 bg-surface-container rounded-full border border-surface-container-high">
                        <span className="text-xs font-bold text-on-surface">{date}:</span>
                        <span className="text-xs font-black text-primary">{cost.toLocaleString()}đ</span>
                        <button 
                          type="button"
                          onClick={() => {
                            const newCosts = { ...config.dailyMarketingCosts };
                            delete newCosts[date];
                            setConfig({ ...config, dailyMarketingCosts: newCosts });
                          }}
                          className="text-secondary hover:text-error transition-colors"
                        >
                          <Settings size={12} />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 flex gap-4">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-4 rounded-2xl border border-surface-container font-bold text-secondary hover:bg-surface-container transition-all"
          >
            Hủy
          </button>
          <button 
            type="submit"
            disabled={isSaving}
            className="flex-[2] bg-primary text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            LƯU CẤU HÌNH
          </button>
        </div>
      </form>
    </div>
  );
}
