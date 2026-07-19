# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini wget

FROM base AS development
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "dev"]

FROM base AS production-deps
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS production
ENV NODE_ENV=production
RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp
COPY --from=production-deps /app/node_modules ./node_modules
COPY --chown=nodeapp:nodeapp . .
RUN mkdir -p logs uploads backups && chown -R nodeapp:nodeapp logs uploads backups
USER nodeapp
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5000/api/v1/health/live >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
