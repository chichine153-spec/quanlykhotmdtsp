import React from 'react';
import Layout from './Layout';
import Dashboard from './Dashboard';
import RePrintModule from './components/RePrintModule';
import PDFUpload from './PDFUpload';
import Inventory from './Inventory';
import StockIn from './StockIn';
import ProfitDashboard from './ProfitDashboard';
import ScanSuccess from './ScanSuccess';
import Returns from './Returns';
import { Screen } from './types';
import { PDFService } from './services/pdfService';
import { useAuth } from './contexts/AuthContext';

export default function App() {
  const { user } = useAuth();
  const [activeScreen, setActiveScreen] = React.useState<Screen>('dashboard');

  // Automatic cleanup of expired data on app load
  React.useEffect(() => {
    if (!user) return;

    const runCleanup = async () => {
      try {
        const cleanedCount = await PDFService.cleanupExpiredData(user.uid);
        if (cleanedCount > 0) {
          console.log(`Successfully cleaned up ${cleanedCount} expired orders and PDF files.`);
        }
      } catch (error) {
        console.error('Cleanup failed:', error);
      }
    };
    
    // Run cleanup once when app starts
    runCleanup();
  }, [user]);

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        return <Dashboard />;
      case 'stockin':
        return <StockIn />;
      case 'upload':
        return <PDFUpload />;
      case 'inventory':
        return <Inventory />;
      case 'profit':
        return <ProfitDashboard />;
      case 'success':
        return <ScanSuccess onScreenChange={setActiveScreen} />;
      case 'returns':
        return <Returns />;
      case 'reprint':
        return <RePrintModule />;
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
