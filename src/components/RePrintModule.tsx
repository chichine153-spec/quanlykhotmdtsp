import React from 'react';
import { 
  Search, 
  Printer, 
  Clock, 
  AlertCircle, 
  RotateCcw, 
  FileText,
  ChevronRight,
  Package,
  Calendar,
  X,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';

interface ShippingLabelRecord {
  id: string;
  trackingCode: string;
  pdfUrl: string;
  uploadDate: string;
  expiryDate: string;
  items: string;
  region?: string;
}

export default function RePrintModule() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [labels, setLabels] = React.useState<ShippingLabelRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;

    const labelsRef = collection(db, 'shipping_labels');
    const q = query(
      labelsRef, 
      where('userId', '==', user.uid),
      orderBy('uploadDate', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recentLabels = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ShippingLabelRecord[];
      setLabels(recentLabels);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const found = labels.find(l => 
      l.trackingCode.toLowerCase() === searchQuery.trim().toLowerCase()
    );

    if (found) {
      handleQuickPrint(found.pdfUrl);
    } else {
      alert('Không tìm thấy đơn hàng trong 15 ngày qua. Vui lòng kiểm tra lại mã vận đơn.');
    }
  };

  const handleQuickPrint = (pdfUrl: string) => {
    if (!pdfUrl) {
      alert('Không tìm thấy URL file PDF cho đơn hàng này.');
      return;
    }
    // Open PDF in a new tab for printing
    window.open(pdfUrl, '_blank');
  };

  if (!user) return null;

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface font-headline leading-none">Tra Cứu & In Lại</h2>
          <p className="text-secondary mt-2 body-md">Quản lý và in lại vận đơn trong vòng 15 ngày qua.</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-morphism rounded-[2rem] p-8 border border-white/10 shadow-lg">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nhập mã vận đơn Shopee (ví dụ: SPX...)"
            className="w-full bg-surface-container-lowest border-2 border-surface-container focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl px-14 py-5 outline-none font-bold text-lg transition-all"
          />
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-secondary" size={24} />
          <button 
            type="submit"
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
          >
            Tra cứu
          </button>
        </form>
      </div>

      {/* Recent Orders Table */}
      <div className="glass-morphism rounded-[2rem] overflow-hidden border border-white/10 shadow-lg">
        <div className="p-6 border-b border-surface-container bg-surface-container-low/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="text-primary" size={20} />
            <h3 className="text-lg font-black text-on-surface tracking-tight">Đơn hàng mới tải lên (15 ngày qua)</h3>
          </div>
          <div className="px-4 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold">
            {labels.length} đơn hàng
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/20">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Ngày tải</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Mã vận đơn</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary">Sản phẩm</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-secondary text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-secondary">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="font-bold">Đang tải dữ liệu...</p>
                    </div>
                  </td>
                </tr>
              ) : labels.length > 0 ? (
                labels.map((label) => (
                  <tr 
                    key={label.id} 
                    className="hover:bg-primary/5 transition-all group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-secondary" />
                        <span className="text-sm font-medium text-on-surface">
                          {new Date(label.uploadDate).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono font-bold text-primary">{label.trackingCode}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-medium text-secondary line-clamp-1 max-w-xs">
                        {label.items}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleQuickPrint(label.pdfUrl)}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-xs shadow-lg hover:scale-105 active:scale-95 transition-all"
                        >
                          <Printer size={14} />
                          In nhanh
                        </button>
                        <button 
                          onClick={() => handleQuickPrint(label.pdfUrl)}
                          className="p-2 text-secondary hover:bg-surface-container rounded-xl transition-all"
                          title="Mở PDF gốc"
                        >
                          <ExternalLink size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-50">
                      <RotateCcw size={48} className="text-secondary" />
                      <p className="text-lg font-bold text-secondary">Chưa có đơn hàng nào trong 15 ngày qua</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ThermalLabel({ order }: { order: any }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN');
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="thermal-label text-black font-sans" style={{ width: '100%', padding: '2mm' }}>
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
        <div className="text-2xl font-black italic tracking-tighter">Shopee</div>
        <div className="text-right">
          <div className="text-[8px] font-bold uppercase">Ngày đặt hàng: {dateStr}</div>
          <div className="text-[10px] font-black">{order.region || 'HCM-7'}</div>
        </div>
      </div>

      {/* Barcode Section */}
      <div className="flex flex-col items-center py-4 border-b-2 border-black">
        <Barcode 
          value={order.trackingCode} 
          width={1.5} 
          height={60} 
          fontSize={14} 
          margin={0}
          displayValue={true}
        />
      </div>

      {/* QR and Info */}
      <div className="grid grid-cols-3 gap-2 py-4 border-b-2 border-black">
        <div className="col-span-1 flex items-center justify-center">
          <QRCodeSVG value={order.trackingCode} size={80} />
        </div>
        <div className="col-span-2 space-y-1">
          <div className="text-[10px] font-black uppercase">Người nhận:</div>
          <div className="text-xs font-bold leading-tight line-clamp-2">NGUYỄN VĂN A (090****123)</div>
          <div className="text-[9px] leading-tight line-clamp-3">
            123 Đường Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div className="py-4">
        <div className="text-[10px] font-black uppercase mb-2">Nội dung hàng (Tổng SL: {items.reduce((acc: number, i: any) => acc + (i.quantity || 0), 0)})</div>
        <div className="space-y-2">
          {items.length > 0 ? items.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between items-start border-b border-dotted border-black/30 pb-1">
              <div className="flex-grow pr-2">
                <div className="text-[11px] font-black leading-tight">{item.productName}</div>
                <div className="text-[10px] font-bold text-gray-700">SKU: {item.sku} | Phân loại: {item.variant}</div>
              </div>
              <div className="text-xs font-black">x{item.quantity}</div>
            </div>
          )) : (
            <div className="text-[10px] italic text-gray-500">{order.items || 'Không có dữ liệu sản phẩm'}</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-4 border-t-2 border-black flex justify-between items-end">
        <div className="text-[8px] italic">In bởi Lucid Inventory lúc {timeStr} {dateStr}</div>
        <div className="text-xs font-black border-2 border-black px-2 py-1">SPX</div>
      </div>
    </div>
  );
}
