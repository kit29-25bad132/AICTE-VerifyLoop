import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import authRouter from './routes/auth.js';

dotenv.config({ path: '../../.env' });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'api' }));
app.use('/api/auth', authRouter);

const port = Number(process.env.PORT ?? 3001);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`API listening on port ${port}`));
}

export default app;
