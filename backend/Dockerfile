# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# --omit=dev: the image carries no test or lint tooling.
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as a non-root user. The node image ships one already.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node

EXPOSE 3000

# Readiness, not liveness: this container is only "healthy" once it can reach
# MongoDB, so an orchestrator will not route traffic to it before then.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The same image runs the worker with a different command, so there is no
# drift between what the API and the worker believe about the models.
CMD ["node", "index.js"]
