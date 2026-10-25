import 'dotenv/config';

const checks = [
  ['PostgreSQL', Boolean(process.env.DATABASE_URL)],
  ['Redis', Boolean(process.env.REDIS_URL)],
  ['GEMINI_API_KEY', Boolean(process.env.GEMINI_API_KEY)],
  ['GROQ_API_KEY', Boolean(process.env.GROQ_API_KEY)],
  ['OPENROUTER_API_KEY', Boolean(process.env.OPENROUTER_API_KEY)],
  ['LANGCHAIN_API_KEY', Boolean(process.env.LANGCHAIN_API_KEY ?? process.env.LANGSMITH_API_KEY)],
] as const;

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? '✅' : '❌'} ${name}`);
if (failed.length > 0) {
  console.error('\nSome checks failed. Fill in .env before proceeding.');
  process.exit(1);
}
console.log('\n✅ All checks passed. Phase 0 complete.');
