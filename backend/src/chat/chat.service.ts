import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { ChatMessageEntity } from '../database/entities';
import { UsersService } from '../users/users.service';

@Injectable()
export class ChatService implements OnModuleDestroy {
  private static readonly LOBBY_MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
  private static readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  private readonly logger = new Logger(ChatService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly chatRepository: Repository<ChatMessageEntity>,
    private readonly usersService: UsersService,
  ) {
    void this.cleanupExpiredMessages();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async create(senderId: number, receiverId: number | null, message: string) {
    const record = this.chatRepository.create({ senderId, receiverId, message });
    return this.chatRepository.save(record);
  }

  async recentLobbyMessages(limit = 30) {
    const records = await this.chatRepository.find({
      where: { receiverId: IsNull() },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const users = await Promise.all(records.map((record) => this.usersService.findById(record.senderId)));

    return records.map((record, index) => ({
      ...record,
      senderName: users[index]?.username,
    }));
  }

  private scheduleCleanup() {
    this.cleanupTimer = setTimeout(() => {
      void this.cleanupExpiredMessages();
    }, ChatService.CLEANUP_INTERVAL_MS);
  }

  private async cleanupExpiredMessages() {
    try {
      const cutoff = new Date(Date.now() - ChatService.LOBBY_MESSAGE_RETENTION_MS);
      const result = await this.chatRepository.delete({
        receiverId: IsNull(),
        createdAt: LessThan(cutoff),
      });

      if (result.affected) {
        this.logger.log(`cleaned up ${result.affected} expired lobby chat messages`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`failed to clean up lobby chat messages: ${message}`);
    } finally {
      this.scheduleCleanup();
    }
  }
}
