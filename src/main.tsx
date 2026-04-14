import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

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
