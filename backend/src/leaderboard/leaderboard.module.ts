import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { LeaderboardController } from './leaderboard.controller';

@Module({
  imports: [UsersModule],
  controllers: [LeaderboardController],
})
export class LeaderboardModule {}
