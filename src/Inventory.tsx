import React from 'react';
import { 
  Search, 
  Plus, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  Edit2, 
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  LogIn,
  CheckCircle2,
  FileText,
  History,
  Filter,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, query, addDoc, getDocs, writeBatch, doc, updateDoc, deleteDoc, orderBy, limit, serverTimestamp, where } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_PRODUCTS, Product, InventoryLog } from './types';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { X, Save, Trash2, Camera, Upload, Globe } from 'lucide-react';
import * as XLSX from 'xlsx';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';
import { ShopeeService, ScannedProduct } from './services/shopeeService';

export default function Inventory() {
  const { user, login } = useAuth();
  const { inventory: products, loading } = useData();
  const [isSeeding, setIsSeeding] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [showHistory, setShowHistory] = React.useState(false);
  const [inventoryLogs, setInventoryLogs] = React.useState<InventoryLog[]>([]);
  const [editingStockId, setEditingStockId] = React.useState<string | null>(null);
  const [quickStockValue, setQuickStockValue] = React.useState<number>(0);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [isAddingNew, setIsAddingNew] = React.useState(false);
  const [isScanning, setIsScanning] = React.useState(false);
  const [shopUrl, setShopUrl] = React.useState('');
  const [showScanner, setShowScanner] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [scannedProducts, setScannedProducts] = React.useState<ScannedProduct[]>([]);
  const [rawText, setRawText] = React.useState('');
  const [scanMode, setScanMode] = React.useState<'url' | 'text'>('url');
  const [apiKeyError, setApiKeyError] = React.useState(false);
  const confirmingDeleteIdRef = React.useRef<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bulkImportRef = React.useRef<HTMLInputElement>(null);

  const [newProduct, setNewProduct] = React.useState<Partial<Product>>({
    name: '',
    sku: '',
    stock: 0,
    variant: '',
    category: 'General',
    image: 'https://picsum.photos/seed/piti/200/200',
    costPrice: 0,
    sellingPrice: 0
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingProduct) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingProduct({
          ...editingProduct,
          image: reader.result as string
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // No local inventory listener needed anymore, using global data from DataContext
  /*
  React.useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'inventory'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(items);
      setLoading(false);
    }, (error) => {
      console.error("Inventory Listener Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);
  */

  React.useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'inventory_logs'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryLog[];
      setInventoryLogs(logs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory_logs');
    });

    return () => unsubscribe();
  }, [user]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-primary-fixed/20 rounded-full flex items-center justify-center text-primary">
          <LogIn size={40} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-bold text-on-surface mb-2">Vui lòng đăng nhập</h2>
          <p className="text-secondary mb-8">Bạn cần đăng nhập để xem và quản lý danh sách sản phẩm trong kho.</p>
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

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const status = (newProduct.stock || 0) > 10 ? 'in_stock' : ((newProduct.stock || 0) > 0 ? 'low_stock' : 'out_of_stock');
      await addDoc(collection(db, 'inventory'), {
        ...newProduct,
        userId: user.uid,
        stock: Number(newProduct.stock || 0),
        status: status,
        createdAt: new Date().toISOString()
      });

      // Log the addition
      await addDoc(collection(db, 'inventory_logs'), {
        timestamp: serverTimestamp(),
        sku: newProduct.sku,
        productName: newProduct.name,
        variant: newProduct.variant || '',
        change: Number(newProduct.stock || 0),
        type: 'addition',
        userId: user?.uid
      });

      setIsAddingNew(false);
      setNewProduct({
        name: '',
        sku: '',
        stock: 0,
        variant: '',
        category: 'General',
        image: 'https://picsum.photos/seed/piti/200/200'
      });
    } catch (error) {
      console.error("Add Error:", error);
      alert('Lỗi khi thêm sản phẩm mới.');
    } finally {
      setIsUpdating(false);
    }
  };

  const openAddVariant = (baseProduct: Product) => {
    setNewProduct({
      name: baseProduct.name,
      image: baseProduct.image,
      category: baseProduct.category,
      sku: '',
      variant: '',
      stock: 0
    });
    setIsAddingNew(true);
  };
  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setIsUpdating(true);
    try {
      const productRef = doc(db, 'inventory', editingProduct.id);
      const status = editingProduct.stock > 10 ? 'in_stock' : (editingProduct.stock > 0 ? 'low_stock' : 'out_of_stock');
      
      // Get original product to calculate change
      const originalProduct = products.find(p => p.id === editingProduct.id);
      const stockChange = originalProduct ? Number(editingProduct.stock) - originalProduct.stock : 0;

      await updateDoc(productRef, {
        name: editingProduct.name,
        sku: editingProduct.sku,
        stock: Number(editingProduct.stock),
        variant: editingProduct.variant || '',
        category: editingProduct.category || 'General',
        image: editingProduct.image,
        status: status
      });

      if (stockChange !== 0) {
        // Log the change
        await addDoc(collection(db, 'inventory_logs'), {
          timestamp: serverTimestamp(),
          sku: editingProduct.sku,
          productName: editingProduct.name,
          variant: editingProduct.variant || '',
          change: stockChange,
          type: 'manual_edit',
          userId: user?.uid
        });
      }

      setEditingProduct(null);
    } catch (error) {
      console.error("Update Error:", error);
      alert('Lỗi khi cập nhật sản phẩm.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'inventory', id));
      setEditingProduct(null);
      setConfirmingDeleteId(null);
    } catch (error) {
      console.error("Delete Error:", error);
      alert('Lỗi khi xóa sản phẩm.');
    }
  };
  const handleQuickStockUpdate = async (product: Product, newValue: number) => {
    if (newValue === product.stock) {
      setEditingStockId(null);
      return;
    }

    setIsUpdating(true);
    try {
      const productRef = doc(db, 'inventory', product.id);
      const status = newValue > 10 ? 'in_stock' : (newValue > 0 ? 'low_stock' : 'out_of_stock');
      
      await updateDoc(productRef, {
        stock: newValue,
        status: status
      });

      // Log the change
      await addDoc(collection(db, 'inventory_logs'), {
        timestamp: serverTimestamp(),
        sku: product.sku,
        productName: product.name,
        variant: product.variant || '',
        change: newValue - product.stock,
        type: 'manual_edit',
        userId: user?.uid
      });

      setEditingStockId(null);
    } catch (error) {
      console.error("Quick Update Error:", error);
      alert('Lỗi khi cập nhật tồn kho.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON (array of arrays)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (jsonData.length < 1) {
          throw new Error('File không có dữ liệu.');
        }

        // Identify if first row is header
        const firstRow = jsonData[0];
        const hasHeader = firstRow.some(cell => 
          typeof cell === 'string' && 
          (cell.toLowerCase().includes('tên') || cell.toLowerCase().includes('sku'))
        );
        
        // Find column indices if header exists
        let nameIdx = 0, skuIdx = 1, variantIdx = 2, stockIdx = 3, catIdx = 4, costIdx = 5, sellIdx = 6, destIdx = -1;
        
        if (hasHeader) {
          firstRow.forEach((cell, idx) => {
            const c = String(cell || '').toLowerCase();
            if (c.includes('tên')) nameIdx = idx;
            else if (c.includes('sku')) skuIdx = idx;
            else if (c.includes('biến thể') || c.includes('màu')) variantIdx = idx;
            else if (c.includes('tồn') || c.includes('số lượng')) stockIdx = idx;
            else if (c.includes('danh mục')) catIdx = idx;
            else if (c.includes('giá vốn')) costIdx = idx;
            else if (c.includes('giá bán')) sellIdx = idx;
            else if (c.includes('noi den')) destIdx = idx;
          });
        }

        const rows = hasHeader ? jsonData.slice(1) : jsonData;
        
        const batch = writeBatch(db);
        let count = 0;

        for (const row of rows) {
          if (!row || row.length === 0) continue;

          const name = String(row[nameIdx] || '').trim();
          const sku = String(row[skuIdx] || '').trim();
          const variant = String(row[variantIdx] || '').trim();
          const stock = parseInt(String(row[stockIdx])) || 0;
          const category = String(row[catIdx] || 'General').trim();
          const costPrice = parseInt(String(row[costIdx])) || 0;
          const sellingPrice = parseInt(String(row[sellIdx])) || 0;
          
          let destination = '';
          if (destIdx !== -1) {
            const rawDest = String(row[destIdx] || '').trim().toUpperCase();
            if (rawDest === 'HN') destination = 'Hà Nội';
            else if (rawDest === 'SG') destination = 'Hồ Chí Minh';
            else destination = rawDest;
          }

          if (!name || !sku) continue;

          const status = stock > 10 ? 'in_stock' : (stock > 0 ? 'low_stock' : 'out_of_stock');

          const newDocRef = doc(collection(db, 'inventory'));
          batch.set(newDocRef, {
            userId: user.uid,
            name,
            sku,
            variant,
            stock,
            category,
            status,
            costPrice,
            sellingPrice,
            destination,
            image: 'https://picsum.photos/seed/import/200/200',
            createdAt: new Date().toISOString()
          });

          // Log the import
          const logRef = doc(collection(db, 'inventory_logs'));
          batch.set(logRef, {
            timestamp: serverTimestamp(),
            sku,
            productName: name,
            variant,
            change: stock,
            type: 'bulk_import',
            userId: user?.uid
          });

          count++;
        }

        await batch.commit();
        alert(`Đã nhập thành công ${count} sản phẩm!`);
      } catch (error) {
        console.error("Bulk Import Error:", error);
        alert('Lỗi khi nhập dữ liệu từ file. Vui lòng kiểm tra định dạng file Excel/CSV.');
      } finally {
        setIsImporting(false);
        if (bulkImportRef.current) bulkImportRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const seedData = async () => {
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      MOCK_PRODUCTS.forEach(product => {
        const docRef = doc(collection(db, 'inventory'));
        batch.set(docRef, {
          ...product,
          userId: user.uid,
          createdAt: new Date().toISOString()
        });
      });
      await batch.commit();
      alert('Đã nạp dữ liệu mẫu thành công!');
    } catch (error) {
      console.error("Seed Error:", error);
      alert('Lỗi khi nạp dữ liệu mẫu.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleScanShop = async () => {
    const key = localStorage.getItem('gemini_api_key');
    if (!key) {
      setApiKeyError(true);
      return;
    }
    setApiKeyError(false);

    if (scanMode === 'url' && !shopUrl) return;
    if (scanMode === 'text' && !rawText) return;

    setIsScanning(true);
    setScanError(null);
    try {
      const products = await ShopeeService.scanShop(shopUrl, scanMode === 'text' ? rawText : undefined, key);
      setScannedProducts(products);
    } catch (error: any) {
      console.error("Scan Error:", error);
      if (error.message === 'MISSING_API_KEY' || error.message.includes('API Key')) {
        setScanError("Lỗi kết nối AI - Vui lòng kiểm tra lại API Key");
        setApiKeyError(true);
      } else {
        setScanError(error.message || "Không thể quét dữ liệu. Vui lòng thử lại.");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveScanned = async () => {
    if (!user || scannedProducts.length === 0) return;
    setIsUpdating(true);
    try {
      await ShopeeService.saveToInventory(user.uid, scannedProducts);
      setShowScanner(false);
      setScannedProducts([]);
      setShopUrl('');
      setRawText('');
      alert('Đã đồng bộ sản phẩm từ Shopee vào kho!');
    } catch (error) {
      console.error("Save Scanned Error:", error);
      alert('Lỗi khi lưu sản phẩm vào kho.');
    } finally {
      setIsUpdating(false);
    }
  };

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];
  const statuses = [
    { id: 'All', label: 'Tất cả trạng thái' },
    { id: 'in_stock', label: 'Còn hàng' },
    { id: 'low_stock', label: 'Sắp hết hàng' },
    { id: 'out_of_stock', label: 'Hết hàng' }
  ];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (p.variant || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2">Kho hàng</h1>
          <p className="text-secondary font-medium">Quản lý mã SKU nội bộ và số lượng tồn kho Shopee.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowScanner(true)}
            className="px-4 py-3 rounded-xl border border-primary/20 text-primary font-bold flex items-center gap-2 hover:bg-primary/5 transition-all"
          >
            <Globe size={18} />
            <span>Quét Shop Shopee</span>
          </button>
          <button 
            onClick={() => setShowHistory(true)}
            className="px-4 py-3 rounded-xl border border-surface-container text-secondary font-bold flex items-center gap-2 hover:bg-surface-container transition-all"
          >
            <History size={18} />
            <span>Lịch sử kho</span>
          </button>
          <button 
            onClick={() => bulkImportRef.current?.click()}
            disabled={isImporting}
            className="px-4 py-3 rounded-xl border border-surface-container text-secondary font-bold flex items-center gap-2 hover:bg-surface-container transition-all disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
            <span>Nhập từ Excel/CSV</span>
          </button>
          <input 
            type="file" 
            ref={bulkImportRef} 
            onChange={handleBulkImport} 
            className="hidden" 
            accept=".csv, .xlsx, .xls"
          />
          <button 
            onClick={seedData}
            disabled={isSeeding}
            className="px-4 py-3 rounded-xl border border-surface-container text-secondary font-bold flex items-center gap-2 hover:bg-surface-container transition-all disabled:opacity-50"
          >
            {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <Database size={18} />}
            <span>Nạp dữ liệu mẫu</span>
          </button>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-primary transition-colors" size={18} />
            <input 
              className="pl-10 pr-4 py-3 w-full md:w-64 bg-surface-container-high border-none rounded-xl focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all placeholder:text-secondary/50" 
              placeholder="Tìm kiếm SKU, tên sản phẩm..." 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => {
              setNewProduct({
                name: '',
                sku: '',
                stock: 0,
                variant: '',
                category: 'General',
                image: 'https://picsum.photos/seed/piti/200/200'
              });
              setIsAddingNew(true);
            }}
            className="bg-gradient-to-br from-primary to-primary-container text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg shadow-primary/10 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={20} />
            <span>Thêm SKU</span>
          </button>
        </div>
      </section>

      {/* Filters Section */}
      <section className="flex flex-wrap items-center gap-4 bg-surface-container-low/40 p-4 rounded-2xl border border-surface-container">
        <div className="flex items-center gap-2 text-secondary">
          <Filter size={16} />
          <span className="text-xs font-bold uppercase tracking-wider">Bộ lọc:</span>
        </div>
        
        <select 
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-white border border-surface-container rounded-xl px-4 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat === 'All' ? 'Tất cả danh mục' : cat}</option>
          ))}
        </select>

        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white border border-surface-container rounded-xl px-4 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        >
          {statuses.map(status => (
            <option key={status.id} value={status.id}>{status.label}</option>
          ))}
        </select>

        {(categoryFilter !== 'All' || statusFilter !== 'All' || searchTerm !== '') && (
          <button 
            onClick={() => {
              setCategoryFilter('All');
              setStatusFilter('All');
              setSearchTerm('');
            }}
            className="text-xs font-bold text-primary hover:underline"
          >
            Xóa bộ lọc
          </button>
        )}
      </section>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-container-lowest/60 glass-morphism p-6 rounded-xl shadow-sm flex flex-col gap-4 border border-white/20">
          <div className="w-10 h-10 rounded-lg bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed">
            <Package size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Tổng sản phẩm</p>
            <p className="text-3xl font-black text-on-surface">{products.length}</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest/60 glass-morphism p-6 rounded-xl shadow-sm flex flex-col gap-4 border border-white/20">
          <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Sắp hết hàng</p>
            <p className="text-3xl font-black text-primary">{products.filter(p => p.stock < 10).length}</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest/60 glass-morphism p-6 rounded-xl shadow-sm flex flex-col gap-4 border border-white/20">
          <div className="w-10 h-10 rounded-lg bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Cần nhập thêm</p>
            <p className="text-3xl font-black text-on-surface">{products.filter(p => p.stock === 0).length}</p>
          </div>
        </div>
      </div>

      {/* Inventory Table Section */}
      <div className="bg-surface-container-lowest/60 glass-morphism rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 border border-white/20">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center text-secondary gap-4">
              <Loader2 className="animate-spin" size={48} />
              <p className="font-bold">Đang tải kho hàng...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="p-20 flex flex-col items-center justify-center text-secondary gap-4">
              <Package size={48} className="opacity-20" />
              <p className="font-bold">Kho hàng trống. Hãy nạp dữ liệu mẫu hoặc thêm SKU mới.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50">
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary">Thông tin sản phẩm</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary">Mã SKU</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-center">Giá (Vốn/Bán)</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-center">Tồn kho</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-center">Trạng thái</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {(Object.entries(
                  filteredProducts
                    .reduce((acc, p) => {
                      if (!acc[p.name]) acc[p.name] = [];
                      acc[p.name].push(p);
                      return acc;
                    }, {} as Record<string, Product[]>)
                ) as [string, Product[]][]).map(([name, variants]) => (
                  <React.Fragment key={name}>
                    {/* Product Group Header Row */}
                    <tr className="bg-surface-container-low/30">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-white flex-shrink-0 overflow-hidden border border-surface-container shadow-sm">
                              <img 
                                src={variants[0].image} 
                                alt={name} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div>
                              <h3 className="text-lg font-black text-on-surface tracking-tight">{name}</h3>
                              <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
                                {variants.length} phân loại màu sắc
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <button 
                              onClick={() => setEditingProduct(variants[0])}
                              className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-all flex items-center gap-2"
                              title="Chỉnh sửa sản phẩm"
                            >
                              <Edit2 size={16} />
                              <span className="text-xs font-bold">Sửa tên/loại</span>
                            </button>
                            <button 
                              onClick={() => openAddVariant(variants[0])}
                              className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-xs font-bold hover:bg-primary hover:text-white transition-all shadow-sm"
                            >
                              <Plus size={14} />
                              Thêm màu sắc mới
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {/* Variant Rows */}
                    {variants.map((variant) => (
                      <tr key={variant.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 pl-20">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-primary/30 group-hover:bg-primary transition-colors"></div>
                            <span className="font-bold text-secondary text-sm">Màu sắc: {variant.variant || 'Mặc định'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-on-surface-variant/70">{variant.sku}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-bold text-error">{(variant.costPrice || 0).toLocaleString()}đ</span>
                            <span className="text-xs font-bold text-green-600">{(variant.sellingPrice || 0).toLocaleString()}đ</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {editingStockId === variant.id ? (
                            <div className="flex items-center justify-center gap-2">
                              <input 
                                type="number"
                                autoFocus
                                value={quickStockValue}
                                onChange={(e) => setQuickStockValue(parseInt(e.target.value) || 0)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleQuickStockUpdate(variant, quickStockValue);
                                  if (e.key === 'Escape') setEditingStockId(null);
                                }}
                                onBlur={() => handleQuickStockUpdate(variant, quickStockValue)}
                                className="w-20 px-2 py-1 bg-white border border-primary rounded-lg text-center font-black text-lg outline-none"
                              />
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingStockId(variant.id);
                                setQuickStockValue(variant.stock);
                              }}
                              className={`w-full py-2 rounded-lg hover:bg-primary/5 transition-all font-black text-lg ${variant.stock < 10 ? 'text-primary' : 'text-on-surface'}`}
                              title="Nhấn để sửa nhanh tồn kho"
                            >
                              {variant.stock}
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            variant.stock > 10 ? 'bg-tertiary-fixed text-on-tertiary-fixed' :
                            variant.stock > 0 ? 'bg-primary-fixed text-on-primary-fixed' :
                            'bg-surface-container-high text-secondary'
                          }`}>
                            {variant.stock > 10 ? 'Còn hàng' :
                             variant.stock > 0 ? 'Sắp hết' : 'Hết hàng'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button 
                              onClick={() => setEditingProduct(variant)}
                              className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-colors active:scale-90"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirmingDeleteId === variant.id) {
                                  handleDeleteProduct(variant.id);
                                } else {
                                  setConfirmingDeleteId(variant.id);
                                  setTimeout(() => setConfirmingDeleteId(null), 3000);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                confirmingDeleteId === variant.id 
                                  ? 'bg-error text-white scale-105 shadow-lg' 
                                  : 'hover:bg-error/10 text-error active:scale-90'
                              }`}
                            >
                              {confirmingDeleteId === variant.id ? (
                                <>
                                  <CheckCircle2 size={14} className="animate-pulse" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Xác nhận</span>
                                </>
                              ) : (
                                <Trash2 size={18} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="p-4 bg-surface-container-low/30 flex justify-between items-center border-t border-surface-container">
          <span className="text-xs font-medium text-secondary">Hiển thị {filteredProducts.length} sản phẩm</span>
          <div className="flex gap-2">
            <button className="p-2 rounded-lg hover:bg-white transition-colors text-secondary disabled:opacity-30">
              <ChevronLeft size={18} />
            </button>
            <button className="px-3 py-1 rounded-lg bg-primary text-white font-bold text-sm">1</button>
            <button className="p-2 rounded-lg hover:bg-white transition-colors text-secondary">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
      {/* History Modal */}
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-surface-container-lowest w-full max-w-3xl rounded-[32px] shadow-2xl overflow-hidden border border-surface-container flex flex-col max-h-[85vh]"
            >
              <div className="p-8 border-b border-surface-container flex items-center justify-between bg-surface-container-low/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <History size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-on-surface">Lịch sử biến động kho</h2>
                    <p className="text-secondary text-sm">Theo dõi các thay đổi tồn kho gần đây.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {inventoryLogs.length === 0 ? (
                  <div className="py-20 text-center text-secondary">
                    <Clock size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="font-bold">Chưa có lịch sử biến động nào.</p>
                  </div>
                ) : (
                  inventoryLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-4 p-4 bg-surface-container-low/50 rounded-2xl border border-surface-container hover:bg-surface-container-low transition-colors">
                      <div className={`mt-1 p-2 rounded-xl flex-shrink-0 ${
                        log.change > 0 ? 'bg-green-100 text-green-600' : 'bg-error-container text-error'
                      }`}>
                        {log.change > 0 ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-bold text-on-surface truncate">
                            {log.productName} {log.variant && `(${log.variant})`}
                          </p>
                          <span className="text-[10px] font-bold text-secondary whitespace-nowrap bg-surface-container-high px-2 py-1 rounded-lg">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('vi-VN') : 'Vừa xong'}
                          </span>
                        </div>
                        <p className="text-xs text-secondary mb-2">
                          Mã SKU: <span className="font-mono font-bold text-on-surface">{log.sku}</span>
                        </p>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-black px-2 py-0.5 rounded-md ${
                            log.change > 0 ? 'bg-green-500 text-white' : 'bg-error text-white'
                          }`}>
                            {log.change > 0 ? '+' : ''}{log.change}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary/60">
                            {log.type === 'deduction' ? `Khấu trừ từ đơn ${log.trackingCode}` : 
                             log.type === 'addition' ? 'Nhập thêm hàng' : 
                             log.type === 'bulk_import' ? 'Nhập hàng loạt' : 'Chỉnh sửa thủ công'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="p-6 bg-surface-container-low/30 border-t border-surface-container flex justify-end">
                <button 
                  onClick={() => setShowHistory(false)}
                  className="px-8 py-3 bg-primary text-white rounded-full font-bold shadow-lg hover:scale-105 transition-all"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Shopee Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container-lowest w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden border border-surface-container flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-surface-container flex items-center justify-between bg-surface-container-low/50">
                <div>
                  <h2 className="text-2xl font-bold text-on-surface flex items-center gap-3">
                    <Globe className="text-primary" size={28} />
                    Quét sản phẩm từ Shopee
                  </h2>
                  <p className="text-secondary text-sm">Sử dụng AI để tự động lấy danh sách sản phẩm từ link cửa hàng Shopee.</p>
                </div>
                <button 
                  onClick={() => setShowScanner(false)}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
                {apiKeyError && (
                  <div className="p-4 bg-error/10 border border-error/20 rounded-2xl flex items-center gap-4 text-error">
                    <AlertTriangle size={24} />
                    <div>
                      <p className="font-black uppercase tracking-widest text-xs">Lỗi API Key</p>
                      <p className="text-sm font-bold">VUI LÒNG NHẬP API KEY ĐỂ SỬ DỤNG</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 p-1 bg-surface-container-low rounded-2xl w-fit">
                  <button 
                    onClick={() => setScanMode('url')}
                    className={`px-6 py-2 rounded-xl font-bold text-xs transition-all ${scanMode === 'url' ? 'bg-primary text-white shadow-md' : 'text-secondary hover:bg-surface-container'}`}
                  >
                    Link Shopee
                  </button>
                  <button 
                    onClick={() => setScanMode('text')}
                    className={`px-6 py-2 rounded-xl font-bold text-xs transition-all ${scanMode === 'text' ? 'bg-primary text-white shadow-md' : 'text-secondary hover:bg-surface-container'}`}
                  >
                    Dán văn bản
                  </button>
                </div>

                {scanMode === 'url' ? (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Link cửa hàng Shopee</label>
                    <div className="flex gap-3">
                      <input 
                        type="text"
                        value={shopUrl}
                        onChange={(e) => setShopUrl(e.target.value)}
                        placeholder="https://shopee.vn/shop/12345678"
                        className="flex-1 px-6 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                      />
                      <button 
                        onClick={handleScanShop}
                        disabled={isScanning || !shopUrl}
                        className="px-8 py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                        <span>{isScanning ? 'Đang quét...' : 'Bắt đầu quét'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-secondary">Dán nội dung trang sản phẩm</label>
                    <textarea 
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Copy toàn bộ nội dung trang sản phẩm Shopee và dán vào đây..."
                      className="w-full h-48 px-6 py-4 bg-surface-container-low border border-surface-container rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium resize-none"
                    />
                    <button 
                      onClick={handleScanShop}
                      disabled={isScanning || !rawText}
                      className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                      <span>{isScanning ? 'Đang xử lý AI...' : 'Bóc tách bằng AI'}</span>
                    </button>
                  </div>
                )}

                {scanError && (
                  <div className="p-4 bg-error/10 border border-error/20 rounded-2xl text-error text-sm font-bold flex items-center gap-3">
                    <AlertTriangle size={20} />
                    {scanError}
                  </div>
                )}

                {scannedProducts.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-on-surface">Kết quả bóc tách ({scannedProducts.length} sản phẩm)</h3>
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Vui lòng kiểm tra kỹ trước khi lưu</p>
                    </div>
                    <div className="border border-surface-container rounded-2xl overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-surface-container-low/50">
                            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">Sản phẩm</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">Mã SKU</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">Phân loại</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Giá bán</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container">
                          {scannedProducts.map((p, idx) => (
                            <tr key={idx} className="hover:bg-surface-container-low/30 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-container flex-shrink-0">
                                    <img src={p.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  </div>
                                  <span className="text-xs font-bold text-on-surface line-clamp-1">{p.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{p.sku}</td>
                              <td className="px-4 py-3 text-xs text-secondary">{p.variant}</td>
                              <td className="px-4 py-3 text-xs font-bold text-green-600 text-right">{p.sellingPrice.toLocaleString()}đ</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 border-t border-surface-container bg-surface-container-low/50 flex justify-end gap-4">
                <button 
                  onClick={() => setShowScanner(false)}
                  className="px-8 py-3 rounded-2xl border border-surface-container font-bold text-secondary hover:bg-surface-container transition-all"
                >
                  Đóng
                </button>
                {scannedProducts.length > 0 && (
                  <button 
                    onClick={handleSaveScanned}
                    disabled={isUpdating}
                    className="px-8 py-3 bg-green-600 text-white rounded-2xl font-bold shadow-lg shadow-green-600/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isUpdating ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    <span>Lưu vào kho hàng</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Product Modal */}
      <AnimatePresence>
        {(editingProduct || isAddingNew) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container-lowest w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden border border-surface-container"
            >
              <div className="p-8 border-b border-surface-container flex items-center justify-between bg-surface-container-low/50">
                <div>
                  <h2 className="text-2xl font-bold text-on-surface">
                    {isAddingNew ? 'Thêm màu sắc/SKU mới' : 'Chỉnh sửa sản phẩm'}
                  </h2>
                  <p className="text-secondary text-sm">
                    {isAddingNew ? 'Tạo một phân loại mới cho sản phẩm này.' : 'Cập nhật thông tin chi tiết của SKU nội bộ.'}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setEditingProduct(null);
                    setIsAddingNew(false);
                  }}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={isAddingNew ? handleAddProduct : handleUpdateProduct} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Image Section */}
                  <div className="md:col-span-2 flex flex-col items-center gap-4 p-6 bg-surface-container-low rounded-2xl border-2 border-dashed border-surface-container">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            if (isAddingNew) {
                              setNewProduct({...newProduct, image: reader.result as string});
                            } else if (editingProduct) {
                              setEditingProduct({...editingProduct, image: reader.result as string});
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }} 
                      className="hidden" 
                      accept="image/*"
                    />
                    <div 
                      className="relative group cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-lg border-4 border-white">
                        <img 
                          src={isAddingNew ? newProduct.image : editingProduct?.image} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                        <Camera className="text-white" size={24} />
                      </div>
                    </div>
                    <div className="w-full">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold uppercase tracking-widest text-secondary">Hình ảnh sản phẩm</label>
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[10px] font-bold text-primary uppercase tracking-wider hover:underline"
                        >
                          Tải ảnh từ máy tính
                        </button>
                      </div>
                      <input 
                        type="text"
                        value={isAddingNew ? newProduct.image : editingProduct?.image}
                        onChange={(e) => {
                          if (isAddingNew) setNewProduct({...newProduct, image: e.target.value});
                          else if (editingProduct) setEditingProduct({...editingProduct, image: e.target.value});
                        }}
                        className="w-full px-4 py-3 bg-white border border-surface-container rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all text-xs text-secondary truncate"
                        placeholder="Hoặc dán link hình ảnh..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-widest text-secondary">Tên sản phẩm</label>
                    <input 
                      type="text"
                      value={isAddingNew ? newProduct.name : editingProduct?.name}
                      onChange={(e) => {
                        if (isAddingNew) setNewProduct({...newProduct, name: e.target.value});
                        else if (editingProduct) setEditingProduct({...editingProduct, name: e.target.value});
                      }}
                      className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-widest text-secondary">Mã SKU</label>
                    <input 
                      type="text"
                      value={isAddingNew ? newProduct.sku : editingProduct?.sku}
                      onChange={(e) => {
                        if (isAddingNew) setNewProduct({...newProduct, sku: e.target.value});
                        else if (editingProduct) setEditingProduct({...editingProduct, sku: e.target.value});
                      }}
                      className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
                      required
                      placeholder="Ví dụ: PITI-BINH-01"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-widest text-secondary">Màu sắc / Phân loại</label>
                    <input 
                      type="text"
                      value={isAddingNew ? newProduct.variant : editingProduct?.variant || ''}
                      onChange={(e) => {
                        if (isAddingNew) setNewProduct({...newProduct, variant: e.target.value});
                        else if (editingProduct) setEditingProduct({...editingProduct, variant: e.target.value});
                      }}
                      className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      placeholder="Ví dụ: Màu trắng, Size L"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-widest text-secondary">Tồn kho</label>
                    <input 
                      type="number"
                      value={isAddingNew ? newProduct.stock : editingProduct?.stock}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        if (isAddingNew) setNewProduct({...newProduct, stock: val});
                        else if (editingProduct) setEditingProduct({...editingProduct, stock: val});
                      }}
                      className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-primary"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-widest text-secondary">Danh mục</label>
                    <input 
                      type="text"
                      value={isAddingNew ? newProduct.category : editingProduct?.category}
                      onChange={(e) => {
                        if (isAddingNew) setNewProduct({...newProduct, category: e.target.value});
                        else if (editingProduct) setEditingProduct({...editingProduct, category: e.target.value});
                      }}
                      className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-widest text-secondary">Giá vốn (VNĐ)</label>
                    <input 
                      type="number"
                      value={isAddingNew ? newProduct.costPrice : editingProduct?.costPrice || 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        if (isAddingNew) setNewProduct({...newProduct, costPrice: val});
                        else if (editingProduct) setEditingProduct({...editingProduct, costPrice: val});
                      }}
                      className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-error"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-widest text-secondary">Giá bán (VNĐ)</label>
                    <input 
                      type="number"
                      value={isAddingNew ? newProduct.sellingPrice : editingProduct?.sellingPrice || 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        if (isAddingNew) setNewProduct({...newProduct, sellingPrice: val});
                        else if (editingProduct) setEditingProduct({...editingProduct, sellingPrice: val});
                      }}
                      className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-green-600"
                      required
                    />
                  </div>
                </div>

                <div className="pt-6 flex flex-col sm:flex-row gap-4">
                  {editingProduct && (
                    <button 
                      type="button"
                      onClick={() => {
                        if (confirmingDeleteId === editingProduct.id) {
                          handleDeleteProduct(editingProduct.id);
                        } else {
                          setConfirmingDeleteId(editingProduct.id);
                          setTimeout(() => setConfirmingDeleteId(null), 3000);
                        }
                      }}
                      className={`px-6 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${
                        confirmingDeleteId === editingProduct.id
                          ? 'bg-error text-white scale-105 shadow-lg'
                          : 'border border-error/30 text-error hover:bg-error/5'
                      }`}
                    >
                      {confirmingDeleteId === editingProduct.id ? (
                        <>
                          <CheckCircle2 size={20} />
                          <span>Xác nhận xóa</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={20} />
                          <span>Xóa sản phẩm</span>
                        </>
                      )}
                    </button>
                  )}
                  <div className="flex-1 flex gap-4">
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingProduct(null);
                        setIsAddingNew(false);
                      }}
                      className="flex-1 px-6 py-4 rounded-2xl border border-surface-container font-bold text-secondary hover:bg-surface-container transition-all"
                    >
                      Hủy
                    </button>
                    <button 
                      type="submit"
                      disabled={isUpdating}
                      className="flex-[2] bg-primary text-white px-6 py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isUpdating ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                      {isAddingNew ? 'Thêm mới' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
