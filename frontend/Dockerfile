# Multi-stage: Vite React build → Nginx SPA
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci -w frontend

COPY frontend ./frontend

# Same-origin behind nginx (empty → runtime uses window.location.origin)
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace frontend

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
# Self-signed / mounted TLS material (compose mounts ./nginx/certs)
RUN mkdir -p /etc/nginx/certs
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
