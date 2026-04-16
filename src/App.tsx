import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Layout from './Layout';
import Dashboard from './Dashboard';
import RePrintModule from './components/RePrintModule';
import PDFUpload from './PDFUpload';
import Inventory from './Inventory';
import StockIn from './StockIn';
import InTransitManagement from './InTransitManagement';
import ProfitDashboard from './ProfitDashboard';
import ScanSuccess from './ScanSuccess';
import Returns from './Returns';
import AccountManagement from './AccountManagement';
import UpgradeAccount from './UpgradeAccount';
import { Screen } from './types';
import { PDFService } from './services/pdfService';
import { useAuth } from './contexts/AuthContext';
import { GeminiService } from './services/gemini';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const { user, role, isSubscriptionValid } = useAuth();
  const [activeScreen, setActiveScreen] = React.useState<Screen>('dashboard');

  const isValid = isSubscriptionValid();
  
  // Force upgrade screen if not valid and not admin
  React.useEffect(() => {
    if (user && !isValid && role !== 'admin') {
      setActiveScreen('upgrade');
    }
  }, [user, isValid, role]);

  // Automatic cleanup of expired data on app load - only once per session
  React.useEffect(() => {
    if (!user) return;

    // Check if cleanup was already run in this session
    const lastCleanup = sessionStorage.getItem(`last_cleanup_${user.uid}`);
    const now = new Date().getTime();
    
    // Run cleanup if not run in the last 24 hours (or if it's a new session)
    if (lastCleanup && (now - parseInt(lastCleanup)) < 24 * 60 * 60 * 1000) {
      return;
    }

    const runCleanup = async () => {
      try {
        const cleanedCount = await PDFService.cleanupExpiredData(user.uid);
        if (cleanedCount > 0) {
          console.log(`Successfully cleaned up ${cleanedCount} expired orders and PDF files.`);
        }
        sessionStorage.setItem(`last_cleanup_${user.uid}`, now.toString());
      } catch (error) {
        console.error('Cleanup failed:', error);
      }
    };
    
    runCleanup();
  }, [user]);

  const renderScreen = () => {
    // Prevent non-admins from accessing settings
    if (activeScreen === 'settings' && role !== 'admin') {
      return <Dashboard onScreenChange={setActiveScreen} />;
    }

    switch (activeScreen) {
      case 'dashboard':
        return <Dashboard onScreenChange={setActiveScreen} />;
      case 'stockin':
        return <StockIn />;
      case 'intransit':
        return <InTransitManagement />;
      case 'upload':
        return <PDFUpload />;
      case 'inventory':
        return <Inventory onScreenChange={setActiveScreen} />;
      case 'profit':
        return <ProfitDashboard />;
      case 'success':
        return <ScanSuccess onScreenChange={setActiveScreen} />;
      case 'returns':
        return <Returns />;
      case 'reprint':
        return <RePrintModule />;
      case 'accounts':
        return <AccountManagement />;
      case 'upgrade':
        return <UpgradeAccount />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout 
      activeScreen={activeScreen} 
      onScreenChange={setActiveScreen}
    >
      <Toaster position="top-right" reverseOrder={false} />
      <div className="relative">
        {renderScreen()}
      </div>
    </Layout>
  );
}
