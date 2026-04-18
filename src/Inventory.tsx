import React from 'react';
import { getSupabase } from './lib/supabase';
import LowStockPanel from './components/LowStockPanel';
import { 
  Search, 
  Plus, 
  Package, 
  AlertTriangle,
  AlertCircle, 
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
  Clock,
  RotateCw,
  X,
  Save,
  Trash2,
  Camera,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, addDoc, getDocs, writeBatch, doc, updateDoc, deleteDoc, orderBy, limit, serverTimestamp, where } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_PRODUCTS, Product, InventoryLog, ProfitConfig } from './types';
import { ProfitService } from './services/profitService';
import { InventoryService } from './services/inventoryService';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { logErrorToSupabase, FRIENDLY_ERROR_MESSAGE } from './lib/error-logging';
import * as XLSX from 'xlsx';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';
import { Screen } from './types';

interface InventoryProps {
  onScreenChange?: (screen: Screen) => void;
}

export default function Inventory({ onScreenChange }: InventoryProps) {
  const { user, role, login } = useAuth();
  const { inventory: products, config: globalConfig, loading, refreshData } = useData();
  const isAdmin = role === 'admin';
  const [forecastCount, setForecastCount] = React.useState(0);
  const [isClearing, setIsClearing] = React.useState(false);
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);
  const [toasts, setToasts] = React.useState<{id: string, message: string, type: 'success' | 'error' | 'info'}[]>([]);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [showHistory, setShowHistory] = React.useState(false);
  const [inventoryLogs, setInventoryLogs] = React.useState<InventoryLog[]>([]);
  const [editingStockId, setEditingStockId] = React.useState<string | null>(null);
  const [editingInTransitId, setEditingInTransitId] = React.useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = React.useState<{id: string, type: 'cost' | 'selling'} | null>(null);
  const [quickStockValue, setQuickStockValue] = React.useState<number>(0);
  const [quickInTransitValue, setQuickInTransitValue] = React.useState<number>(0);
  const [quickPriceValue, setQuickPriceValue] = React.useState<number>(0);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [isAddingNew, setIsAddingNew] = React.useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bulkImportRef = React.useRef<HTMLInputElement>(null);

  // Fetch forecast count for the header stat
  React.useEffect(() => {
    const fetchForecastCount = async () => {
      if (!user) return;
      const supabase = getSupabase();
      if (!supabase) return;
      
      try {
        // Count items that either have a suggested restock OR are currently very low stock
        const { data, error } = await supabase
          .from('restock_forecast')
          .select('id')
          .eq('user_id', user.uid)
          .or('suggested_restock_qty.gt.0,stock_quantity.lte.5');
        
        if (!error && data) {
          setForecastCount(data.length);
        }
      } catch (e) {
        console.error('Error fetching forecast count:', e);
      }
    };
    
    fetchForecastCount();
  }, [user, products]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Basic size check for very large files
      if (file.size > 10 * 1024 * 1024) {
        addToast('File quá lớn. Vui lòng chọn ảnh dưới 10MB.', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimension 500px for good performance and small footprint
          const maxDim = 500;
          if (width > height) {
            if (width > maxDim) {
              height *= maxDim / width;
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width *= maxDim / height;
              height = maxDim;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            
            // Quality 0.6 ensures the resulting Base64 is well under the 1MB Firestore limit
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            
            if (isAddingNew) {
              setNewProduct(prev => ({ ...prev, image: dataUrl }));
            } else if (editingProduct) {
              setEditingProduct(prev => prev ? ({ ...prev, image: dataUrl }) : null);
            }
          }
          // Reset input value
          e.target.value = '';
        };
        img.onerror = () => {
          addToast('Lỗi khi xử lý ảnh.', 'error');
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        addToast('Lỗi khi đọc file ảnh.', 'error');
      };
      reader.readAsDataURL(file);
    }
  };

  // No local inventory listener needed anymore, using global data from DataContext
  const fetchHistory = async () => {
    if (!user) return;
    setIsUpdating(true);
    try {
      const q = query(
        collection(db, 'inventory_logs'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryLog[];
      setInventoryLogs(logs);
    } catch (error: any) {
      console.error('Fetch History Error:', error);
      if (error.message?.includes('Quota')) {
        addToast('Không thể tải lịch sử do hết hạn mức truy cập.', 'error');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  React.useEffect(() => {
    if (showHistory && user) {
      fetchHistory();
    }
  }, [showHistory, user]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-primary-fixed/20 rounded-full flex items-center justify-center text-primary">
          <LogIn size={40} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-black text-on-surface mb-2 uppercase tracking-tight font-headline">Zenith OMS - Vui lòng đăng nhập</h2>
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

  const [isSyncing, setIsSyncing] = React.useState(false);

  const syncToSupabase = async (itemsInput: any = products, silent: boolean = false) => {
    const items = Array.isArray(itemsInput) ? itemsInput : products;
    if (!user || items.length === 0) return;
    const supabase = getSupabase();
    if (!supabase) {
      if (!silent) addToast('Supabase chưa được cấu hình.', 'error');
      return;
    }

    if (!silent) setIsSyncing(true);
    try {
      // Robust check for items being an array
      const itemsToProcess = Array.isArray(items) ? items : [];
      if (itemsToProcess.length === 0) {
        if (!silent) setIsSyncing(false);
        return;
      }

      const supabaseData = itemsToProcess.map(p => ({
        user_id: user.uid,
        product_name: p.variant ? `${p.name} (${p.variant})` : p.name,
        sku: p.sku,
        stock_quantity: Number(p.stock),
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('inventory')
        .upsert(supabaseData, { onConflict: 'user_id,product_name' });

      if (error) throw error;
      if (!silent) addToast('Đã đồng bộ dữ liệu kho sang Supabase thành công!', 'success');
      
      // Refresh forecast count after sync
      const { data: forecastData } = await supabase
        .from('restock_forecast')
        .select('id')
        .eq('user_id', user.uid)
        .or('suggested_restock_qty.gt.0,stock_quantity.lte.5');
      
      if (forecastData) setForecastCount(forecastData.length);
    } catch (error: any) {
      console.error('Sync Error:', error);
      logErrorToSupabase(error, 'inventory_sync', user.uid);
      if (!silent) addToast(FRIENDLY_ERROR_MESSAGE, 'error');
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  // Auto-sync to Supabase when products change (debounced)
  React.useEffect(() => {
    if (!user || products.length === 0 || loading) return;
    
    const timer = setTimeout(() => {
      syncToSupabase(products, true);
    }, 3000); // 3 second debounce
    
    return () => clearTimeout(timer);
  }, [products, user]);

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
      addToast('Đã thêm sản phẩm mới thành công!', 'success');
      // Refresh global data to show new product immediately
      refreshData();
    } catch (error) {
      console.error("Add Error:", error);
      try {
        handleFirestoreError(error, OperationType.WRITE, 'inventory');
      } catch (fe: any) {
        const errObj = JSON.parse(fe.message);
        addToast(errObj.userFriendlyMessage || 'Lỗi khi thêm sản phẩm mới. Có thể ảnh quá lớn.', 'error');
      }
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
        costPrice: Number(editingProduct.costPrice || 0),
        sellingPrice: Number(editingProduct.sellingPrice || 0),
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
      addToast('Đã cập nhật thông tin sản phẩm.', 'success');
      // Refresh global data to show changes immediately
      refreshData();
    } catch (error) {
      console.error("Update Error:", error);
      try {
        handleFirestoreError(error, OperationType.UPDATE, 'inventory');
      } catch (fe: any) {
        const errObj = JSON.parse(fe.message);
        addToast(errObj.userFriendlyMessage || 'Lỗi khi cập nhật sản phẩm. Có thể ảnh quá lớn.', 'error');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    setIsUpdating(true);
    try {
      await deleteDoc(doc(db, 'inventory', id));
      setEditingProduct(null);
      setConfirmingDeleteId(null);
      addToast('Đã xoá sản phẩm khỏi kho.', 'info');
      // Refresh to update list
      refreshData();
    } catch (error) {
      console.error("Delete Error:", error);
      addToast('Lỗi khi xóa sản phẩm.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };
  const handleQuickPriceUpdate = async (product: Product, type: 'cost' | 'selling', newValue: number) => {
    const currentValue = type === 'cost' ? (product.costPrice || 0) : (product.sellingPrice || 0);
    if (newValue === currentValue) {
      setEditingPriceId(null);
      return;
    }

    setIsUpdating(true);
    try {
      const productRef = doc(db, 'inventory', product.id);
      const updateData: any = {};
      if (type === 'cost') updateData.costPrice = newValue;
      else updateData.sellingPrice = newValue;
      
      await updateDoc(productRef, updateData);

      // Log the change
      await addDoc(collection(db, 'inventory_logs'), {
        timestamp: serverTimestamp(),
        sku: product.sku,
        productName: product.name,
        variant: product.variant || '',
        change: 0,
        type: 'manual_edit',
        userId: user?.uid,
        details: `Cập nhật ${type === 'cost' ? 'giá vốn' : 'giá bán'} từ ${currentValue.toLocaleString()}đ lên ${newValue.toLocaleString()}đ`
      });

      setEditingPriceId(null);
      addToast(`Đã cập nhật ${type === 'cost' ? 'giá vốn' : 'giá bán'}.`, 'success');
      // Refresh global data to show changes immediately
      refreshData();
    } catch (error) {
      console.error("Quick Price Update Error:", error);
      addToast('Lỗi khi cập nhật giá.', 'error');
    } finally {
      setIsUpdating(false);
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
      addToast('Đã cập nhật tồn kho.', 'success');
      // Refresh global data to show changes immediately
      refreshData();
    } catch (error) {
      console.error("Quick Update Error:", error);
      addToast('Lỗi khi cập nhật tồn kho.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleQuickInTransitUpdate = async (product: Product, newValue: number) => {
    if (newValue === (product.inTransit || 0)) {
      setEditingInTransitId(null);
      return;
    }

    setIsUpdating(true);
    try {
      await InventoryService.updateInTransit(product.id, newValue);

      // Log the change
      await addDoc(collection(db, 'inventory_logs'), {
        timestamp: serverTimestamp(),
        sku: product.sku,
        productName: product.name,
        variant: product.variant || '',
        change: 0,
        type: 'manual_edit',
        userId: user?.uid,
        details: `Cập nhật số lượng đang về từ ${(product.inTransit || 0)} lên ${newValue}`
      });

      setEditingInTransitId(null);
      addToast('Đã cập nhật số lượng đang về.', 'success');
      // Refresh global data to show changes immediately
      refreshData();
    } catch (error) {
      console.error("Quick In-Transit Update Error:", error);
      addToast('Lỗi khi cập nhật số lượng đang về.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

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

        // Find the first row that actually has content (potential header or first data row)
        let firstContentRowIdx = -1;
        for (let i = 0; i < jsonData.length; i++) {
          if (jsonData[i] && jsonData[i].some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
            firstContentRowIdx = i;
            break;
          }
        }

        if (firstContentRowIdx === -1) {
          throw new Error('Không tìm thấy dữ liệu trong file.');
        }

        const firstContentRow = jsonData[firstContentRowIdx];
        
        // Better header detection
        const hasHeader = firstContentRow.some(cell => {
          if (typeof cell !== 'string') return false;
          const c = cell.toLowerCase();
          return c.includes('tên') || c.includes('sku') || c.includes('name') || c.includes('mã') || c.includes('sản phẩm') || c.includes('hàng');
        });
        
        // Default indices
        let nameIdx = 0, skuIdx = 1, variantIdx = 2, stockIdx = 3, catIdx = 4, costIdx = 5, sellIdx = 6, destIdx = -1;
        
        if (hasHeader) {
          firstContentRow.forEach((cell, idx) => {
            const c = String(cell || '').toLowerCase().trim();
            // Vietnamese & English keywords - even more robust
            if (c.includes('tên') || c === 'name' || c.includes('product') || c === 'sp') nameIdx = idx;
            else if (c.includes('sku') || c.includes('mã') || c === 'code' || c.includes('id')) skuIdx = idx;
            else if (c.includes('biến thể') || c.includes('màu') || c.includes('phân loại') || c.includes('variant') || c.includes('loại')) variantIdx = idx;
            else if (c.includes('tồn') || c.includes('số lượng') || c.includes('stock') || c === 'qty' || c.includes('sl')) stockIdx = idx;
            else if (c.includes('danh mục') || c.includes('category') || c === 'nhóm') catIdx = idx;
            else if (c.includes('giá nhập') || c.includes('giá vốn') || c.includes('cost') || c.includes('mua')) costIdx = idx;
            else if (c.includes('giá bán') || c.includes('price') || c.includes('niêm yết') || c.includes('bán')) sellIdx = idx;
            else if (c.includes('nơi đến') || c.includes('destination') || c.includes('kho')) destIdx = idx;
          });
        }

        console.log('Import Mapping Result:', { 
          hasHeader, 
          firstContentRow,
          mapping: { nameIdx, skuIdx, variantIdx, stockIdx, catIdx, costIdx, sellIdx } 
        });
        
        const rows = hasHeader ? jsonData.slice(firstContentRowIdx + 1) : jsonData.slice(firstContentRowIdx);
        
        if (rows.length > 0) {
          console.log('First data row example:', rows[0]);
        }
        
        const batch = writeBatch(db);
        let count = 0;
        let updatedCount = 0;

        // Pre-map inventory by SKU+Variant for fast lookup
        const inventoryMap = new Map();
        products.forEach(p => {
          const key = `${p.sku.toLowerCase()}_${(p.variant || '').toLowerCase()}`;
          inventoryMap.set(key, p);
        });

        for (const row of rows) {
          if (!row || row.length === 0) continue;

          // Skip rows where all important cells are empty
          const name = String(row[nameIdx] || '').trim();
          const sku = String(row[skuIdx] || '').trim();
          
          if (!name && !sku) continue;

          const variant = String(row[variantIdx] || '').trim();
          const rawStock = String(row[stockIdx] || '0').replace(/[^0-9]/g, '');
          const stock = parseInt(rawStock) || 0;
          const category = String(row[catIdx] || 'General').trim();
          const costPrice = parseInt(String(row[costIdx] || '0').replace(/[^0-9]/g, '')) || 0;
          const sellingPrice = parseInt(String(row[sellIdx] || '0').replace(/[^0-9]/g, '')) || 0;
          
          let destination = '';
          if (destIdx !== -1 && row[destIdx]) {
            const rawDest = String(row[destIdx] || '').trim().toUpperCase();
            if (rawDest === 'HN') destination = 'Hà Nội';
            else if (rawDest === 'SG') destination = 'Hồ Chí Minh';
            else destination = rawDest;
          }

          const status = stock > 10 ? 'in_stock' : (stock > 0 ? 'low_stock' : 'out_of_stock');

          // Check if SKU+Variant already exists
          const key = `${sku.toLowerCase()}_${variant.toLowerCase()}`;
          const existingProduct = inventoryMap.get(key);

          if (existingProduct) {
            // Update existing product
            const productRef = doc(db, 'inventory', existingProduct.id);
            batch.update(productRef, {
              costPrice,
              sellingPrice,
              updatedAt: new Date().toISOString()
            });
            updatedCount++;
          } else {
            // Create new product
            const newDocRef = doc(collection(db, 'inventory'));
            const productData = {
              userId: user.uid,
              name: name || 'Sản phẩm không tên',
              sku: sku || `SKU-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
              variant,
              stock,
              category,
              status,
              costPrice,
              sellingPrice,
              destination,
              image: 'https://picsum.photos/seed/import/200/200',
              createdAt: new Date().toISOString()
            };
            batch.set(newDocRef, productData);
            count++;
          }

          // Log the import (only for new ones or significant changes if needed)
          const logRef = doc(collection(db, 'inventory_logs'));
          batch.set(logRef, {
            timestamp: serverTimestamp(),
            sku: sku || 'N/A',
            productName: name || 'Sản phẩm không tên',
            variant,
            change: existingProduct ? 0 : stock,
            type: 'bulk_import',
            userId: user.uid,
            details: existingProduct ? 'Cập nhật giá từ Excel' : 'Nhập mới từ Excel'
          });
        }

        if (count > 0 || updatedCount > 0) {
          await batch.commit();
          await refreshData();
          addToast(`Đã nhập thành công: ${count} mới, ${updatedCount} cập nhật giá!`, 'success');
        } else {
          addToast('Không tìm thấy sản phẩm hợp lệ trong file.', 'info');
        }
      } catch (error) {
        console.error("Bulk Import Error:", error);
        addToast('Lỗi khi nhập dữ liệu từ file. Vui lòng kiểm tra định dạng file Excel/CSV.', 'error');
      } finally {
        setIsImporting(false);
        if (bulkImportRef.current) bulkImportRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const clearInventory = async () => {
    setIsClearing(true);
    try {
      const collectionsToClear = [
        'inventory',
        'inventory_logs',
        'orders',
        'processed_orders',
        'returns',
        'shipping_labels'
      ];

      for (const collectionName of collectionsToClear) {
        const q = query(collection(db, collectionName), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const docs = snapshot.docs;
          // Process in batches of 500
          for (let i = 0; i < docs.length; i += 500) {
            const batch = writeBatch(db);
            const chunk = docs.slice(i, i + 500);
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }
        }
      }
      
      setShowClearConfirm(false);
      addToast('Đã khôi phục kho về trạng thái gốc thành công!', 'success');
      refreshData();
    } catch (error) {
      console.error("Clear Error:", error);
      addToast('Lỗi khi xoá sạch kho hàng.', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const categories = ['All', ...Array.from(new Set((Array.isArray(products) ? products : []).map(p => p.category)))];
  const statuses = [
    { id: 'All', label: 'Tất cả trạng thái' },
    { id: 'in_stock', label: 'Còn hàng' },
    { id: 'low_stock', label: 'Sắp hết hàng' },
    { id: 'out_of_stock', label: 'Hết hàng' }
  ];

    const filteredProducts = (Array.isArray(products) ? products : []).filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (p.variant || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
      
      let matchesStatus = true;
      const stockNum = Number(p.stock);
      if (statusFilter === 'in_stock') matchesStatus = stockNum > 10;
      else if (statusFilter === 'low_stock') matchesStatus = stockNum > 0 && stockNum <= 10;
      else if (statusFilter === 'out_of_stock') matchesStatus = stockNum <= 0;
      
      return matchesSearch && matchesCategory && matchesStatus;
    });

  React.useEffect(() => {
    if (user) {
      console.log('Inventory Component State:', {
        totalProducts: products.length,
        filteredCount: filteredProducts.length,
        loading,
        userUid: user.uid,
        searchTerm,
        categoryFilter,
        statusFilter
      });
    }
  }, [products, filteredProducts, loading, user, searchTerm, categoryFilter, statusFilter]);

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
          <p className="text-secondary font-medium">Quản lý mã SKU nội bộ và số lượng tồn kho.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={refreshData}
            disabled={loading}
            className="p-3 rounded-xl border border-surface-container text-secondary hover:bg-surface-container transition-all disabled:opacity-50"
            title="Tải lại dữ liệu"
          >
            <RotateCw size={18} className={loading ? 'animate-spin' : ''} />
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
            onClick={() => syncToSupabase()}
            disabled={isSyncing || loading}
            className="px-4 py-3 rounded-xl border border-primary/20 text-primary font-bold flex items-center gap-2 hover:bg-primary/5 transition-all disabled:opacity-50"
            title="Đồng bộ dữ liệu sang Supabase để chạy dự báo"
          >
            {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <TrendingUp size={18} />}
            <span>Đồng bộ Dự báo</span>
          </button>
          <button 
            onClick={() => onScreenChange?.('intransit')}
            className="px-4 py-3 rounded-xl border border-blue-200 text-blue-600 font-bold flex items-center gap-2 hover:bg-blue-50 transition-all"
            title="Quản lý danh sách hàng đang về từ xưởng"
          >
            <ArrowDownCircle size={18} />
            <span>Nhập Hàng đang về</span>
          </button>
          <button 
            onClick={() => setShowClearConfirm(true)}
            disabled={isClearing}
            className="px-4 py-3 rounded-xl border border-error/20 text-error font-bold flex items-center gap-2 hover:bg-error/5 transition-all disabled:opacity-50"
          >
            {isClearing ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
            <span>Xoá sạch kho</span>
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

      {/* Forecast Panel Integration */}
      <section className="mb-12">
        <LowStockPanel />
      </section>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => setStatusFilter('All')}
          className={`p-6 rounded-xl shadow-sm flex flex-col gap-4 border transition-all cursor-pointer hover:scale-[1.02] active:scale-95 ${
            statusFilter === 'All' ? 'bg-white border-primary ring-2 ring-primary/20' : 'bg-surface-container-lowest/60 border-white/20'
          }`}
        >
          <div className="w-10 h-10 rounded-lg bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed">
            <Package size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Tổng sản phẩm</p>
            <p className="text-3xl font-black text-on-surface">{(Array.isArray(products) ? products : []).length}</p>
          </div>
        </div>
        <div 
          onClick={() => setStatusFilter('low_stock')}
          className={`p-6 rounded-xl shadow-sm flex flex-col gap-4 border transition-all cursor-pointer hover:scale-[1.02] active:scale-95 ${
            statusFilter === 'low_stock' ? 'bg-white border-primary ring-2 ring-primary/20' : 'bg-surface-container-lowest/60 border-white/20'
          }`}
        >
          <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Sắp hết hàng</p>
            <p className="text-3xl font-black text-primary">{(Array.isArray(products) ? products : []).filter(p => Number(p.stock) > 0 && Number(p.stock) <= 10).length}</p>
          </div>
        </div>
        <div 
          onClick={() => setStatusFilter('out_of_stock')}
          className={`p-6 rounded-xl shadow-sm flex flex-col gap-4 border transition-all cursor-pointer hover:scale-[1.02] active:scale-95 ${
            statusFilter === 'out_of_stock' ? 'bg-white border-primary ring-2 ring-primary/20' : 'bg-surface-container-lowest/60 border-white/20'
          }`}
        >
          <div className="w-10 h-10 rounded-lg bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-1">Cần nhập thêm</p>
            <p className="text-3xl font-black text-on-surface">
              {Math.max(forecastCount, (Array.isArray(products) ? products : []).filter(p => Number(p.stock) <= 5).length)}
            </p>
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
          ) : (Array.isArray(products) ? products : []).length === 0 ? (
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
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-center">Giá vốn</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-center">Giá bán</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-center">Lợi nhuận</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-center">Tồn kho</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-center">Đang về</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-widest text-secondary text-center">Phí sàn</th>
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
                        <td className="px-6 py-4 pl-20" colSpan={1}>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-surface-container bg-white shadow-sm flex-shrink-0">
                               <img 
                                 src={variant.image} 
                                 alt={variant.variant} 
                                 className="w-full h-full object-cover"
                                 referrerPolicy="no-referrer"
                                 onError={(e) => {
                                   (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/placeholder/100/100';
                                 }}
                               />
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary/30 group-hover:bg-primary transition-colors"></div>
                              <span className="font-bold text-secondary text-sm">Màu sắc: {variant.variant || 'Mặc định'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-on-surface-variant/70">{variant.sku}</td>
                        <td className="px-6 py-4 text-center">
                          {editingPriceId?.id === variant.id && editingPriceId?.type === 'cost' ? (
                            <input 
                              type="number"
                              autoFocus
                              value={quickPriceValue}
                              onChange={(e) => setQuickPriceValue(parseInt(e.target.value) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleQuickPriceUpdate(variant, 'cost', quickPriceValue);
                                if (e.key === 'Escape') setEditingPriceId(null);
                              }}
                              onBlur={() => handleQuickPriceUpdate(variant, 'cost', quickPriceValue)}
                              className="w-24 px-2 py-1 bg-white border border-primary rounded-lg text-center font-bold text-sm outline-none"
                            />
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingPriceId({ id: variant.id, type: 'cost' });
                                setQuickPriceValue(variant.costPrice || 0);
                              }}
                              className="text-sm font-bold text-error hover:bg-error/5 px-2 py-1 rounded transition-all"
                              title="Sửa giá vốn"
                            >
                              {(variant.costPrice || 0).toLocaleString()}đ
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {editingPriceId?.id === variant.id && editingPriceId?.type === 'selling' ? (
                            <input 
                              type="number"
                              autoFocus
                              value={quickPriceValue}
                              onChange={(e) => setQuickPriceValue(parseInt(e.target.value) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleQuickPriceUpdate(variant, 'selling', quickPriceValue);
                                if (e.key === 'Escape') setEditingPriceId(null);
                              }}
                              onBlur={() => handleQuickPriceUpdate(variant, 'selling', quickPriceValue)}
                              className="w-24 px-2 py-1 bg-white border border-primary rounded-lg text-center font-bold text-sm outline-none"
                            />
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingPriceId({ id: variant.id, type: 'selling' });
                                setQuickPriceValue(variant.sellingPrice || 0);
                              }}
                              className="text-sm font-bold text-green-600 hover:bg-green-50 px-2 py-1 rounded transition-all"
                              title="Sửa giá bán"
                            >
                              {(variant.sellingPrice || 0).toLocaleString()}đ
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`text-sm font-black ${(variant.sellingPrice || 0) - (variant.costPrice || 0) > 0 ? 'text-primary' : 'text-secondary'}`}>
                            {((variant.sellingPrice || 0) - (variant.costPrice || 0)).toLocaleString()}đ
                          </span>
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
                          {editingInTransitId === variant.id ? (
                            <div className="flex items-center justify-center gap-2">
                              <input 
                                type="number"
                                autoFocus
                                value={quickInTransitValue}
                                onChange={(e) => setQuickInTransitValue(parseInt(e.target.value) || 0)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleQuickInTransitUpdate(variant, quickInTransitValue);
                                  if (e.key === 'Escape') setEditingInTransitId(null);
                                }}
                                onBlur={() => handleQuickInTransitUpdate(variant, quickInTransitValue)}
                                className="w-20 px-2 py-1 bg-white border border-primary rounded-lg text-center font-black text-lg outline-none"
                              />
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingInTransitId(variant.id);
                                setQuickInTransitValue(variant.inTransit || 0);
                              }}
                              className={`w-full py-2 rounded-lg hover:bg-primary/5 transition-all font-black text-lg ${variant.inTransit ? 'text-blue-600' : 'text-secondary/40'}`}
                              title="Nhấn để sửa nhanh số lượng đang về"
                            >
                              {variant.inTransit || 0}
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-xs font-bold text-primary bg-primary/5 px-2 py-1 rounded-lg">
                            {ProfitService.getPlatformFeePercent(variant.sku, variant.name, globalConfig)}%
                          </span>
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
                              onClick={() => setConfirmingDeleteId(variant.id)}
                              className="p-2 hover:bg-error/10 text-error rounded-lg transition-colors active:scale-90"
                            >
                              <Trash2 size={18} />
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
      {/* Clear Inventory Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container-lowest w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-surface-container p-8 text-center"
            >
              <div className="w-20 h-20 bg-error/10 rounded-full flex items-center justify-center text-error mx-auto mb-6">
                <AlertTriangle size={40} />
              </div>
              <h2 className="text-2xl font-bold text-on-surface mb-2">Xác nhận xoá sạch kho?</h2>
              <p className="text-secondary mb-8">
                Hành động này sẽ xoá <strong>toàn bộ sản phẩm</strong> và <strong>lịch sử biến động kho</strong> của bạn. Dữ liệu sẽ không thể khôi phục.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={clearInventory}
                  disabled={isClearing}
                  className="w-full py-4 bg-error text-white rounded-2xl font-bold shadow-lg shadow-error/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isClearing ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                  <span>{isClearing ? 'Đang xoá...' : 'Xác nhận xoá sạch'}</span>
                </button>
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                  className="w-full py-4 bg-surface-container-low text-secondary rounded-2xl font-bold hover:bg-surface-container transition-all"
                >
                  Huỷ bỏ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
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

      {/* Add/Edit Product Modal */}
      <AnimatePresence>
        {(editingProduct || isAddingNew) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
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
                      id="product-image-input"
                      ref={fileInputRef} 
                      onChange={handleImageChange} 
                      className="hidden" 
                      accept="image/*"
                    />
                    <div 
                      className="relative group cursor-pointer"
                      onClick={() => {
                        const input = document.getElementById('product-image-input');
                        if (input) (input as HTMLInputElement).click();
                        else fileInputRef.current?.click();
                      }}
                    >
                      <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-lg border-4 border-white">
                        <img 
                          src={isAddingNew ? newProduct.image : (editingProduct?.image || '')} 
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
                          onClick={() => {
                            const input = document.getElementById('product-image-input');
                            if (input) (input as HTMLInputElement).click();
                            else fileInputRef.current?.click();
                          }}
                          className="text-[10px] font-bold text-primary uppercase tracking-wider hover:underline"
                        >
                          Tải ảnh từ máy tính
                        </button>
                      </div>
                      <input 
                        type="text"
                        value={isAddingNew ? newProduct.image : (editingProduct?.image || '')}
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
                      value={isAddingNew ? newProduct.name : (editingProduct?.name || '')}
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
                      value={isAddingNew ? newProduct.sku : (editingProduct?.sku || '')}
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
                      value={isAddingNew ? newProduct.stock : (editingProduct?.stock ?? 0)}
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
                      value={isAddingNew ? newProduct.category : (editingProduct?.category || '')}
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

      {/* Product Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmingDeleteId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm no-print">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-surface-container"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mb-6 mx-auto">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-on-surface mb-2 text-center">Xác nhận xoá</h3>
              <p className="text-sm text-secondary mb-8 text-center leading-relaxed">
                Bạn có chắc chắn muốn xoá sản phẩm này khỏi kho? Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmingDeleteId(null)}
                  disabled={isUpdating}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-secondary hover:bg-surface-container transition-all"
                >
                  Hủy
                </button>
                <button 
                  onClick={() => handleDeleteProduct(confirmingDeleteId)}
                  disabled={isUpdating}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                >
                  {isUpdating ? <Loader2 className="animate-spin" size={18} /> : 'Xác nhận xoá'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <div className="fixed bottom-24 right-8 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={`pointer-events-auto px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px] border ${
                toast.type === 'success' ? 'bg-green-50 border-green-100 text-green-800' :
                toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' :
                'bg-blue-50 border-blue-100 text-blue-800'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : 
               toast.type === 'error' ? <AlertCircle size={20} /> : 
               <Package size={20} />}
              <span className="text-sm font-bold">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
