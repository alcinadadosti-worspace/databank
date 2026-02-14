import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { getDb, getStorageBucket, COLLECTIONS, getNextId } from '../models/database';
import { logAudit } from '../models/queries';

const router = Router();

// Extend Request type to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer for file upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos'));
    }
  },
});

interface Report {
  id: number;
  title: string;
  description?: string;
  filename: string;
  fileUrl: string;
  fileSize: number;
  weekStart?: string;
  weekEnd?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

/** GET /api/reports - List all reports */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const snapshot = await db
      .collection(COLLECTIONS.REPORTS)
      .orderBy('uploadedAt', 'desc')
      .get();

    const reports: Report[] = snapshot.docs.map(doc => ({
      id: doc.data().id,
      ...doc.data(),
    })) as Report[];

    res.json({ reports });
  } catch (error) {
    console.error('[reports] Error listing reports:', error);
    res.status(500).json({ error: 'Falha ao listar relatórios' });
  }
});

/** POST /api/reports - Upload a new report */
router.post('/', upload.single('file'), async (req: MulterRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const { title, description, weekStart, weekEnd, uploadedBy } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Título é obrigatório' });
    }

    const db = getDb();
    const bucket = getStorageBucket();

    // Generate unique filename
    const timestamp = Date.now();
    const safeTitle = (title as string).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `reports/${timestamp}_${safeTitle}.pdf`;

    // Upload to Firebase Storage
    const file = bucket.file(filename);
    await file.save(req.file.buffer, {
      metadata: {
        contentType: 'application/pdf',
      },
    });

    // Make the file publicly accessible
    await file.makePublic();

    // Get public URL
    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

    // Save metadata to Firestore
    const id = await getNextId(COLLECTIONS.REPORTS);
    const report: Report = {
      id,
      title,
      description: description || '',
      filename,
      fileUrl,
      fileSize: req.file.size,
      weekStart: weekStart || '',
      weekEnd: weekEnd || '',
      uploadedAt: new Date().toISOString(),
      uploadedBy: uploadedBy || 'Admin',
    };

    await db.collection(COLLECTIONS.REPORTS).doc(String(id)).set(report);

    await logAudit('REPORT_UPLOADED', 'report', id, `${title} uploaded`);

    res.json({ success: true, report });
  } catch (error) {
    console.error('[reports] Error uploading report:', error);
    res.status(500).json({ error: 'Falha ao fazer upload do relatório' });
  }
});

/** DELETE /api/reports/:id - Delete a report */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id as string;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const db = getDb();
    const bucket = getStorageBucket();

    // Get the report to find the filename
    const doc = await db.collection(COLLECTIONS.REPORTS).doc(String(id)).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Relatório não encontrado' });
    }

    const report = doc.data() as Report;

    // Delete from Storage
    try {
      await bucket.file(report.filename).delete();
    } catch (storageError) {
      console.warn('[reports] Could not delete file from storage:', storageError);
    }

    // Delete from Firestore
    await db.collection(COLLECTIONS.REPORTS).doc(String(id)).delete();

    await logAudit('REPORT_DELETED', 'report', id, `${report.title} deleted`);

    res.json({ success: true, message: 'Relatório excluído' });
  } catch (error) {
    console.error('[reports] Error deleting report:', error);
    res.status(500).json({ error: 'Falha ao excluir relatório' });
  }
});

/** GET /api/reports/:id/download - Get download URL */
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id as string;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const db = getDb();
    const doc = await db.collection(COLLECTIONS.REPORTS).doc(String(id)).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Relatório não encontrado' });
    }

    const report = doc.data() as Report;
    res.json({ url: report.fileUrl });
  } catch (error) {
    console.error('[reports] Error getting download URL:', error);
    res.status(500).json({ error: 'Falha ao obter URL de download' });
  }
});

export default router;
