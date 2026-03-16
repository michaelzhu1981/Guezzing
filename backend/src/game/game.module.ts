import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import {
  GameEntity,
  GamePlayerEntity,
  GuessEntity,
  SecretEntity,
} from '../database/entities';
import { UsersModule } from '../users/users.module';
import { ChatModule } from '../chat/chat.module';
import { LobbyModule } from '../lobby/lobby.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameEntity, GamePlayerEntity, SecretEntity, GuessEntity]),
    AuthModule,
    UsersModule,
    ChatModule,
    LobbyModule,
    forwardRef(() => MatchmakingModule),
  ],
  providers: [GameGateway, GameService],
  exports: [GameGateway, GameService],
})
export class GameModule {}
