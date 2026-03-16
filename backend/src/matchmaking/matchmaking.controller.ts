import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { MatchmakingService } from './matchmaking.service';

class MatchmakingDto {
  @IsInt()
  @Min(9)
  @Max(15)
  N!: number;

  @IsInt()
  @Min(3)
  @Max(15)
  M!: number;
}

@Controller('matchmaking')
export class MatchmakingController {
  constructor(private readonly matchmakingService: MatchmakingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('join')
  async join(
    @CurrentUser() user: { userId: number; username: string },
    @Body() body: MatchmakingDto,
  ) {
    const match = await this.matchmakingService.joinQueue(
      { id: user.userId, username: user.username },
      body,
    );
    return {
      waiting: !match,
      match,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('cancel')
  async cancel(@CurrentUser() user: { userId: number }) {
    await this.matchmakingService.cancel(user.userId);
    return {
      success: true,
    };
  }
}
