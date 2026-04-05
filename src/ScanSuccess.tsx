import React from 'react';
import { 
  CheckCircle2, 
  Scan, 
  LayoutDashboard, 
  Lightbulb 
} from 'lucide-react';
import { motion } from 'motion/react';
import { Screen } from './types';

interface ScanSuccessProps {
  onScreenChange: (screen: Screen) => void;
}

export default function ScanSuccess({ onScreenChange }: ScanSuccessProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="min-h-[80vh] flex flex-col items-center justify-center py-12"
    >
      {/* Step Progress Bar */}
      <div className="mb-12 flex justify-between items-center relative px-2 w-full max-w-md">
        <div className="absolute top-1/2 left-0 w-full h-[2px] bg-primary -translate-y-1/2 -z-10"></div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-md">
            <CheckCircle2 size={16} />
          </div>
          <span className="text-[10px] font-bold tracking-widest uppercase text-primary">Liên kết</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-md">
            <CheckCircle2 size={16} />
          </div>
          <span className="text-[10px] font-bold tracking-widest uppercase text-primary">Quét Shop</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-md">
            <CheckCircle2 size={16} />
          </div>
          <span className="text-[10px] font-bold tracking-widest uppercase text-primary">Hoàn tất</span>
        </div>
      </div>

      {/* Success Content Bento Card */}
      <section className="glass-morphism rounded-[2rem] p-8 text-center flex flex-col items-center shadow-2xl shadow-primary/5 border border-surface-container w-full max-w-lg">
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shadow-xl shadow-primary/20">
              <CheckCircle2 className="text-white" size={32} />
            </div>
          </div>
          <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-tertiary-container blur-[1px]"></div>
          <div className="absolute bottom-0 -left-4 w-6 h-6 rounded-full bg-primary-fixed blur-[2px]"></div>
        </div>

        <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface mb-3">
          Đã tạo tồn kho thành công
        </h1>
        <p className="text-secondary font-body mb-10 leading-relaxed max-w-[280px] mx-auto">
          Tất cả sản phẩm đã được thêm vào kho của bạn một cách chính xác.
        </p>

        <div className="grid grid-cols-2 gap-4 w-full mb-10">
          <div className="bg-surface-container-low rounded-2xl p-4 text-left">
            <span className="text-[10px] font-bold tracking-widest uppercase text-secondary block mb-1">Sản phẩm</span>
            <span className="text-xl font-bold text-on-surface">1,248</span>
          </div>
          <div className="bg-surface-container-low rounded-2xl p-4 text-left">
            <span className="text-[10px] font-bold tracking-widest uppercase text-secondary block mb-1">Thời gian</span>
            <span className="text-xl font-bold text-on-surface">45s</span>
          </div>
        </div>

        <div className="flex flex-col w-full gap-3">
          <button 
            onClick={() => onScreenChange('scanner')}
            className="bg-gradient-to-br from-primary to-primary-container text-white font-bold py-4 px-8 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-all duration-200"
          >
            <Scan size={20} />
            Tiếp tục quét
          </button>
          <button 
            onClick={() => onScreenChange('dashboard')}
            className="text-primary font-bold py-4 px-8 rounded-full border border-primary/20 hover:bg-primary/5 active:scale-95 transition-all duration-200"
          >
            Về Dashboard
          </button>
        </div>
      </section>

      {/* Contextual Decorative Card */}
      <div className="mt-6 glass-morphism rounded-3xl p-4 flex items-center gap-4 border border-surface-container w-full max-w-lg">
        <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center">
          <Lightbulb className="text-primary" size={24} />
        </div>
        <div className="text-left">
          <p className="text-xs font-bold text-on-surface">Mẹo quản lý</p>
          <p className="text-[11px] text-secondary">Bạn có thể thiết lập thông báo khi hàng tồn kho xuống thấp trong cài đặt.</p>
        </div>
      </div>
    </motion.div>
  );
}
