import React from 'react';
import { 
  CreditCard, 
  CheckCircle2, 
  QrCode, 
  Phone, 
  Mail, 
  ArrowRight, 
  ShieldCheck,
  Loader2,
  Banknote,
  Smartphone,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './contexts/AuthContext';

const PACKAGES = [
  { id: '1_month', label: '1 Tháng', months: 1, price: 199000, priceLabel: '199.000đ' },
  { id: '6_months', label: '6 Tháng', months: 6, price: 990000, priceLabel: '990.000đ', popular: true },
  { id: '1_year', label: '1 Năm', months: 12, price: 1690000, priceLabel: '1.690.000đ' }
];

const BANK_INFO = {
  accountName: 'BUI VAN QUY',
  accountNumber: '3333401882',
  bankName: 'Vietcombank',
  branch: 'Trụ sở CN Móng Cái'
};

export default function UpgradeAccount() {
  const { user, phone, paymentStatus } = useAuth();
  const [selectedPackage, setSelectedPackage] = React.useState(PACKAGES[1]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [hasSubmitted, setHasSubmitted] = React.useState(paymentStatus === 'pending');
  const [copied, setCopied] = React.useState<string | null>(null);
  const [userPhone, setUserPhone] = React.useState(phone || '');

  const transferContent = `Gia han ${user?.email} - ${selectedPackage.label}`;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleConfirmPayment = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        paymentStatus: 'pending',
        phone: userPhone
      });
      
      // Simulate sending email notification to admin
      console.log(`Notification sent to chichine153@gmail.com: Khách hàng ${user.email} vừa thanh toán gói ${selectedPackage.label}, vui lòng kiểm tra và kích hoạt`);
      
      setHasSubmitted(true);
    } catch (error) {
      console.error('Error confirming payment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-8">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-8"
        >
          <CheckCircle2 size={48} />
        </motion.div>
        <h2 className="text-3xl font-black text-on-surface mb-4 uppercase tracking-tight">Đã gửi yêu cầu kích hoạt</h2>
        <p className="text-secondary max-w-md mb-8 font-medium">
          Hệ thống đã ghi nhận yêu cầu của bạn. Admin sẽ kiểm tra và kích hoạt tài khoản trong giây lát. Vui lòng giữ liên lạc qua Gmail hoặc Số điện thoại.
        </p>
        <div className="bg-primary/5 p-6 rounded-3xl border border-primary/10 w-full max-w-sm">
          <p className="text-xs font-black text-primary uppercase tracking-widest mb-2">Trạng thái hiện tại</p>
          <div className="flex items-center justify-center gap-2 text-primary font-black">
            <Loader2 className="animate-spin" size={18} />
            <span>ĐANG CHỜ DUYỆT</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto py-12 px-4"
    >
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-on-surface mb-4 uppercase tracking-tighter font-headline">Nâng cấp gói Foot</h1>
        <p className="text-secondary max-w-2xl mx-auto font-medium">
          Mở khóa toàn bộ tính năng quản lý kho, bóc tách đơn hàng tự động và báo cáo lợi nhuận chuyên sâu.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        {PACKAGES.map((pkg) => (
          <div 
            key={pkg.id}
            onClick={() => setSelectedPackage(pkg)}
            className={`relative p-8 rounded-[2.5rem] border-4 transition-all cursor-pointer flex flex-col ${
              selectedPackage.id === pkg.id 
                ? 'border-primary bg-primary/5 shadow-2xl shadow-primary/10 scale-105 z-10' 
                : 'border-surface-container bg-white hover:border-primary/30'
            }`}
          >
            {pkg.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                Phổ biến nhất
              </div>
            )}
            <div className="mb-6">
              <h3 className="text-xl font-black text-on-surface mb-1">{pkg.label}</h3>
              <p className="text-xs text-secondary font-bold uppercase tracking-widest">Gói dịch vụ Foot</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-black text-primary">{pkg.priceLabel}</span>
            </div>
            <ul className="space-y-4 mb-8 flex-grow">
              {[
                'Bóc tách đơn hàng Gemini 1.5',
                'Quản lý kho hàng thông minh',
                'Báo cáo lợi nhuận chi tiết',
                'In lại đơn hàng dữ liệu gốc',
                'Hỗ trợ kỹ thuật 24/7'
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-sm font-bold text-secondary">
                  <CheckCircle2 size={16} className="text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
            <div className={`w-full py-4 rounded-2xl font-black text-center transition-all ${
              selectedPackage.id === pkg.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-surface-container text-secondary'
            }`}>
              {selectedPackage.id === pkg.id ? 'ĐANG CHỌN' : 'CHỌN GÓI'}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl border border-primary/10">
        {/* Payment Info */}
        <div className="space-y-8">
          <div>
            <h3 className="text-2xl font-black text-on-surface mb-6 flex items-center gap-3">
              <Banknote className="text-primary" size={28} />
              Thông tin thanh toán
            </h3>
            <div className="space-y-4">
              <div className="p-6 bg-surface-container-low rounded-3xl border border-surface-container relative group">
                <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">Ngân hàng</p>
                <p className="text-lg font-black text-on-surface">{BANK_INFO.bankName}</p>
                <p className="text-xs text-secondary font-bold">{BANK_INFO.branch}</p>
                <div className="absolute top-4 right-4 opacity-20 group-hover:opacity-100 transition-opacity">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Logo_Vietcombank.svg/2560px-Logo_Vietcombank.svg.png" alt="VCB" className="h-6 object-contain" />
                </div>
              </div>

              <div className="p-6 bg-surface-container-low rounded-3xl border border-surface-container flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">Số tài khoản</p>
                  <p className="text-xl font-black text-primary font-mono">{BANK_INFO.accountNumber}</p>
                </div>
                <button 
                  onClick={() => handleCopy(BANK_INFO.accountNumber, 'acc')}
                  className="p-3 bg-white rounded-xl hover:bg-primary/10 text-primary transition-all shadow-sm"
                >
                  {copied === 'acc' ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>

              <div className="p-6 bg-surface-container-low rounded-3xl border border-surface-container">
                <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">Chủ tài khoản</p>
                <p className="text-lg font-black text-on-surface">{BANK_INFO.accountName}</p>
              </div>

              <div className="p-6 bg-primary/5 rounded-3xl border-2 border-primary/20 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Nội dung chuyển khoản</p>
                  <p className="text-sm font-black text-primary">{transferContent}</p>
                </div>
                <button 
                  onClick={() => handleCopy(transferContent, 'content')}
                  className="p-3 bg-white rounded-xl hover:bg-primary/10 text-primary transition-all shadow-sm"
                >
                  {copied === 'content' ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-black text-on-surface flex items-center gap-3">
              <Smartphone className="text-primary" size={24} />
              Thông tin liên hệ
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40" size={20} />
                <input 
                  type="text"
                  readOnly
                  value={user?.email || ''}
                  className="w-full pl-12 pr-6 py-4 bg-surface-container-low border-2 border-surface-container rounded-2xl outline-none font-bold text-secondary"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40" size={20} />
                <input 
                  type="tel"
                  placeholder="Nhập số điện thoại của bạn..."
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  className="w-full pl-12 pr-6 py-4 bg-white border-2 border-primary/10 focus:border-primary rounded-2xl outline-none transition-all font-bold shadow-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="flex flex-col items-center justify-center space-y-8 bg-surface-container-low rounded-[2.5rem] p-8 border border-surface-container">
          <div className="text-center">
            <h4 className="text-xl font-black text-on-surface mb-2 uppercase tracking-tight">Quét mã QR để thanh toán</h4>
            <p className="text-xs text-secondary font-bold">Sử dụng ứng dụng Ngân hàng hoặc Ví điện tử</p>
          </div>
          
          <div className="relative p-6 bg-white rounded-[2rem] shadow-xl border-2 border-primary/10 group">
            <div className="w-64 h-64 bg-surface-container rounded-xl flex items-center justify-center overflow-hidden">
              {/* Using a placeholder QR generator with the transfer info */}
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=STB|${BANK_INFO.accountNumber}|${selectedPackage.price}|${transferContent}`} 
                alt="QR Code" 
                className="w-full h-full object-contain"
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/40 backdrop-blur-[2px] rounded-[2rem]">
              <QrCode size={48} className="text-primary" />
            </div>
          </div>

          <div className="w-full space-y-4">
            <button 
              onClick={handleConfirmPayment}
              disabled={isSubmitting || !userPhone}
              className="w-full py-5 bg-primary text-white rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle2 size={24} />}
              XÁC NHẬN ĐÃ CHUYỂN KHOẢN
            </button>
            <p className="text-[10px] text-center text-secondary font-bold uppercase tracking-widest">
              * Vui lòng nhấn xác nhận sau khi đã chuyển khoản thành công
            </p>
          </div>
        </div>
      </div>

      <div className="mt-12 flex items-center justify-center gap-8 opacity-40 grayscale">
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Logo_Vietcombank.svg/2560px-Logo_Vietcombank.svg.png" alt="VCB" className="h-6" />
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/VietinBank_logo.svg/2560px-VietinBank_logo.svg.png" alt="Vietin" className="h-6" />
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Logo_MB_Bank.svg/2560px-Logo_MB_Bank.svg.png" alt="MB" className="h-6" />
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Techcombank_logo.svg/2560px-Techcombank_logo.svg.png" alt="TCB" className="h-6" />
      </div>
    </motion.div>
  );
}
