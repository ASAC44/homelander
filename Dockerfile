FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 app
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY package.json ./
USER app
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
