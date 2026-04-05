import React from 'react';
import { 
  Barcode, 
  ArrowRight, 
  User, 
  Truck, 
  PlusCircle, 
  AlertCircle, 
  Printer,
  LogIn
} from 'lucide-react';
import { motion } from 'motion/react';
import { MOCK_PRODUCTS } from './types';
import { useAuth } from './contexts/AuthContext';

export default function Returns() {
  const { user, login } = useAuth();
  const [barcode, setBarcode] = React.useState('');

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-primary-fixed/20 rounded-full flex items-center justify-center text-primary">
          <LogIn size={40} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-bold text-on-surface mb-2">Vui lòng đăng nhập</h2>
          <p className="text-secondary mb-8">Bạn cần đăng nhập để thực hiện xử lý hàng hoàn và cập nhật kho hàng.</p>
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

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header Section */}
      <header>
        <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2">Hàng Hoàn</h1>
        <p className="text-secondary text-sm font-medium">Xử lý hàng hoàn từ khách hàng Shopee</p>
      </header>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Scanner Section */}
        <section className="lg:col-span-7 bg-surface-container-lowest glass-morphism rounded-[2rem] p-8 shadow-sm border border-surface-container">
          <div className="flex items-center gap-2 mb-6 text-primary">
            <Barcode size={20} />
            <span className="text-xs font-bold uppercase tracking-widest">Scanner Active</span>
          </div>
          <div className="relative group">
            <label className="absolute -top-3 left-6 bg-white px-2 text-[10px] font-bold text-secondary uppercase tracking-widest z-10">Mã vận đơn / Tracking Code</label>
            <div className="flex items-center bg-surface-container-low rounded-3xl p-2 focus-within:ring-2 ring-primary transition-all">
              <input 
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                autoFocus 
                className="w-full bg-transparent border-none focus:ring-0 text-2xl font-bold py-6 px-6 placeholder:text-slate-300" 
                placeholder="Quét barcode hoặc nhập mã SPX..." 
                type="text"
              />
              <button className="bg-gradient-to-br from-primary to-primary-container text-white p-6 rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-all">
                <ArrowRight size={24} />
              </button>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="bg-surface-container-high/40 rounded-2xl p-4 text-center">
              <p className="text-[10px] text-secondary font-bold uppercase mb-1">Hôm nay</p>
              <p className="text-2xl font-black text-on-surface">142</p>
            </div>
            <div className="bg-surface-container-high/40 rounded-2xl p-4 text-center">
              <p className="text-[10px] text-secondary font-bold uppercase mb-1">Đã xử lý</p>
              <p className="text-2xl font-black text-tertiary">128</p>
            </div>
            <div className="bg-surface-container-high/40 rounded-2xl p-4 text-center">
              <p className="text-[10px] text-secondary font-bold uppercase mb-1">Chờ duyệt</p>
              <p className="text-2xl font-black text-primary">14</p>
            </div>
          </div>
        </section>

        {/* Order Details Section */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-surface-container-lowest glass-morphism rounded-[2rem] p-8 shadow-sm border border-surface-container">
            <div className="flex justify-between items-start mb-8">
              <div>
                <span className="bg-tertiary-fixed text-on-tertiary-fixed text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter mb-2 inline-block">Đơn hàng hiện tại</span>
                <h3 className="text-xl font-bold text-on-surface">#SHP99283741</h3>
              </div>
              <Truck className="text-slate-300" size={40} />
            </div>
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-secondary-container flex items-center justify-center text-on-secondary-container">
                  <User size={24} />
                </div>
                <div>
                  <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Khách hàng</p>
                  <p className="font-bold text-on-surface">Nguyễn Minh Tuấn</p>
                </div>
              </div>
              <div className="bg-surface-container-low rounded-2xl p-4">
                <p className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-3">Sản phẩm hoàn trả</p>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-white border border-surface-container">
                    <img 
                      src={MOCK_PRODUCTS[0].image} 
                      alt="product" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold line-clamp-1">{MOCK_PRODUCTS[0].name}</p>
                    <p className="text-xs text-secondary">Size: 42 | SKU: {MOCK_PRODUCTS[0].sku}</p>
                    <div className="flex justify-between mt-1">
                      <span className="text-primary font-bold">x1</span>
                      <span className="text-xs font-medium text-tertiary">Lý do: Không vừa size</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Quick Process CTA */}
            <button className="w-full mt-8 bg-gradient-to-br from-primary to-primary-container text-white py-6 rounded-2xl shadow-xl shadow-orange-100 flex items-center justify-center gap-3 active:scale-95 transition-all group">
              <PlusCircle className="group-hover:rotate-90 transition-transform" size={28} />
              <span className="text-lg font-bold tracking-tight">Nhập thêm (+1)</span>
            </button>
          </div>

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 gap-4">
            <button className="bg-surface-container-lowest py-4 rounded-2xl text-secondary font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors border border-surface-container">
              <AlertCircle size={16} /> Khiếu nại
            </button>
            <button className="bg-surface-container-lowest py-4 rounded-2xl text-secondary font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors border border-surface-container">
              <Printer size={16} /> In tem
            </button>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
