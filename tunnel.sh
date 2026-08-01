#!/bin/bash
# 公网隧道自动重连脚本
while true; do
  echo "🔄 启动隧道..." 
  ssh -p 443 -R0:localhost:3456 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 a.pinggy.io 2>&1
  echo "⚠️ 隧道断开，5秒后重连..."
  sleep 5
done
