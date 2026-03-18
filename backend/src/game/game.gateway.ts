import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ChatService } from '../chat/chat.service';
import { RateLimitService } from '../common/rate-limit.service';
import { GameState } from '../database/entities';
import { LeaderboardChangeEvent, LeaderboardService } from '../leaderboard/leaderboard.service';
import { LobbyService, UserStatus } from '../lobby/lobby.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { GameService } from './game.service';

class MatchmakingDto {
  @IsInt()
  @Min(9)
  @Max(15)
  N!: number;

  @IsInt()
  @Min(3)
  @Max(15)
  M!: number;
}

class GameActionDto {
  @IsInt()
  gameId!: number;
}

class SecretDto extends GameActionDto {
  @IsString()
  @Length(3, 15)
  secret!: string;
}

class GuessDto extends GameActionDto {
  @IsString()
  @Length(3, 15)
  guess!: string;
}

class ChatDto {
  @IsString()
  @Length(1, 200)
  message!: string;

  @IsOptional()
  @IsInt()
  receiverId?: number;
}

class GameChatDto extends GameActionDto {
  @IsString()
  @Length(1, 200)
  message!: string;
}

class InvitePlayerDto extends MatchmakingDto {
  @IsInt()
  targetUserId!: number;
}

class InviteResponseDto {
  @IsString()
  inviteId!: string;

  @IsString()
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';
}

class InviteActionDto {
  @IsString()
  inviteId!: string;
}

type PendingInvite = {
  inviteId: string;
  fromUserId: number;
  fromUsername: string;
  toUserId: number;
  settings: MatchmakingDto;
  timeout: NodeJS.Timeout;
};

const websocketOrigins =
  process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) || false;

@WebSocketGateway({
  cors: {
    origin: websocketOrigins,
    credentials: true,
  },
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@UseFilters()
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  private static readonly DISCONNECT_CONFIRM_DELAY_MS = 2_000;
  private static readonly INVITE_TIMEOUT_MS = 30_000;
  private readonly logger = new Logger(GameGateway.name);
  private timeoutSweepTimer: NodeJS.Timeout | null = null;
  private isSweepingTimeouts = false;
  private readonly pendingDisconnects = new Map<number, NodeJS.Timeout>();
  private readonly pendingInvites = new Map<string, PendingInvite>();
  private leaderboardChangesSubscription: Subscription | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly lobbyService: LobbyService,
    private readonly matchmakingService: MatchmakingService,
    private readonly gameService: GameService,
    private readonly leaderboardService: LeaderboardService,
    private readonly chatService: ChatService,
    private readonly redisService: RedisService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  afterInit() {
    this.timeoutSweepTimer = setInterval(() => {
      void this.broadcastTimeoutResolutions();
    }, 5_000);
  }

  onModuleInit() {
    this.leaderboardChangesSubscription = this.leaderboardService.observeChanges().subscribe({
      next: (event) => {
        void this.broadcastLeaderboardUpdate(event);
      },
    });
  }

  onModuleDestroy() {
    if (this.timeoutSweepTimer) {
      clearInterval(this.timeoutSweepTimer);
      this.timeoutSweepTimer = null;
    }

    this.leaderboardChangesSubscription?.unsubscribe();
    this.leaderboardChangesSubscription = null;

    for (const timer of this.pendingDisconnects.values()) {
      clearTimeout(timer);
    }
    this.pendingDisconnects.clear();

    for (const invite of this.pendingInvites.values()) {
      clearTimeout(invite.timeout);
    }
    this.pendingInvites.clear();
  }

  async handleConnection(client: Socket) {
    try {
      const token = String(client.handshake.auth?.token || client.handshake.headers.authorization || '')
        .replace(/^Bearer\s+/i, '')
        .trim();
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = await this.jwtService.verifyAsync<{ sub: number; username: string }>(
        token,
        { secret: process.env.JWT_SECRET?.trim() },
      );
      client.data.user = {
        userId: payload.sub,
        username: payload.username,
      };

      this.logger.log(
        `socket connected userId=${payload.sub} socketId=${client.id} addr=${client.handshake.address || 'unknown'}`,
      );
      this.clearPendingDisconnect(payload.sub);
      await this.gameService.recordPlayerPresence(payload.sub);

      await this.redisService.client.set(`user_socket:${payload.sub}`, client.id);
      await this.lobbyService.setUserOnline(payload.sub);
      client.join(`user:${payload.sub}`);
      this.server.emit('user_online', {
        username: payload.username,
        userId: payload.sub,
        status: 'ONLINE',
      });
      const leaderboardPayload = await this.leaderboardService.getLeaderboardPayload();
      client.emit('lobby_snapshot', {
        onlineUsers: await this.lobbyService.getOnlineUserProfiles(),
        leaderboard: leaderboardPayload.leaderboard,
        leaderboardUpdatedAt: leaderboardPayload.updatedAt,
        messages: await this.chatService.recentLobbyMessages(),
      });
      const currentGame = await this.gameService.getCurrentGameSnapshot(payload.sub);
      if (currentGame) {
        client.emit('current_game', currentGame);
      }

      await this.gameService.handlePlayerReconnect(payload.sub);
      await this.emitUserPresence(payload.sub);
    } catch {
      client.disconnect();
    }
  }

  private async broadcastLeaderboardUpdate(event: LeaderboardChangeEvent) {
    const leaderboardPayload = await this.leaderboardService.getLeaderboardPayload();
    this.server.emit('leaderboard_updated', {
      ...leaderboardPayload,
      reason: event.reason,
    });

    const profilePayloads = await Promise.all(
      event.affectedUserIds.map(async (userId) => ({
        userId,
        payload: await this.leaderboardService.getProfileUpdatedPayload(userId),
      })),
    );

    profilePayloads.forEach(({ userId, payload }) => {
      if (!payload) {
        return;
      }
      this.server.to(`user:${userId}`).emit('profile_updated', payload);
    });
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as { userId: number; username: string } | undefined;
    if (!user) {
      return;
    }
    this.logger.log(`socket disconnected userId=${user.userId} socketId=${client.id} schedule_confirm=true`);
    this.clearPendingDisconnect(user.userId);
    const timer = setTimeout(() => {
      void this.confirmDisconnect(user.userId, client.id);
    }, GameGateway.DISCONNECT_CONFIRM_DELAY_MS);
    this.pendingDisconnects.set(user.userId, timer);
  }

  @SubscribeMessage('join_matchmaking')
  async joinMatchmaking(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: MatchmakingDto,
  ) {
    const user = client.data.user as { userId: number; username: string };
    this.consumeSocketRateLimit(user.userId, 'join_matchmaking', 6, 60_000);
    await this.cancelInvitesForUser(user.userId, 'cancelled');
    const match = await this.matchmakingService.joinQueue(
      {
        id: user.userId,
        username: user.username,
      },
      body,
    );

    if (!match) {
      await this.emitUserPresence(user.userId);
      client.emit('matchmaking_waiting', body);
      return;
    }

    const game = await this.gameService.createGame(match.players, body);
    await this.emitUserPresence(match.players.map((player) => player.id));
    for (const player of match.players) {
      this.server.to(`user:${player.id}`).emit('match_found', {
        gameId: game.id,
        state: GameState.WAITING_SECRET,
        players: game.players,
        N: game.N,
        M: game.M,
      });
    }
  }

  @SubscribeMessage('cancel_matchmaking')
  async cancelMatchmaking(@ConnectedSocket() client: Socket) {
    const user = client.data.user as { userId: number };
    await this.matchmakingService.cancel(user.userId);
    await this.lobbyService.setUserStatus(user.userId, 'ONLINE');
    await this.emitUserPresence(user.userId);
    client.emit('matchmaking_cancelled');
  }

  @SubscribeMessage('invite_player')
  async invitePlayer(@ConnectedSocket() client: Socket, @MessageBody() body: InvitePlayerDto) {
    const user = client.data.user as { userId: number; username: string };
    this.consumeSocketRateLimit(user.userId, 'invite_player', 10, 60_000);
    await this.gameService.recordPlayerPresence(user.userId);

    if (body.targetUserId === user.userId) {
      throw new BadRequestException('不能邀请自己');
    }

    if (this.findInviteByUser(user.userId) || this.findInviteByUser(body.targetUserId)) {
      throw new BadRequestException('邀请中的玩家暂时不可再次发起或接收邀请');
    }

    await this.assertUsersInviteable(user.userId, body.targetUserId);
    await this.matchmakingService.cancel(user.userId);
    await this.lobbyService.setUserStatus(user.userId, 'ONLINE');
    await this.emitUserPresence(user.userId);

    const inviteId = randomUUID();
    const invite: PendingInvite = {
      inviteId,
      fromUserId: user.userId,
      fromUsername: user.username,
      toUserId: body.targetUserId,
      settings: {
        N: body.N,
        M: body.M,
      },
      timeout: setTimeout(() => {
        void this.expireInvite(inviteId);
      }, GameGateway.INVITE_TIMEOUT_MS),
    };
    this.pendingInvites.set(inviteId, invite);

    this.server.to(`user:${body.targetUserId}`).emit('invite_received', {
      inviteId,
      fromUserId: user.userId,
      fromUsername: user.username,
      N: body.N,
      M: body.M,
    });
    client.emit('invite_sent', {
      inviteId,
      targetUserId: body.targetUserId,
      N: body.N,
      M: body.M,
    });
  }

  @SubscribeMessage('respond_invite')
  async respondInvite(@ConnectedSocket() client: Socket, @MessageBody() body: InviteResponseDto) {
    const user = client.data.user as { userId: number };
    this.consumeSocketRateLimit(user.userId, 'respond_invite', 20, 60_000);
    await this.gameService.recordPlayerPresence(user.userId);

    const invite = this.pendingInvites.get(body.inviteId);
    if (!invite) {
      throw new BadRequestException('邀请已失效');
    }
    if (invite.toUserId !== user.userId) {
      throw new BadRequestException('你无权处理该邀请');
    }

    if (body.action === 'reject') {
      this.removeInvite(invite.inviteId);
      client.emit('invite_rejected', { inviteId: invite.inviteId });
      this.server.to(`user:${invite.fromUserId}`).emit('invite_declined', {
        inviteId: invite.inviteId,
        targetUserId: invite.toUserId,
      });
      return;
    }

    await this.assertUsersInviteable(invite.fromUserId, invite.toUserId);
    this.removeInvite(invite.inviteId);

    const match = {
      players: [
        {
          id: invite.fromUserId,
          username: invite.fromUsername,
        },
        {
          id: invite.toUserId,
          username: (client.data.user as { username: string }).username,
        },
      ],
    };
    const game = await this.gameService.createGame(match.players, invite.settings);
    await this.emitUserPresence(match.players.map((player) => player.id));
    for (const player of match.players) {
      this.server.to(`user:${player.id}`).emit('match_found', {
        gameId: game.id,
        state: GameState.WAITING_SECRET,
        players: game.players,
        N: game.N,
        M: game.M,
        source: 'invite',
      });
    }
  }

  @SubscribeMessage('cancel_invite')
  async cancelInvite(@ConnectedSocket() client: Socket, @MessageBody() body: InviteActionDto) {
    const user = client.data.user as { userId: number };
    await this.gameService.recordPlayerPresence(user.userId);

    const invite = this.pendingInvites.get(body.inviteId);
    if (!invite) {
      throw new BadRequestException('邀请已失效');
    }
    if (invite.fromUserId !== user.userId) {
      throw new BadRequestException('你无权取消该邀请');
    }

    this.emitInviteCancelled(invite, user.userId, 'cancelled');
  }

  @SubscribeMessage('submit_secret')
  async submitSecret(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SecretDto,
  ) {
    const user = client.data.user as { userId: number };
    this.consumeSocketRateLimit(user.userId, 'submit_secret', 20, 60_000);
    await this.gameService.recordPlayerPresence(user.userId);
    const game = await this.gameService.submitSecret(body.gameId, user.userId, body.secret);
    this.server.to(`user:${user.userId}`).emit('secret_saved', { gameId: body.gameId });

    if (game.state === GameState.PLAYING) {
      game.players.forEach((player) => {
        this.server.to(`user:${player.id}`).emit('game_start', {
          gameId: game.id,
          N: game.N,
          M: game.M,
          players: game.players,
          startedAt: game.startedAt,
        });
      });
    }
  }

  @SubscribeMessage('submit_guess')
  async submitGuess(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: GuessDto,
  ) {
    const user = client.data.user as { userId: number };
    this.consumeSocketRateLimit(user.userId, 'submit_guess', 40, 60_000);
    await this.gameService.recordPlayerPresence(user.userId);
    const response = await this.gameService.submitGuess(body.gameId, user.userId, body.guess);
    const actor = response.game.players.find((player) => player.id === user.userId);
    const opponent = response.game.players.find((player) => player.id !== user.userId);

    client.emit('guess_result', {
      gameId: body.gameId,
      guess: body.guess.toUpperCase(),
      ...response.result,
    });

    if (opponent) {
      this.server.to(`user:${opponent.id}`).emit('opponent_guess', {
        gameId: body.gameId,
        player: actor,
        guess: body.guess.toUpperCase(),
        ...response.result,
      });
    }

    if (response.winnerId) {
      await this.emitUserPresence(response.game.players.map((player) => player.id));
      response.game.players.forEach((player) => {
        const opponent = response.game.players.find((candidate) => candidate.id !== player.id);
        this.server.to(`user:${player.id}`).emit('game_win', {
          gameId: body.gameId,
          winnerId: response.winnerId,
          endedAt: response.game.endedAt,
          opponentAnswer: opponent ? response.game.secrets[opponent.id] : undefined,
        });
      });
    }
  }

  @SubscribeMessage('surrender')
  async surrender(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: GameActionDto,
  ) {
    const user = client.data.user as { userId: number };
    await this.gameService.recordPlayerPresence(user.userId);
    const result = await this.gameService.surrender(body.gameId, user.userId);
    await this.emitUserPresence(result.game.players.map((player) => player.id));
    result.game.players.forEach((player) => {
      const opponent = result.game.players.find((candidate) => candidate.id !== player.id);
      this.server.to(`user:${player.id}`).emit('game_win', {
        gameId: body.gameId,
        winnerId: result.winnerId,
        endedAt: result.game.endedAt,
        surrenderedBy: user.userId,
        opponentAnswer: opponent ? result.game.secrets[opponent.id] : undefined,
      });
    });
  }

  @SubscribeMessage('send_chat')
  async sendChat(@ConnectedSocket() client: Socket, @MessageBody() body: ChatDto) {
    const user = client.data.user as { userId: number; username: string };
    this.consumeSocketRateLimit(user.userId, 'send_chat', 30, 60_000);
    await this.gameService.recordPlayerPresence(user.userId);
    const record = await this.chatService.create(user.userId, body.receiverId ?? null, body.message);
    const payload = {
      id: record.id,
      senderId: user.userId,
      senderName: user.username,
      receiverId: body.receiverId ?? null,
      message: body.message,
      createdAt: record.createdAt,
    };

    if (body.receiverId) {
      this.server.to(`user:${body.receiverId}`).emit('chat_message', payload);
      client.emit('chat_message', payload);
      return;
    }

    this.server.emit('chat_message', payload);
  }

  @SubscribeMessage('send_game_chat')
  async sendGameChat(@ConnectedSocket() client: Socket, @MessageBody() body: GameChatDto) {
    const user = client.data.user as { userId: number; username: string };
    this.consumeSocketRateLimit(user.userId, 'send_game_chat', 30, 60_000);
    await this.gameService.recordPlayerPresence(user.userId);
    const payload = await this.gameService.appendChatMessage(
      body.gameId,
      {
        id: user.userId,
        username: user.username,
      },
      body.message,
    );

    this.server.to(`user:${user.userId}`).emit('game_chat_message', {
      gameId: body.gameId,
      ...payload,
    });

    const game = await this.gameService.getGame(body.gameId);
    const opponent = game.players.find((player) => player.id !== user.userId);
    if (opponent) {
      this.server.to(`user:${opponent.id}`).emit('game_chat_message', {
        gameId: body.gameId,
        ...payload,
      });
    }
  }

  @SubscribeMessage('heartbeat')
  async heartbeat(@ConnectedSocket() client: Socket) {
    const user = client.data.user as { userId: number } | undefined;
    if (!user) {
      return;
    }

    await this.gameService.recordPlayerPresence(user.userId);
  }

  private async broadcastTimeoutResolutions() {
    if (this.isSweepingTimeouts) {
      return;
    }

    this.isSweepingTimeouts = true;
    try {
      const resolutions = await this.gameService.sweepTimeouts();
      for (const resolution of resolutions) {
        if (resolution.type === 'forfeit') {
          await this.emitUserPresence(resolution.game.players.map((player) => player.id));
          resolution.game.players.forEach((player) => {
            const opponent = resolution.game.players.find((candidate) => candidate.id !== player.id);
            this.server.to(`user:${player.id}`).emit('game_win', {
              gameId: resolution.game.id,
              winnerId: resolution.winnerId,
              endedAt: resolution.endedAt,
              forfeitedBy: resolution.loserId,
              opponentAnswer: opponent ? resolution.game.secrets[opponent.id] : undefined,
            });
          });
          continue;
        }

        await this.emitUserPresence(resolution.game.players.map((player) => player.id));
        resolution.game.players.forEach((player) => {
          const opponent = resolution.game.players.find((candidate) => candidate.id !== player.id);
          this.server.to(`user:${player.id}`).emit('game_invalid', {
            gameId: resolution.game.id,
            endedAt: resolution.endedAt,
            reason: resolution.reason,
            opponentAnswer: opponent ? resolution.game.secrets[opponent.id] : undefined,
          });
        });
      }
    } finally {
      this.isSweepingTimeouts = false;
    }
  }

  private clearPendingDisconnect(userId: number) {
    const pending = this.pendingDisconnects.get(userId);
    if (pending) {
      clearTimeout(pending);
      this.pendingDisconnects.delete(userId);
      this.logger.log(`pending disconnect cleared userId=${userId}`);
    }
  }

  private async confirmDisconnect(userId: number, socketId: string) {
    this.pendingDisconnects.delete(userId);

    const activeSocketId = await this.redisService.client.get(`user_socket:${userId}`);
    this.logger.log(
      `confirm disconnect userId=${userId} socketId=${socketId} activeSocketId=${activeSocketId ?? 'null'}`,
    );
    if (activeSocketId && activeSocketId !== socketId) {
      this.logger.log(`ignore stale disconnect userId=${userId} socketId=${socketId}`);
      return;
    }

    await this.redisService.client.del(`user_socket:${userId}`);
    await this.lobbyService.setUserOffline(userId);
    await this.cancelInvitesForUser(userId, 'offline');
    this.server.emit('user_offline', { userId });
    this.logger.warn(`player marked offline userId=${userId} socketId=${socketId}`);

    const disconnectResult = await this.gameService.handlePlayerDisconnect(userId);
    if (disconnectResult) {
      this.logger.warn(`player disconnect recorded userId=${userId} gameId=${disconnectResult.game.id}`);
      return;
    }

    this.logger.log(`no active game disconnect action userId=${userId}`);
  }

  private removeInvite(inviteId: string) {
    const invite = this.pendingInvites.get(inviteId);
    if (!invite) {
      return;
    }
    clearTimeout(invite.timeout);
    this.pendingInvites.delete(inviteId);
  }

  private findInviteByUser(userId: number) {
    for (const invite of this.pendingInvites.values()) {
      if (invite.fromUserId === userId || invite.toUserId === userId) {
        return invite;
      }
    }
    return null;
  }

  private async expireInvite(inviteId: string) {
    const invite = this.pendingInvites.get(inviteId);
    if (!invite) {
      return;
    }
    this.removeInvite(inviteId);
    this.server.to(`user:${invite.fromUserId}`).emit('invite_expired', {
      inviteId,
      targetUserId: invite.toUserId,
    });
    this.server.to(`user:${invite.toUserId}`).emit('invite_expired', {
      inviteId,
      fromUserId: invite.fromUserId,
    });
  }

  private async cancelInvitesForUser(userId: number, reason: 'cancelled' | 'offline') {
    const relatedInvites = [...this.pendingInvites.values()].filter(
      (invite) => invite.fromUserId === userId || invite.toUserId === userId,
    );

    for (const invite of relatedInvites) {
      this.emitInviteCancelled(invite, userId, reason);
    }
  }

  private emitInviteCancelled(invite: PendingInvite, userId: number, reason: 'cancelled' | 'offline') {
    this.removeInvite(invite.inviteId);
    const peerUserId = invite.fromUserId === userId ? invite.toUserId : invite.fromUserId;
    this.server.to(`user:${peerUserId}`).emit('invite_cancelled', {
      inviteId: invite.inviteId,
      userId,
      reason,
    });
    this.server.to(`user:${userId}`).emit('invite_cancelled', {
      inviteId: invite.inviteId,
      userId,
      reason,
    });
  }

  private async assertUsersInviteable(senderUserId: number, targetUserId: number) {
    const [senderStatus, targetStatus, targetSocketId] = await Promise.all([
      this.lobbyService.getUserStatus(senderUserId),
      this.lobbyService.getUserStatus(targetUserId),
      this.redisService.client.get(`user_socket:${targetUserId}`),
    ]);

    if (senderStatus !== 'ONLINE') {
      throw new BadRequestException('你当前不可发起邀请');
    }
    if (targetStatus !== 'ONLINE' || !targetSocketId) {
      throw new BadRequestException('目标玩家当前不可被邀请');
    }
  }

  private async emitUserPresence(userIds: number | number[]) {
    const normalizedUserIds = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
    for (const userId of normalizedUserIds) {
      const profile = await this.lobbyService.getOnlineUserProfile(userId);
      const status = (await this.lobbyService.getUserStatus(userId)) || 'OFFLINE';
      if (profile) {
        this.server.emit('user_status_changed', profile);
        continue;
      }

      this.server.emit('user_status_changed', {
        userId,
        username: `玩家 #${userId}`,
        status: status as UserStatus,
      });
    }
  }

  private consumeSocketRateLimit(userId: number, action: string, limit: number, windowMs: number) {
    this.rateLimitService.consume(`ws:${action}:user:${userId}`, limit, windowMs);
  }
}
