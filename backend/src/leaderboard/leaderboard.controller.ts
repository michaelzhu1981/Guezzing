import { Controller, Get } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async leaderboard() {
    const records = await this.usersService.getLeaderboard();
    return records.map((item, index) => {
      const profile = this.usersService.toPublicProfile(item);
      return {
      rank: index + 1,
      userId: profile.userId,
      username: profile.username,
      score: profile.score,
      wins: profile.wins,
      games: profile.games,
      winRate: profile.winRate,
    };
    });
  }
}
