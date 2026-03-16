import { Injectable } from '@nestjs/common';
import { LobbyService } from '../lobby/lobby.service';
import { RedisService } from '../redis/redis.service';
import { PlayerSummary } from '../game/game.types';

@Injectable()
export class MatchmakingService {
  constructor(
    private readonly redisService: RedisService,
    private readonly lobbyService: LobbyService,
  ) {}

  async joinQueue(player: PlayerSummary, settings: { N: number; M: number }) {
    const queueKey = `match_queue:${settings.N}_${settings.M}`;
    await this.cancel(player.id);
    const queuedPlayers = await this.redisService.client.lrange(queueKey, 0, -1);
    const opponentId = queuedPlayers.find((entry) => {
      const parsed = JSON.parse(entry) as PlayerSummary;
      return parsed.id !== player.id;
    });

    if (!opponentId) {
      await this.redisService.client.rpush(queueKey, JSON.stringify(player));
      await this.lobbyService.setUserStatus(player.id, 'MATCHING');
      return null;
    }

    await this.redisService.client.lrem(queueKey, 1, opponentId);
    await this.lobbyService.setUserStatus(player.id, 'PLAYING');
    const opponent = JSON.parse(opponentId) as PlayerSummary;
    await this.lobbyService.setUserStatus(opponent.id, 'PLAYING');

    return {
      players: [opponent, player],
    };
  }

  async cancel(userId: number) {
    const keys = await this.redisService.client.keys('match_queue:*');
    for (const key of keys) {
      const entries = await this.redisService.client.lrange(key, 0, -1);
      for (const entry of entries) {
        const player = JSON.parse(entry) as PlayerSummary;
        if (player.id === userId) {
          await this.redisService.client.lrem(key, 1, entry);
        }
      }
    }
  }
}
