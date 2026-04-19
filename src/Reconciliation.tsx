import React from 'react';
import { 
  FileCheck, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Search,
  Filter,
  Download,
  AlertTriangle,
  Loader2,
  Trash2,
  ChevronRight,
  ArrowRightLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useData } from './contexts/DataContext';
import { useAuth } from './contexts/AuthContext';
import { ReconciliationService } from './services/reconciliationService';
import { Order, ReconciliationRecord } from './types';
import toast from 'react-hot-toast';

const Reconciliation: React.FC = () => {
  const { user } = useAuth();
  const { loading: dataLoading } = useData();
  const [loading, setLoading] = React.useState(false);
  const [history, setHistory] = React.useState<ReconciliationRecord[]>([]);
  const [lateOrders, setLateOrders] = React.useState<Order[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [filterStatus, setFilterStatus] = React.useState<string>('all');
  const [searchTerm, setSearchTerm] = React.useState('');

  const loadData = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [hist, late] = await Promise.all([
        ReconciliationService.fetchHistory(user.uid),
        ReconciliationService.checkLatePayments(user.uid)
      ]);
      setHistory(hist.sort((a, b) => new Date(b.reconciledAt).getTime() - new Date(a.reconciledAt).getTime()));
      setLateOrders(late);
    } catch (error) {
      console.error("Load Recon Error:", error);
      toast.error("Không thể tải dữ liệu đối soát.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    const toastId = toast.loading('Đang xử lý bảng đối soát...');
    
    try {
      const jsonData = await ReconciliationService.parseCarrierReport(file);
      if (jsonData.length === 0) throw new Error("File trống hoặc định dạng không đúng.");
      
      const results = await ReconciliationService.reconcile(user.uid, jsonData);
      toast.success(`Đã đối soát ${results.length} mã vận đơn!`, { id: toastId });
      loadData();
    } catch (error: any) {
      console.error("Upload Recon Error:", error);
      toast.error(error.message || "Lỗi khi xử lý file đối soát.", { id: toastId });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const filteredHistory = history.filter(item => {
    const matchesSearch = item.trackingCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || item.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: history.length,
    matched: history.filter(h => h.status === 'matched').length,
    discrepancy: history.filter(h => h.status === 'discrepancy').length,
    late: lateOrders.length
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-on-surface tracking-tight font-headline flex items-center gap-3">
            <ArrowRightLeft className="text-primary" size={32} />
            ĐỐI SOÁT COD
          </h1>
          <p className="text-secondary text-sm font-medium">Đối soát phí vận chuyển và dòng tiền COD từ đơn vị vận chuyển</p>
        </div>

        <div className="flex items-center gap-3 no-print">
          <label className="flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-2xl font-bold cursor-pointer hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95">
            {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
            <span>Tải bảng đối soát</span>
            <input type="file" onChange={handleFileUpload} accept=".xlsx, .xls, .csv" className="hidden" />
          </label>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Tổng bản ghi" 
          value={stats.total} 
          icon={<FileCheck />} 
          color="bg-slate-100 text-slate-600"
        />
        <StatCard 
          label="Đã khớp" 
          value={stats.matched} 
          icon={<CheckCircle2 />} 
          color="bg-green-100 text-green-600"
        />
        <StatCard 
          label="Bất thường" 
          value={stats.discrepancy} 
          icon={<AlertCircle />} 
          color="bg-red-100 text-red-600"
        />
        <StatCard 
          label="Tiền chưa về" 
          value={stats.late} 
          icon={<Clock />} 
          color="bg-amber-100 text-amber-600" 
          highlight={stats.late > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Alerts Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-surface-container shadow-sm border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2 text-amber-600 mb-4">
              <AlertTriangle size={20} />
              <h2 className="font-bold uppercase tracking-widest text-xs">Cảnh báo thu hộ muộn</h2>
            </div>
            {lateOrders.length === 0 ? (
              <p className="text-secondary text-sm italic">Không có đơn hàng nào bị chậm thanh toán COD.</p>
            ) : (
              <div className="space-y-3">
                {lateOrders.map(order => (
                  <div key={order.id} className="p-3 bg-amber-50 rounded-xl flex items-center justify-between group">
                    <div>
                      <p className="font-mono text-xs font-bold text-on-surface">#{order.trackingCode}</p>
                      <p className="text-[10px] text-amber-700">Giao {new Date(order.deliveredAt || order.processedAt!).toLocaleDateString('vi-VN')} ({'>'}7 ngày)</p>
                    </div>
                    <button className="p-2 text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface-container-low rounded-3xl p-6 border border-surface-container">
            <h3 className="font-bold text-sm mb-4">Hướng dẫn đối soát</h3>
            <ul className="text-xs text-secondary space-y-3 list-disc pl-4">
              <li>Tải file báo cáo COD từ GHN, Viettel Post hoặc Shopee.</li>
              <li>Hệ thống sẽ tự động so khớp Mã vận đơn và Số tiền cần thu.</li>
              <li>Các đơn hàng bị lệch tiền hoặc đơn không có trong hệ thống sẽ được báo đỏ.</li>
              <li>Đơn hàng <strong>Đã giao</strong> quá 7 ngày mà chưa có trong bảng đối soát sẽ ở mục "Tiền chưa về".</li>
            </ul>
          </div>
        </div>

        {/* History Table Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-2">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary" size={18} />
              <input 
                type="text"
                placeholder="Tìm mã vận đơn..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-surface-container rounded-2xl text-sm focus:ring-2 ring-primary outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Filter className="text-secondary" size={18} />
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-white border border-surface-container rounded-2xl px-4 py-3 text-sm focus:ring-2 ring-primary outline-none flex-1 md:flex-none"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="matched">Khớp hoàn toàn</option>
                <option value="discrepancy">Bất thường / Lệch</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-surface-container overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low border-bottom border-surface-container">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-widest">Mã vận đơn</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-widest">Đơn vị</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-widest text-right">Tiền hãng</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-widest text-right">Hệ thống</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-widest text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  <AnimatePresence>
                    {filteredHistory.map((item, idx) => (
                      <motion.tr 
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="group hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <p className="font-mono text-sm font-bold text-on-surface">#{item.trackingCode}</p>
                          <p className="text-[10px] text-secondary">{new Date(item.reconciledAt).toLocaleDateString('vi-VN')}</p>
                        </td>
                        <td className="px-6 py-4 font-medium text-xs text-secondary">{item.carrier}</td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-black text-xs text-on-surface">{item.carrierAmount.toLocaleString()}đ</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-medium text-xs text-secondary">{item.systemAmount.toLocaleString()}đ</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge status={item.status} />
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              {filteredHistory.length === 0 && !loading && (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center text-secondary mx-auto mb-4">
                    <Search size={32} />
                  </div>
                  <p className="text-secondary font-medium">Không tìm thấy bản ghi nào khớp với điều kiện.</p>
                </div>
              )}

              {loading && (
                <div className="p-12 text-center">
                  <Loader2 className="animate-spin text-primary mx-auto mb-2" size={32} />
                  <p className="text-secondary text-sm">Đang tải lịch sử đối soát...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  highlight?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, highlight }) => (
  <div className={`bg-white rounded-3xl p-6 border border-surface-container shadow-sm transition-all ${highlight ? 'ring-2 ring-amber-500 ring-offset-2' : ''}`}>
    <div className="flex items-center gap-4">
      <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center`}>
        {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement, { size: 24 } as any)}
      </div>
      <div>
        <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-on-surface leading-tight">{value.toLocaleString()}</p>
      </div>
    </div>
  </div>
);

const StatusBadge: React.FC<{ status: ReconciliationRecord['status'] }> = ({ status }) => {
  switch (status) {
    case 'matched':
      return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase"><CheckCircle2 size={12}/> Khớp</span>;
    case 'discrepancy':
      return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase"><AlertCircle size={12}/> Bất thường</span>;
    case 'late_payment':
      return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase"><Clock size={12}/> Thu chậm</span>;
    default:
      return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">Đang chờ</span>;
  }
};

export default Reconciliation;
