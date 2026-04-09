import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use the database ID from config, but fallback to default if needed
const initialDbId = firebaseConfig.firestoreDatabaseId || '(default)';

// Initialize Firestore with long-polling to prevent "INTERNAL ASSERTION FAILED" errors
// and improve stability when hitting quota limits or in restricted network environments.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, initialDbId);

export const storage = getStorage(app);

// Test connection to Firestore
async function testConnection() {
  try {
    // Try to fetch a non-existent document from the server to test connectivity
    await getDocFromServer(doc(db, '_connection_test_', 'test'));
    console.log(`Firestore connection successful to database: ${initialDbId}`);
  } catch (error: any) {
    if (error.message && error.message.includes('the client is offline')) {
      console.error(`CRITICAL: Firestore connection failed to database: ${initialDbId}. Please check your Firebase configuration.`);
    } else {
      // Other errors (like permission denied) are fine for this test
      console.log("Firestore connectivity test completed (with expected non-offline error).");
    }
  }
}
testConnection();
