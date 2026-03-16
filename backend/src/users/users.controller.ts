import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { userId: number; username: string }) {
    const fullUser = await this.usersService.findById(user.userId);
    if (!fullUser) {
      return {
        userId: user.userId,
        username: user.username,
        score: 0,
        wins: 0,
        games: 0,
        win_rate: 0,
        streak: 0,
        avg_time: 0,
      };
    }

    const profile = this.usersService.toPublicProfile(fullUser);
    return {
      userId: profile.userId,
      username: profile.username,
      score: profile.score,
      wins: profile.wins,
      games: profile.games,
      win_rate: profile.winRate,
      streak: profile.streak,
      avg_time: profile.avgTime,
    };
  }
}
