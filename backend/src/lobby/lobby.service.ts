import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';

export type UserStatus = 'ONLINE' | 'OFFLINE' | 'MATCHING' | 'PLAYING';

@Injectable()
export class LobbyService {
  constructor(
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
  ) {}

  async getOnlineUsers() {
    const ids = await this.redisService.client.smembers('online_users');
    return ids.map((id) => Number(id));
  }

  async getOnlineUserProfiles() {
    const userIds = await this.getOnlineUsers();
    const [users, statuses] = await Promise.all([
      Promise.all(userIds.map((userId) => this.usersService.findById(userId))),
      userIds.length
        ? this.redisService.client.mget(userIds.map((userId) => `user_status:${userId}`))
        : Promise.resolve([]),
    ]);

    return users
      .filter((user): user is NonNullable<typeof user> => Boolean(user))
      .map((user, index) => ({
        userId: user.id,
        username: user.username,
        status: (statuses[index] as UserStatus | null) || 'ONLINE',
      }));
  }

  async setUserOnline(userId: number) {
    await this.redisService.client.sadd('online_users', String(userId));
    await this.redisService.client.set(`user_status:${userId}`, 'ONLINE');
  }

  async setUserOffline(userId: number) {
    await this.redisService.client.srem('online_users', String(userId));
    await this.redisService.client.set(`user_status:${userId}`, 'OFFLINE');
  }

  async setUserStatus(userId: number, status: UserStatus) {
    await this.redisService.client.set(`user_status:${userId}`, status);
  }

  async getUserStatus(userId: number) {
    return (await this.redisService.client.get(`user_status:${userId}`)) as UserStatus | null;
  }

  async getOnlineUserProfile(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      return null;
    }

    return {
      userId: user.id,
      username: user.username,
      status: (await this.getUserStatus(userId)) || 'ONLINE',
    };
  }
}
