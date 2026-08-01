FROM node:22-alpine

# 安装 SQLite 构建依赖
RUN apk add --no-cache python3 make g++ sqlite

# 设置持久化数据目录
ENV DATA_DIR=/data
ENV PORT=3000

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json* ./
RUN npm install --production

# 复制项目文件
COPY server.js ./
COPY public/ ./public/

# 创建数据目录
RUN mkdir -p $DATA_DIR/data/books $DATA_DIR/backups

# 暴露端口
EXPOSE $PORT

CMD ["node", "server.js"]
