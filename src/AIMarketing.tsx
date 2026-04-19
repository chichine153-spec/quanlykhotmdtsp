import React from 'react';
import { 
  Sparkles, 
  Search, 
  Tag, 
  ShoppingBag, 
  Video, 
  Type as FontType, 
  Copy, 
  Check, 
  Loader2, 
  ArrowRight,
  RefreshCw,
  Layout,
  Instagram,
  Clapperboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { useData } from './contexts/DataContext';
import { useAuth } from './contexts/AuthContext';
import { Product } from './types';
import { MarketingService, MarketingContent } from './services/marketingService';
import toast from 'react-hot-toast';

const AIMarketing: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = React.useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [content, setContent] = React.useState<MarketingContent | null>(null);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');

  const fetchProducts = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'inventory'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const prodList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
      setProducts(prodList);
    } catch (error) {
      console.error("Fetch Products Error:", error);
      toast.error("Không thể tải danh sách sản phẩm.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleGenerate = async () => {
    if (!selectedProduct) return;
    
    setIsGenerating(true);
    try {
      const result = await MarketingService.generateMarketingContent(selectedProduct);
      setContent(result);
      toast.success("Nội dung Marketing đã sẵn sàng!");
    } catch (error: any) {
      toast.error(error.message || "Lỗi khi tạo nội dung.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Đã sao chép vào bộ nhớ tạm");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-3xl font-black text-on-surface tracking-tight font-headline flex items-center gap-3">
          <Sparkles className="text-primary" size={32} />
          AI CONTENT CREATOR
        </h1>
        <p className="text-secondary text-sm font-medium">Sáng tạo nội dung bán hàng chuẩn SEO Shopee & TikTok Script với sức mạnh từ Gemini AI</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Product Selector Panel */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl border border-surface-container shadow-sm p-6 space-y-4">
            <h2 className="font-bold flex items-center gap-2 text-on-surface">
              <ShoppingBag size={18} className="text-secondary" />
              Chọn sản phẩm
            </h2>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16} />
              <input 
                type="text"
                placeholder="Tìm SKU hoặc tên SP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-surface-container-low border border-surface-container rounded-xl text-sm outline-none focus:ring-2 ring-primary transition-all"
              />
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {loading ? (
                <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></div>
              ) : filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center gap-3 hover:bg-slate-50 ${
                    selectedProduct?.id === product.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-surface-container'
                  }`}
                >
                  <img src={product.image || 'https://picsum.photos/seed/product/50/50'} className="w-12 h-12 rounded-lg object-cover bg-slate-100" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-on-surface truncate">{product.name}</p>
                    <p className="text-[10px] text-secondary font-mono">SKU: {product.sku}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleGenerate}
              disabled={!selectedProduct || isGenerating}
              className="w-full bg-primary text-on-primary py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:brightness-110 transition-all disabled:opacity-50 disabled:grayscale"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
              Tạo Content AI
            </button>
          </div>
        </div>

        {/* Content Preview Panel */}
        <div className="lg:col-span-8 space-y-6">
          <AnimatePresence mode="wait">
            {!content ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-surface-container-low/50 rounded-3xl border-2 border-dashed border-surface-container flex flex-col items-center justify-center p-12 text-center h-full min-h-[400px]"
              >
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-primary mb-6 shadow-sm border border-surface-container">
                  <Sparkles size={40} />
                </div>
                <h3 className="text-xl font-bold text-on-surface mb-2">Trình soạn thảo AI sẵn sàng</h3>
                <p className="text-secondary text-sm max-w-sm">Chọn một sản phẩm từ danh sách bên trái và nhấn "Tạo Content AI" để bắt đầu sáng tạo nội dung viral.</p>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                {/* Result Cards */}
                <ContentCard 
                  icon={<FontType size={18} className="text-indigo-500" />}
                  label="Tiêu đề chuẩn SEO (Shopee)"
                  value={content.title}
                  onCopy={() => handleCopy(content.title, 'title')}
                  isCopied={copiedField === 'title'}
                />

                <ContentCard 
                  icon={<Layout size={18} className="text-emerald-500" />}
                  label="Mô tả sản phẩm thu hút"
                  value={content.description}
                  onCopy={() => handleCopy(content.description, 'description')}
                  isCopied={copiedField === 'description'}
                  multiline
                />

                <ContentCard 
                  icon={<Clapperboard size={18} className="text-rose-500" />}
                  label="Kịch bản TikTok 30s Viral"
                  value={content.tiktokScript}
                  onCopy={() => handleCopy(content.tiktokScript, 'tiktok')}
                  isCopied={copiedField === 'tiktok'}
                  multiline
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

interface ContentCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  onCopy: () => void;
  isCopied: boolean;
  multiline?: boolean;
}

const ContentCard: React.FC<ContentCardProps> = ({ icon, label, value, onCopy, isCopied, multiline }) => (
  <div className="bg-white rounded-3xl border border-surface-container shadow-sm p-6 overflow-hidden relative group">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{label}</span>
      </div>
      <button 
        onClick={onCopy}
        className={`p-2 rounded-xl transition-all ${isCopied ? 'bg-green-100 text-green-600' : 'bg-surface-container-low text-secondary hover:bg-surface-container opacity-0 group-hover:opacity-100'}`}
      >
        {isCopied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
    
    <div className={`${multiline ? 'text-sm' : 'text-lg font-bold'} text-on-surface leading-relaxed whitespace-pre-wrap selection:bg-primary/20`}>
      {value}
    </div>

    {/* Decorative blur */}
    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
  </div>
);

export default AIMarketing;
