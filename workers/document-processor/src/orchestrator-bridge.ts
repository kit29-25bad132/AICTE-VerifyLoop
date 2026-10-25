import { spawn } from 'node:child_process';

export interface OrchestratorRequest {
  prompt: string;
  schema: unknown;
}

export interface OrchestratorResponse {
  succeeded: boolean;
  response?: unknown;
  error?: string;
}

/**
 * The existing orchestrator is Python-only. This boundary is intentionally
 * process-based until that project exposes a supported service or CLI entrypoint.
 */
export async function extractWithOrchestrator(
  request: OrchestratorRequest,
): Promise<OrchestratorResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(globalThis.process.env.PYTHON ?? 'python', ['-c', 'raise SystemExit(78)'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let error = '';
    child.stderr.on('data', (chunk: Buffer) => { error += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code === 78) {
        resolve({
          succeeded: false,
          error: 'The Python llm-orchestrator has no CLI/service entrypoint yet.',
        });
      } else {
        reject(new Error(error || `orchestrator process exited with code ${code ?? 'unknown'}`));
      }
    });
    void request;
  });
}
