# Guezzing 游戏状态机

状态：

WAITING_SECRET PLAYING FINISHED INVALID

------------------------------------------------------------------------

状态转换：

WAITING_SECRET → PLAYING 双方提交答案

PLAYING → FINISHED 玩家猜中

PLAYING → FINISHED 玩家投降

PLAYING → INVALID 双方掉线

PLAYING → INVALID 超时

------------------------------------------------------------------------

# 游戏时序

玩家A进入大厅 玩家B进入大厅

匹配成功

创建游戏

提交答案

游戏开始

玩家A猜测

服务器计算结果

返回结果

直到某人获胜
