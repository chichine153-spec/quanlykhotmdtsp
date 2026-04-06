import React from 'react';
import { Settings, Save, Loader2, Package } from 'lucide-react';
import { motion } from 'motion/react';
import { ProfitConfig } from '../types';
import { ProfitService } from '../services/profitService';
import { useAuth } from '../contexts/AuthContext';

interface FinanceSettingsProps {
  onClose: () => void;
  initialConfig: ProfitConfig;
}

export default function FinanceSettings({ onClose, initialConfig }: FinanceSettingsProps) {
  const { user } = useAuth();
  const [config, setConfig] = React.useState<ProfitConfig>(initialConfig);
  const [isSaving, setIsSaving] = React.useState(false);

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
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Settings size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-on-surface uppercase tracking-tight">CẤU HÌNH CHI PHÍ VẬN HÀNH</h2>
          <p className="text-secondary text-xs">Thiết lập phí đóng gói linh hoạt cho từng loại sản phẩm.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
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
