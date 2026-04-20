"use client";

import { firebaseConfig } from "@/firebase/config";
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * Initializes the Firebase app, handling both client-side and server-side rendering.
 * Ensures that Firebase is only initialized once.
 */
export function initializeFirebase() {
  // If the app is already initialized, return the existing services.
  if (getApps().length) {
    return getSdks(getApp());
  }

  // In a client-side environment, initialize the app with the provided config.
  // This is a robust approach that works across different hosting environments.
  // On Firebase App Hosting, environment variables would typically be used,
  // but this explicit initialization ensures consistency.
  const firebaseApp = initializeApp(firebaseConfig);

  return getSdks(firebaseApp);
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
    storage: getStorage(firebaseApp),
  };
}

export * from "./provider";
export * from "./client-provider";
export * from "./firestore/use-collection";
export * from "./firestore/use-doc";
export * from "./non-blocking-updates";
export * from "./non-blocking-login";
export * from "./errors";
export * from "./error-emitter";

// Storage hook
export function useStorage() {
  const { storage } = initializeFirebase();
  return storage;
}
