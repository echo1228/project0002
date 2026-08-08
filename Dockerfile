FROM node:24-bookworm-slim AS build

RUN npm install --global pnpm@10.12.1 \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
RUN npm install --global pnpm@10.12.1 \
  && apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data /exchange /pnpm-store /tmp \
  && chown -R node:node /data /exchange /pnpm-store /tmp

USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", ".output/server/index.mjs"]
