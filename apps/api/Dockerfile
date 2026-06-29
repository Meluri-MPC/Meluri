# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY package.json tsconfig.json ./
COPY apps/api/package.json apps/api/tsconfig*.json apps/api/
COPY packages/sdk/package.json packages/sdk/tsconfig*.json packages/sdk/

RUN pnpm install --frozen-lockfile --filter @velumx/api --filter @velumx/mpc

COPY apps/api/prisma apps/api/prisma/
COPY apps/api/src apps/api/src/
COPY packages/sdk/src packages/sdk/src/

RUN pnpm --filter @velumx/mpc build
RUN pnpm --filter @velumx/api prisma:generate
RUN pnpm --filter @velumx/api build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/sdk/package.json ./packages/sdk/
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist

ENV NODE_ENV=production
ENV PORT=4002

EXPOSE 4002

CMD ["node", "apps/api/dist/main.js"]
