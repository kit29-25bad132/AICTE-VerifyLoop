import axios from 'axios';
const URL = process.env.ORCHESTRATOR_SERVICE_URL ?? 'http://localhost:8001';
export async function ocrWithGemini(pageImageBase64: string): Promise<string> {
  const response = await axios.post(`${URL}/extract`, { system_prompt: 'Extract all text from this document image. Return only text.', user_prompt: `[IMAGE_BASE64]: ${pageImageBase64}`, output_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }, { timeout: 90000 });
  return String(response.data?.data?.raw ?? response.data?.text ?? '');
}
