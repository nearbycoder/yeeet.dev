# Yeeet backend runtime. Build from the repository root:
#   docker build -f packages/runtime/Dockerfile -t yeeet-runtime .
FROM oven/bun:1.3-slim

WORKDIR /app
COPY packages/runtime/package.json ./package.json
COPY packages/runtime/src ./src

# The runtime starts as root so it can give every site worker its own OS user.
# Mount a persistent volume here for SQLite databases, backups, and bundles.
ENV DATA_DIR=/data \
    PORT=8080 \
    NODE_ENV=production
EXPOSE 8080

CMD ["bun", "src/server.js"]
