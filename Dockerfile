# One-box Pot & Arena: Express API + Expo web static (same origin).
# Build context = repo root. Web client is pre-exported into server/public.
FROM node:22-bookworm-slim

WORKDIR /app

# System deps (none required for node:sqlite on Node 22+)
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/src ./src
COPY server/public ./public

# SQLite lives on a volume in production (DB_PATH)
RUN mkdir -p /data
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV DB_PATH=/data/game.db

EXPOSE 8080
CMD ["node", "src/index.js"]
