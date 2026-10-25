import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.get('/health', (_request, response) => response.json({ status: 'ok' }));

const port = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`API listening on port ${port}`));
}

export default app;
