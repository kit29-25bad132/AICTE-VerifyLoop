import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import { startSLACron } from './jobs/sla-cron.js';

dotenv.config({ path: '../../.env' });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'api' }));
app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'Invalid upload' });
    return;
  }
  console.error('[api] request failed', error instanceof Error ? error.message : 'Unknown error');
  response.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 3001);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`API listening on port ${port}`));
  startSLACron();
}

export default app;
