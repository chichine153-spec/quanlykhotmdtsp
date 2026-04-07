import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use the database ID from config, but fallback to default if needed
// Note: In many cases, (default) is the correct database ID
const initialDbId = firebaseConfig.firestoreDatabaseId || '(default)';
export const db = getFirestore(app, initialDbId);
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
