# syntax=docker/dockerfile:1

FROM node:24-alpine AS web-build

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG ALL_PROXY
ARG NO_PROXY

WORKDIR /src/apps/web

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

COPY apps/web ./
RUN npm run build

FROM golang:1.26-alpine AS build

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG ALL_PROXY
ARG NO_PROXY

WORKDIR /src/services/api

COPY services/api/go.mod services/api/go.sum ./
RUN go mod download

COPY services/api ./
COPY --from=web-build /src/apps/web/dist ./internal/webui/dist
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/home-finance-api ./cmd/server

FROM alpine:3.22

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG ALL_PROXY
ARG NO_PROXY

RUN apk add --no-cache su-exec \
  && addgroup -S homefinance \
  && adduser -S -G homefinance homefinance

WORKDIR /app
COPY --from=build /out/home-finance-api /app/home-finance-api
COPY services/api/docker-entrypoint.sh /app/docker-entrypoint.sh

ENV HOME_FINANCE_DB_PATH=/data/home-finance.db

RUN chmod +x /app/docker-entrypoint.sh \
  && mkdir -p /data \
  && chown -R homefinance:homefinance /data /app

EXPOSE 8080
VOLUME ["/data"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/home-finance-api"]
