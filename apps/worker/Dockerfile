# Worker image for Railway / local docker-compose
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN pnpm --filter @daytrading/shared build && pnpm --filter @daytrading/worker build
# --legacy: pnpm v10 otherwise refuses to deploy workspaces without
# inject-workspace-packages=true (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE)
RUN pnpm --filter @daytrading/worker --prod --legacy deploy /prod/worker

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /prod/worker /app
# Run as non-root
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-8080}/health || exit 1
CMD ["node", "dist/index.js"]
