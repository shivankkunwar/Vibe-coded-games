# The games site, Dead Air, and the narrator API in one container.
# Build: docker build -t games .
# Run:   docker run --rm -p 5173:5173 -e GEMINI_API_KEY=... games
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=5173
COPY --from=build /app/dist ./dist
COPY narrator ./narrator
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
USER node
CMD ["node", "narrator/server.mjs"]
