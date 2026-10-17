import crypto from 'crypto';
import { getDb, getStorageBucket, COLLECTIONS } from '../models/database';

/**
 * Medical certificates (atestados) the employee sends through Slack. Health data
 * (LGPD): files live in Storage WITHOUT a public download token and are only
 * served by the backend to the RH login or the employee's own gestor.
 */

export const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024; // Slack's file_input limit too
export const MAX_FILES_PER_UPLOAD = 3;
export const MAX_FILES_PER_DAY = 10;
/** Offered in Slack's file picker — convenience only, the bytes are checked again on save. */
export const SLACK_CERTIFICATE_FILETYPES = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'pdf'];

export type CertificateFlow = 'late' | 'full_day' | 'test';

export interface MedicalCertificate {
  id: string;
  employee_id: number;
  /** Day the certificate covers (the daily record's date) */
  date: string;
  daily_record_id: number | null;
  justification_id: number | null;
  flow: CertificateFlow;
  storage_path: string;
  filename: string;
  mimetype: string;
  size: number;
  uploaded_at: string;
  uploaded_by_slack_id: string | null;
  slack_file_id: string | null;
  is_test: boolean;
}

/** A file we refuse to keep; `message` is shown to the employee in Slack. */
export class CertificateFileError extends Error {}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/**
 * Real file type from the first bytes. Slack's mimetype/extension come from the
 * user's phone and are not trusted — this also stops an HTML/SVG file from being
 * served back to the panel as if it were an image.
 */
export function detectCertificateFileType(buf: Buffer): { ext: string; mimetype: string } | null {
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString('latin1');
  if (buf.length >= 5 && ascii(0, 5) === '%PDF-') return { ext: 'pdf', mimetype: 'application/pdf' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mimetype: 'image/jpeg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mimetype: 'image/png' };
  }
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { ext: 'webp', mimetype: 'image/webp' };
  if (buf.length >= 12 && ascii(4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(8, 12))) return { ext: 'heic', mimetype: 'image/heic' };
  return null;
}

/** Keeps the employee's file name readable but safe for headers and logs. */
export function cleanCertificateFilename(name: string | null | undefined, ext: string): string {
  const base = (name || '').replace(/[\u0000-\u001f\u007f"\\/]/g, '').trim().slice(0, 120) || 'atestado';
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base.replace(/\.[a-z0-9]{1,5}$/i, '')}.${ext}`;
}

/** Downloads a Slack file (url_private_download) with the bot token, capped at MAX_CERTIFICATE_BYTES. */
export async function downloadSlackFile(url: string, botToken: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${botToken}` } });
  if (!res.ok) throw new CertificateFileError(`o Slack não liberou o arquivo (HTTP ${res.status})`);
  // Without access (e.g. missing files:read) Slack answers 200 with its login page
  if ((res.headers.get('content-type') || '').startsWith('text/html')) {
    throw new CertificateFileError('o Slack não liberou o arquivo para o sistema; avise o RH');
  }
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_CERTIFICATE_BYTES) throw new CertificateFileError('o arquivo passa de 10 MB');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_CERTIFICATE_BYTES) throw new CertificateFileError('o arquivo passa de 10 MB');
  return buf;
}

function certificatesCollection() {
  return getDb().collection(COLLECTIONS.MEDICAL_CERTIFICATES);
}

/** Validates the bytes, stores the file privately and records its metadata. */
export async function saveCertificate(input: {
  buffer: Buffer;
  originalName: string | null;
  employeeId: number;
  date: string;
  dailyRecordId: number | null;
  justificationId: number | null;
  flow: CertificateFlow;
  uploadedBySlackId: string | null;
  slackFileId: string | null;
}): Promise<MedicalCertificate> {
  if (input.buffer.length === 0) throw new CertificateFileError('o arquivo está vazio');
  if (input.buffer.length > MAX_CERTIFICATE_BYTES) throw new CertificateFileError('o arquivo passa de 10 MB');
  const type = detectCertificateFileType(input.buffer);
  if (!type) throw new CertificateFileError('só aceitamos foto (JPG, PNG, HEIC, WEBP) ou PDF');

  const id = crypto.randomUUID();
  const isTest = input.flow === 'test';
  const folder = isTest ? 'test' : String(input.employeeId);
  const storagePath = `medical-certificates/${folder}/${input.date}/${id}.${type.ext}`;

  // No firebaseStorageDownloadTokens: without it there is no public URL for the file
  await getStorageBucket().file(storagePath).save(input.buffer, {
    resumable: false,
    contentType: type.mimetype,
    metadata: { cacheControl: 'private, no-store' },
  });

  const cert: MedicalCertificate = {
    id,
    employee_id: input.employeeId,
    date: input.date,
    daily_record_id: input.dailyRecordId,
    justification_id: input.justificationId,
    flow: input.flow,
    storage_path: storagePath,
    filename: cleanCertificateFilename(input.originalName, type.ext),
    mimetype: type.mimetype,
    size: input.buffer.length,
    uploaded_at: new Date().toISOString(),
    uploaded_by_slack_id: input.uploadedBySlackId,
    slack_file_id: input.slackFileId,
    is_test: isTest,
  };
  await certificatesCollection().doc(id).set(cert);
  return cert;
}

/** Certificates covering days in [start, end] (single-field range: no composite index). */
export async function listCertificates(start: string, end: string): Promise<MedicalCertificate[]> {
  const snap = await certificatesCollection()
    .where('date', '>=', start)
    .where('date', '<=', end)
    .get();
  return snap.docs
    .map(d => d.data() as MedicalCertificate)
    .sort((a, b) => b.date.localeCompare(a.date) || b.uploaded_at.localeCompare(a.uploaded_at));
}

export async function countCertificatesForDay(employeeId: number, date: string, isTest = false): Promise<number> {
  const snap = await certificatesCollection()
    .where('employee_id', '==', employeeId)
    .where('date', '==', date)
    .get();
  return snap.docs.filter(d => Boolean(d.data().is_test) === isTest).length;
}

export async function getCertificate(id: string): Promise<MedicalCertificate | null> {
  const doc = await certificatesCollection().doc(id).get();
  return doc.exists ? (doc.data() as MedicalCertificate) : null;
}

export async function readCertificateFile(cert: MedicalCertificate): Promise<Buffer> {
  const [buf] = await getStorageBucket().file(cert.storage_path).download();
  return buf;
}

export async function deleteCertificate(cert: MedicalCertificate): Promise<void> {
  await getStorageBucket().file(cert.storage_path).delete({ ignoreNotFound: true });
  await certificatesCollection().doc(cert.id).delete();
}
