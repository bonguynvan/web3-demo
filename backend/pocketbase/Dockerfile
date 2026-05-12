# ─── builder ────────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /src
RUN apk add --no-cache build-base git

COPY go.mod ./
RUN go mod download || true

COPY *.go ./
RUN go mod tidy && \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/pocketbase .

# ─── runtime ───────────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -g 1000 -S pb && adduser -u 1000 -S pb -G pb

WORKDIR /app
COPY --from=builder /out/pocketbase /app/pocketbase
COPY pb_migrations /app/pb_migrations

RUN mkdir -p /pb_data && chown -R pb:pb /app /pb_data
USER pb

EXPOSE 8090
VOLUME ["/pb_data"]

ENTRYPOINT ["/app/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb_data", "--migrationsDir=/app/pb_migrations"]
