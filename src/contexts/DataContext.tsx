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
  updateConfig: (newConfig: ProfitConfig) => Promise<void>;
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
  const [fetching, setFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const fetchData = async (force: boolean = false) => {
    if (!user || fetching) return;

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
    setFetching(true);
    try {
      // 1. Fetch data from Supabase-enabled services first
      // This will use Supabase if configured, or fallback to Firebase if not.
      const [newInventory, newOrders, newConfig, newReturns, newProblematic] = await Promise.all([
        InventoryService.fetchInventory(user.uid),
        InventoryService.fetchOrders(user.uid),
        ProfitService.fetchConfig(user.uid),
        ProfitService.fetchReturns(user.uid),
        InventoryService.fetchProblematicOrders(user.uid)
      ]);
      
      // 2. Fetch other configs that still reside in Firebase for now
      // We wrap these in individual try-catch to not block the whole UI if one fails
      let newGlobalConfig = globalConfig;

      try {
        const [globalConfigSnap] = await Promise.all([
          getDoc(doc(db, 'global_configs', 'settings'))
        ]);

        newGlobalConfig = globalConfigSnap.exists() ? globalConfigSnap.data() as any : null;
      } catch (fbError: any) {
        console.warn('[DataContext] Firebase secondary fetch failed (likely quota):', fbError.message);
      }

      console.log(`Fetch successful for user ${user.uid}: ${newInventory.length} products, ${newOrders.length} orders.`);

      setInventory(newInventory);
      setOrders(newOrders);
      setReturns(newReturns);
      setProblematicOrders(newProblematic);
      setConfig(newConfig);
      setGlobalConfig(newGlobalConfig);

      // Save to cache
      const now = new Date().getTime();
      localStorage.setItem(`cache_inventory_${user.uid}`, JSON.stringify(newInventory));
      localStorage.setItem(`cache_orders_${user.uid}`, JSON.stringify(newOrders));
      localStorage.setItem(`cache_returns_${user.uid}`, JSON.stringify(newReturns));
      localStorage.setItem(`cache_problematic_${user.uid}`, JSON.stringify(newProblematic));
      localStorage.setItem(`cache_config_${user.uid}`, JSON.stringify(newConfig));
      localStorage.setItem('cache_global_config', JSON.stringify(newGlobalConfig));
      localStorage.setItem(`cache_time_${user.uid}`, now.toString());

      if (newGlobalConfig) GeminiService.resetInstance();
      
      setLastUpdated(new Date(now));
      setLoading(false);
      setFetching(false);
      
      // CRITICAL: If we have Supabase data, we don't care about Firebase quota errors
      if (newInventory.length > 0 || newOrders.length > 0) {
        setQuotaExceeded(false);
      }
    } catch (error: any) {
      const classified = classifyError(error, 'Firebase');
      console.error('Fetch Data Error:', classified.message);
      
      if (classified.isQuota || error.message?.includes('INTERNAL ASSERTION FAILED')) {
        setQuotaExceeded(true);
        try {
          // Hard disable network to prevent further quota drain
          await disableNetwork(db);
          console.warn('[DataContext] Network disabled due to Quota Exceeded');
        } catch (e) {
          console.error('Failed to disable network:', e);
        }
        
        // Mandatory fallback to cache if available
        if (cachedInventory) setInventory(JSON.parse(cachedInventory));
        if (cachedOrders) setOrders(JSON.parse(cachedOrders));
        if (cachedReturns) setReturns(JSON.parse(cachedReturns));
        if (cachedProblematic) setProblematicOrders(JSON.parse(cachedProblematic));
        if (cachedConfig) setConfig(JSON.parse(cachedConfig));
      }
      
      setLoading(false);
      setFetching(false);
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
    try {
      setLoading(true);
      // Always try to enable network when user explicitly asks for refresh
      await enableNetwork(db);
      setQuotaExceeded(false);
      await fetchData(true);
    } catch (error: any) {
      console.error('Refresh failed:', error);
      // If still quota exceeded, it will be caught in fetchData
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (newConfig: ProfitConfig) => {
    if (!user) return;
    await ProfitService.saveConfig(user.uid, newConfig);
    setConfig(newConfig);
    localStorage.setItem(`cache_config_${user.uid}`, JSON.stringify(newConfig));
  };

  return (
    <DataContext.Provider value={{ inventory, orders, returns, problematicOrders, config, globalConfig, loading, refreshData, updateConfig, lastUpdated, quotaExceeded }}>
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
