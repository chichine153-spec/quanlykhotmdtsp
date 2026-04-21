import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase';
import './index.css';

// Test connection to Firestore as per best practices
async function testConnection() {
  try {
    // Only attempt if we have initialized db
    if (db) {
      await getDocFromServer(doc(db, 'global_configs', 'settings'));
      console.log('Firebase connection verified.');
    }
  } catch (error) {
    if(error instanceof Error && (error.message.includes('offline') || error.message.includes('permission'))) {
      console.warn("Firestore connection check produced an expected warning or error:", error.message);
    }
  }
}
testConnection();

// Global error handling for unhandled promise rejections and errors
// This is crucial for catching Firestore internal assertion failures that happen in background streams
window.addEventListener('error', (event) => {
  if (event.message && (event.message.includes('FIRESTORE') || event.message.includes('INTERNAL ASSERTION FAILED'))) {
    console.error('Caught global Firestore error:', event.message);
    // We can't easily trigger the React ErrorBoundary from here, but we can alert or reload
    // For now, let's just log it clearly. The ErrorBoundary should catch most React-level errors.
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && (event.reason.message.includes('Quota exceeded') || event.reason.message.includes('INTERNAL ASSERTION FAILED'))) {
    console.error('Caught global unhandled Firestore rejection:', event.reason.message);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
