import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { InventoryService, OrderRecord } from '../services/inventoryService';
import { ProfitService } from '../services/profitService';
import { Product, ReturnRecord, ProfitConfig } from '../types';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc, 
  doc, 
  orderBy, 
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';

interface DataContextType {
  inventory: Product[];
  orders: OrderRecord[];
  returns: ReturnRecord[];
  config: ProfitConfig | null;
  loading: boolean;
  refreshData: () => Promise<void>;
  lastUpdated: Date | null;
  quotaExceeded: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [config, setConfig] = useState<ProfitConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const fetchData = async (force: boolean = false) => {
    if (!user) return;

    // Check cache if not forced
    const cachedInventory = localStorage.getItem(`cache_inventory_${user.uid}`);
    const cachedOrders = localStorage.getItem(`cache_orders_${user.uid}`);
    const cachedReturns = localStorage.getItem(`cache_returns_${user.uid}`);
    const cachedConfig = localStorage.getItem(`cache_config_${user.uid}`);
    const cachedTime = localStorage.getItem(`cache_time_${user.uid}`);

    if (!force && cachedInventory && cachedOrders && cachedReturns && cachedConfig && cachedTime) {
      const time = parseInt(cachedTime);
      const now = new Date().getTime();
      // If cache is less than 30 minutes old, use it and skip fetch
      if (now - time < 30 * 60 * 1000) {
        console.log('Using fresh cache for DataContext');
        setInventory(JSON.parse(cachedInventory));
        setOrders(JSON.parse(cachedOrders));
        setReturns(JSON.parse(cachedReturns));
        setConfig(JSON.parse(cachedConfig));
        setLastUpdated(new Date(time));
        setLoading(false);
        return; // Skip network fetch
      }
    }

    setLoading(true);
    try {
      // Fetch initial data for returns and config (less frequent changes)
      const [inventorySnap, returnsSnap, configSnap] = await Promise.all([
        getDocs(query(collection(db, 'inventory'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'returns'), where('userId', '==', user.uid), orderBy('returnedAt', 'desc'), limit(100))),
        getDoc(doc(db, 'profit_configs', user.uid))
      ]);
      
      const newInventory = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
      const newReturns = returnsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ReturnRecord[];
      const newConfig = configSnap.exists() ? configSnap.data() as ProfitConfig : null;

      console.log(`Initial fetch for user ${user.uid}: ${newInventory.length} products found.`);

      setInventory(newInventory);
      setReturns(newReturns);
      setConfig(newConfig);
      
      // Save to cache
      const now = new Date().getTime();
      localStorage.setItem(`cache_inventory_${user.uid}`, JSON.stringify(newInventory));
      localStorage.setItem(`cache_returns_${user.uid}`, JSON.stringify(newReturns));
      localStorage.setItem(`cache_config_${user.uid}`, JSON.stringify(newConfig));
      localStorage.setItem(`cache_time_${user.uid}`, now.toString());
      
      setLastUpdated(new Date(now));
      setLoading(false);
      setQuotaExceeded(false);
    } catch (error: any) {
      console.error('Error fetching initial data:', error);
      if (error.message?.includes('Quota exceeded') || error.message?.includes('quota')) {
        setQuotaExceeded(true);
        // Fallback to cache if available
        if (cachedInventory) setInventory(JSON.parse(cachedInventory));
        if (cachedOrders) setOrders(JSON.parse(cachedOrders));
        if (cachedReturns) setReturns(JSON.parse(cachedReturns));
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
      setLoading(false);
      setQuotaExceeded(false);
      return;
    }

    fetchData();

    // Set up real-time listeners for inventory and orders
    const inventoryQuery = query(collection(db, 'inventory'), where('userId', '==', user.uid));
    const ordersQuery = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('processedAt', 'desc'), limit(100));

    const unsubscribeInventory = onSnapshot(inventoryQuery, (snapshot) => {
      const newInventory = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
      console.log(`Inventory listener update for user ${user.uid}: ${newInventory.length} products.`);
      setInventory(newInventory);
      localStorage.setItem(`cache_inventory_${user.uid}`, JSON.stringify(newInventory));
      localStorage.setItem(`cache_time_${user.uid}`, new Date().getTime().toString());
      setLastUpdated(new Date());
    }, (error) => {
      console.error('Inventory listener error:', error);
      if (error.message?.includes('Quota exceeded') || error.message?.includes('quota')) {
        setQuotaExceeded(true);
      }
    });

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const newOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as OrderRecord[];
      setOrders(newOrders);
      localStorage.setItem(`cache_orders_${user.uid}`, JSON.stringify(newOrders));
    }, (error) => {
      console.error('Orders listener error:', error);
      if (error.message?.includes('Quota exceeded') || error.message?.includes('quota')) {
        setQuotaExceeded(true);
      }
    });

    const returnsQuery = query(
      collection(db, 'returns'),
      where('userId', '==', user.uid),
      orderBy('returnedAt', 'desc'),
      limit(100)
    );

    const unsubscribeReturns = onSnapshot(returnsQuery, (snapshot) => {
      const newReturns = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ReturnRecord[];
      setReturns(newReturns);
      localStorage.setItem(`cache_returns_${user.uid}`, JSON.stringify(newReturns));
    }, (error) => {
      console.error('Returns listener error:', error);
      if (error.message?.includes('Quota exceeded') || error.message?.includes('quota')) {
        setQuotaExceeded(true);
      }
    });

    return () => {
      unsubscribeInventory();
      unsubscribeOrders();
      unsubscribeReturns();
    };
  }, [user]);

  const refreshData = async () => {
    await fetchData(true);
  };

  return (
    <DataContext.Provider value={{ inventory, orders, returns, config, loading, refreshData, lastUpdated, quotaExceeded }}>
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
