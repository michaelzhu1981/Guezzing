import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessageEntity } from '../database/entities';
import { ChatService } from './chat.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessageEntity]), UsersModule],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
