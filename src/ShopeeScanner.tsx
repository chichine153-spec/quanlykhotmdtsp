import React from 'react';
import { 
  Link as LinkIcon, 
  Scan, 
  CheckCircle2, 
  AlertTriangle, 
  Grid, 
  Search, 
  RotateCcw,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
  LogIn,
  Save,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Screen } from './types';
import { useAuth } from './contexts/AuthContext';
import { ShopeeService, ScannedProduct } from './services/shopeeService';

interface ShopeeScannerProps {
  onSuccess: (screen: Screen) => void;
}

export default function ShopeeScanner({ onSuccess }: ShopeeScannerProps) {
  const { user, login } = useAuth();
  const [isScanning, setIsScanning] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [shopUrl, setShopUrl] = React.useState('');
  const [rawText, setRawText] = React.useState('');
  const [scanMode, setScanMode] = React.useState<'link' | 'text'>('link');
  const [scannedProducts, setScannedProducts] = React.useState<ScannedProduct[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'scanning' | 'success' | 'error'>('idle');

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-primary-fixed/20 rounded-full flex items-center justify-center text-primary">
          <LogIn size={40} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-bold text-on-surface mb-2">Vui lòng đăng nhập</h2>
          <p className="text-secondary mb-8">Bạn cần đăng nhập để thực hiện quét dữ liệu từ Shopee và cập nhật kho hàng.</p>
          <button 
            onClick={login}
            className="bg-primary text-white px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-all"
          >
            Đăng nhập ngay
          </button>
        </div>
      </div>
    );
  }

  const handleScan = async () => {
    if (scanMode === 'link' && !shopUrl.trim()) {
      setError('Vui lòng nhập link shop Shopee.');
      return;
    }
    if (scanMode === 'text' && !rawText.trim()) {
      setError('Vui lòng dán nội dung trang shop vào.');
      return;
    }

    setIsScanning(true);
    setError(null);
    setStatus('scanning');
    setScannedProducts([]);

    try {
      const products = await ShopeeService.scanShop(shopUrl, scanMode === 'text' ? rawText : undefined);
      setScannedProducts(products);
      setStatus('success');
    } catch (err: any) {
      console.error("Scan Error:", err);
      setError(err.message || 'Đã xảy ra lỗi khi quét dữ liệu.');
      setStatus('error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSave = async () => {
    if (scannedProducts.length === 0) return;

    setIsSaving(true);
    try {
      await ShopeeService.saveToInventory(scannedProducts);
      onSuccess('inventory');
    } catch (err: any) {
      console.error("Save Error:", err);
      setError('Lỗi khi lưu dữ liệu vào kho hàng.');
    } finally {
      setIsSaving(false);
    }
  };

  const validCount = scannedProducts.filter(p => p.sku && p.name).length;
  const errorCount = scannedProducts.length - validCount;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header & Progress Section */}
      <section>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-on-surface mb-2 font-headline">Quét sản phẩm từ Shopee</h1>
            <p className="text-secondary body-md">Nhập link shop để tạo tồn kho tự động thông qua công nghệ quét thông minh của Lucid.</p>
          </div>
          {/* Progress Stepper */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 bg-surface-container px-6 py-3 rounded-full border border-surface-container">
              <div className={`flex items-center gap-2 ${status === 'idle' ? 'text-primary font-bold' : 'text-secondary/60'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${status === 'idle' ? 'bg-primary text-white' : 'bg-white'}`}>1</span>
                <span className="text-xs font-medium uppercase tracking-wider">Link</span>
              </div>
              <div className="w-8 h-px bg-surface-container-high"></div>
              <div className={`flex items-center gap-2 ${status === 'scanning' ? 'text-primary font-bold' : 'text-secondary/60'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-md ${status === 'scanning' ? 'bg-primary text-white' : 'bg-white'}`}>2</span>
                <span className="text-xs uppercase tracking-wider">Quét</span>
              </div>
              <div className="w-8 h-px bg-surface-container-high"></div>
              <div className={`flex items-center gap-2 ${status === 'success' ? 'text-primary font-bold' : 'text-secondary/40'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-sm ${status === 'success' ? 'bg-primary text-white' : 'bg-white'}`}>3</span>
                <span className="text-xs uppercase tracking-wider">Kiểm tra</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search/Input Bar Bento Card */}
        <div className="bg-surface-container-lowest p-8 rounded-[2rem] shadow-sm border border-surface-container relative overflow-hidden group">
          <div className="absolute -right-12 -top-12 w-64 h-64 bg-primary/5 rounded-full blur-3xl transition-all group-hover:bg-primary/10"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <label className="block text-xs font-bold uppercase tracking-widest text-secondary">Phương thức quét</label>
              <div className="flex bg-surface-container p-1 rounded-full border border-surface-container">
                <button 
                  onClick={() => setScanMode('link')}
                  className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${scanMode === 'link' ? 'bg-primary text-white shadow-md' : 'text-secondary hover:text-primary'}`}
                >
                  Link cửa hàng
                </button>
                <button 
                  onClick={() => setScanMode('text')}
                  className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${scanMode === 'text' ? 'bg-primary text-white shadow-md' : 'text-secondary hover:text-primary'}`}
                >
                  Dán văn bản (Khuyên dùng)
                </button>
              </div>
            </div>
            {scanMode === 'link' ? (
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary/50" size={20} />
                  <input 
                    value={shopUrl}
                    onChange={(e) => setShopUrl(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-surface-container-low border-0 border-b-2 border-surface-container focus:border-primary focus:ring-0 rounded-2xl text-on-surface transition-all" 
                    placeholder="https://shopee.vn/your-shop" 
                    type="text"
                  />
                </div>
                <button 
                  onClick={handleScan}
                  disabled={isScanning}
                  className="bg-gradient-to-r from-primary to-primary-container text-white px-8 py-4 rounded-full font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl shadow-primary/20 hover:shadow-primary/30 disabled:opacity-50"
                >
                  {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Scan size={20} />}
                  Quét sản phẩm
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex items-start gap-3">
                  <AlertCircle className="text-primary shrink-0" size={20} />
                  <p className="text-sm text-secondary">
                    <span className="font-bold text-primary">Hướng dẫn:</span> Mở trang Shopee của bạn, nhấn <kbd className="bg-white px-1 rounded border shadow-sm">Ctrl + A</kbd> để chọn tất cả, sau đó <kbd className="bg-white px-1 rounded border shadow-sm">Ctrl + C</kbd> để copy và dán vào ô dưới đây. Cách này giúp tránh bị Shopee chặn.
                  </p>
                </div>
                <div className="relative">
                  <textarea 
                    placeholder="Dán nội dung trang Shopee tại đây..."
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="w-full bg-surface-container-low border-0 border-b-2 border-surface-container focus:border-primary focus:ring-0 rounded-2xl py-4 px-6 text-on-surface placeholder:text-secondary/50 outline-none transition-all text-base font-medium min-h-[200px] resize-none"
                  />
                  <button 
                    onClick={handleScan}
                    disabled={isScanning || !rawText}
                    className="absolute right-4 bottom-4 bg-primary text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 disabled:scale-100"
                  >
                    {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Scan size={20} />}
                    {isScanning ? 'Đang phân tích...' : 'Phân tích văn bản'}
                  </button>
                </div>
              </div>
            )}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 p-3 bg-error-container text-error rounded-xl flex items-center gap-2 text-sm"
                >
                  <AlertCircle size={16} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm flex items-center gap-4 border border-surface-container">
          <div className="w-14 h-14 rounded-2xl bg-tertiary-fixed flex items-center justify-center text-tertiary">
            <Grid size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Đã quét</p>
            <p className="text-2xl font-black text-on-surface">{scannedProducts.length}</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm flex items-center gap-4 border border-surface-container">
          <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center text-green-700">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Hợp lệ</p>
            <p className="text-2xl font-black text-on-surface">{validCount}</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm flex items-center gap-4 border-2 border-red-50">
          <div className="w-14 h-14 rounded-2xl bg-error-container flex items-center justify-center text-error">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Cần chỉnh sửa</p>
            <p className="text-2xl font-black text-error">{errorCount}</p>
          </div>
        </div>
      </div>

      {/* Product Table Canvas */}
      <div className="bg-surface-container-lowest rounded-[2rem] overflow-hidden shadow-sm border border-surface-container">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary">Sản phẩm</th>
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary">SKU</th>
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary">Phân loại</th>
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary">Tồn kho</th>
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high">
              {scannedProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-secondary">
                    {isScanning ? (
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="animate-spin text-primary" size={48} />
                        <p className="font-bold">Đang quét dữ liệu từ Shopee...</p>
                        <p className="text-xs max-w-xs">Quá trình này có thể mất vài giây tùy thuộc vào số lượng sản phẩm của shop.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4">
                        <Scan className="opacity-20" size={64} />
                        <p className="font-bold">Chưa có dữ liệu. Hãy nhập link shop và nhấn Quét.</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                scannedProducts.map((product, idx) => (
                  <tr key={idx} className={`${!product.sku ? 'bg-red-50/30' : ''} hover:bg-surface-container-low/30 transition-colors`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img 
                          src={product.image} 
                          alt={product.name} 
                          className="w-14 h-14 rounded-xl object-cover bg-surface-container shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <p className="font-bold text-sm text-on-surface line-clamp-1">{product.name}</p>
                          <p className="text-xs text-secondary mt-1">{product.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input 
                          id={`sku-input-${idx}`}
                          className={`bg-surface-container-low/50 border border-transparent focus:border-primary focus:bg-white rounded-lg px-2 py-1 outline-none text-sm font-medium w-32 transition-all ${!product.sku ? 'text-error border-error' : ''}`} 
                          value={product.sku}
                          onChange={(e) => {
                            const newProducts = [...scannedProducts];
                            newProducts[idx].sku = e.target.value;
                            setScannedProducts(newProducts);
                          }}
                          placeholder="Nhập SKU..."
                          type="text" 
                        />
                        <button 
                          onClick={() => document.getElementById(`sku-input-${idx}`)?.focus()}
                          className="p-1 text-primary hover:bg-primary/10 rounded-lg transition-all"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <input 
                        className="bg-transparent border-0 border-b border-surface-container focus:border-primary focus:ring-0 p-0 text-sm w-32" 
                        value={product.variant} 
                        onChange={(e) => {
                          const newProducts = [...scannedProducts];
                          newProducts[idx].variant = e.target.value;
                          setScannedProducts(newProducts);
                        }}
                        type="text" 
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input 
                        className="w-20 bg-surface-container-low border-0 rounded-lg text-sm px-3 py-1 font-bold focus:ring-1 focus:ring-primary/20" 
                        type="number" 
                        value={product.stock} 
                        onChange={(e) => {
                          const newProducts = [...scannedProducts];
                          newProducts[idx].stock = parseInt(e.target.value) || 0;
                          setScannedProducts(newProducts);
                        }}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${!product.sku ? 'bg-error-container text-error' : 'bg-green-50 text-green-700'}`}>
                        {!product.sku ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                        {!product.sku ? 'Cần sửa' : 'Hợp lệ'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Table Footer Actions */}
        {scannedProducts.length > 0 && (
          <div className="p-6 bg-surface-container-low/50 border-t border-surface-container-high flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <button 
                onClick={handleScan}
                className="flex items-center gap-2 text-sm font-bold text-secondary hover:text-primary transition-all"
              >
                <RotateCcw size={16} />
                Quét lại
              </button>
              <div className="w-px h-4 bg-surface-container-high"></div>
              <p className="text-sm text-secondary">Hiển thị {scannedProducts.length} sản phẩm</p>
            </div>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <button 
                onClick={() => setScannedProducts([])}
                className="flex-1 md:flex-none px-8 py-3 rounded-xl border border-surface-container text-secondary font-bold hover:bg-surface-container-high transition-all"
              >
                Huỷ
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || validCount === 0}
                className="flex-1 md:flex-none px-8 py-3 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                Lưu vào kho
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
