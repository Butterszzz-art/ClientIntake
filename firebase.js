// Shared Firebase initialization for both the client-facing page and the
// coach dashboard. Loaded via Google's CDN as ES modules — no npm install,
// no build step. This apiKey is not a secret: it only identifies the
// project. Real access control lives in Firestore's security rules
// (clients can only create records; only a logged-in coach can read them).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBlO302taIVPacE_yzeqBQ14c9yUdP3sLE',
  authDomain: 'clientintake-cfa71.firebaseapp.com',
  projectId: 'clientintake-cfa71',
  storageBucket: 'clientintake-cfa71.firebasestorage.app',
  messagingSenderId: '771024858691',
  appId: '1:771024858691:web:ed62ef7f6793d61dca6ef6',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
