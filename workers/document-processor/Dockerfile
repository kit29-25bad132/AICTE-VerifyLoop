FROM node:20-alpine
WORKDIR /app
COPY . .
RUN apk add --no-cache openssl && npm install -g pnpm && pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @aicte/database generate
CMD ["node", "--import", "tsx", "workers/document-processor/src/index.ts"]
