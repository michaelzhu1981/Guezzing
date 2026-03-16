import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CommonModule } from './common/common.module';
import { DatabaseEntities } from './database/entities';
import { GameModule } from './game/game.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { LobbyModule } from './lobby/lobby.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'postgres'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USER', 'guezzing'),
        password: configService.get<string>('DB_PASSWORD', 'guezzing'),
        database: configService.get<string>('DB_NAME', 'guezzing'),
        entities: DatabaseEntities,
        synchronize: true,
      }),
    }),
    RedisModule,
    UsersModule,
    AuthModule,
    LobbyModule,
    MatchmakingModule,
    ChatModule,
    GameModule,
    LeaderboardModule,
  ],
})
export class AppModule {}
