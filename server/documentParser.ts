import { createRequire } from 'module';
import mammoth from 'mammoth';
import { getGeminiClient, isGeminiAvailable } from './geminiClient.js';

const require = createRequire(import.meta.url);
let pdfParse: any;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn('pdf-parse load notice:', e);
}

export interface ParsedDocumentOutput {
  text: string;
  pageCount: number;
  pages: { pageNumber: number; text: string }[];
  isOcrApplied: boolean;
  metadata?: {
    author?: string;
    title?: string;
    creationDate?: string;
  };
}

/**
 * Robust sanitizer to ensure no raw PDF binary, object references, or stream bytes
 * ever leak into the extracted document text.
 */
export function sanitizeDocumentText(raw: string): string {
  if (!raw) return '';

  // Check if string contains raw PDF signatures
  if (raw.includes('%PDF-') || raw.includes('/Catalog') || raw.includes('/Pages') || raw.includes('endobj') || raw.includes('xref')) {
    // Clean out typical PDF object syntax
    let cleaned = raw
      .replace(/%PDF-[\d.]+/g, '')
      .replace(/\d+\s+\d+\s+obj[\s\S]*?endobj/g, '')
      .replace(/stream[\s\S]*?endstream/g, '')
      .replace(/xref[\s\S]*?trailer[\s\S]*?%%EOF/g, '')
      .replace(/[\w\d]+\s+\d+\s+obj[\s\S]*?endobj/g, '')
      .replace(/stream[\s\S]*?endstream/g, '')
      .replace(/xref[\s\S]*?trailer[\s\S]*?%%EOF/g, '')
      .replace(/^\s*\/[\w\d]+\s*$/g, ' ')
      .replace(/[<>()[\]{}]/g, ' ')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length < 50) {
      return '';
    }
    return cleaned;
  }

  // Remove binary/null characters while preserving normal formatting
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Extracts human-readable text from uploaded PDF buffer.
 * If text extraction produces no text (scanned PDF), attempts Gemini AI OCR.
 */
export async function parsePdfBuffer(buffer: Buffer, originalFilename?: string): Promise<ParsedDocumentOutput> {
  let extractedText = '';
  let pageCount = 1;
  let isOcrApplied = false;
  let pages: { pageNumber: number; text: string }[] = [];

  try {
    const parserFn = typeof pdfParse === 'function' ? pdfParse : (pdfParse as any)?.default || pdfParse;
    if (typeof parserFn === 'function') {
      const data = await parserFn(buffer);
      if (data && data.text) {
        extractedText = sanitizeDocumentText(data.text);
        pageCount = Math.max(1, data.numpages || 1);
      }
    }
  } catch (err) {
    console.warn('Standard PDF parsing failed, trying OCR fallback:', err);
  }

  // If text is empty or too short (< 20 chars), use Gemini Multimodal OCR
  if ((!extractedText || extractedText.length < 30) && isGeminiAvailable()) {
    const gemini = getGeminiClient();
    if (gemini) {
      try {
        const base64Data = buffer.toString('base64');
        const response = await gemini.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: base64Data
                  }
                },
                {
                  text: 'Perform OCR and extract all human-readable text from this document accurately. Organize the output clearly with page markers like --- PAGE 1 ---, --- PAGE 2 --- if multiple pages exist. Do NOT include raw binary or PDF metadata keywords.'
                }
              ]
            }
          ]
        });

        const ocrText = response.text || '';
        if (ocrText.trim().length > 20) {
          extractedText = sanitizeDocumentText(ocrText);
          isOcrApplied = true;
        }
      } catch (ocrErr) {
        console.error('Gemini PDF OCR fallback error:', ocrErr);
      }
    }
  }

  // If still empty, provide clean fallback message
  if (!extractedText || extractedText.length < 10) {
    extractedText = `Document: ${originalFilename || 'Uploaded PDF'}\n\nNotice: Text extraction was unsuccessful for this document (it may contain non-standard encoding or scanned image without searchable text layer). Use 'Re-Run AI Pipeline' to run OCR analysis.`;
  }

  // Split into page chunks for page-aware navigation
  pages = splitTextIntoPages(extractedText, pageCount);

  return {
    text: extractedText,
    pageCount: Math.max(1, pageCount, pages.length),
    pages,
    isOcrApplied
  };
}

/**
 * Extracts human-readable text from uploaded DOCX buffer using Mammoth.
 */
export async function parseDocxBuffer(buffer: Buffer): Promise<ParsedDocumentOutput> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = sanitizeDocumentText(result.value || '');
    const pageCount = Math.max(1, Math.ceil(text.length / 1800));
    const pages = splitTextIntoPages(text, pageCount);

    return {
      text,
      pageCount,
      pages,
      isOcrApplied: false
    };
  } catch (err: any) {
    console.error('Docx parse error:', err);
    const fallbackText = 'Notice: Could not parse Word document content. Please ensure valid .docx format.';
    return {
      text: fallbackText,
      pageCount: 1,
      pages: [{ pageNumber: 1, text: fallbackText }],
      isOcrApplied: false
    };
  }
}

/**
 * Splits extracted document text into logical pages based on page markers or character length.
 */
export function splitTextIntoPages(fullText: string, expectedPageCount: number): { pageNumber: number; text: string }[] {
  const pages: { pageNumber: number; text: string }[] = [];

  // Check for explicit page markers like "--- PAGE 1 ---" or "\f" (form feed)
  if (fullText.includes('\f')) {
    const rawPages = fullText.split('\f');
    rawPages.forEach((pText, idx) => {
      const clean = pText.trim();
      if (clean) {
        pages.push({ pageNumber: idx + 1, text: clean });
      }
    });
  } else if (/---\s*PAGE\s*\d+\s*---/i.test(fullText)) {
    const sections = fullText.split(/---\s*PAGE\s*\d+\s*---/i);
    let pNum = 1;
    sections.forEach(sec => {
      const clean = sec.trim();
      if (clean) {
        pages.push({ pageNumber: pNum++, text: clean });
      }
    });
  }

  // If no explicit markers found, divide evenly across paragraphs
  if (pages.length === 0) {
    const paragraphs = fullText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) {
      return [{ pageNumber: 1, text: fullText }];
    }

    const targetPages = Math.max(1, expectedPageCount || Math.ceil(fullText.length / 1500));
    const parasPerPage = Math.max(1, Math.ceil(paragraphs.length / targetPages));

    for (let i = 0; i < targetPages; i++) {
      const slice = paragraphs.slice(i * parasPerPage, (i + 1) * parasPerPage);
      if (slice.length > 0) {
        pages.push({
          pageNumber: i + 1,
          text: slice.join('\n\n')
        });
      }
    }
  }

  return pages.length > 0 ? pages : [{ pageNumber: 1, text: fullText }];
}