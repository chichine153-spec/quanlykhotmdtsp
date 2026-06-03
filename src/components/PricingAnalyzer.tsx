import React from 'react';
import { 
  DollarSign, 
  Package, 
  HelpCircle, 
  Info, 
  TrendingUp, 
  ChevronRight, 
  Percent, 
  Flame, 
  CheckCircle2, 
  AlertCircle,
  Save
} from 'lucide-react';
// Recharts removed to use custom custom-tailored stacked pillar chart


interface CategoryConfig {
  id: string;
  name: string;
  cogs: number;
  packingFee: number;
  platformFeePercent: number;
  usePlatformFee: boolean;
  useFreeshipXtra: boolean;
  freeshipXtraPercent: number;
  useVoucherXtra: boolean;
  voucherXtraPercent: number;
  usePiship: boolean;
  pishipAmount: number;
  useInfrastructure: boolean;
  infrastructureAmount: number;
  adsPercent: number;
  taxPercent: number;
  riskPercent: number;
  targetMargin: number;
  customPrice: number;
  pricingMode: 'fixed-target' | 'custom-price';
}

const DEFAULT_CATEGORIES: CategoryConfig[] = [
  {
    id: 'coc-giu-nhiet',
    name: 'Cốc giữ nhiệt',
    cogs: 45000,
    packingFee: 3000,
    platformFeePercent: 16.0,
    usePlatformFee: true,
    useFreeshipXtra: true,
    freeshipXtraPercent: 7.0,
    useVoucherXtra: true,
    voucherXtraPercent: 4.0,
    usePiship: true,
    pishipAmount: 8000,
    useInfrastructure: true,
    infrastructureAmount: 5000,
    adsPercent: 10.0,
    taxPercent: 1.5,
    riskPercent: 2.0,
    targetMargin: 20.0,
    customPrice: 110000,
    pricingMode: 'custom-price'
  },
  {
    id: 'binh-giu-nhiet',
    name: 'Bình giữ nhiệt',
    cogs: 50000,
    packingFee: 3000,
    platformFeePercent: 16.0,
    usePlatformFee: true,
    useFreeshipXtra: true,
    freeshipXtraPercent: 7.0,
    useVoucherXtra: true,
    voucherXtraPercent: 4.0,
    usePiship: true,
    pishipAmount: 8000,
    useInfrastructure: true,
    infrastructureAmount: 5000,
    adsPercent: 10.0,
    taxPercent: 1.5,
    riskPercent: 2.0,
    targetMargin: 20.0,
    customPrice: 130000,
    pricingMode: 'custom-price'
  },
  {
    id: 'tu-dinh-nghia',
    name: 'Khác (Tự định nghĩa)',
    cogs: 60000,
    packingFee: 3000,
    platformFeePercent: 16.0,
    usePlatformFee: true,
    useFreeshipXtra: true,
    freeshipXtraPercent: 7.0,
    useVoucherXtra: true,
    voucherXtraPercent: 4.0,
    usePiship: true,
    pishipAmount: 8000,
    useInfrastructure: true,
    infrastructureAmount: 5000,
    adsPercent: 10.0,
    taxPercent: 1.5,
    riskPercent: 2.0,
    targetMargin: 20.0,
    customPrice: 150000,
    pricingMode: 'custom-price'
  }
];

export default function PricingAnalyzer() {
  const [categories, setCategories] = React.useState<CategoryConfig[]>(() => {
    const saved = localStorage.getItem('piti_pricing_categories');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validated = parsed.map(c => {
            const def = DEFAULT_CATEGORIES.find(d => d.id === c.id);
            if (def) {
              return { ...def, ...c };
            }
            return c;
          });
          return validated;
        }
      } catch (e) {
        console.error('Error parsing categories:', e);
      }
    }
    return DEFAULT_CATEGORIES;
  });
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>('coc-giu-nhiet');
  const [showSavedAlert, setShowSavedAlert] = React.useState(false);
  const [showResetAlert, setShowResetAlert] = React.useState(false);

  const handleSaveConfig = () => {
    localStorage.setItem('piti_pricing_categories', JSON.stringify(categories));
    setShowSavedAlert(true);
    setTimeout(() => {
      setShowSavedAlert(false);
    }, 3000);
  };

  const handleResetConfig = () => {
    const original = DEFAULT_CATEGORIES.find(c => c.id === selectedCategoryId) || DEFAULT_CATEGORIES[0];
    const updated = categories.map(c => c.id === selectedCategoryId ? { ...original } : c);
    setCategories(updated);
    localStorage.setItem('piti_pricing_categories', JSON.stringify(updated));
    setShowResetAlert(true);
    setTimeout(() => {
      setShowResetAlert(false);
    }, 3000);
  };

  const activeCategory = React.useMemo(() => {
    return categories.find(c => c.id === selectedCategoryId) || categories[0];
  }, [categories, selectedCategoryId]);

  const updateActiveCategory = (updates: Partial<CategoryConfig>) => {
    setCategories(prev => prev.map(c => c.id === selectedCategoryId ? { ...c, ...updates } : c));
  };

  // Getters & Aliased Setters to match exact downstream inputs
  const cogs = activeCategory.cogs;
  const setCogs = (val: number) => updateActiveCategory({ cogs: val });

  const packingFee = activeCategory.packingFee;
  const setPackingFee = (val: number) => updateActiveCategory({ packingFee: val });

  const usePlatformFee = activeCategory.usePlatformFee;
  const setUsePlatformFee = (val: boolean) => updateActiveCategory({ usePlatformFee: val });

  const platformFeePercent = activeCategory.platformFeePercent;
  const setPlatformFeePercent = (val: number) => updateActiveCategory({ platformFeePercent: val });

  const useFreeshipXtra = activeCategory.useFreeshipXtra;
  const setUseFreeshipXtra = (val: boolean) => updateActiveCategory({ useFreeshipXtra: val });

  const freeshipXtraPercent = activeCategory.freeshipXtraPercent;
  const setFreeshipXtraPercent = (val: number) => updateActiveCategory({ freeshipXtraPercent: val });

  const useVoucherXtra = activeCategory.useVoucherXtra;
  const setUseVoucherXtra = (val: boolean) => updateActiveCategory({ useVoucherXtra: val });

  const voucherXtraPercent = activeCategory.voucherXtraPercent;
  const setVoucherXtraPercent = (val: number) => updateActiveCategory({ voucherXtraPercent: val });

  const usePiship = activeCategory.usePiship;
  const setUsePiship = (val: boolean) => updateActiveCategory({ usePiship: val });

  const pishipAmount = activeCategory.pishipAmount;
  const setPishipAmount = (val: number) => updateActiveCategory({ pishipAmount: val });

  const useInfrastructure = activeCategory.useInfrastructure;
  const setUseInfrastructure = (val: boolean) => updateActiveCategory({ useInfrastructure: val });

  const infrastructureAmount = activeCategory.infrastructureAmount;
  const setInfrastructureAmount = (val: number) => updateActiveCategory({ infrastructureAmount: val });

  const adsPercent = activeCategory.adsPercent;
  const setAdsPercent = (val: number) => updateActiveCategory({ adsPercent: val });

  const taxPercent = activeCategory.taxPercent;
  const setTaxPercent = (val: number) => updateActiveCategory({ taxPercent: val });

  const riskPercent = activeCategory.riskPercent;
  const setRiskPercent = (val: number) => updateActiveCategory({ riskPercent: val });

  const targetMargin = activeCategory.targetMargin;
  const setTargetMargin = (val: number) => updateActiveCategory({ targetMargin: val });

  const customPrice = activeCategory.customPrice;
  const setCustomPrice = (val: number) => updateActiveCategory({ customPrice: val });

  const pricingMode = activeCategory.pricingMode;
  const setPricingMode = (val: 'fixed-target' | 'custom-price') => updateActiveCategory({ pricingMode: val });

  // Math calculations: Tổng chi phí cố định thực tế bằng Giá vốn + Phí đóng gói
  const totalFixedCost = cogs + packingFee;

  // Active inputs strictly mapped to shop's rules, fully adjustable
  const activePlatformFee = usePlatformFee ? platformFeePercent : 0; // Phí cố định & thanh toán sàn
  const activeFreeship = useFreeshipXtra ? freeshipXtraPercent : 0; // Freeship Xtra
  const activeVoucher = useVoucherXtra ? voucherXtraPercent : 0; // Voucher Xtra
  const activePishipAmount = usePiship ? pishipAmount : 0; // Phí Piship tiền mặt
  const activeInfrastructureAmount = useInfrastructure ? infrastructureAmount : 0; // Phí hạ tầng tiền mặt
  
  // Tổng Chi phí Biến đổi (Tính theo %) = 16% (Phí sàn) + % Gói dịch vụ bật + % Thuế + % Marketing + % Hoàn hủy
  const totalVariablePercent = activePlatformFee + activeFreeship + activeVoucher + adsPercent + taxPercent + riskPercent;

  // Real-time calculated Proposed Listed Price based on Target Profit margin
  const denominator = 1 - (totalVariablePercent + targetMargin) / 100;
  const totalFlatFees = totalFixedCost + activePishipAmount + activeInfrastructureAmount;
  const proposedPrice = denominator > 0 ? Math.round(totalFlatFees / denominator) : 0;

  // Selected price to calculate exact VNĐ breakdown (uses customPrice in 'custom-price' mode, and proposedPrice in 'fixed-target' mode)
  const selectedPrice = pricingMode === 'custom-price' ? customPrice : proposedPrice;

  // Breakdown values based on the selected price
  // Group 1: Giá vốn & Đóng gói (Gồm Giá vốn + Phí đóng gói cố định)
  const valCOGS = cogs + packingFee;
  
  // Group 2: Vận hành & Sàn (Gồm Phí sàn + Phí Piship VNĐ + Phí hạ tầng VNĐ)
  const valOpsPlatform = Math.round(activePlatformFee * selectedPrice / 100) + activePishipAmount + activeInfrastructureAmount;
  
  // Group 3: Gói Dịch Vụ (Tổng % của Voucher Xtra + Freeship Xtra if checked)
  const valServicePacks = Math.round((activeFreeship + activeVoucher) * selectedPrice / 100);
  
  // Group 4: Chi phí khác (% Thuế + % Marketing + % Hoàn hủy)
  const valOtherExpenses = Math.round((taxPercent + adsPercent + riskPercent) * selectedPrice / 100);

  // Real profit calculation (making sure it sums perfectly relative to groups)
  const calculatedProfitValue = selectedPrice - valCOGS - valOpsPlatform - valServicePacks - valOtherExpenses;
  const profitMarginPercent = selectedPrice > 0 ? (calculatedProfitValue / selectedPrice) * 100 : 0; // True net percentage

  // Quick button handler to copy proposed price to custom price
  const handleApplyProposedPrice = () => {
    if (proposedPrice > 0) {
      setCustomPrice(proposedPrice);
      setPricingMode('custom-price');
    }
  };

  // Computes precise actual percentages of the chosen selling price to back the cards and legend beautifully
  const cogsRatio = selectedPrice > 0 ? Number(((valCOGS / selectedPrice) * 100).toFixed(1)) : 0;
  const opsPlatformRatio = selectedPrice > 0 ? Number(((valOpsPlatform / selectedPrice) * 100).toFixed(1)) : 0;
  const servicePacksRatio = selectedPrice > 0 ? Number(((valServicePacks / selectedPrice) * 100).toFixed(1)) : 0;
  const otherExpensesRatio = selectedPrice > 0 ? Number(((valOtherExpenses / selectedPrice) * 100).toFixed(1)) : 0;
  const profitRatio = selectedPrice > 0 ? Number(((calculatedProfitValue / selectedPrice) * 100).toFixed(1)) : 0;

  // 1. Five newly configured segments mapping 1-to-1 with 5-column display
  const finalSegments = React.useMemo(() => {
    return [
      {
        id: 'cogs',
        name: 'Giá vốn & Đóng gói',
        val: valCOGS,
        pctValue: cogsRatio,
        color: 'from-slate-400 to-slate-500 bg-slate-400',
        shadowClass: 'shadow-slate-450/10',
        borderCol: 'border-slate-200/50',
        textColor: 'text-slate-600',
        bgLight: 'bg-slate-50/80',
        hoverColor: 'hover:from-slate-500 hover:to-slate-600'
      },
      {
        id: 'opsPlatform',
        name: 'Vận hành & Sàn',
        val: valOpsPlatform,
        pctValue: opsPlatformRatio,
        color: 'from-blue-400 to-blue-500 bg-blue-400',
        shadowClass: 'shadow-blue-450/10',
        borderCol: 'border-blue-200/50',
        textColor: 'text-blue-600',
        bgLight: 'bg-blue-50/80',
        hoverColor: 'hover:from-blue-500 hover:to-blue-600'
      },
      {
        id: 'servicePacks',
        name: 'Gói Dịch Vụ',
        val: valServicePacks,
        pctValue: servicePacksRatio,
        color: 'from-orange-400 to-orange-500 bg-orange-400',
        shadowClass: 'shadow-orange-450/10',
        borderCol: 'border-orange-200/50',
        textColor: 'text-orange-600',
        bgLight: 'bg-orange-50/80',
        hoverColor: 'hover:from-orange-500 hover:to-orange-600'
      },
      {
        id: 'otherExpenses',
        name: 'Chi phí khác',
        val: valOtherExpenses,
        pctValue: otherExpensesRatio,
        color: 'from-indigo-400 to-indigo-500 bg-indigo-400',
        shadowClass: 'shadow-indigo-450/10',
        borderCol: 'border-indigo-200/50',
        textColor: 'text-indigo-600',
        bgLight: 'bg-indigo-50/80',
        hoverColor: 'hover:from-indigo-500 hover:to-indigo-600'
      },
      {
        id: 'profit',
        name: 'Lợi nhuận ròng',
        val: calculatedProfitValue,
        pctValue: profitRatio,
        color: calculatedProfitValue >= 0 ? 'from-emerald-400 to-emerald-500 bg-emerald-400' : 'from-rose-500 to-rose-600 bg-rose-500',
        shadowClass: calculatedProfitValue >= 0 ? 'shadow-emerald-450/10' : 'shadow-rose-450/10',
        borderCol: calculatedProfitValue >= 0 ? 'border-emerald-200/50' : 'border-rose-200/50',
        textColor: calculatedProfitValue >= 0 ? 'text-emerald-600' : 'text-rose-600',
        bgLight: calculatedProfitValue >= 0 ? 'bg-emerald-50/80' : 'bg-rose-50/80',
        hoverColor: calculatedProfitValue >= 0 ? 'hover:from-emerald-500 hover:to-emerald-600' : 'hover:from-rose-500 hover:to-rose-600',
        isProfit: true
      }
    ];
  }, [valCOGS, valOpsPlatform, valServicePacks, valOtherExpenses, calculatedProfitValue, cogsRatio, opsPlatformRatio, servicePacksRatio, otherExpensesRatio, profitRatio]);

  // Get active segments
  const activeSegments = React.useMemo(() => {
    return finalSegments.filter(segment => {
      if (segment.val <= 0 && segment.id !== 'profit') return false;
      if (segment.id === 'profit' && calculatedProfitValue <= 0) return false;
      return true;
    });
  }, [finalSegments, calculatedProfitValue]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* LEFT COLUMN: Input Panels & Real-time Calculations (8 cols) */}
      <div className="lg:col-span-7 space-y-6">
        
        {/* DROPDOWN SELECT: Bộ chọn ngành hàng */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">
            Chọn ngành hàng / Danh mục sản phẩm
          </label>
          <div className="relative">
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full pl-4 pr-10 py-3 bg-slate-55 border border-slate-200 rounded-xl focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all font-bold text-slate-700 text-sm appearance-none cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-slate-500">
              <ChevronRight size={16} className="rotate-90" />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 italic">
            * Mỗi ngành hàng có cấu hình giá vốn, phí sàn mặc định và phí đóng gói tối ưu riêng biệt. Bạn có thể tự do điều chỉnh các thông số bên dưới cho ngành hàng hiện tại.
          </p>
        </div>

        {/* PANEL 1: Fixed Costs (Khung nhập dữ liệu Chi phí cố định) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
              <Package size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Chi phí cố định</h3>
              <p className="text-xs text-slate-400">Các khoản phí cố định cho mỗi sản phẩm bán ra.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Input COGS */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Giá vốn (COGS)</label>
              <div className="relative">
                <input 
                  type="number"
                  value={cogs}
                  onChange={(e) => setCogs(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all font-semibold text-slate-700 font-sans"
                  placeholder="0"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">đ</span>
              </div>
            </div>

            {/* Input packingFee */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Phí đóng gói</label>
              <div className="relative">
                <input 
                  type="number"
                  value={packingFee}
                  onChange={(e) => setPackingFee(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all font-semibold text-slate-700 font-sans"
                  placeholder="0"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">đ</span>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Tổng chi phí cố định thực tế:</span>
            <span className="font-bold text-slate-700 text-sm">{totalFixedCost.toLocaleString()}đ</span>
          </div>
        </div>

        {/* PANEL 2: Variable Costs & Platform Fees (Khung nhập dữ liệu Chi phí biến đổi & Phí sàn) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
              <Percent size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Chi phí biến đổi & Phí sàn</h3>
              <p className="text-xs text-slate-400">Thiết lập các khoản chi khấu trừ theo phần trăm (%) của doanh thu sàn.</p>
            </div>
          </div>

          <div className="space-y-3.5">
            {/* Variable Fee: Platform Fee */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  id="usePlatformFee"
                  checked={usePlatformFee}
                  onChange={(e) => setUsePlatformFee(e.target.checked)}
                  className="w-4.5 h-4.5 text-orange-600 border-slate-300 rounded focus:ring-orange-500 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="usePlatformFee" className="flex flex-col cursor-pointer select-none">
                  <span className="text-xs font-bold text-slate-700">Phí Vận hành & Sàn (Shopee/TikTok)</span>
                  <span className="text-[10px] text-slate-400">Mức chiết khấu giao dịch mặc định và cố định của sàn.</span>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <input 
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  disabled={!usePlatformFee}
                  value={platformFeePercent}
                  onChange={(e) => setPlatformFeePercent(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-16 px-2 py-1 text-center bg-white border border-slate-200 rounded-lg font-bold text-xs text-slate-700 focus:border-orange-500 focus:ring-orange-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
                <span className="text-xs font-semibold text-slate-500">%</span>
              </div>
            </div>

            {/* Variable Fee: Freeship Xtra */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  id="useFreeship"
                  checked={useFreeshipXtra}
                  onChange={(e) => setUseFreeshipXtra(e.target.checked)}
                  className="w-4.5 h-4.5 text-orange-600 border-slate-300 rounded focus:ring-orange-500 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="useFreeship" className="flex flex-col cursor-pointer select-none">
                  <span className="text-xs font-bold text-slate-700">Gói Freeship Xtra</span>
                  <span className="text-[10px] text-slate-400">Chương trình hỗ trợ phí vận chuyển cho người mua.</span>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <input 
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  disabled={!useFreeshipXtra}
                  value={freeshipXtraPercent}
                  onChange={(e) => setFreeshipXtraPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-16 px-2 py-1 text-center bg-white border border-slate-200 rounded-lg font-bold text-xs text-slate-700 focus:border-orange-500 focus:ring-orange-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
                <span className="text-xs font-semibold text-slate-500">%</span>
              </div>
            </div>

            {/* Variable Fee: Voucher Xtra */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  id="useVoucher"
                  checked={useVoucherXtra}
                  onChange={(e) => setUseVoucherXtra(e.target.checked)}
                  className="w-4.5 h-4.5 text-orange-600 border-slate-300 rounded focus:ring-orange-500 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="useVoucher" className="flex flex-col cursor-pointer select-none">
                  <span className="text-xs font-bold text-slate-700">Gói Voucher Xtra / Hoàn Xu</span>
                  <span className="text-[10px] text-slate-400">Tham gia hoàn xu và áp mã giảm giá bổ sung từ sàn.</span>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <input 
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  disabled={!useVoucherXtra}
                  value={voucherXtraPercent}
                  onChange={(e) => setVoucherXtraPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-16 px-2 py-1 text-center bg-white border border-slate-200 rounded-lg font-bold text-xs text-slate-700 focus:border-orange-500 focus:ring-orange-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
                <span className="text-xs font-semibold text-slate-500">%</span>
              </div>
            </div>

            {/* Variable Fee: PiShip */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  id="usePiship"
                  checked={usePiship}
                  onChange={(e) => setUsePiship(e.target.checked)}
                  className="w-4.5 h-4.5 text-orange-600 border-slate-300 rounded focus:ring-orange-500 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="usePiship" className="flex flex-col cursor-pointer select-none">
                  <span className="text-xs font-bold text-slate-700">Phí PiShip (Phí đóng gói)</span>
                  <span className="text-[10px] text-slate-400">Chi phí cố định tiền mặt trên từng đơn hàng đã tối ưu.</span>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <input 
                  type="number"
                  min="0"
                  disabled={!usePiship}
                  value={pishipAmount}
                  onChange={(e) => setPishipAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 px-2 py-1 text-center bg-white disabled:bg-slate-100 disabled:cursor-not-allowed border border-slate-200 rounded-lg focus:border-orange-500 focus:ring-orange-500 font-bold text-xs text-slate-700"
                />
                <span className="text-xs font-semibold text-slate-500">đ</span>
              </div>
            </div>

            {/* Variable Fee: Phí Hạ tầng */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  id="useInfrastructure"
                  checked={useInfrastructure}
                  onChange={(e) => setUseInfrastructure(e.target.checked)}
                  className="w-4.5 h-4.5 text-orange-600 border-slate-300 rounded focus:ring-orange-500 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="useInfrastructure" className="flex flex-col cursor-pointer select-none">
                  <span className="text-xs font-bold text-slate-700">Phí Hạ tầng</span>
                  <span className="text-[10px] text-slate-400">Phí dịch vụ hạ tầng mạng lưới và kho bãi vận hành trực tuyến.</span>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <input 
                  type="number"
                  min="0"
                  disabled={!useInfrastructure}
                  value={infrastructureAmount}
                  onChange={(e) => setInfrastructureAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 px-2 py-1 text-center bg-white disabled:bg-slate-100 disabled:cursor-not-allowed border border-slate-200 rounded-lg focus:border-orange-500 focus:ring-orange-500 font-bold text-xs text-slate-700"
                />
                <span className="text-xs font-semibold text-slate-500">đ</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Tổng các tỉ lệ biến đổi & Phí sàn:</span>
            <span className="font-bold text-slate-700 text-sm">{(activePlatformFee + activeFreeship + activeVoucher).toFixed(1)}%</span>
          </div>
        </div>

        {/* PANEL 2.5: Other Expenses & Risk Buffers (CHI PHÍ MARKETING VÀ THUẾ) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <AlertCircle size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Chi phí Marketing và Thuế</h3>
              <p className="text-xs text-slate-400">Các chi phí kinh doanh bổ sung và biên an toàn.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Input Tax */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Thuế kinh doanh (%)</label>
              <div className="relative">
                <input 
                  type="number"
                  step="0.1"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-semibold text-slate-700 text-sm font-sans"
                  placeholder="1.5"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
              </div>
            </div>

            {/* Input Risk */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide font-headline font-sans">Rủi ro (Hoàn %)</label>
              <div className="relative">
                <input 
                  type="number"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-semibold text-slate-700 text-sm font-sans"
                  placeholder="2.0"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
              </div>
            </div>

            {/* Input Marketing/Ads */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Marketing (%)</label>
              <div className="relative">
                <input 
                  type="number"
                  step="0.5"
                  value={adsPercent}
                  onChange={(e) => setAdsPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-semibold text-slate-700 text-sm font-sans"
                  placeholder="10"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
              </div>
            </div>

          </div>

          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Tổng tỷ lệ chi phí Marketing & Thuế:</span>
            <span className="font-bold text-slate-700 text-sm">{(taxPercent + adsPercent + riskPercent).toFixed(1)}%</span>
          </div>
        </div>

        {/* NÚT LƯU CỐ ĐỊNH CHI PHÍ SÀN & MARKETING */}
        <div id="save-pricing-config-card" className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3.5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 shrink-0 mt-0.5">
              <Save size={16} />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-slate-800 text-sm">Lưu cấu hình chi phí cố định</h4>
              <p className="text-[11px] text-slate-400 leading-normal">
                Lưu lại các tỷ lệ phí sàn (<span className="font-semibold text-slate-600">{platformFeePercent}%</span>) và chi phí Marketing (<span className="font-semibold text-slate-600">{adsPercent}%</span>) của ngành hàng <strong className="text-slate-700 font-bold">"{activeCategory.name}"</strong> để tự động áp dụng trong các lần truy cập sau.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 justify-end pt-1">
            <button
              onClick={handleResetConfig}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 active:scale-95 text-[11px] font-bold text-slate-500 rounded-lg transition-all"
            >
              Đặt lại mặc định ban đầu
            </button>
            <button
              onClick={handleSaveConfig}
              className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-[11px] rounded-lg shadow-sm shadow-orange-600/15 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <Save size={12} />
              Lưu cố định chi phí
            </button>
          </div>

          {showSavedAlert && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-550 shrink-0" />
              <span>Đã lưu cố định tỉ lệ Phí sàn ({platformFeePercent}%) & Marketing ({adsPercent}%) của "{activeCategory.name}" thành công!</span>
            </div>
          )}

          {showResetAlert && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs font-bold flex items-center gap-2">
              <Info size={14} className="text-amber-600 shrink-0" />
              <span>Đã khôi phục cài đặt gốc của "{activeCategory.name}" ban đầu thành công!</span>
            </div>
          )}
        </div>

        {/* TARGET CONFIGS & SIMULATOR CONTROL */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/60 shadow-inner grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest border-b border-slate-200/50 pb-1 flex items-center gap-1">
              <Info size={14} className="text-orange-600" />
              1. Tính Giá niêm yết đề xuất
            </h4>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500">Biên lợi nhuận mong muốn (%):</label>
              <div className="flex gap-4 items-center">
                <input 
                  type="range"
                  min="5"
                  max="60"
                  step="1"
                  value={targetMargin}
                  onChange={(e) => {
                    setTargetMargin(parseInt(e.target.value));
                    setPricingMode('fixed-target');
                  }}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                />
                <span className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-orange-600 min-w-12 text-center">{targetMargin}%</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Hệ thống tự động tính toán Giá niêm yết cần treo ở sàn để sau khi trừ hết chi phí trên, bạn sẽ bỏ túi đúng {targetMargin}% Biên lợi nhuận ròng.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest border-b border-slate-200/50 pb-1 flex items-center gap-1">
              <TrendingUp size={14} className="text-green-600" />
              2. Khảo sát Giá bán tự chọn (Thực nghiệm)
            </h4>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500">Giá bán thử nghiệm (Khách trả):</label>
              <div className="relative">
                <input 
                  type="number"
                  value={customPrice}
                  onChange={(e) => {
                    setCustomPrice(Math.max(0, parseInt(e.target.value) || 0));
                    setPricingMode('custom-price');
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all font-black text-slate-700 text-sm"
                  placeholder="Ví dụ: 120000"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">đ</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Nếu bạn đã quyết định bán với mức giá cố định này, hệ thống sẽ phân tích xem cơ cấu giá trị thực nhận có hợp lý không.
              </p>
            </div>
          </div>
        </div>

        {/* PANEL 3: Real-time Analysis (Khung kết quả phân tích giá tự động) */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                <DollarSign size={18} />
              </div>
              <h3 className="font-bold text-white text-base">Phân tích cấu trúc giá tự động</h3>
            </div>
            
            {/* Simulation Mode Badges */}
            <div className="flex gap-1.5 bg-slate-800/80 p-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
              <button 
                onClick={() => setPricingMode('fixed-target')}
                className={`px-2 py-1 rounded transition-all ${pricingMode === 'fixed-target' ? 'bg-orange-600 text-white' : 'text-slate-400'}`}
              >
                Mục tiêu
              </button>
              <button 
                onClick={() => setPricingMode('custom-price')}
                className={`px-2 py-1 rounded transition-all ${pricingMode === 'custom-price' ? 'bg-green-600 text-white' : 'text-slate-400'}`}
              >
                Thực tế
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left box: Proposed Price */}
            <div className="space-y-1 bg-white/[0.03] p-4.5 rounded-2xl border border-white/[0.05] relative group hover:border-orange-500/30 transition-all">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {pricingMode === 'fixed-target' ? 'MỨC GIÁ BÁN KHOẢNG ĐỀ XUẤT' : 'GIÁ BÁN ĐỀ XUẤT (NIÊM YẾT)'}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black text-[#FF5722] tracking-tight">
                  {proposedPrice > 0 ? proposedPrice.toLocaleString() : '---'}
                </span>
                <span className="text-sm font-bold text-orange-500">đ</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium leading-normal mt-1.5">
                {denominator > 0 
                  ? `Mức giá tối ưu giúp thu về đúng ${targetMargin}% lợi nhuận ròng.` 
                  : 'Phần trăm tỷ lệ chi phí vượt ngưỡng 100%'
                }
              </p>

              {pricingMode === 'custom-price' && proposedPrice > 0 && proposedPrice !== customPrice && (
                <button 
                  onClick={handleApplyProposedPrice}
                  className="mt-3 w-full py-2 bg-orange-600 hover:bg-orange-500 active:scale-95 text-[10px] font-black uppercase tracking-wider text-white rounded-xl transition-all shadow-lg shadow-orange-950/20"
                >
                  Áp dụng giá bán này
                </button>
              )}
            </div>

            {/* Right box: Net Profit Amount */}
            <div className="space-y-1 bg-white/[0.03] p-4.5 rounded-2xl border border-white/[0.05] hover:border-emerald-500/30 transition-all">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Lợi nhuận thực nhận (VNĐ)</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black text-emerald-400 tracking-tight">
                  {calculatedProfitValue.toLocaleString()}
                </span>
                <span className="text-sm font-bold text-emerald-400">đ</span>
              </div>
              
              {/* Margin Rate Badge */}
              <div className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black text-[10px]">
                <TrendingUp size={10} />
                Biên ròng: {profitMarginPercent.toFixed(1)}%
              </div>

              <p className="text-[10px] text-slate-400 font-medium leading-normal mt-2">
                {calculatedProfitValue > 0 
                  ? 'Bán lẻ có lãi sau khi khấu hao hết chi phí đóng gói, thuế suất, rủi ro sản lượng hoàn về.' 
                  : 'Cảnh báo: Bán lẻ đang bị âm vốn/lỗ ròng. Hãy nâng giá bán hoặc giảm chi phí.'
                }
              </p>
            </div>

          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-2 text-[11px] text-slate-400">
            <div>
              <span className="block font-medium">Giá vốn & Đóng gói:</span>
              <span className="font-bold text-white">{valCOGS.toLocaleString()}đ</span>
            </div>
            <div>
              <span className="block font-medium">Vận hành VNĐ:</span>
              <span className="font-bold text-white">{(activePishipAmount + activeInfrastructureAmount).toLocaleString()}đ</span>
            </div>
            <div>
              <span className="block font-medium">Phí sàn ({activePlatformFee.toFixed(1)}%):</span>
              <span className="font-bold text-white">{Math.round(activePlatformFee * selectedPrice / 100).toLocaleString()}đ</span>
            </div>
            <div>
              <span className="block font-medium">Gói dịch vụ (Xtra):</span>
              <span className="font-bold text-white">{valServicePacks.toLocaleString()}đ</span>
            </div>
            <div>
              <span className="block font-medium text-slate-300 font-bold">Thuế, Ads & Khác:</span>
              <span className="font-bold text-slate-100">{valOtherExpenses.toLocaleString()}đ</span>
            </div>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Stacked Bar Chart & Quick Insights (5 cols) */}
      <div className="lg:col-span-12 xl:col-span-5 space-y-6">
        
        {/* CHART CONTAINER (Khung biểu đồ phân tích cơ cấu giá) */}
        <div id="chart-container-card" className="bg-white p-6 rounded-2xl border border-slate-100 shadow-lg space-y-6">
          <div className="text-center pb-2 border-b border-slate-100">
            <h3 className="font-extrabold text-slate-800 text-sm tracking-widest uppercase">BIỂU ĐỒ PHÂN TÍCH CƠ CẤU GIÁ SẢN PHẨM</h3>
            <p className="text-[11px] text-slate-400 mt-1">Cấu trúc chi phí & thực nhận trên giá bán <strong>{selectedPrice.toLocaleString()}đ</strong></p>
          </div>

          <div className="space-y-6">
            
            {/* Visual Column Viewport with independent columns and Y-axis */}
            {(() => {
              const maxPriceForAxis = selectedPrice > 0 ? selectedPrice : 100000;
              
              const axisTicks = [5, 4, 3, 2, 1, 0].map(i => {
                const val = (maxPriceForAxis * i) / 5;
                let label = '';
                if (val >= 1000000) {
                  label = `${(val / 1000000).toFixed(1).replace('.0', '')}M`;
                } else if (val >= 1000) {
                  label = `${Math.round(val / 1000)}k`;
                } else {
                  label = `${Math.round(val)}`;
                }
                return { label, value: val };
              });

              const chartBars = [
                {
                  label: 'Giá vốn & Đóng gói',
                  value: valCOGS,
                  ratio: cogsRatio,
                  color: 'from-slate-400 to-slate-500 bg-slate-400',
                  hoverColor: 'hover:from-slate-500 hover:to-slate-600',
                  borderCol: 'border-slate-200',
                  textColor: 'text-slate-600',
                  indicatorColor: 'bg-slate-400'
                },
                {
                  label: 'Vận hành & Sàn',
                  value: valOpsPlatform,
                  ratio: opsPlatformRatio,
                  color: 'from-blue-400 to-blue-500 bg-blue-400',
                  hoverColor: 'hover:from-blue-500 hover:to-blue-600',
                  borderCol: 'border-blue-200',
                  textColor: 'text-blue-600',
                  indicatorColor: 'bg-blue-400'
                },
                {
                  label: 'Gói Dịch Vụ',
                  value: valServicePacks,
                  ratio: servicePacksRatio,
                  color: 'from-orange-400 to-orange-500 bg-orange-400',
                  hoverColor: 'hover:from-orange-500 hover:to-orange-600',
                  borderCol: 'border-orange-200',
                  textColor: 'text-orange-600',
                  indicatorColor: 'bg-orange-400'
                },
                {
                  label: 'Chi phí khác',
                  value: valOtherExpenses,
                  ratio: otherExpensesRatio,
                  color: 'from-indigo-400 to-indigo-500 bg-indigo-400',
                  hoverColor: 'hover:from-indigo-500 hover:to-indigo-600',
                  borderCol: 'border-indigo-200',
                  textColor: 'text-indigo-600',
                  indicatorColor: 'bg-indigo-400'
                },
                {
                  label: 'Lợi nhuận',
                  value: calculatedProfitValue,
                  ratio: profitRatio,
                  color: calculatedProfitValue >= 0 ? 'from-emerald-400 to-emerald-500 bg-emerald-400' : 'from-rose-500 to-rose-600 bg-rose-500',
                  hoverColor: calculatedProfitValue >= 0 ? 'hover:from-emerald-555 hover:to-emerald-600' : 'hover:from-rose-600 hover:to-rose-700',
                  borderCol: calculatedProfitValue >= 0 ? 'border-emerald-200' : 'border-rose-200',
                  textColor: calculatedProfitValue >= 0 ? 'text-emerald-600' : 'text-rose-600',
                  indicatorColor: calculatedProfitValue >= 0 ? 'bg-[#34d399]' : 'bg-rose-500',
                  isProfit: true
                }
              ];

              return (
                <div className="w-full bg-slate-50/50 rounded-2xl border border-slate-100 p-3 sm:p-5 flex flex-col justify-between relative overflow-visible">
                  
                  {/* Alert if net loss */}
                  {calculatedProfitValue < 0 && (
                    <div className="w-full mb-5 p-3 rounded-xl bg-red-50 border border-red-250 shadow-xs flex items-center justify-center gap-2 text-xs font-bold text-red-600 animate-pulse">
                      <AlertCircle size={15} className="flex-shrink-0" />
                      <span className="uppercase tracking-wide">Cảnh báo: Bán lỗ -{Math.abs(calculatedProfitValue).toLocaleString()}đ</span>
                    </div>
                  )}

                  {/* Alert if profitable */}
                  {calculatedProfitValue > 0 && (
                    <div className="w-full mb-5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 shadow-xs flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-550" />
                      <span>Sản phẩm kinh doanh đạt mức biên ròng dương!</span>
                    </div>
                  )}

                  {/* Multi-Column Group Chart */}
                  <div className="flex items-stretch h-[290px] relative">
                    {/* Y-Axis Labels */}
                    <div className="w-10 sm:w-11 pr-2 flex flex-col-reverse justify-between text-right text-[10px] font-bold text-slate-400 select-none pb-8 pt-5">
                      {axisTicks.slice().reverse().map((tick, idx) => (
                        <span key={idx} className="block leading-none">{tick.label}</span>
                      ))}
                    </div>

                    {/* Grid & Bars Container */}
                    <div className="flex-1 h-full flex flex-col justify-between relative">
                      
                      {/* Grid Lines & Columns */}
                      <div className="flex-1 relative h-full flex items-end">
                        {/* Background horizontal lines */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8 pt-5">
                          {[...Array(6)].map((_, i) => (
                            <div key={i} className="w-full border-t border-slate-200/40 h-0" />
                          ))}
                        </div>

                        {/* Columns wrapper */}
                        <div className="absolute inset-x-0 top-0 bottom-8 flex justify-around items-end px-1 sm:px-2">
                          {chartBars.map((bar) => {
                            const heightPercent = selectedPrice > 0 ? (Math.max(0, bar.value) / selectedPrice) * 100 : 0;
                            return (
                              <div key={bar.label} className="group flex-1 max-w-[44px] sm:max-w-[48px] mx-0.5 sm:mx-1 flex flex-col justify-end items-center h-full relative">
                                {/* Ratio value badge above the bar in bold format */}
                                <span className={`text-[10px] sm:text-xs font-black mb-1.5 transition-colors ${bar.isProfit && bar.value < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                                  {bar.ratio}%
                                </span>

                                {/* The styled bar */}
                                <div 
                                  style={{ height: `${Math.max(4, Math.min(100, heightPercent))}%` }}
                                  className={`w-full bg-gradient-to-t ${bar.color} ${bar.hoverColor} rounded-t-md sm:rounded-t-lg transition-all duration-500 ease-out relative cursor-pointer shadow-xs origin-bottom`}
                                >
                                  {/* Glare reflect */}
                                  <div className="absolute inset-x-0 h-1/2 top-0 bg-white/10 rounded-t-md sm:rounded-t-lg pointer-events-none" />

                                  {/* Floating details tooltip on hover */}
                                  <div className="absolute bottom-[calc(100%+28px)] left-1/2 -translate-x-1/2 bg-slate-900/95 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-slate-700/85 backdrop-blur-xs">
                                    <span className="font-extrabold text-orange-400 block">{bar.label}</span>
                                    <div className="mt-0.5 text-white/90 font-mono">{bar.value.toLocaleString()}đ</div>
                                    <div className="w-1.5 h-1.5 bg-slate-900 border-r border-b border-slate-700/80 rotate-45 absolute left-1/2 -translate-x-1/2 bottom-[-4px]" />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* X-Axis Horizontal Line and Labels */}
                      <div className="h-8 border-t border-slate-200 relative flex justify-around items-center px-1">
                        {chartBars.map((bar) => (
                          <div key={bar.label} className="flex-1 max-w-[44px] sm:max-w-[48px] mx-0.5 sm:mx-1 text-center truncate">
                            <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-500 truncate block select-none leading-tight font-sans">
                              {bar.label}
                            </span>
                          </div>
                        ))}
                      </div>

                    </div>
                  </div>

                  {/* Total Price Cap */}
                  <div className="mt-4 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-center shadow-md border border-slate-800 select-none flex items-center justify-between text-xs">
                    <span className="font-black text-slate-400 uppercase tracking-widest text-[9px] sm:text-[10px]">Doanh thu thực nghiệm:</span>
                    <span className="font-black text-orange-400 font-mono text-sm">{selectedPrice.toLocaleString()}đ</span>
                  </div>

                </div>
              );
            })()}

            {/* Custom Structured Color Legend Grid */}
            <div id="pricing-color-legend" className="grid grid-cols-2 gap-3 pt-2">
              {finalSegments.map((segment) => {
                const isLoss = segment.id === 'profit' && segment.val < 0;
                return (
                  <div 
                    key={segment.id} 
                    className={`flex items-center gap-2.5 p-2 rounded-xl border ${segment.borderCol} ${isLoss ? 'bg-red-50/50 border-red-200 animate-pulse' : 'bg-slate-50/50'} hover:scale-[1.01] transition-all`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-lg bg-gradient-to-br ${segment.color} flex-shrink-0 ${segment.shadowClass} shadow`} />
                    <div className="overflow-hidden min-w-0">
                      <p className="text-[10px] text-slate-400 font-extrabold uppercase truncate leading-tight">{segment.name}</p>
                      <p className={`text-xs font-black mt-0.5 leading-tight ${isLoss ? 'text-red-600' : 'text-slate-800'}`}>
                        {segment.pctValue}%
                        <span className="text-[10px] font-semibold text-slate-450 ml-1 block sm:inline">
                          ({segment.val.toLocaleString()}đ)
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* EXTRA INSIGHTS NOTE */}
        <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100/80 space-y-2 text-xs text-amber-800 leading-relaxed font-sans">
          <h4 className="font-extrabold uppercase tracking-wide text-amber-900 flex items-center gap-1 font-sans">
            <Info size={14} className="text-amber-600" />
            Nhận định vận hành PiTi Store:
          </h4>
          <p>
            Đối với các dòng sản phẩm của PiTi Store như <strong className="text-amber-950 font-black">{activeCategory.name}</strong>, tỷ lệ rủi ro hoàn trả cao do tính chất dễ nứt/móp trong lúc giao vận (SPX / J&T). Việc giữ mức rủi ro hoàn khoảng <strong>{riskPercent}%</strong> đã bao gồm chi phí móp méo hộp/bình được khấu hao hợp lý.
          </p>
          <p className="font-medium text-[11px] text-amber-700">
            * Khuyến nghị: Biên lợi nhuận ròng tiêu chuẩn ngành bán lẻ bình nước nhiệt từ 20 - 25% là mức an toàn để duy trì dòng tiền Ads tối ưu nhất!
          </p>
        </div>

      </div>
    </div>
  );
}
