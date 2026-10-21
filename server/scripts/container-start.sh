#!/bin/sh
# Starts the server inside its container (server/Dockerfile).
#
# It refuses to start unless the data folder is a mounted volume. A container's
# own disk is replaced on every deploy, so a database written there would lose
# every account's usage counts, the Stripe event order and the try-out's state
# at the next one, with nothing in the logs to say so.
# TRACELY_ALLOW_EPHEMERAL_DATA=1 skips the check, for a throwaway local run.
set -eu

dir="${TRACELY_DATA_DIR:?TRACELY_DATA_DIR is not set}"

if [ "${TRACELY_ALLOW_EPHEMERAL_DATA:-}" != "1" ] && ! grep -qs " $dir " /proc/mounts; then
  echo "[tracely] no volume is mounted at $dir. Refusing to start: the database would be lost at the next deploy. Attach a volume at $dir (server/DEPLOY.md, \"Railway\")." >&2
  exit 1
fi

exec node server.js
