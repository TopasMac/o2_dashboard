#!/usr/bin/env bash
cd "$(dirname "$0")"
# CRA dev server env
export HOST=0.0.0.0
export PORT=3100
export WDS_ALLOWED_HOSTS=all
export DANGEROUSLY_DISABLE_HOST_CHECK=true
export WDS_SOCKET_HOST=localhost
export WDS_SOCKET_PORT=3100
export CHOKIDAR_USEPOLLING=true
export CHOKIDAR_INTERVAL=500
export WATCHPACK_POLLING=true
export BROWSER=none
# run the CRA dev server the same way as your start:mobile script
npm run start:mobile
