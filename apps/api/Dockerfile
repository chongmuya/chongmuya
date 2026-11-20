# syntax=docker/dockerfile:1
FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS dependencies
WORKDIR /app
# Bootstrap the pinned package manager; application installs use only pnpm.
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

FROM dependencies AS build
RUN pnpm install --filter @chongmuya/api... --frozen-lockfile --ignore-scripts
COPY apps/api/tsconfig*.json apps/api/nest-cli.json ./apps/api/
COPY apps/api/src ./apps/api/src
RUN pnpm --filter @chongmuya/api build
# .dockerignore excludes all local fixture/reset code before compilation.
RUN test ! -d apps/api/dist/database/seeds

FROM dependencies AS production-dependencies
RUN pnpm install --filter @chongmuya/api... --prod --frozen-lockfile --ignore-scripts

FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
# Keep the pnpm virtual store at the same relative path as the package links.
COPY --from=production-dependencies /app/node_modules /app/node_modules
COPY --from=production-dependencies /app/apps/api/node_modules ./node_modules
COPY apps/api/package.json ./package.json
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/scripts/operations-application.mjs apps/api/scripts/merchant-operations.mjs apps/api/scripts/reservation-operations.mjs apps/api/scripts/reservation-completion.mjs apps/api/scripts/merchant-cli.mjs apps/api/scripts/restaurant-data.mjs apps/api/scripts/restaurant-data-input.mjs apps/api/scripts/normalize-restaurant-address.mjs apps/api/scripts/deployment-config.mjs apps/api/scripts/migrate.mjs ./scripts/
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
