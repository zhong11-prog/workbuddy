# 🐱 钟雁羚的工作台

随时随地管理计划、记账、学习、阅读的个人数据中枢。

## 功能模块

- 🏠 **首页仪表盘** — 韩语每日一句、今日待办、今日支出
- 📋 **今日计划** — 待办事项管理
- 💰 **智能记账** — 收支记录
- 🏃 **健身** — 游泳/力量/羽毛球/有氧训练记录
- 🇰🇷 **韩语陪考** — TOPIK 单词/语法学习、发音朗读、卡片翻转
- 📚 **电子阅读** — 上传 EPUB/TXT 电子书在线阅读
- 🍜 **随机菜单** — 118 种餐食随机推荐
- 👩‍🍳 **家常菜谱** — 101 道详细菜谱
- 🛒 **待购清单** — 购物清单管理
- 💪 **健康打卡** — 每日习惯追踪
- 📅 **经期记录** — 周期预测日历
- 💝 **心情日记** — 每日心情记录
- 🍅 **番茄专注** — 番茄钟白噪音
- 🎮 **开心消消乐** — 10 关卡三消游戏
- 🐱 **小七猫咪** — 可拖动的电子宠物陪伴

---

## 🚀 一键部署

### Railway 部署（推荐免费方案）

1. 注册 https://railway.app （GitHub 登录）
2. 点击「New Project」→「Deploy from GitHub repo」
3. 选择本项目的 GitHub 仓库
4. Railway 自动检测 Dockerfile 并构建
5. 设置环境变量：
   - `PORT` — 不用设置（Railway 自动分配）
   - `DATA_DIR` — 设为 `/data`
6. 挂载持久化磁盘：Settings → Volumes → Add Volume，挂载路径 `/data`
7. 部署后获得公网 URL（如 `https://xxx.up.railway.app`）

### Render 部署

1. 注册 https://render.com （GitHub 登录）
2. 点击「New」→「Web Service」
3. 连接 GitHub 仓库，选择本项目
4. 配置：
   - **Runtime**: Docker
   - **Build Command**: 留空（使用 Dockerfile）
   - **Start Command**: 留空（使用 Dockerfile CMD）
5. 设置环境变量：
   - `DATA_DIR` = `/data`
6. 挂载磁盘：左侧菜单「Disks」→ 创建 1GB 磁盘，挂载路径 `/data`
7. 部署后获得公网 URL（如 `https://xxx.onrender.com`）

### Docker 本地部署

```bash
# 构建镜像
docker build -t workbuddy .

# 运行（数据持久化到 ./data 目录）
docker run -d -p 3456:3000 \
  -v $(pwd)/data:/data \
  -e DATA_DIR=/data \
  --name workbuddy \
  workbuddy

# 访问 http://localhost:3456
```

---

## 本地开发

```bash
npm install
PORT=3456 node server.js
```

访问 http://localhost:3456

---

## 技术栈

- **后端**: Node.js + Express + SQLite (better-sqlite3)
- **前端**: 纯 HTML/CSS/JS（无框架依赖）
- **同步**: IndexedDB + Service Worker (PWA)
- **部署**: Docker / Railway / Render

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `DATA_DIR` | 项目根目录 | 数据库和文件存储路径 |
