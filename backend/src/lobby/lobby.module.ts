import { Module } from '@nestjs/common';
import { LobbyController } from './lobby.controller';
import { LobbyService } from './lobby.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [LobbyService],
  controllers: [LobbyController],
  exports: [LobbyService],
})
export class LobbyModule {}
