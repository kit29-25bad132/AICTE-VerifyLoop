import express from 'express';
import { dbStore } from './server/dbStore.js';
import { extractDocumentIntelligence } from './server/aiServices.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', demoActive: dbStore.isDemoActive, documentCount: dbStore.documents.length });
});

// Demo toggle endpoint
app.post('/api/demo/toggle', (req, res) => {
  dbStore.isDemoActive = !dbStore.isDemoActive;
  res.json({ isDemoActive: dbStore.isDemoActive });
});

// Demo clear endpoint
app.post('/api/demo/clear', (req, res) => {
  dbStore.clearAllData();
  res.json({ success: true });
});

// Auth users endpoint
app.get('/api/auth/users', (req, res) => {
  res.json({ users: dbStore.users });
});

// Documents endpoint
app.get('/api/documents', (req, res) => {
  res.json({ documents: dbStore.documents, isDemoActive: dbStore.isDemoActive });
});

// Risks endpoint
app.get('/api/risks', (req, res) => {
  res.json({ risks: dbStore.risks });
});

// Simple catch-all for other API paths
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`AICTE VerifyLoop server running on port ${PORT}`);
  console.log(`Demo mode: ${dbStore.isDemoActive ? 'ON' : 'OFF'}`);
  console.log(`Documents loaded: ${dbStore.documents.length}`);
});