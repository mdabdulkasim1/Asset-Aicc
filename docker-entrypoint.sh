#!/bin/sh
# A mounted disk arrives owned by root, while the register runs as an ordinary
# user - so it could not create its database and the container died at startup.
# This runs first as root, hands the data folder to that user, then drops the
# privileges before starting the app.
set -e

DATA_PATH="${RAILWAY_VOLUME_MOUNT_PATH:-${DATA_DIR:-/data}}"
mkdir -p "$DATA_PATH"

if [ "$(id -u)" = '0' ]; then
  chown -R node:node "$DATA_PATH" 2>/dev/null || \
    echo "entrypoint: could not take ownership of $DATA_PATH - carrying on" >&2
  exec gosu node "$@"
fi

exec "$@"
