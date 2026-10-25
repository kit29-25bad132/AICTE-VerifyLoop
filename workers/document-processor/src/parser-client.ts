import axios from 'axios';
const PARSER_URL = process.env.PARSER_SERVICE_URL ?? 'http://localhost:8002';
export interface SpanData { text: string; bbox: [number, number, number, number]; page: number; }
export interface ParseResult { pages: SpanData[][]; total_words: number; page_count: number; needs_ocr: boolean; page_images: string[]; }
export async function parseDocument(pdfPath: string): Promise<ParseResult> {
  return (await axios.post<ParseResult>(`${PARSER_URL}/extract`, { pdf_path: pdfPath }, { timeout: 60000 })).data;
}
export async function ocrWithTesseract(imageBase64: string): Promise<string> {
  return (await axios.post<{ text: string }>(`${PARSER_URL}/ocr`, { image_base64: imageBase64 }, { timeout: 60000 })).data.text;
}
export async function checkParserHealth(): Promise<boolean> {
  try { return (await axios.get(`${PARSER_URL}/health`, { timeout: 5000 })).data?.status === 'ok'; } catch { return false; }
}
