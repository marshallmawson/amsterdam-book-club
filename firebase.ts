// firebase.ts

// Inform TypeScript that a 'firebase' object will exist on the global window scope
// This comes from the <script> tags we added in index.html
declare const firebase: any;

// Your web app's Firebase configuration
// Load from environment variables to avoid committing secrets to git
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.VITE_FIREBASE_APP_ID || "",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

// Validate that required Firebase config is present
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("Firebase configuration is missing! Please set the VITE_FIREBASE_* environment variables.");
}

// A variable to hold our initialized db instance
let dbInstance: any = null;

// This function initializes Firebase ONLY on the first time it's called.
export const getDb = () => {
  if (!dbInstance) {
    // Check if Firebase has already been initialized
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    // Get the Firestore instance using the v8 syntax
    dbInstance = firebase.firestore();
  }
  return dbInstance;
};

// You will also need to export these v8-compatible functions for your app to use
export const firestore = {
    collection: (db: any, path: string) => db.collection(path),
    // FIX: The doc helper was defined with 3 parameters, but the usage implies a 2-parameter function (db, fullPath). Updated to use db.doc(fullPath) which is valid for Firestore v8 and matches the error.
    doc: (db: any, path: string) => db.doc(path),
    addDoc: async (collectionRef: any, data: object) => await collectionRef.add(data),
    getDocs: async (queryOrRef: any) => await queryOrRef.get(),
    // FIX: Updated onSnapshot to support an optional error callback, which is used in the app.
    onSnapshot: (queryOrRef: any, onNext: any, onError?: any) => queryOrRef.onSnapshot(onNext, onError),
    runTransaction: async (db: any, updateFunction: any) => await db.runTransaction(updateFunction),
    increment: (n: number) => firebase.firestore.FieldValue.increment(n),
    serverTimestamp: () => firebase.firestore.FieldValue.serverTimestamp(),
    deleteDoc: async (docRef: any) => await docRef.delete(),
    setDoc: async (docRef: any, data: object, options?: object) => await docRef.set(data, options),
    query: (collectionRef: any, ...constraints: any[]) => {
        let q = collectionRef;
        constraints.forEach(c => {
            q = q.where(c.field, c.op, c.value);
        });
        return q;
    },
    where: (field: string, op: any, value: any) => ({ field, op, value })
};
