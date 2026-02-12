import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { env } from '../config/env';
import path from 'path';
import fs from 'fs';

let db: Firestore;

export function getDb(): Firestore {
  if (!db) {
    if (getApps().length === 0) {
      // Priority: 1) JSON file (local dev), 2) Base64 env var (Render), 3) raw JSON env var
      const keyPath = path.resolve(__dirname, '../../firebase-key.json');
      if (fs.existsSync(keyPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        initializeApp({ credential: cert(serviceAccount) });
      } else if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        const json = Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
        const serviceAccount = JSON.parse(json);
        initializeApp({ credential: cert(serviceAccount) });
      } else if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
        initializeApp({ credential: cert(serviceAccount) });
      } else {
        throw new Error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_BASE64 or provide firebase-key.json');
      }
    }
    db = getFirestore();
  }
  return db;
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
  AUDIT_LOG: 'audit_log',
  USERS: 'users',
  COUNTERS: 'counters',
  HOLIDAYS: 'holidays',
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
