import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

/**
 * Initializes a secondary Firebase app using configuration from localStorage.
 * This is used for the user's personal web data.
 */
export function getFirebaseApp(): FirebaseApp | null {
  const config = {
    apiKey: localStorage.getItem('fb_web_api_key'),
    authDomain: localStorage.getItem('fb_web_auth_domain'),
    projectId: localStorage.getItem('fb_web_project_id'),
    storageBucket: localStorage.getItem('fb_web_storage_bucket')
  };

  if (!config.apiKey || !config.projectId) {
    return null;
  }

  try {
    // Check if app already initialized
    if (getApps().find(app => app.name === 'UserWebData')) {
      return getApp('UserWebData');
    }

    return initializeApp(config, 'UserWebData');
  } catch (error) {
    console.error('Error initializing User Firebase App:', error);
    return null;
  }
}

/**
 * Gets the Firestore instance for the user's secondary Firebase app.
 */
export function getFirebaseFirestore(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  return getFirestore(app);
}
