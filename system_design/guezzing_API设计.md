# Guezzing API 设计文档

## 认证 API

### 注册

POST `/auth/register`

请求

{ "username":"player1", "password":"password" }

响应

{ "userId":12, "username":"player1" }

------------------------------------------------------------------------

### 登录

POST `/auth/login`

{ "username":"player1", "password":"password" }

响应

{ "token":"JWT_TOKEN" }

------------------------------------------------------------------------

# 用户 API

GET `/users/me`

返回

{ "username":"player1", "score":120, "wins":40, "games":60,
"win_rate":0.66 }

------------------------------------------------------------------------

# 大厅 API

GET `/lobby/online-users`

返回在线玩家列表

------------------------------------------------------------------------

# 匹配 API

POST `/matchmaking/join`

{ "N":12, "M":4 }

------------------------------------------------------------------------

POST `/matchmaking/cancel`

取消匹配

------------------------------------------------------------------------

# 排行榜

GET `/leaderboard`

返回排行榜数据

------------------------------------------------------------------------

# WebSocket

连接

ws://server/ws

认证

JWT Token

------------------------------------------------------------------------

## 大厅事件

客户端

invite_player join_matchmaking cancel_matchmaking send_chat

服务器

user_online user_offline invite_received match_found chat_message

------------------------------------------------------------------------

## 游戏事件

客户端

submit_secret submit_guess surrender

服务器

game_start guess_result opponent_guess game_win game_invalid
player_disconnect player_reconnect
