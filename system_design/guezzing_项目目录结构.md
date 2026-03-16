# Guezzing 项目目录结构设计

本文档定义 Guezzing 项目的推荐工程目录结构，适用于：

-   前端：Next.js + React
-   后端：NestJS
-   Docker 部署

------------------------------------------------------------------------

# 一、整体目录结构

    guezzing/
    │
    ├── frontend/
    ├── backend/
    ├── docker/
    ├── docs/
    ├── scripts/
    │
    └── docker-compose.yml

说明：

  目录       说明
  ---------- ----------------
  frontend   前端代码
  backend    后端服务
  docker     Docker相关配置
  docs       技术文档
  scripts    运维脚本

------------------------------------------------------------------------

# 二、Frontend 结构

    frontend/
    │
    ├── src/
    │   ├── app/
    │   ├── components/
    │   ├── pages/
    │   ├── services/
    │   ├── store/
    │   ├── hooks/
    │   └── utils/
    │
    ├── public/
    ├── styles/
    └── package.json

说明：

  目录         作用
  ------------ -------------
  pages        页面组件
  components   可复用组件
  services     API 请求
  store        状态管理
  hooks        React hooks
  utils        工具函数

------------------------------------------------------------------------

# 三、Backend 结构

    backend/
    │
    ├── src/
    │   ├── auth/
    │   ├── users/
    │   ├── lobby/
    │   ├── matchmaking/
    │   ├── game/
    │   ├── chat/
    │   ├── leaderboard/
    │   ├── redis/
    │   ├── database/
    │   └── common/
    │
    ├── test/
    └── package.json

模块说明：

  模块          功能
  ------------- ------------
  auth          登录注册
  users         用户管理
  lobby         游戏大厅
  matchmaking   匹配系统
  game          游戏逻辑
  chat          聊天
  leaderboard   排行榜
  redis         Redis服务
  database      数据库访问

------------------------------------------------------------------------

# 四、Docker 结构

    docker/
    │
    ├── nginx/
    │   └── nginx.conf
    │
    ├── postgres/
    │   └── init.sql
    │
    └── redis/
        └── redis.conf

------------------------------------------------------------------------

# 五、Docker Compose

系统服务：

    frontend
    backend
    postgres
    redis
    nginx

启动：

    docker-compose up -d
