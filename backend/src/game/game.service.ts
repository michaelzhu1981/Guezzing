import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { evaluateGuess, validateSequence } from '../common/game-utils';
import {
  GameEntity,
  GamePlayerEntity,
  GameState,
  GuessEntity,
  SecretEntity,
} from '../database/entities';
import { LobbyService } from '../lobby/lobby.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { GameSnapshot, LiveGame, LiveGameChatMessage, LiveGuess, PlayerSummary } from './game.types';

const PRESENCE_TIMEOUT_MS = 60_000;
const INACTIVITY_INVALID_MS = 5 * 60_000;

type TimeoutResolution =
  | {
      type: 'forfeit';
      game: LiveGame;
      winnerId: number;
      loserId: number;
      endedAt?: string;
    }
  | {
      type: 'invalid';
      game: LiveGame;
      endedAt?: string;
      reason: 'disconnect' | 'inactivity';
    };

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    @InjectRepository(GameEntity)
    private readonly gamesRepository: Repository<GameEntity>,
    @InjectRepository(GamePlayerEntity)
    private readonly gamePlayersRepository: Repository<GamePlayerEntity>,
    @InjectRepository(SecretEntity)
    private readonly secretsRepository: Repository<SecretEntity>,
    @InjectRepository(GuessEntity)
    private readonly guessesRepository: Repository<GuessEntity>,
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
    private readonly lobbyService: LobbyService,
  ) {}

  async createGame(
    players: PlayerSummary[],
    settings: { N: number; M: number },
  ): Promise<LiveGame> {
    const game = await this.gamesRepository.save(
      this.gamesRepository.create({
        N: settings.N,
        M: settings.M,
        state: GameState.WAITING_SECRET,
      }),
    );

    await this.gamePlayersRepository.save(
      players.map((player) =>
        this.gamePlayersRepository.create({
          gameId: game.id,
          playerId: player.id,
          status: 'ACTIVE',
        }),
      ),
    );

    const liveGame: LiveGame = {
      id: game.id,
      N: settings.N,
      M: settings.M,
      state: GameState.WAITING_SECRET,
      players,
      secrets: {},
      guesses: [],
      chatMessages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.persistLiveGame(liveGame);
    await this.redisService.client.sadd('active_games', String(game.id));
    await Promise.all(
      players.map((player) => this.redisService.client.set(`game_player:${player.id}`, String(game.id))),
    );
    await Promise.all(players.map((player) => this.lobbyService.setUserStatus(player.id, 'PLAYING')));
    return liveGame;
  }

  async getGame(gameId: number): Promise<LiveGame> {
    const raw = await this.redisService.client.get(`game_live:${gameId}`);
    if (!raw) {
      throw new NotFoundException('游戏不存在');
    }
    const game = JSON.parse(raw) as LiveGame;
    game.chatMessages ||= [];
    return game;
  }

  async getCurrentGameSnapshot(userId: number): Promise<GameSnapshot | null> {
    const game = await this.getActiveGameByPlayer(userId);
    if (!game || !this.isGameActive(game)) {
      return null;
    }

    return this.toGameSnapshot(game, userId);
  }

  async recordPlayerPresence(userId: number) {
    await this.redisService.client.set(`presence:${userId}`, String(Date.now()));
  }

  async submitSecret(gameId: number, playerId: number, secret: string): Promise<LiveGame> {
    const game = await this.getGame(gameId);
    this.assertPlayer(game, playerId);

    const normalized = this.validateInput(secret, game.N, game.M);
    game.secrets[playerId] = normalized;
    game.updatedAt = new Date().toISOString();

    await this.secretsRepository.upsert(
      {
        gameId,
        playerId,
        secretString: normalized,
      },
      ['gameId', 'playerId'],
    );

    if (game.players.every((player) => game.secrets[player.id])) {
      const startedAt = new Date().toISOString();
      game.state = GameState.PLAYING;
      game.startedAt = startedAt;
      game.updatedAt = startedAt;
      await this.gamesRepository.update(
        { id: gameId },
        {
          state: GameState.PLAYING,
          startTime: new Date(startedAt),
        },
      );
    }

    await this.persistLiveGame(game);
    return game;
  }

  async submitGuess(gameId: number, playerId: number, guess: string) {
    const game = await this.getGame(gameId);
    this.assertPlayer(game, playerId);

    if (game.state !== GameState.PLAYING) {
      throw new BadRequestException('游戏尚未开始');
    }

    const normalized = this.validateInput(guess, game.N, game.M);
    const opponent = game.players.find((player) => player.id !== playerId);
    if (!opponent) {
      throw new BadRequestException('缺少对手信息');
    }
    const opponentSecret = game.secrets[opponent.id];
    if (!opponentSecret) {
      throw new BadRequestException('对手尚未提交答案');
    }

    const result = evaluateGuess(opponentSecret, normalized);
    const liveGuess: LiveGuess = {
      playerId,
      guessString: normalized,
      ...result,
      createdAt: new Date().toISOString(),
    };
    game.guesses.push(liveGuess);
    game.updatedAt = new Date().toISOString();

    await this.guessesRepository.save(
      this.guessesRepository.create({
        gameId,
        playerId,
        guessString: normalized,
        hitCharCount: result.hitCharCount,
        hitPosCount: result.hitPosCount,
      }),
    );

    let winnerId: number | null = null;
    if (result.hitPosCount === game.M) {
      game.state = GameState.FINISHED;
      winnerId = playerId;
      await this.finishGame(game, winnerId, true);
    } else {
      await this.persistLiveGame(game);
    }

    return {
      game,
      result,
      winnerId,
    };
  }

  async appendChatMessage(gameId: number, sender: PlayerSummary, message: string): Promise<LiveGameChatMessage> {
    const game = await this.getGame(gameId);
    this.assertPlayer(game, sender.id);

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      throw new BadRequestException('消息不能为空');
    }

    const chatMessage: LiveGameChatMessage = {
      id: `${gameId}:${Date.now()}:${sender.id}:${Math.random().toString(36).slice(2, 8)}`,
      senderId: sender.id,
      senderName: sender.username,
      message: trimmedMessage,
      createdAt: new Date().toISOString(),
    };
    game.chatMessages ||= [];
    game.chatMessages.push(chatMessage);
    game.updatedAt = new Date().toISOString();
    await this.persistLiveGame(game);
    return chatMessage;
  }

  async surrender(gameId: number, playerId: number) {
    const game = await this.getGame(gameId);
    this.assertPlayer(game, playerId);
    const opponent = game.players.find((player) => player.id !== playerId);
    if (!opponent) {
      throw new BadRequestException('缺少对手信息');
    }
    game.state = GameState.FINISHED;
    await this.finishGame(game, opponent.id, true);
    return {
      game,
      winnerId: opponent.id,
    };
  }

  async handlePlayerDisconnect(userId: number) {
    const game = await this.getActiveGameByPlayer(userId);
    if (!game || !this.isGameActive(game)) {
      return null;
    }

    const disconnectedAt = Date.now();
    await this.redisService.client.set(`disconnect:${userId}`, String(disconnectedAt));

    return {
      game,
      disconnectedPlayerId: userId,
    };
  }

  async handlePlayerReconnect(userId: number) {
    const game = await this.getActiveGameByPlayer(userId);
    if (!game || !this.isGameActive(game)) {
      await this.redisService.client.del(`disconnect:${userId}`);
      return null;
    }

    await this.redisService.client.del(`disconnect:${userId}`);
    await this.redisService.client.del(`disconnect_both_since:${game.id}`);
    await this.lobbyService.setUserStatus(userId, 'PLAYING');

    return {
      game,
      reconnectedPlayerId: userId,
    };
  }

  async sweepTimeouts(): Promise<TimeoutResolution[]> {
    const gameIds = await this.redisService.client.smembers('active_games');
    const resolutions: TimeoutResolution[] = [];

    for (const rawGameId of gameIds) {
      const gameId = Number(rawGameId);
      if (!Number.isInteger(gameId)) {
        continue;
      }

      const resolution = await this.resolveTimeoutForGame(gameId);
      if (resolution) {
        resolutions.push(resolution);
      }
    }

    return resolutions;
  }

  async invalidateGame(gameId: number) {
    const game = await this.getGame(gameId);
    const endedAt = new Date().toISOString();
    game.state = GameState.INVALID;
    game.endedAt = endedAt;
    game.updatedAt = endedAt;
    await this.gamesRepository.update(
      { id: gameId },
      {
        state: GameState.INVALID,
        isValid: false,
        endTime: new Date(endedAt),
      },
    );
    await this.persistLiveGame(game);
    await this.cleanupActiveGameState(game);
    await Promise.all(game.players.map((player) => this.lobbyService.setUserStatus(player.id, 'ONLINE')));
    return game;
  }

  private async finishGame(game: LiveGame, winnerId: number, isValid: boolean) {
    const endedAt = new Date().toISOString();
    game.endedAt = endedAt;
    game.updatedAt = endedAt;
    await this.gamesRepository.update(
      { id: game.id },
      {
        state: game.state,
        winnerId,
        isValid,
        endTime: new Date(endedAt),
      },
    );

    const playerEntities = await Promise.all(game.players.map((player) => this.usersService.findById(player.id)));
    const winner = playerEntities.find((player) => player?.id === winnerId);
    const losers = playerEntities.filter((player) => player && player.id !== winnerId);

    if (winner) {
      await this.usersService.updateStats(winner.id, {
        score: winner.score + game.M,
        wins: winner.wins + 1,
        games: winner.games + 1,
        streak: winner.streak + 1,
        winRate: (winner.wins + 1) / Math.max(winner.games + 1, 1),
      });
    }

    for (const loser of losers) {
      if (!loser) {
        continue;
      }
      await this.usersService.updateStats(loser.id, {
        games: loser.games + 1,
        streak: 0,
        winRate: loser.wins / Math.max(loser.games + 1, 1),
      });
    }

    await this.persistLiveGame(game);
    await this.cleanupActiveGameState(game);
    await Promise.all(game.players.map((player) => this.lobbyService.setUserStatus(player.id, 'ONLINE')));
  }

  private async resolveTimeoutForGame(gameId: number): Promise<TimeoutResolution | null> {
    let game: LiveGame;
    try {
      game = await this.getGame(gameId);
    } catch {
      await this.redisService.client.srem('active_games', String(gameId));
      return null;
    }

    if (!this.isGameActive(game)) {
      await this.cleanupActiveGameState(game);
      return null;
    }

    const stalePlayers = await this.getStalePresencePlayers(game);
    if (stalePlayers.length === game.players.length) {
      if (stalePlayers.every((entry) => entry.staleForMs >= PRESENCE_TIMEOUT_MS)) {
        const invalidGame = await this.invalidateGame(game.id);
        this.logger.warn(`invalidate game by dual presence timeout gameId=${game.id}`);
        return {
          type: 'invalid',
          game: invalidGame,
          endedAt: invalidGame.endedAt,
          reason: 'disconnect',
        };
      }

      return null;
    }

    if (stalePlayers.length === 1) {
      const [stalePlayer] = stalePlayers;
      if (stalePlayer.staleForMs >= PRESENCE_TIMEOUT_MS) {
        const winner = game.players.find((player) => player.id !== stalePlayer.playerId);
        if (!winner) {
          return null;
        }

        game.state = GameState.FINISHED;
        await this.finishGame(game, winner.id, true);
        this.logger.warn(
          `forfeit by presence timeout gameId=${game.id} loserId=${stalePlayer.playerId} winnerId=${winner.id}`,
        );
        return {
          type: 'forfeit',
          game,
          winnerId: winner.id,
          loserId: stalePlayer.playerId,
          endedAt: game.endedAt,
        };
      }
    }

    const lastAction = Date.parse(game.updatedAt);
    if (!Number.isNaN(lastAction) && Date.now() - lastAction >= INACTIVITY_INVALID_MS) {
      const invalidGame = await this.invalidateGame(game.id);
      this.logger.warn(`invalidate game by inactivity gameId=${game.id}`);
      return {
        type: 'invalid',
        game: invalidGame,
        endedAt: invalidGame.endedAt,
        reason: 'inactivity',
      };
    }

    return null;
  }

  private validateInput(value: string, n: number, m: number) {
    try {
      return validateSequence(value, n, m);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '输入不合法',
      );
    }
  }

  private assertPlayer(game: LiveGame, playerId: number) {
    if (!game.players.some((player) => player.id === playerId)) {
      throw new BadRequestException('你不在该对局中');
    }
  }

  private async persistLiveGame(game: LiveGame) {
    await this.redisService.client.set(`game_live:${game.id}`, JSON.stringify(game));
    await this.redisService.client.hset(`game_state:${game.id}`, {
      state: game.state,
      playerA: String(game.players[0]?.id ?? ''),
      playerB: String(game.players[1]?.id ?? ''),
      start_time: game.createdAt,
      last_action: game.updatedAt,
    });
    await this.redisService.client.set(`game_timer:${game.id}`, game.updatedAt);
  }

  private isGameActive(game: LiveGame) {
    return game.state === GameState.WAITING_SECRET || game.state === GameState.PLAYING;
  }

  private async getActiveGameByPlayer(userId: number) {
    const gameIdValue = await this.redisService.client.get(`game_player:${userId}`);
    const gameId = Number(gameIdValue);
    if (!Number.isInteger(gameId)) {
      return null;
    }

    try {
      return await this.getGame(gameId);
    } catch {
      await this.redisService.client.del(`game_player:${userId}`);
      return null;
    }
  }

  private async getStalePresencePlayers(game: LiveGame) {
    const playerIds = game.players.map((player) => player.id);
    const presenceList = await Promise.all(
      playerIds.map((playerId) => this.redisService.client.get(`presence:${playerId}`)),
    );
    const now = Date.now();

    return playerIds
      .map((playerId, index) => ({
        playerId,
        lastSeenAt: Number(presenceList[index]),
        staleForMs: now - Number(presenceList[index]),
      }))
      .filter((entry) => Number.isFinite(entry.lastSeenAt) && entry.staleForMs >= PRESENCE_TIMEOUT_MS);
  }

  private async cleanupActiveGameState(game: LiveGame) {
    const keys = [
      `game_timer:${game.id}`,
      `disconnect_both_since:${game.id}`,
      ...game.players.flatMap((player) => [`game_player:${player.id}`, `disconnect:${player.id}`]),
    ];

    await this.redisService.client.srem('active_games', String(game.id));
    if (keys.length > 0) {
      await this.redisService.client.del(...keys);
    }
  }

  private toGameSnapshot(game: LiveGame, userId: number): GameSnapshot {
    return {
      gameId: game.id,
      N: game.N,
      M: game.M,
      players: game.players,
      secretSubmitted: !!game.secrets[userId],
      started: game.state === GameState.PLAYING || game.state === GameState.FINISHED || game.state === GameState.INVALID,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      myGuesses: game.guesses
        .filter((guess) => guess.playerId === userId)
        .map((guess) => ({
          guess: guess.guessString,
          hitCharCount: guess.hitCharCount,
          hitPosCount: guess.hitPosCount,
        })),
      opponentGuesses: game.guesses
        .filter((guess) => guess.playerId !== userId)
        .map((guess) => ({
          guess: guess.guessString,
          hitCharCount: guess.hitCharCount,
          hitPosCount: guess.hitPosCount,
        })),
      chatMessages: game.chatMessages || [],
    };
  }
}
