# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY package.json tsconfig.json ./
COPY apps/mpc/package.json apps/mpc/tsconfig*.json apps/mpc/

RUN pnpm install --frozen-lockfile --filter @velumx/mpc-service

COPY apps/mpc/src apps/mpc/src/

RUN pnpm --filter @velumx/mpc-service build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/mpc/package.json ./apps/mpc/
COPY --from=builder /app/apps/mpc/node_modules ./apps/mpc/node_modules
COPY --from=builder /app/apps/mpc/dist ./apps/mpc/dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080 8081

CMD ["node", "apps/mpc/dist/main.js"]
