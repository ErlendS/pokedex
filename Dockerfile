# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.14.1
ARG PNPM_VERSION=11.0.9

FROM node:${NODE_VERSION}-alpine AS build

WORKDIR /app

RUN npm install --global pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:${NODE_VERSION}-alpine AS final
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/index.mjs"]
