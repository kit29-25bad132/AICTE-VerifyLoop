# AICTE VerifyLoop

## Local development

The locked plan targets Node.js 20. This project currently uses Node.js
24.13.1 as the approved local runtime exception; Node.js 20 has not been tested
here. The package engine range requires Node.js 24.13.1 or later within major
version 24. If a future mandatory dependency is incompatible, resolve the
dependency or runtime policy with the project owner before changing the active
runtime.

The local Phase 0 environment was verified with Python 3.14.0 (the plan
requires 3.11+), Docker 29.7.2, Docker Compose 5.5.1, pnpm 9.15.0, and npm
11.8.0. The repository still uses its npm lockfile for application installs;
pnpm is present to satisfy the tooling prerequisite. The required VS Code
extensions (ESLint, Prettier, Prisma, Tailwind CSS IntelliSense, and Python)
are installed.

The build plan requires a private GitHub repository. The owner has explicitly
approved keeping this repository public as an exception to that requirement.
Do not publish credentials or other sensitive data; real environment files
must remain untracked. Use `main` for demo-ready code, `dev` for integration,
and `feature/<name>` branches for work. A change must be reviewed by at least
one other team member before merging into `dev`; ensure every project team
member has repository access.

Use PowerShell from the repository directory:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run lint
npm run build
```

`.env.example` contains development-only placeholders. Keep real credentials in
the ignored `.env` file and never commit that file. Set a unique local
`JWT_SECRET` before using authentication; do not use the development defaults
in a shared or deployed environment.

## PostgreSQL and Redis

Docker Compose starts PostgreSQL 16 and Redis 7. The PostgreSQL host port
defaults to `5433` because port `5432` may already be used by a local
PostgreSQL installation. `POSTGRES_PORT` is configurable in `.env`; if the
chosen port is occupied, select an available host port and update the port in
`DATABASE_URL` to match. PostgreSQL still listens on port `5432` inside its
container.

Start the services and check their health:

```powershell
docker compose up -d
docker compose ps
docker compose exec -T postgres pg_isready -U postgres -d verifyloop
docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1"'
docker compose exec -T redis redis-cli ping
```

The database query should return `1`; Redis should return `PONG`. These checks
do not print credentials. Stop the services without deleting their persisted
data with `docker compose down`.

The current API uses in-memory application data; it does not connect to
PostgreSQL or Redis yet. Compose provides local service readiness only.

## Python OCR prerequisites

The build plan requires Python 3.11+, PyMuPDF, Tesseract, and its language
bindings. The local Python 3.14 virtual environment and exact package versions
are captured in `requirements-ocr.txt`. The Windows Tesseract engine is
available from the UB Mannheim Winget package (verified version
5.4.0.20240606); the language data is pinned to the official `tessdata_fast`
4.1.0 release.

Run the following once from the repository root:

```powershell
winget install --id UB-Mannheim.TesseractOCR --exact --source winget --silent --accept-package-agreements --accept-source-agreements
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\requirements-ocr.txt
New-Item -ItemType Directory -Force .tessdata | Out-Null
foreach ($language in @('eng', 'hin', 'tam', 'tel', 'mar', 'kan')) {
  Invoke-WebRequest "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/$language.traineddata" -OutFile ".tessdata\$language.traineddata"
}
$tesseract = 'C:\Program Files\Tesseract-OCR\tesseract.exe'
$env:TESSDATA_PREFIX = (Resolve-Path .tessdata).Path
& $tesseract --list-langs
```

The language list must include `eng`, `hin`, `tam`, `tel`, `mar`, and `kan`.
For Python OCR, set `pytesseract.pytesseract.tesseract_cmd` to the executable
path above. Keep `TESSDATA_PREFIX` set in the same PowerShell session.
`.venv` and `.tessdata` are ignored by Git.

## Run the API

In a separate PowerShell window:

```powershell
npm run dev
```

Check the health endpoint:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

## AI and document processing

The current server integration uses `GEMINI_API_KEY` and `GEMINI_MODEL`.
Keep the key in `.env`; do not copy the orchestrator's environment file. Groq,
OpenRouter, and LangSmith tracing are not currently wired into this server.
Without Gemini credentials, document intelligence uses its deterministic local
fallback.

PDF text extraction currently uses the Node.js `pdf-parse` dependency, with a
Gemini multimodal fallback for scanned PDFs. The Python OCR prerequisites are
installed and verified for Phase 0, but are not yet wired into the application
parser.

## Quick Local Troubleshooting

- **Database Port**: Note that PostgreSQL runs on mapped port `5433` (`DATABASE_URL=...:5433/...`).
- **Prisma Migrations**: Run migrations explicitly with schema paths:
  `npx prisma migrate dev --name add_sla_due_date --schema=packages/database/prisma/schema.prisma`
- **Key Validation**: Run `npx tsx scripts/validate-keys.ts` after adding credentials to `.env`.