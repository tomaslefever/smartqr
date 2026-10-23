# syntax=docker/dockerfile:1

# --- Build: instala dependencias y genera dist/ con Vite ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime: solo Node, server.js y el build estático ---
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/server.js ./
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1
CMD ["node", "server.js"]
