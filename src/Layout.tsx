import React from 'react';
import { 
  LayoutDashboard, 
  UploadCloud, 
  Package, 
  RotateCcw, 
  Search, 
  TrendingUp,
  Bell,
  LogOut,
  LogIn,
  Menu,
  X,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Screen } from './types';
import { useAuth } from './contexts/AuthContext';
import ApiKeyManager from './components/ApiKeyManager';

interface LayoutProps {
  children: React.ReactNode;
  activeScreen: Screen;
  onScreenChange: (screen: Screen) => void;
}

export default function Layout({ children, activeScreen, onScreenChange }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const { user, login, logout, error, clearError } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Bảng điều khiển', icon: LayoutDashboard },
    { id: 'upload', label: 'Tải lên PDF', icon: UploadCloud },
    { id: 'inventory', label: 'Kho hàng', icon: Package },
    { id: 'returns', label: 'Hàng Hoàn', icon: RotateCcw },
    { id: 'stockin', label: 'Nhập kho hàng về', icon: Search },
    { id: 'reprint', label: 'In lại đơn hàng', icon: RotateCcw },
    { id: 'profit', label: 'Báo cáo lợi nhuận', icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-surface">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-white/60 backdrop-blur-xl border-b border-surface-container flex justify-between items-center px-4 md:px-8 h-16">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 hover:bg-surface-container rounded-full transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-white">
              <Package size={18} />
            </div>
            <span className="text-lg font-black tracking-tighter text-primary font-headline">LUCID INVENTORY</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <ApiKeyManager />
          {error && !user && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-bold border border-red-100">
              <AlertTriangle size={12} />
              <span>Lỗi tên miền</span>
              <button onClick={clearError} className="hover:opacity-70">
                <X size={12} />
              </button>
            </div>
          )}
          {user ? (
            <>
              <button className="p-2 text-secondary hover:bg-surface-container rounded-full transition-colors relative">
                <Bell size={20} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-white"></span>
              </button>
              <div className="flex items-center gap-3">
                <div className="hidden md:block text-right">
                  <p className="text-xs font-bold text-secondary">{user.displayName}</p>
                  <p className="text-[10px] text-secondary opacity-60">Manager</p>
                </div>
                <div className="w-10 h-10 rounded-full overflow-hidden border border-surface-container">
                  <img 
                    src={user.photoURL || "https://picsum.photos/seed/manager/100/100"} 
                    alt="User Avatar" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            </>
          ) : (
            <button 
              onClick={login}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all"
            >
              <LogIn size={18} />
              <span>Đăng nhập</span>
            </button>
          )}
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 z-[60] w-72 p-4 flex-col gap-6 bg-white/60 backdrop-blur-2xl rounded-r-3xl h-[calc(100vh-2rem)] my-4 ml-4 shadow-2xl shadow-slate-200/50">
        <div className="px-4 py-6 border-b border-surface-container">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center text-white shadow-lg">
              <Package size={24} />
            </div>
            <div>
              <p className="text-xl font-bold text-primary font-headline">Quản lý kho</p>
              <p className="text-[10px] uppercase tracking-widest text-secondary font-bold">Shopee Premium Vendor</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-2 flex-grow">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onScreenChange(item.id as Screen)}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-medium text-sm tracking-tight ${
                activeScreen === item.id 
                  ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                  : 'text-secondary hover:bg-surface-container hover:translate-x-1'
              }`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-surface-container">
          {user ? (
            <button 
              onClick={logout}
              className="flex items-center gap-3 px-4 py-3 w-full text-secondary hover:bg-surface-container rounded-xl transition-all"
            >
              <LogOut size={20} />
              <span className="text-sm font-medium">Đăng xuất</span>
            </button>
          ) : (
            <button 
              onClick={login}
              className="flex items-center gap-3 px-4 py-3 w-full text-primary hover:bg-surface-container rounded-xl transition-all"
            >
              <LogIn size={20} />
              <span className="text-sm font-medium">Đăng nhập</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[70] lg:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-72 bg-white z-[80] lg:hidden p-4 flex flex-col gap-6"
            >
              <div className="flex justify-between items-center px-2">
                <span className="text-lg font-black text-primary">LUCID INVENTORY</span>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2">
                  <X size={20} />
                </button>
              </div>
              <nav className="flex flex-col gap-2">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onScreenChange(item.id as Screen);
                      setIsSidebarOpen(false);
                    }}
                    className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
                      activeScreen === item.id 
                        ? 'bg-primary text-white shadow-lg' 
                        : 'text-secondary hover:bg-surface-container'
                    }`}
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="pt-24 pb-24 lg:pb-8 px-4 lg:ml-80">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 px-6 pb-2 bg-white/60 backdrop-blur-xl rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {navItems.slice(0, 5).map((item) => (
          <button
            key={item.id}
            onClick={() => onScreenChange(item.id as Screen)}
            className={`flex flex-col items-center justify-center transition-all active:scale-90 ${
              activeScreen === item.id ? 'text-primary' : 'text-secondary'
            }`}
          >
            <item.icon size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest mt-1">
              {item.id === 'returns' ? 'Trả hàng' : item.id === 'stockin' ? 'Nhập kho' : item.id === 'upload' ? 'Upload' : item.id === 'inventory' ? 'Kho' : item.id === 'profit' ? 'Lợi nhuận' : 'Home'}
            </span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <footer className="hidden lg:flex flex-col items-center gap-2 mt-auto w-full py-8 lg:ml-40">
        <p className="text-xs tracking-tighter opacity-50 text-secondary">© 2024 Lucid Inventory Management</p>
        <div className="flex gap-6">
          <a href="#" className="text-xs text-secondary hover:opacity-100 transition-opacity">Support</a>
          <a href="#" className="text-xs text-secondary hover:opacity-100 transition-opacity">Privacy</a>
          <a href="#" className="text-xs text-secondary hover:opacity-100 transition-opacity">Terms</a>
        </div>
      </footer>
    </div>
  );
}
