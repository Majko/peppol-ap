# Builder stage
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production stage
FROM node:22-slim
WORKDIR /app
# Install nginx and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends nginx curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/node_modules ./node_modules
COPY . .
COPY nginx/ /etc/nginx/
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD curl -f http://localhost/health/live || exit 1
CMD ["sh", "-c", "nginx && node server/cluster.js"]
