# Guezzing Redis 数据结构设计

Redis 主要用于：

-   在线用户状态
-   匹配队列
-   WebSocket session
-   游戏临时状态
-   掉线记录

------------------------------------------------------------------------

# 一、在线用户

Key:

    online_users

类型：

    SET

存储：

    user_id

示例：

    online_users = {1,2,3,4}

------------------------------------------------------------------------

# 二、用户状态

Key:

    user_status:{userId}

类型：

    STRING

值：

    ONLINE
    MATCHING
    PLAYING
    OFFLINE

------------------------------------------------------------------------

# 三、匹配队列

Key:

    match_queue:{N}_{M}

类型：

    LIST

示例：

    match_queue:12_4

值：

    user_id

------------------------------------------------------------------------

# 四、WebSocket Session

Key:

    user_socket:{userId}

类型：

    STRING

值：

    socketId

------------------------------------------------------------------------

# 五、游戏状态缓存

Key:

    game_state:{gameId}

类型：

    HASH

字段示例：

    state
    playerA
    playerB
    start_time
    last_action

------------------------------------------------------------------------

# 六、掉线记录

Key:

    disconnect:{playerId}

类型：

    STRING

值：

    timestamp

------------------------------------------------------------------------

# 七、游戏计时

Key:

    game_timer:{gameId}

类型：

    STRING

用途：

记录最近操作时间，用于检测

    5分钟超时
