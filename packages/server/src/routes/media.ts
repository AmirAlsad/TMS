import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SUPPORTED_MEDIA_TYPES, MAX_MEDIA_SIZE } from '@tms/shared';

const MEDIA_DIR = path.resolve(process.cwd(), '.tms', 'media');

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, MEDIA_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MEDIA_SIZE },
  fileFilter(_req, file, cb) {
    if (SUPPORTED_MEDIA_TYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported media type: ${file.mimetype}`));
    }
  },
});

export function createMediaRouter(port: number) {
  const router = Router();

  // POST /api/media — upload a file
  router.post('/', upload.single('file'), (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const mediaUrl = `http://localhost:${port}/api/media/${file.filename}`;
    const mediaType = file.mimetype;
    res.json({ mediaUrl, mediaType });
  });

  // GET /api/media/:filename — serve uploaded files
  router.get('/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(MEDIA_DIR, filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.sendFile(filePath);
  });

  return router;
}

/** Ensure the media directory exists */
export function ensureMediaDir(): void {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/** Clean up the media directory */
export function cleanupMediaDir(): void {
  fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
}
