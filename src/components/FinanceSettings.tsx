import React from 'react';
import { Settings, Save, Loader2, Package, Calculator, Truck } from 'lucide-react';
import { motion } from 'motion/react';
import { ProfitConfig, PricingTier } from '../types';
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
    ...initialConfig,
    pricingTiers: initialConfig.pricingTiers || {
      standard: { kgHN: 0, m3HN: 0, kgSG: 0, m3SG: 0 },
      cosmetics: { kgHN: 0, m3HN: 0, kgSG: 0, m3SG: 0 },
      electronics: { kgHN: 0, m3HN: 0, kgSG: 0, m3SG: 0 },
      heavy: { kgHN: 0, m3HN: 0, kgSG: 0, m3SG: 0 }
    }
  });

  // Calculator State
  const [calcCategory, setCalcCategory] = React.useState('standard');
  const [calcDest, setCalcDest] = React.useState('HN');
  const [calcWeight, setCalcWeight] = React.useState<number>(0);
  const [calcVolume, setCalcVolume] = React.useState<number>(0);
  const [calcResult, setCalcResult] = React.useState<number>(0);

  const updateTier = (tier: keyof NonNullable<ProfitConfig['pricingTiers']>, field: keyof PricingTier, value: number) => {
    setConfig(prev => ({
      ...prev,
      pricingTiers: {
        ...prev.pricingTiers!,
        [tier]: {
          ...prev.pricingTiers![tier],
          [field]: value
        }
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

  const categories = [
    { id: 'standard', label: 'Phổ thông' },
    { id: 'cosmetics', label: 'Mỹ phẩm' },
    { id: 'electronics', label: 'Linh kiện' },
    { id: 'heavy', label: 'Hàng nặng' }
  ];

  // Auto-calculate when inputs change
  React.useEffect(() => {
    const fee = ProfitService.calculateShippingFee(calcCategory, calcDest, calcWeight, calcVolume, config);
    setCalcResult(fee);
  }, [calcCategory, calcDest, calcWeight, calcVolume, config]);

  return (
    <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Settings size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-on-surface uppercase tracking-tight">CẤU HÌNH CHI PHÍ VẬN HÀNH</h2>
          <p className="text-secondary text-xs">Thiết lập phí đóng gói và bảng giá vận chuyển đa tầng.</p>
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

        {/* Pricing Table */}
        <div className="space-y-4">
          <h3 className="text-sm font-black text-primary uppercase tracking-widest">Bảng giá vận chuyển đa tầng</h3>
          <div className="overflow-x-auto rounded-2xl border border-surface-container">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">Loại hàng</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">Giá KG HN</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">Giá M3 HN</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">Giá KG SG</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-center">Giá M3 SG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-surface-container-low/20 transition-colors">
                    <td className="px-4 py-3 text-xs font-bold text-on-surface">{cat.label}</td>
                    <td className="px-2 py-2">
                      <input 
                        type="number"
                        value={config.pricingTiers?.[cat.id as keyof NonNullable<ProfitConfig['pricingTiers']>]?.kgHN || 0}
                        onChange={(e) => updateTier(cat.id as any, 'kgHN', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-2 bg-surface-container-lowest border border-surface-container rounded-lg text-xs font-bold text-center outline-none focus:border-primary"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input 
                        type="number"
                        value={config.pricingTiers?.[cat.id as keyof NonNullable<ProfitConfig['pricingTiers']>]?.m3HN || 0}
                        onChange={(e) => updateTier(cat.id as any, 'm3HN', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-2 bg-surface-container-lowest border border-surface-container rounded-lg text-xs font-bold text-center outline-none focus:border-primary"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input 
                        type="number"
                        value={config.pricingTiers?.[cat.id as keyof NonNullable<ProfitConfig['pricingTiers']>]?.kgSG || 0}
                        onChange={(e) => updateTier(cat.id as any, 'kgSG', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-2 bg-surface-container-lowest border border-surface-container rounded-lg text-xs font-bold text-center outline-none focus:border-primary"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input 
                        type="number"
                        value={config.pricingTiers?.[cat.id as keyof NonNullable<ProfitConfig['pricingTiers']>]?.m3SG || 0}
                        onChange={(e) => updateTier(cat.id as any, 'm3SG', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-2 bg-surface-container-lowest border border-surface-container rounded-lg text-xs font-bold text-center outline-none focus:border-primary"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Phí sàn Shopee (%)</label>
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
        </div>

        {/* Shipping Calculator Tool */}
        <div className="p-6 bg-primary/5 rounded-3xl border border-primary/20 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Calculator size={18} />
            <h3 className="text-sm font-black uppercase tracking-widest">Công cụ tính cước nhanh</h3>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-secondary uppercase">Loại hàng</label>
              <select 
                value={calcCategory}
                onChange={(e) => setCalcCategory(e.target.value)}
                className="w-full p-2 bg-white border border-surface-container rounded-xl text-xs font-bold outline-none"
              >
                {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-secondary uppercase">Đến</label>
              <select 
                value={calcDest}
                onChange={(e) => setCalcDest(e.target.value)}
                className="w-full p-2 bg-white border border-surface-container rounded-xl text-xs font-bold outline-none"
              >
                <option value="HN">Hà Nội</option>
                <option value="SG">Hồ Chí Minh</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-secondary uppercase">Cân nặng (KG)</label>
              <input 
                type="number"
                value={calcWeight}
                onChange={(e) => setCalcWeight(parseFloat(e.target.value) || 0)}
                className="w-full p-2 bg-white border border-surface-container rounded-xl text-xs font-bold outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-secondary uppercase">Thể tích (M3)</label>
              <input 
                type="number"
                value={calcVolume}
                onChange={(e) => setCalcVolume(parseFloat(e.target.value) || 0)}
                className="w-full p-2 bg-white border border-surface-container rounded-xl text-xs font-bold outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-primary/10">
            <div className="flex items-center gap-2 text-secondary">
              <Truck size={16} />
              <span className="text-xs font-bold">Cước dự kiến:</span>
            </div>
            <span className="text-xl font-black text-primary">{calcResult.toLocaleString()}đ</span>
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
