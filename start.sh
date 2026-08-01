#!/bin/bash
cd /workspace
npm install better-sqlite3 express node-cron 2>/dev/null
node server.js &
# Also serve static via python as fallback
python3 -m http.server 8080 --directory /workspace/public &
