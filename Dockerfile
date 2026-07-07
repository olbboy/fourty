FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# node_modules from the builder includes tsx + drizzle so the image can run
# migrations (migrate one-shot) and the sqlite→postgres tool (ADR-002/003).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json /app/drizzle.config.ts ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
# Next traps SIGTERM for graceful shutdown; Compose stop_grace_period drains it.
CMD ["npx", "next", "start"]
