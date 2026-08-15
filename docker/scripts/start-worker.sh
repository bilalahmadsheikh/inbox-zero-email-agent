#!/bin/sh
set -e

echo "🚀 Starting Zynbox worker..."
exec node /app/apps/worker/src/index.mjs
