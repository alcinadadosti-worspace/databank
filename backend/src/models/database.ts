import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { env } from '../config/env';
import path from 'path';
import fs from 'fs';

let db: Firestore;

export function getDb(): Firestore {
  if (!db) {
    if (getApps().length === 0) {
      // Priority: 1) JSON file (local dev), 2) JSON env var (Render), 3) individual env vars
      const keyPath = path.resolve(__dirname, '../../firebase-key.json');
      if (fs.existsSync(keyPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        initializeApp({ credential: cert(serviceAccount) });
      } else if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        // Render may convert \n inside the JSON to real newlines, breaking JSON.parse.
        // Fix: escape real newlines inside string values before parsing.
        const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON.replace(/\n/g, '\\n');
        const serviceAccount = JSON.parse(raw);
        // Restore real newlines in private_key for PEM format
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        initializeApp({ credential: cert(serviceAccount) });
      } else {
        initializeApp({
          credential: cert({
            projectId: env.FIREBASE_PROJECT_ID!,
            clientEmail: env.FIREBASE_CLIENT_EMAIL!,
            privateKey: env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
          }),
        });
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
