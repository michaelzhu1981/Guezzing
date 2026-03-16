# Guezzing

Guezzing 是一个在线多人猜数字游戏示例项目，基于 `system_design/` 下的设计文档实现。项目提供完整的前后端代码、实时对战流程，以及 Docker 一键启动方案。

## 项目简介

玩家注册并登录后，可以在大厅中查看在线用户和排行榜，通过随机匹配或主动邀请进入双人对局。游戏过程中双方分别设置自己的秘密串，并通过实时猜测逐步逼近答案，系统会返回命中字符数和位置命中数。项目同时包含大厅聊天、游戏内聊天、断线重连和基础积分统计能力。

## 已实现功能

- 用户注册、登录、修改密码
- JWT 鉴权
- 大厅在线用户列表
- 全局排行榜
- 随机匹配
- 玩家互相邀请开始对局
- WebSocket 实时同步游戏状态
- 大厅聊天与对局聊天
- 断线重连与在线状态维护
- 游戏结果统计与积分数据持久化

## 技术栈

### 前端

- Next.js 15
- React 18
- Ant Design 5
- Zustand
- Socket.IO Client

### 后端

- NestJS 10
- Socket.IO
- TypeORM
- PostgreSQL
- Redis
- JWT / Passport

### 部署与运行

- Docker Compose
- Nginx 反向代理

## 目录结构

```text
.
├── frontend/               # Next.js 前端
├── backend/                # NestJS 后端
├── docker/                 # Nginx / PostgreSQL / Redis 配置
├── system_design/          # 设计文档
├── docker-compose.yml      # 一键启动编排
└── README.md
```

## 快速启动

### 方式一：Docker Compose

这是最省事的运行方式，会同时启动前端、后端、PostgreSQL、Redis 和 Nginx。

首次启动前，先在项目根目录创建或确认 `/.env`，至少包含：

```env
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=http://localhost:8080,http://<你的局域网 IP>:8080
```

然后再执行：

```bash
docker compose up --build
```

启动后访问：

- 浏览器本机访问：`http://localhost:8080`
- 局域网访问：`http://<你的局域网 IP>:8080`

当前编排默认包含以下服务：

- `frontend`：Next.js，容器内端口 `3000`
- `backend`：NestJS，容器内端口 `3001`
- `postgres`：PostgreSQL 16
- `redis`：Redis 7
- `nginx`：统一入口，宿主机端口 `8080`

## 本地开发

### 1. 安装依赖

```bash
cd frontend
npm install
```

```bash
cd backend
npm install
```

### 2. 启动基础设施

如果你只想本地跑前后端代码，可以单独启动数据库和 Redis：

```bash
docker compose up -d postgres redis
```

### 3. 启动后端

```bash
cd backend
npm run start:dev
```

默认监听：`0.0.0.0:3001`

### 4. 启动前端

```bash
cd frontend
npm run dev
```

默认监听：`0.0.0.0:3000`

本地开发时可直接访问：

- 前端：`http://localhost:3000`
- 后端接口：`http://localhost:3001/api`

如果希望在局域网其他设备访问，前后端当前都已配置为监听 `0.0.0.0`。

## 环境变量

### 前端

前端通过以下环境变量决定接口地址：

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | `/api` | HTTP API 基础路径 |
| `NEXT_PUBLIC_WS_BASE` | `/` | Socket.IO 连接基础地址 |

在 Docker Compose 中通过 Nginx 统一代理，因此默认值即可工作。

本地前后端分开启动时，建议在 `frontend/.env.local` 中配置：

```env
NEXT_PUBLIC_API_BASE=http://localhost:3001/api
NEXT_PUBLIC_WS_BASE=http://localhost:3001
```

### 后端

后端支持以下环境变量：

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 服务监听端口 |
| `JWT_SECRET` | 无默认值，必须设置 | JWT 签名密钥 |
| `DB_HOST` | `postgres` | PostgreSQL 主机 |
| `DB_PORT` | `5432` | PostgreSQL 端口 |
| `DB_USER` | `guezzing` | PostgreSQL 用户名 |
| `DB_PASSWORD` | `guezzing` | PostgreSQL 密码 |
| `DB_NAME` | `guezzing` | PostgreSQL 数据库名 |
| `REDIS_HOST` | `redis` | Redis 主机 |
| `REDIS_PORT` | `6379` | Redis 端口 |

本地开发若直接连接本机 Docker 中的数据库和 Redis，可按如下方式设置：

```env
PORT=3001
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=http://localhost:3000,http://localhost:8080,http://<你的局域网 IP>:8080
DB_HOST=localhost
DB_PORT=5432
DB_USER=guezzing
DB_PASSWORD=guezzing
DB_NAME=guezzing
REDIS_HOST=localhost
REDIS_PORT=6379
```

如果使用项目根目录的 `/.env` 配合 `docker compose` 启动，当前示例可写为：

```env
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=http://localhost:8080,http://<你的局域网 IP>:8080
```

`JWT_SECRET` 必须是高强度随机值，建议至少 32 字节；修改后旧 JWT 会失效，需要重新登录。

`CORS_ORIGIN` 只接受 Origin 列表，多个值使用英文逗号分隔，例如：

- `http://localhost:8080`
- `http://192.168.4.188:8080`

不要写成带路径的地址，例如 `http://localhost:8080/api`。

## 接口与通信说明

### HTTP API

后端统一使用 `/api` 作为全局前缀。

主要接口包括：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/change-password`
- `GET /api/lobby/online-users`
- `GET /api/leaderboard`
- `POST /api/matchmaking/join`
- `POST /api/matchmaking/cancel`

### WebSocket

- 基于 Socket.IO
- 默认路径：`/socket.io`
- 连接时通过 `auth.token` 传入 JWT

主要实时能力包括：

- 大厅快照同步
- 在线状态广播
- 匹配队列与匹配成功通知
- 邀请发起、接受、拒绝、超时
- 游戏状态同步
- 聊天消息同步
- 当前对局恢复

## 安全说明

当前实现包含以下默认安全策略：

- JWT 签名密钥必须通过环境变量提供，未配置时后端拒绝启动
- HTTP 与 WebSocket CORS 都基于 `CORS_ORIGIN` 白名单控制
- 排行榜和大厅快照只返回公开用户字段，不会返回 `passwordHash`
- `register`、`login`、`change-password` 以及部分高频 WebSocket 事件已启用基础限流

部署时仍建议额外补充：

- 在 Nginx 或网关层继续做 IP 限流
- 为生产环境使用独立域名和 HTTPS
- 定期轮换 `JWT_SECRET`

## 数据持久化

项目当前使用 PostgreSQL 持久化以下核心数据：

- 用户信息与积分
- 对局信息
- 对局玩家关系
- 秘密串
- 猜测记录
- 聊天消息

Redis 主要用于在线状态、Socket 映射和实时态辅助存储。

## 游戏规则说明

当前项目支持自定义参数：

- `N`：可用字符池大小，范围 `9 ~ 15`
- `M`：秘密串长度，范围 `3 ~ 15`

游戏中使用不重复字符组成秘密串。玩家提交猜测后，系统会返回：

- 命中字符数
- 命中位置数

双方完成设置后进入正式对局，先猜中对方秘密串的一方获胜。

## 设计文档

如果你想了解项目设计背景，可以直接查看：

- [技术设计文档](./system_design/guezzing_技术设计文档.md)
- [API 设计](./system_design/guezzing_API设计.md)
- [数据库设计](./system_design/guezzing_数据库设计.md)
- [Redis 设计](./system_design/guezzing_Redis设计.md)
- [状态机设计](./system_design/guezzing_状态机设计.md)
- [UI 原型](./system_design/guezzing_UI原型.md)
- [项目目录结构](./system_design/guezzing_项目目录结构.md)

## 说明与限制

- 后端当前启用了 TypeORM `synchronize: true`，适合开发环境，不建议直接用于生产数据库迁移。
- 仓库中包含 `dist/` 和 `node_modules/`，如果作为长期维护项目，建议后续补充 `.gitignore` 和更清晰的构建产物管理策略。
- `docker-compose.yml` 中镜像源使用了国内镜像地址，若你的环境无法拉取，可按需替换为官方镜像。

## License

本项目采用 [MIT License](./LICENSE)。
