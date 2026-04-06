import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { InventoryService, OrderRecord } from '../services/inventoryService';
import { ProfitService } from '../services/profitService';
import { Product, ReturnRecord, ProfitConfig } from '../types';

interface DataContextType {
  inventory: Product[];
  orders: OrderRecord[];
  returns: ReturnRecord[];
  config: ProfitConfig | null;
  loading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [config, setConfig] = useState<ProfitConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setInventory([]);
      setOrders([]);
      setReturns([]);
      setConfig(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Single listener for inventory
    const inventoryUnsub = InventoryService.listenToInventory(user.uid, (products) => {
      setInventory(products);
    });

    // Single listener for orders
    const ordersUnsub = InventoryService.listenToOrders(user.uid, (allOrders) => {
      setOrders(allOrders);
    });

    // Single listener for returns
    const returnsUnsub = ProfitService.listenToReturns(user.uid, (data) => {
      setReturns(data);
      setLoading(false);
    });

    // Single listener for config
    const configUnsub = ProfitService.listenToConfig(user.uid, (data) => {
      if (data) setConfig(data);
    });

    return () => {
      inventoryUnsub();
      ordersUnsub();
      returnsUnsub();
      configUnsub();
    };
  }, [user]);

  return (
    <DataContext.Provider value={{ inventory, orders, returns, config, loading }}>
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
