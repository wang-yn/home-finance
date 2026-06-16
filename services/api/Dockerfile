# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS build

WORKDIR /src/services/api

COPY services/api/go.mod services/api/go.sum ./
RUN go mod download

COPY services/api ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/home-finance-api ./cmd/server

FROM alpine:3.22

RUN addgroup -S homefinance && adduser -S -G homefinance homefinance

WORKDIR /app
COPY --from=build /out/home-finance-api /app/home-finance-api

ENV HOME_FINANCE_DB_PATH=/data/home-finance.db

RUN mkdir -p /data && chown -R homefinance:homefinance /data /app

USER homefinance
EXPOSE 8080
VOLUME ["/data"]

ENTRYPOINT ["/app/home-finance-api"]
