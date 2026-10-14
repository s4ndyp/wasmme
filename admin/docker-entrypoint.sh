#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"

mkdir -p "${DATA_DIR}/staging" "${DATA_DIR}/published"

# Named volumes are often root-owned; admin runs as node (uid 1000).
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "${DATA_DIR}"
  exec su-exec node "$@"
fi

exec "$@"
