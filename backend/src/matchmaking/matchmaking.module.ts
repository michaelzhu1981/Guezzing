import { Module } from '@nestjs/common';
import { LobbyModule } from '../lobby/lobby.module';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';

@Module({
  imports: [LobbyModule],
  providers: [MatchmakingService],
  controllers: [MatchmakingController],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
