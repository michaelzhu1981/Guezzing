# Guezzing 数据库设计

实体：

Users Games GamePlayers Secrets Guesses ChatMessages

关系：

Users \| GamePlayers \| Games \| Guesses

------------------------------------------------------------------------

## users

-   id
-   username
-   password_hash
-   score
-   wins
-   games
-   win_rate
-   streak
-   avg_time

------------------------------------------------------------------------

## games

-   id
-   N
-   M
-   state
-   winner_id
-   start_time
-   end_time

------------------------------------------------------------------------

## game_players

-   game_id
-   player_id
-   join_time

------------------------------------------------------------------------

## secrets

-   game_id
-   player_id
-   secret_string

------------------------------------------------------------------------

## guesses

-   game_id
-   player_id
-   guess_string
-   hit_char_count
-   hit_pos_count

------------------------------------------------------------------------

## chat_messages

-   sender_id
-   receiver_id
-   message
-   created_at
