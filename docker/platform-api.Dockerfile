FROM node:20-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/platform-api/package.json apps/platform-api/package.json
COPY packages/game-sdk/package.json packages/game-sdk/package.json
COPY packages/shared-observability/package.json packages/shared-observability/package.json

RUN pnpm install --frozen-lockfile

COPY apps/platform-api apps/platform-api
COPY packages/game-sdk packages/game-sdk
COPY packages/shared-observability packages/shared-observability

RUN pnpm --filter @wifi-portal/shared-observability build \
  && pnpm --filter @wifi-portal/game-sdk build \
  && pnpm --filter @wifi-portal/platform-api build

FROM node:20-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000

CMD ["node", "apps/platform-api/dist/main.cjs"]
