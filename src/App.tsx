import React from 'react';
import Layout from './Layout';
import Dashboard from './Dashboard';
import OrderSearch from './OrderSearch';
import PDFUpload from './PDFUpload';
import Inventory from './Inventory';
import ShopeeScanner from './ShopeeScanner';
import ScanSuccess from './ScanSuccess';
import Returns from './Returns';
import { Screen } from './types';

export default function App() {
  const [activeScreen, setActiveScreen] = React.useState<Screen>('dashboard');

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        return <Dashboard />;
      case 'search':
        return <OrderSearch />;
      case 'upload':
        return <PDFUpload />;
      case 'inventory':
        return <Inventory />;
      case 'scanner':
        return <ShopeeScanner onSuccess={setActiveScreen} />;
      case 'success':
        return <ScanSuccess onScreenChange={setActiveScreen} />;
      case 'returns':
        return <Returns />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout activeScreen={activeScreen} onScreenChange={setActiveScreen}>
      {renderScreen()}
    </Layout>
  );
}
