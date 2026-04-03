import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import { env } from '../config/env';
import path from 'path';
import fs from 'fs';

let db: Firestore;
let storage: Storage;

function resolveStorageBucket(serviceAccount: any): string {
  const projectId = env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
  if (!projectId) throw new Error('Cannot determine Firebase project ID for Storage bucket');
  // Newer Firebase projects (post-2022) use .firebasestorage.app; older use .appspot.com.
  // FIREBASE_STORAGE_BUCKET env var overrides both if set explicitly.
  return (process.env.FIREBASE_STORAGE_BUCKET) || `${projectId}.firebasestorage.app`;
}

function initFirebase() {
  if (getApps().length === 0) {
    // Priority: 1) JSON file (local dev), 2) Base64 env var (Render), 3) raw JSON env var
    const keyPath = path.resolve(__dirname, '../../firebase-key.json');

    if (fs.existsSync(keyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      initializeApp({ credential: cert(serviceAccount), storageBucket: resolveStorageBucket(serviceAccount) });
    } else if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const json = Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      const serviceAccount = JSON.parse(json);
      initializeApp({ credential: cert(serviceAccount), storageBucket: resolveStorageBucket(serviceAccount) });
    } else if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      initializeApp({ credential: cert(serviceAccount), storageBucket: resolveStorageBucket(serviceAccount) });
    } else {
      throw new Error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_BASE64 or provide firebase-key.json');
    }
  }
}

export function getDb(): Firestore {
  if (!db) {
    initFirebase();
    db = getFirestore();
  }
  return db;
}

export function getStorageBucket() {
  initFirebase();
  if (!storage) {
    storage = getStorage();
  }
  return storage.bucket();
}

export function closeDb(): void {
  // Firestore doesn't need explicit closing
}

// Collection names
export const COLLECTIONS = {
  LEADERS: 'leaders',
  EMPLOYEES: 'employees',
  DAILY_RECORDS: 'daily_records',
  JUSTIFICATIONS: 'justifications',
  PUNCH_ADJUSTMENTS: 'punch_adjustments',
  AUDIT_LOG: 'audit_log',
  USERS: 'users',
  COUNTERS: 'counters',
  HOLIDAYS: 'holidays',
  REPORTS: 'reports',
  VACATIONS: 'vacations',
  VACATION_SCHEDULES: 'vacation_schedules',
  FOLGAS: 'folgas',
} as const;

/**
 * Auto-increment ID generator using a counters collection.
 * Keeps numeric IDs for frontend compatibility.
 */
export async function getNextId(collection: string): Promise<number> {
  const db = getDb();
  const counterRef = db.collection(COLLECTIONS.COUNTERS).doc(collection);

  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.value as number) : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next });
    return next;
  });

  return result;
}
