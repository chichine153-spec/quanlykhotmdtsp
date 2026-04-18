import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { InventoryService, OrderRecord } from '../services/inventoryService';
import { ProfitService } from '../services/profitService';
import { Product, ReturnRecord, ProfitConfig, ProblematicOrder } from '../types';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc, 
  doc, 
  orderBy, 
  limit,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';
import { db } from '../firebase';
import { classifyError } from '../lib/errorUtils';
import { GeminiService } from '../services/gemini';

interface DataContextType {
  inventory: Product[];
  orders: OrderRecord[];
  returns: ReturnRecord[];
  problematicOrders: ProblematicOrder[];
  config: ProfitConfig | null;
  globalConfig: { geminiApiKey?: string } | null;
  loading: boolean;
  refreshData: () => Promise<void>;
  lastUpdated: Date | null;
  quotaExceeded: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';
  const [inventory, setInventory] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [problematicOrders, setProblematicOrders] = useState<ProblematicOrder[]>([]);
  const [config, setConfig] = useState<ProfitConfig | null>(null);
  const [globalConfig, setGlobalConfig] = useState<{ geminiApiKey?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const fetchData = async (force: boolean = false) => {
    if (!user) return;

    // Check cache if not forced
    const cachedInventory = localStorage.getItem(`cache_inventory_${user.uid}`);
    const cachedOrders = localStorage.getItem(`cache_orders_${user.uid}`);
    const cachedReturns = localStorage.getItem(`cache_returns_${user.uid}`);
    const cachedProblematic = localStorage.getItem(`cache_problematic_${user.uid}`);
    const cachedConfig = localStorage.getItem(`cache_config_${user.uid}`);
    const cachedGlobalConfig = localStorage.getItem('cache_global_config');
    const cachedTime = localStorage.getItem(`cache_time_${user.uid}`);

    if (!force && cachedInventory && cachedOrders && cachedReturns && cachedProblematic && cachedConfig && cachedGlobalConfig && cachedTime) {
      const time = parseInt(cachedTime);
      const now = new Date().getTime();
      // Increased cache TTL to 60 minutes for better quota management
      if (now - time < 60 * 60 * 1000) {
        console.log('Using fresh cache (60m TTL) for DataContext to save quota');
        setInventory(JSON.parse(cachedInventory));
        setOrders(JSON.parse(cachedOrders));
        setReturns(JSON.parse(cachedReturns));
        setProblematicOrders(JSON.parse(cachedProblematic));
        setConfig(JSON.parse(cachedConfig));
        setGlobalConfig(JSON.parse(cachedGlobalConfig));
        setLastUpdated(new Date(time));
        setLoading(false);
        setQuotaExceeded(false);
        return; // Skip network fetch
      }
    }

    setLoading(true);
    try {
      // Fetch initial data using getDocs for better control over quota usage
      const inventoryQuery = isAdmin 
        ? query(collection(db, 'inventory'), limit(500)) 
        : query(collection(db, 'inventory'), where('userId', '==', user.uid), limit(300));
        
      const ordersQuery = isAdmin
        ? query(collection(db, 'orders'), orderBy('processedAt', 'desc'), limit(200))
        : query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('processedAt', 'desc'), limit(150));
        
      const returnsQuery = isAdmin
        ? query(collection(db, 'returns'), orderBy('returnedAt', 'desc'), limit(100))
        : query(collection(db, 'returns'), where('userId', '==', user.uid), orderBy('returnedAt', 'desc'), limit(100));
        
      const problematicQuery = isAdmin
        ? query(collection(db, 'problematic_orders'), orderBy('updatedAt', 'desc'), limit(50))
        : query(collection(db, 'problematic_orders'), where('userId', '==', user.uid), orderBy('updatedAt', 'desc'), limit(50));

      const [inventorySnap, ordersSnap, returnsSnap, problematicSnap, configSnap, globalConfigSnap] = await Promise.all([
        getDocs(inventoryQuery),
        getDocs(ordersQuery),
        getDocs(returnsQuery),
        getDocs(problematicQuery),
        getDoc(doc(db, 'profit_configs', user.uid)),
        getDoc(doc(db, 'global_configs', 'settings'))
      ]);
      
      const newInventory = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
      const newOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as OrderRecord[];
      const newReturns = returnsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ReturnRecord[];
      const newProblematic = problematicSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ProblematicOrder[];
      const newConfig = configSnap.exists() ? configSnap.data() as ProfitConfig : null;
      const newGlobalConfig = globalConfigSnap.exists() ? globalConfigSnap.data() as any : null;

      console.log(`Fetch successful for user ${user.uid}: ${newInventory.length} products, ${newOrders.length} orders.`);

      setInventory(newInventory);
      setOrders(newOrders);
      setReturns(newReturns);
      setProblematicOrders(newProblematic);
      setConfig(newConfig);

      // Save to cache BEFORE setting globalConfig to ensure consistency
      const now = new Date().getTime();
      localStorage.setItem(`cache_inventory_${user.uid}`, JSON.stringify(newInventory));
      localStorage.setItem(`cache_orders_${user.uid}`, JSON.stringify(newOrders));
      localStorage.setItem(`cache_returns_${user.uid}`, JSON.stringify(newReturns));
      localStorage.setItem(`cache_problematic_${user.uid}`, JSON.stringify(newProblematic));
      localStorage.setItem(`cache_config_${user.uid}`, JSON.stringify(newConfig));
      localStorage.setItem('cache_global_config', JSON.stringify(newGlobalConfig));
      localStorage.setItem(`cache_time_${user.uid}`, now.toString());

      setGlobalConfig(newGlobalConfig);
      GeminiService.resetInstance();
      
      setLastUpdated(new Date(now));
      setLoading(false);
      setQuotaExceeded(false);
    } catch (error: any) {
      const classified = classifyError(error, 'Firebase');
      console.error('Fetch Data Error:', classified.message);
      
      if (classified.isQuota || error.message?.includes('INTERNAL ASSERTION FAILED')) {
        setQuotaExceeded(true);
        // Fallback to cache if available
        if (cachedInventory) setInventory(JSON.parse(cachedInventory));
        if (cachedOrders) setOrders(JSON.parse(cachedOrders));
        if (cachedReturns) setReturns(JSON.parse(cachedReturns));
        if (cachedProblematic) setProblematicOrders(JSON.parse(cachedProblematic));
        if (cachedConfig) setConfig(JSON.parse(cachedConfig));
      }
      
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setInventory([]);
      setOrders([]);
      setReturns([]);
      setConfig(null);
      setGlobalConfig(null);
      setLoading(false);
      setQuotaExceeded(false);
      return;
    }

    fetchData();

    // Periodic check for global config instead of real-time listener to prevent Watch assertion errors
    const fetchGlobalOnly = async () => {
      try {
        const snapshot = await getDoc(doc(db, 'global_configs', 'settings'));
        if (snapshot.exists()) {
          const newGlobalConfig = snapshot.data();
          setGlobalConfig(newGlobalConfig);
          localStorage.setItem('cache_global_config', JSON.stringify(newGlobalConfig));
          GeminiService.resetInstance();
        }
      } catch (err) {
        // Silent error for periodic background check
      }
    };

    const interval = setInterval(fetchGlobalOnly, 10 * 60 * 1000); // 10 minutes

    return () => {
      clearInterval(interval);
    };
  }, [user]);

  const refreshData = async () => {
    if (quotaExceeded) {
      try {
        await enableNetwork(db);
        setQuotaExceeded(false);
      } catch (e) {
        console.error('Failed to enable network:', e);
      }
    }
    await fetchData(true);
  };

  return (
    <DataContext.Provider value={{ inventory, orders, returns, problematicOrders, config, globalConfig, loading, refreshData, lastUpdated, quotaExceeded }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
