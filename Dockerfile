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

FROM nginx:alpine AS final

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
