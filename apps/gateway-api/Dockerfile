# Multi-stage build for the AI-Driven QA Platform's Layer 1 service.
# Build from the MONOREPO ROOT so the pnpm workspace resolves:
#   docker build -f apps/gateway-api/Dockerfile -t qaf-gateway-api .
# (docker-compose.yml's `gateway-api` service already sets this context/dockerfile.)

FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter "@qaf/gateway-api..." build

FROM node:20-slim AS runtime
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /repo ./
EXPOSE 3000
CMD ["node", "apps/gateway-api/dist/bin/rest-server.js"]
