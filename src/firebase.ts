import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDocFromServer, 
  terminate, 
  clearIndexedDbPersistence,
  Firestore,
  memoryLocalCache
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize App only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Use the database ID from config, but fallback to default if needed
const initialDbId = firebaseConfig.firestoreDatabaseId || '(default)';

/**
 * Initialize Firestore instance with optimized settings for AI Studio environment.
 * Using long-polling to prevent intermittent stream issues and assertions.
 */
function createDbInstance(): Firestore {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      // Explicitly use memory-only cache to prevent "INTERNAL ASSERTION FAILED"
      // which is usually caused by IndexedDB issues in iframe environments.
      localCache: memoryLocalCache()
    }, initialDbId);
  } catch (error) {
    console.error('Firestore initialization error:', error);
    // Fallback if initializeFirestore fails (e.g. called twice)
    return initializeFirestore(app, {}, initialDbId);
  }
}

export const db = createDbInstance();
export const storage = getStorage(app);

/**
 * Attempt to recover from Firestore assertions by clearing cache.
 */
export async function recoverFirestore() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
    window.location.reload();
  } catch (e) {
    console.error('Failed to recover Firestore:', e);
    window.location.reload();
  }
}

// Test connection to Firestore
async function testConnection() {
  try {
    // Try to fetch a non-existent document from the server to test connectivity
    await getDocFromServer(doc(db, '_connection_test_', 'test'));
    console.log(`Firestore connection successful to database: ${initialDbId}`);
  } catch (error: any) {
    const errorStr = String(error);
    if (errorStr.includes('the client is offline')) {
      console.error(`CRITICAL: Firestore connection failed - Offline.`);
    } else if (errorStr.includes('quota') || errorStr.includes('Quota')) {
      console.warn(`QUOTA WARNING: Firestore is hitting limits.`);
    } else if (errorStr.includes('assertion')) {
      console.error(`ASSERTION FAILED detected. Attempting recovery...`);
      // recoverFirestore(); // Avoid infinite reload loop
    }
  }
}
testConnection();
