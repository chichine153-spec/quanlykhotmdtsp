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

  const fetchData = async (force: boolean = false) => {
    if (!user) return;

    // Check cache if not forced
    if (!force) {
      const cachedInventory = localStorage.getItem(`cache_inventory_${user.uid}`);
      const cachedOrders = localStorage.getItem(`cache_orders_${user.uid}`);
      const cachedReturns = localStorage.getItem(`cache_returns_${user.uid}`);
      const cachedConfig = localStorage.getItem(`cache_config_${user.uid}`);
      const cachedTime = localStorage.getItem(`cache_time_${user.uid}`);

      if (cachedInventory && cachedOrders && cachedReturns && cachedConfig && cachedTime) {
        const time = parseInt(cachedTime);
        const now = new Date().getTime();
        // If cache is less than 30 minutes old, use it
        if (now - time < 30 * 60 * 1000) {
          setInventory(JSON.parse(cachedInventory));
          setOrders(JSON.parse(cachedOrders));
          setReturns(JSON.parse(cachedReturns));
          setConfig(JSON.parse(cachedConfig));
          setLastUpdated(new Date(time));
          setLoading(false);
          // Still set up listeners even if using cache
        }
      }
    }

    setLoading(true);
    try {
      // Fetch initial data for returns and config (less frequent changes)
      const [returnsSnap, configSnap] = await Promise.all([
        getDocs(query(collection(db, 'returns'), where('userId', '==', user.uid), orderBy('returnedAt', 'desc'), limit(100))),
        getDoc(doc(db, 'profit_configs', user.uid))
      ]);

      const newReturns = returnsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ReturnRecord[];
      const newConfig = configSnap.exists() ? configSnap.data() as ProfitConfig : null;

      setReturns(newReturns);
      setConfig(newConfig);
      
      // Save to cache
      localStorage.setItem(`cache_returns_${user.uid}`, JSON.stringify(newReturns));
      localStorage.setItem(`cache_config_${user.uid}`, JSON.stringify(newConfig));
      
      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching initial data:', error);
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
      return;
    }

    fetchData();

    // Set up real-time listeners for inventory and orders
    const inventoryQuery = query(collection(db, 'inventory'), where('userId', '==', user.uid));
    const ordersQuery = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('processedAt', 'desc'), limit(100));

    const unsubscribeInventory = onSnapshot(inventoryQuery, (snapshot) => {
      const newInventory = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
      setInventory(newInventory);
      localStorage.setItem(`cache_inventory_${user.uid}`, JSON.stringify(newInventory));
      setLastUpdated(new Date());
    }, (error) => {
      console.error('Inventory listener error:', error);
    });

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const newOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as OrderRecord[];
      setOrders(newOrders);
      localStorage.setItem(`cache_orders_${user.uid}`, JSON.stringify(newOrders));
    }, (error) => {
      console.error('Orders listener error:', error);
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
    <DataContext.Provider value={{ inventory, orders, returns, config, loading, refreshData, lastUpdated }}>
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
