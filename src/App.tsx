import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Layout from './Layout';
import Dashboard from './Dashboard';
import RePrintModule from './components/RePrintModule';
import PDFUpload from './PDFUpload';
import Inventory from './Inventory';
import StockIn from './StockIn';
import ProfitDashboard from './ProfitDashboard';
import ScanSuccess from './ScanSuccess';
import Returns from './Returns';
import AccountManagement from './AccountManagement';
import UpgradeAccount from './UpgradeAccount';
import ConnectionSettings from './components/ConnectionSettings';
import GeminiKeyModal from './components/GeminiKeyModal';
import { Screen } from './types';
import { PDFService } from './services/pdfService';
import { useAuth } from './contexts/AuthContext';
import { GeminiService } from './services/gemini';

export default function App() {
  const { user, role, isSubscriptionValid } = useAuth();
  const [activeScreen, setActiveScreen] = React.useState<Screen>('dashboard');
  const [showKeyModal, setShowKeyModal] = React.useState(false);

  const isValid = isSubscriptionValid();
  
  // Force upgrade screen if not valid and not admin
  React.useEffect(() => {
    if (user && !isValid && role !== 'admin') {
      setActiveScreen('upgrade');
    }
  }, [user, isValid, role]);

  // Check for API key on load
  React.useEffect(() => {
    if (!GeminiService.hasApiKey()) {
      setShowKeyModal(true);
    }
  }, []);

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
      case 'accounts':
        return <AccountManagement />;
      case 'upgrade':
        return <UpgradeAccount />;
      case 'settings':
        return <ConnectionSettings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout 
      activeScreen={activeScreen} 
      onScreenChange={setActiveScreen}
      onOpenKeyModal={() => setShowKeyModal(true)}
    >
      <div className="relative">
        {renderScreen()}
      </div>
      <GeminiKeyModal isOpen={showKeyModal} onClose={() => setShowKeyModal(false)} />
    </Layout>
  );
}
