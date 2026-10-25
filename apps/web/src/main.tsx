import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <main><h1>AICTE VerifyLoop</h1><p>Phase 0 workspace scaffold.</p></main>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
