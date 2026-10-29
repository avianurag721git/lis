# Monorepo: build backend workspace for production API
FROM node:26-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --omit=dev -w backend

FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci -w backend
COPY backend ./backend
RUN npm run build --workspace backend
           
FROM node:26-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --omit=dev -w backend
COPY --from=build /app/backend/dist ./backend/dist
EXPOSE 5000 5055
CMD ["node", "backend/dist/server.js"]