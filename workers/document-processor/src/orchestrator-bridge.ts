import axios from 'axios';

const ORCH_URL = process.env.ORCHESTRATOR_SERVICE_URL ?? 'http://localhost:8001';

export interface ExtractResult {
  data: Record<string, unknown>;
  provider: string;
  model: string;
}

export async function extractWithOrchestrator(
  systemPrompt: string,
  userPrompt: string,
  outputSchema: Record<string, unknown>,
): Promise<ExtractResult> {
  const res = await axios.post<ExtractResult>(`${ORCH_URL}/extract`, {
    system_prompt: systemPrompt,
    user_prompt: userPrompt,
    output_schema: outputSchema,
  });
  return res.data;
}

export async function checkOrchestratorHealth(): Promise<boolean> {
  try {
    await axios.get(`${ORCH_URL}/health`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
