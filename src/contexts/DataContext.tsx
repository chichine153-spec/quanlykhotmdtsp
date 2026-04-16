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
  onSnapshot,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';
import { db } from '../firebase';
import { classifyError } from '../lib/errorUtils';

interface DataContextType {
  inventory: Product[];
  orders: OrderRecord[];
  returns: ReturnRecord[];
  problematicOrders: ProblematicOrder[];
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
  const [problematicOrders, setProblematicOrders] = useState<ProblematicOrder[]>([]);
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
    const cachedProblematic = localStorage.getItem(`cache_problematic_${user.uid}`);
    const cachedConfig = localStorage.getItem(`cache_config_${user.uid}`);
    const cachedTime = localStorage.getItem(`cache_time_${user.uid}`);

    if (!force && cachedInventory && cachedOrders && cachedReturns && cachedProblematic && cachedConfig && cachedTime) {
      const time = parseInt(cachedTime);
      const now = new Date().getTime();
      // If cache is less than 30 minutes old, use it and skip fetch
      if (now - time < 30 * 60 * 1000) {
        console.log('Using fresh cache for DataContext');
        setInventory(JSON.parse(cachedInventory));
        setOrders(JSON.parse(cachedOrders));
        setReturns(JSON.parse(cachedReturns));
        setProblematicOrders(JSON.parse(cachedProblematic));
        setConfig(JSON.parse(cachedConfig));
        setLastUpdated(new Date(time));
        setLoading(false);
        return; // Skip network fetch
      }
    }

    setLoading(true);
    try {
      // Fetch initial data for returns and config (less frequent changes)
      const [inventorySnap, returnsSnap, problematicSnap, configSnap] = await Promise.all([
        getDocs(query(collection(db, 'inventory'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'returns'), where('userId', '==', user.uid), orderBy('returnedAt', 'desc'), limit(100))),
        getDocs(query(collection(db, 'problematic_orders'), where('userId', '==', user.uid), orderBy('updatedAt', 'desc'), limit(50))),
        getDoc(doc(db, 'profit_configs', user.uid))
      ]);
      
      const newInventory = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
      const newReturns = returnsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ReturnRecord[];
      const newProblematic = problematicSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ProblematicOrder[];
      const newConfig = configSnap.exists() ? configSnap.data() as ProfitConfig : null;

      console.log(`Initial fetch for user ${user.uid}: ${newInventory.length} products found.`);

      setInventory(newInventory);
      setReturns(newReturns);
      setProblematicOrders(newProblematic);
      setConfig(newConfig);
      
      // Save to cache
      const now = new Date().getTime();
      localStorage.setItem(`cache_inventory_${user.uid}`, JSON.stringify(newInventory));
      localStorage.setItem(`cache_returns_${user.uid}`, JSON.stringify(newReturns));
      localStorage.setItem(`cache_problematic_${user.uid}`, JSON.stringify(newProblematic));
      localStorage.setItem(`cache_config_${user.uid}`, JSON.stringify(newConfig));
      localStorage.setItem(`cache_time_${user.uid}`, now.toString());
      
      setLastUpdated(new Date(now));
      setLoading(false);
      setQuotaExceeded(false);
    } catch (error: any) {
      const classified = classifyError(error, 'Firebase');
      if (classified.isQuota) {
        setQuotaExceeded(true);
        console.warn('Quota exceeded during initial fetch, disabling network to prevent SDK errors.');
        try {
          await disableNetwork(db);
        } catch (e) {
          console.error('Failed to disable network:', e);
        }
      } else {
        console.error(`Error fetching initial data (${classified.service}):`, classified.message);
      }
      
      // Fallback to cache if available
      if (cachedInventory) setInventory(JSON.parse(cachedInventory));
      if (cachedOrders) setOrders(JSON.parse(cachedOrders));
      if (cachedReturns) setReturns(JSON.parse(cachedReturns));
      if (cachedProblematic) setProblematicOrders(JSON.parse(cachedProblematic));
      if (cachedConfig) setConfig(JSON.parse(cachedConfig));
      
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
    const inventoryQuery = query(collection(db, 'inventory'), where('userId', '==', user.uid), limit(300));
    const ordersQuery = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('processedAt', 'desc'), limit(150));

    const unsubscribeInventory = onSnapshot(inventoryQuery, (snapshot) => {
      const newInventory = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
      setInventory(newInventory);
      localStorage.setItem(`cache_inventory_${user.uid}`, JSON.stringify(newInventory));
      localStorage.setItem(`cache_time_${user.uid}`, new Date().getTime().toString());
      setLastUpdated(new Date());
    }, (error) => {
      const classified = classifyError(error, 'Firebase');
      if (classified.isQuota) {
        setQuotaExceeded(true);
        disableNetwork(db).catch(console.error);
      } else {
        console.error('Inventory listener error:', classified.message);
      }
    });

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const newOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as OrderRecord[];
      setOrders(newOrders);
      localStorage.setItem(`cache_orders_${user.uid}`, JSON.stringify(newOrders));
    }, (error) => {
      const classified = classifyError(error, 'Firebase');
      if (classified.isQuota) {
        setQuotaExceeded(true);
        disableNetwork(db).catch(console.error);
      } else {
        console.error('Orders listener error:', classified.message);
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
      const classified = classifyError(error, 'Firebase');
      if (classified.isQuota) {
        setQuotaExceeded(true);
        disableNetwork(db).catch(console.error);
      } else {
        console.error('Returns listener error:', classified.message);
      }
    });

    const problematicQuery = query(
      collection(db, 'problematic_orders'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );

    const unsubscribeProblematic = onSnapshot(problematicQuery, (snapshot) => {
      const newProblematic = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ProblematicOrder[];
      setProblematicOrders(newProblematic);
      localStorage.setItem(`cache_problematic_${user.uid}`, JSON.stringify(newProblematic));
    }, (error) => {
      const classified = classifyError(error, 'Firebase');
      if (classified.isQuota) {
        setQuotaExceeded(true);
        disableNetwork(db).catch(console.error);
      } else {
        console.error('Problematic orders listener error:', classified.message);
      }
    });

    return () => {
      try {
        unsubscribeInventory();
        unsubscribeOrders();
        unsubscribeReturns();
        unsubscribeProblematic();
      } catch (err) {
        console.warn('Error during listener cleanup:', err);
      }
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
    <DataContext.Provider value={{ inventory, orders, returns, problematicOrders, config, loading, refreshData, lastUpdated, quotaExceeded }}>
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
