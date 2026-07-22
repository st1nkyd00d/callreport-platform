# Build de apps/api dentro del monorepo (workspaces npm). El contexto de
# build es la raíz del repo (ver docker-compose.yml: context: .).

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/prisma ./apps/api/prisma
# `npm ci` corre el postinstall de apps/api (`prisma generate`), que no
# necesita conexión a base de datos.
RUN npm ci --workspace apps/api --workspace packages/shared --include-workspace-root

FROM deps AS build
COPY . .
RUN npm run build --workspace apps/api

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json apps/api/package.json
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
