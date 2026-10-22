# Telltale server image. Built remotely by Fly (`fly deploy`), so no local Docker is needed.
FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN BUILD_STANDALONE=1 pnpm build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Local Chromium for the agent: used when Kernel is off, and as the fallback when a page crashes
# Kernel's browser. Pinned to the app's Playwright version so the browser build matches.
RUN npx -y playwright@1.64.1 install --with-deps chromium && rm -rf /root/.npm
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Read at runtime from process.cwd(): the CA registry CSV and the latest Daylight snapshot.
COPY --from=build /app/data ./data
EXPOSE 3000
CMD ["node", "server.js"]
