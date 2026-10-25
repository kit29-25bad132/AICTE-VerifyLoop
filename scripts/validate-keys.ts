import 'dotenv/config';

const checks = [
  { name: 'PostgreSQL', test: async () => Boolean(process.env.DATABASE_URL) },
  { name: 'Redis', test: async () => Boolean(process.env.REDIS_URL) },
  { name: 'GEMINI_API_KEY', test: async () => Boolean(process.env.GEMINI_API_KEY) },
  { name: 'GROQ_API_KEY', test: async () => Boolean(process.env.GROQ_API_KEY) },
  { name: 'OPENROUTER_API_KEY', test: async () => Boolean(process.env.OPENROUTER_API_KEY) },
  {
    name: 'LANGCHAIN_API_KEY',
    test: async () => Boolean(process.env.LANGCHAIN_API_KEY ?? process.env.LANGSMITH_API_KEY),
  },
  {
    name: 'GROQ_API_KEY (live)',
    test: async () => {
      if (!process.env.GROQ_API_KEY) return false;
      try {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  },
  {
    name: 'LANGSMITH (live)',
    test: async () => {
      const key = process.env.LANGCHAIN_API_KEY ?? process.env.LANGSMITH_API_KEY;
      if (!key) return false;
      try {
        const response = await fetch('https://api.smith.langchain.com/info', {
          headers: { 'x-api-key': key },
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  },
] as const;

const results = await Promise.all(checks.map(async (check) => [check.name, await check.test()] as const));
const failed = results.filter(([, passed]) => !passed);
for (const [name, passed] of results) console.log(`${passed ? '✅' : '❌'} ${name}`);
if (failed.length > 0) {
  console.error('\nSome checks failed. Fill in .env before proceeding.');
  process.exit(1);
}
console.log('\n✅ All checks passed. Phase 0 complete.');
