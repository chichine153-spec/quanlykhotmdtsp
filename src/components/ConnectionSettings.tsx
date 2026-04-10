import React from 'react';
import { 
  Settings, 
  Database, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RefreshCw, 
  FileJson, 
  Play, 
  AlertTriangle,
  Copy,
  Terminal
} from 'lucide-react';
import { motion } from 'motion/react';
import { ShopeeService } from '../services/shopeeService';
import { getSupabase, resetSupabaseInstance } from '../lib/supabase';
import { GeminiService } from '../services/gemini';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { classifyError } from '../lib/errorUtils';
import { getFirebaseFirestore } from '../lib/firebaseClient';
import { getDoc, doc } from 'firebase/firestore';

export default function ConnectionSettings() {
  const [config, setConfig] = React.useState({
    geminiKey: localStorage.getItem('gemini_api_key') || '',
    supabaseUrl: localStorage.getItem('supabase_url') || '',
    supabaseKey: localStorage.getItem('supabase_anon_key') || '',
    firebaseApiKey: localStorage.getItem('fb_web_api_key') || '',
    firebaseAuthDomain: localStorage.getItem('fb_web_auth_domain') || '',
    firebaseProjectId: localStorage.getItem('fb_web_project_id') || '',
    firebaseStorageBucket: localStorage.getItem('fb_web_storage_bucket') || ''
  });

  const [status, setStatus] = React.useState<{
    gemini: 'idle' | 'checking' | 'success' | 'error';
    supabase: 'idle' | 'checking' | 'success' | 'error';
    firebase: 'idle' | 'checking' | 'success' | 'error';
    tables: 'idle' | 'checking' | 'success' | 'error';
  }>({
    gemini: 'idle',
    supabase: 'idle',
    firebase: 'idle',
    tables: 'idle'
  });

  const [errors, setErrors] = React.useState({
    gemini: '',
    supabase: '',
    firebase: '',
    tables: ''
  });

  const [isInitializing, setIsInitializing] = React.useState(false);
  const [isLoadingSample, setIsLoadingSample] = React.useState(false);
  const [showSql, setShowSql] = React.useState(false);

  const handleSave = () => {
    localStorage.setItem('gemini_api_key', config.geminiKey);
    localStorage.setItem('supabase_url', config.supabaseUrl);
    localStorage.setItem('supabase_anon_key', config.supabaseKey);
    localStorage.setItem('fb_web_api_key', config.firebaseApiKey);
    localStorage.setItem('fb_web_auth_domain', config.firebaseAuthDomain);
    localStorage.setItem('fb_web_project_id', config.firebaseProjectId);
    localStorage.setItem('fb_web_storage_bucket', config.firebaseStorageBucket);
    resetSupabaseInstance();
    alert('Đã lưu cấu hình! Hệ thống sẽ tải lại để áp dụng.');
    window.location.reload();
  };

  const checkGemini = async () => {
    setStatus(prev => ({ ...prev, gemini: 'checking' }));
    setErrors(prev => ({ ...prev, gemini: '' }));
    
    try {
      const isValid = await ShopeeService.validateApiKey(config.geminiKey);
      if (isValid) {
        setStatus(prev => ({ ...prev, gemini: 'success' }));
      } else {
        throw new Error('Sai API Key hoặc Model không hỗ trợ');
      }
    } catch (err: any) {
      setStatus(prev => ({ ...prev, gemini: 'error' }));
      const classified = classifyError(err, 'Gemini');
      setErrors(prev => ({ ...prev, gemini: classified.message }));
    }
  };

  const checkSupabase = async () => {
    setStatus(prev => ({ ...prev, supabase: 'checking' }));
    setErrors(prev => ({ ...prev, supabase: '' }));
    
    try {
      // Use current input values for testing, not just what's in localStorage
      const supabase = getSupabase(config.supabaseUrl, config.supabaseKey);
      if (!supabase) throw new Error('Vui lòng nhập đầy đủ URL và Key');
      
      // Check if table exists and has the required user_id column
      const { error } = await supabase.from('print_history').select('id, user_id').limit(1);
      
      if (error) {
        if (error.message.includes('relation "print_history" does not exist')) {
          throw new Error('Kết nối thành công nhưng chưa có bảng print_history');
        }
        if (error.message.includes('column "user_id" does not exist')) {
          throw new Error('Bảng print_history bị thiếu cột user_id. Vui lòng chạy lại SQL Script.');
        }
        throw error;
      }
      
      setStatus(prev => ({ ...prev, supabase: 'success' }));
    } catch (err: any) {
      setStatus(prev => ({ ...prev, supabase: 'error' }));
      const classified = classifyError(err, 'Supabase');
      setErrors(prev => ({ ...prev, supabase: classified.message }));
    }
  };

  const checkFirebase = async () => {
    setStatus(prev => ({ ...prev, firebase: 'checking' }));
    setErrors(prev => ({ ...prev, firebase: '' }));

    try {
      // Temporarily save to test
      localStorage.setItem('fb_web_api_key', config.firebaseApiKey);
      localStorage.setItem('fb_web_project_id', config.firebaseProjectId);
      
      const firestore = getFirebaseFirestore();
      if (!firestore) throw new Error('Cấu hình Firebase không hợp lệ');

      // Attempt a simple read to test connection
      // We use a dummy doc path
      await getDoc(doc(firestore, 'test_connection', 'ping'));
      
      setStatus(prev => ({ ...prev, firebase: 'success' }));
    } catch (err: any) {
      setStatus(prev => ({ ...prev, firebase: 'error' }));
      const classified = classifyError(err, 'Firebase');
      setErrors(prev => ({ ...prev, firebase: classified.message }));
    }
  };

  const initializeTables = async () => {
    setIsInitializing(true);
    setStatus(prev => ({ ...prev, tables: 'checking' }));
    
    try {
      // Use current input values
      const supabase = getSupabase(config.supabaseUrl, config.supabaseKey);
      if (!supabase) throw new Error('Chưa cấu hình Supabase');

      // Check if tables exist
      const { error: checkError } = await supabase.from('print_history').select('id').limit(1);
      
      if (checkError && checkError.message.includes('relation "print_history" does not exist')) {
        setShowSql(true);
        throw new Error('Vui lòng chạy SQL Script bên dưới trong Supabase SQL Editor');
      }

      setStatus(prev => ({ ...prev, tables: 'success' }));
    } catch (err: any) {
      setStatus(prev => ({ ...prev, tables: 'error' }));
      setErrors(prev => ({ ...prev, tables: err.message }));
    } finally {
      setIsInitializing(false);
    }
  };

  const loadSampleData = async () => {
    setIsLoadingSample(true);
    try {
      // Use current input values
      const supabase = getSupabase(config.supabaseUrl, config.supabaseKey);
      if (!supabase) throw new Error('Chưa cấu hình Supabase');

      // 1. Add sample to Firestore inventory
      const inventoryRef = collection(db, 'inventory');
      await addDoc(inventoryRef, {
        userId: auth.currentUser?.uid,
        sku: 'SAMPLE-01',
        name: 'Sản phẩm mẫu (Cốc giữ nhiệt)',
        variant: 'Màu Trắng',
        stock: 50,
        status: 'in_stock',
        category: 'Gia dụng',
        costPrice: 150000,
        sellingPrice: 250000,
        createdAt: new Date().toISOString()
      });

      // 2. Add sample to Supabase print_history
      await supabase.from('print_history').insert({
        user_id: auth.currentUser?.uid,
        tracking_number: 'SPX-SAMPLE-123',
        product_name: 'Sản phẩm mẫu (Cốc giữ nhiệt) Màu Trắng',
        quantity: 1,
        image_url: 'https://picsum.photos/seed/sample/800/1200',
        is_cup: true,
        created_at: new Date().toISOString()
      });

      alert('Đã tải dữ liệu mẫu thành công!');
    } catch (err: any) {
      alert('Lỗi tải dữ liệu mẫu: ' + err.message);
    } finally {
      setIsLoadingSample(false);
    }
  };

  const sqlScript = `
-- 1. Tạo bảng lịch sử in (nếu chưa có)
CREATE TABLE IF NOT EXISTS public.print_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    tracking_number TEXT NOT NULL,
    product_name TEXT,
    quantity INTEGER DEFAULT 1,
    image_url TEXT,
    is_cup BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tạo bảng tồn kho (Inventory) trên Supabase
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT,
    stock_quantity INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, product_name)
);

-- 3. Tạo View Dự báo nhập hàng thông minh (Restock Forecast)
CREATE OR REPLACE VIEW public.restock_forecast AS
WITH sales_velocity AS (
    SELECT 
        user_id,
        product_name,
        SUM(quantity) as total_sold_10d,
        SUM(quantity) / 10.0 as daily_velocity
    FROM public.print_history
    WHERE created_at >= now() - INTERVAL '10 days'
    GROUP BY user_id, product_name
)
SELECT 
    i.id,
    i.user_id,
    i.product_name,
    i.sku,
    i.stock_quantity,
    COALESCE(v.daily_velocity, 0) as daily_velocity,
    CASE 
        WHEN COALESCE(v.daily_velocity, 0) = 0 THEN 999 
        ELSE i.stock_quantity / v.daily_velocity 
    END as days_until_empty,
    CASE 
        WHEN (CASE WHEN COALESCE(v.daily_velocity, 0) = 0 THEN 999 ELSE i.stock_quantity / v.daily_velocity END) <= 3 
        THEN CEIL((COALESCE(v.daily_velocity, 0) * 15) - i.stock_quantity)
        ELSE 0 
    END as suggested_restock_qty
FROM public.inventory i
LEFT JOIN sales_velocity v ON i.product_name = v.product_name AND i.user_id = v.user_id;

-- 4. Bật RLS và tạo Policy
ALTER TABLE public.print_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon access for all" ON public.print_history;
CREATE POLICY "Allow anon access for all" ON public.print_history FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon access for inventory" ON public.inventory;
CREATE POLICY "Allow anon access for inventory" ON public.inventory FOR ALL TO anon USING (true) WITH CHECK (true);
`.trim();

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-2xl text-primary">
            <Settings size={24} />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-on-surface uppercase font-headline">Cấu hình kết nối</h1>
        </div>
        <p className="text-secondary text-sm">Thiết lập AI và Cơ sở dữ liệu riêng để làm chủ hoàn toàn dữ liệu của bạn.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AI Configuration */}
        <div className="glass-morphism rounded-[2rem] p-8 border border-surface-container space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 rounded-xl text-purple-600">
              <Cpu size={20} />
            </div>
            <h2 className="font-black text-sm uppercase tracking-widest">AI Kết nối (Gemini)</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Gemini API Key</label>
              <input 
                type="password"
                value={config.geminiKey}
                onChange={(e) => setConfig({ ...config, geminiKey: e.target.value })}
                placeholder="Dán API Key từ Google AI Studio..."
                className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button 
                onClick={checkGemini}
                disabled={status.gemini === 'checking' || !config.geminiKey}
                className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-xl text-xs font-bold hover:bg-surface-container-high transition-all disabled:opacity-50"
              >
                {status.gemini === 'checking' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Kiểm tra kết nối
              </button>

              {status.gemini === 'success' && (
                <div className="flex items-center gap-1 text-green-600 text-[10px] font-black uppercase">
                  <CheckCircle2 size={14} /> Hoạt động
                </div>
              )}
              {status.gemini === 'error' && (
                <div className="flex items-center gap-1 text-error text-[10px] font-black uppercase">
                  <XCircle size={14} /> {errors.gemini}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Database Configuration */}
        <div className="glass-morphism rounded-[2rem] p-8 border border-surface-container space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
              <Database size={20} />
            </div>
            <h2 className="font-black text-sm uppercase tracking-widest">Cơ sở dữ liệu (Supabase)</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Supabase URL</label>
              <input 
                type="text"
                value={config.supabaseUrl}
                onChange={(e) => setConfig({ ...config, supabaseUrl: e.target.value })}
                placeholder="https://your-project.supabase.co"
                className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Supabase Anon Key</label>
              <input 
                type="password"
                value={config.supabaseKey}
                onChange={(e) => setConfig({ ...config, supabaseKey: e.target.value })}
                placeholder="Dán Anon Key..."
                className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
              />
              {(() => {
                try {
                  if (config.supabaseKey.startsWith('eyJ') && config.supabaseKey.includes('.')) {
                    const payload = JSON.parse(atob(config.supabaseKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                    if (payload.role === 'service_role') {
                      return (
                        <p className="text-[10px] text-error font-bold flex items-center gap-1">
                          <AlertTriangle size={10} /> Cảnh báo: Bạn đang dùng Service Role Key. Vui lòng dùng Anon Key để bảo mật.
                        </p>
                      );
                    }
                  }
                } catch (e) {
                  // Ignore decoding errors
                }
                return null;
              })()}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button 
                onClick={checkSupabase}
                disabled={status.supabase === 'checking' || !config.supabaseKey}
                className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-xl text-xs font-bold hover:bg-surface-container-high transition-all disabled:opacity-50"
              >
                {status.supabase === 'checking' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Kiểm tra kết nối
              </button>

              {status.supabase === 'success' && (
                <div className="flex items-center gap-1 text-green-600 text-[10px] font-black uppercase">
                  <CheckCircle2 size={14} /> Hoạt động
                </div>
              )}
              {status.supabase === 'error' && (
                <div className="flex items-center gap-1 text-error text-[10px] font-black uppercase">
                  <XCircle size={14} /> {errors.supabase}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Firebase Web Data Configuration */}
        <div className="glass-morphism rounded-[2rem] p-8 border border-surface-container space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 rounded-xl text-orange-600">
              <Database size={20} />
            </div>
            <h2 className="font-black text-sm uppercase tracking-widest">KẾT NỐI FIREBASE (WEB DATA)</h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-secondary uppercase tracking-widest">API Key</label>
                <input 
                  type="password"
                  value={config.firebaseApiKey}
                  onChange={(e) => setConfig({ ...config, firebaseApiKey: e.target.value })}
                  placeholder="Firebase API Key..."
                  className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Auth Domain</label>
                <input 
                  type="text"
                  value={config.firebaseAuthDomain}
                  onChange={(e) => setConfig({ ...config, firebaseAuthDomain: e.target.value })}
                  placeholder="project.firebaseapp.com"
                  className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Project ID</label>
                <input 
                  type="text"
                  value={config.firebaseProjectId}
                  onChange={(e) => setConfig({ ...config, firebaseProjectId: e.target.value })}
                  placeholder="my-project-id"
                  className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Storage Bucket</label>
                <input 
                  type="text"
                  value={config.firebaseStorageBucket}
                  onChange={(e) => setConfig({ ...config, firebaseStorageBucket: e.target.value })}
                  placeholder="project.appspot.com"
                  className="w-full px-4 py-3 bg-surface-container-low rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all"
                />
              </div>
            </div>
            <p className="text-[10px] text-secondary italic">Dùng để kết nối và lưu trữ thông tin cho Trang web bán hàng riêng của bạn.</p>
            
            <div className="flex items-center justify-between pt-2">
              <button 
                onClick={checkFirebase}
                disabled={status.firebase === 'checking' || !config.firebaseApiKey}
                className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-xl text-xs font-bold hover:bg-surface-container-high transition-all disabled:opacity-50"
              >
                {status.firebase === 'checking' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Kiểm tra kết nối
              </button>

              {status.firebase === 'success' && (
                <div className="flex items-center gap-1 text-green-600 text-[10px] font-black uppercase">
                  <CheckCircle2 size={14} /> Hoạt động
                </div>
              )}
              {status.firebase === 'error' && (
                <div className="flex items-center gap-1 text-error text-[10px] font-black uppercase">
                  <XCircle size={14} /> {errors.firebase}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Section */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={handleSave}
            className="flex-1 min-w-[200px] py-4 bg-primary text-white rounded-2xl font-black text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={20} />
            LƯU VÀ ÁP DỤNG CẤU HÌNH
          </button>

          <button 
            onClick={initializeTables}
            disabled={status.supabase !== 'success' || isInitializing}
            className="flex-1 min-w-[200px] py-4 bg-surface-container text-on-surface rounded-2xl font-black text-sm hover:bg-surface-container-high transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isInitializing ? <Loader2 size={20} className="animate-spin" /> : <Terminal size={20} />}
            KHỞI TẠO CƠ SỞ DỮ LIỆU
          </button>

          <button 
            onClick={loadSampleData}
            disabled={status.supabase !== 'success' || isLoadingSample}
            className="flex-1 min-w-[200px] py-4 bg-surface-container text-on-surface rounded-2xl font-black text-sm hover:bg-surface-container-high transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoadingSample ? <Loader2 size={20} className="animate-spin" /> : <FileJson size={20} />}
            TẢI DỮ LIỆU MẪU
          </button>
        </div>

        {/* SQL Script Display */}
        {showSql && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-container-lowest rounded-[2rem] p-8 border border-surface-container overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-error">
                <AlertTriangle size={20} />
                <span className="font-black text-sm uppercase tracking-widest">Cần khởi tạo bảng thủ công</span>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(sqlScript);
                  alert('Đã sao chép SQL Script!');
                }}
                className="flex items-center gap-2 px-3 py-1 bg-surface-container rounded-lg text-[10px] font-black hover:bg-surface-container-high transition-all"
              >
                <Copy size={12} /> SAO CHÉP SQL
              </button>
            </div>
            
            <p className="text-xs text-secondary mb-4">
              Vui lòng truy cập <b>Supabase Dashboard {'>'} SQL Editor</b>, dán đoạn mã bên dưới và nhấn <b>Run</b> để tạo các bảng cần thiết.
            </p>

            <pre className="bg-black text-green-400 p-6 rounded-xl text-[10px] font-mono overflow-x-auto border border-white/10">
              {sqlScript}
            </pre>
          </motion.div>
        )}
      </div>

      {/* Help Section */}
      <div className="p-8 bg-primary/5 rounded-[2rem] border border-primary/10">
        <h3 className="font-black text-sm uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
          <Play size={16} fill="currentColor" /> Hướng dẫn nhanh
        </h3>
        <ul className="space-y-3">
          {[
            'Truy cập Google AI Studio để lấy Gemini API Key miễn phí.',
            'Tạo một dự án Supabase mới để lưu trữ ảnh vận đơn và lịch sử in.',
            'Vào mục Storage > Create New Bucket: Đặt tên là "shipping-labels" và bật chế độ "Public".',
            'Copy URL và Anon Key từ mục Project Settings > API trong Supabase.',
            'Nhấn "Kiểm tra kết nối" để đảm bảo mọi thứ đã sẵn sàng.',
            'Dùng SQL Script bên dưới để tạo bảng print_history trong SQL Editor.'
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-xs text-secondary leading-relaxed">
              <span className="font-black text-primary">0{i+1}.</span>
              {step}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
