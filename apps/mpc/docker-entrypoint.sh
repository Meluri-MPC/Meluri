#!/bin/sh
set -e

# Wait for PostgreSQL
if [ -n "$DATABASE_URL" ]; then
  PG_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:/]*\).*/\1/p')
  PG_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*$/\1/p')
  PG_PORT=${PG_PORT:-5432}

  until pg_isready -h "$PG_HOST" -p "$PG_PORT" -t 3 2>/dev/null; do
    echo "Waiting for PostgreSQL at $PG_HOST:$PG_PORT..."
    sleep 2
  done
fi

# Wait for Redis
if [ -n "$REDIS_URL" ]; then
  REDIS_HOST=$(echo "$REDIS_URL" | sed -n 's/.*@\([^:/]*\).*/\1/p')
  REDIS_HOST=${REDIS_HOST:-$(echo "$REDIS_URL" | sed -n 's/.*\/\/\([^:/]*\).*/\1/p')}
  REDIS_PORT=$(echo "$REDIS_URL" | sed -n 's/.*:\([0-9]*\).*$/\1/p')
  REDIS_PORT=${REDIS_PORT:-6379}

  until nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null || redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null; do
    echo "Waiting for Redis at $REDIS_HOST:$REDIS_PORT..."
    sleep 2
  done
fi

exec node dist/main.js
