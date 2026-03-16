import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { LobbyService } from './lobby.service';

@Controller('lobby')
export class LobbyController {
  constructor(private readonly lobbyService: LobbyService) {}

  @UseGuards(JwtAuthGuard)
  @Get('online-users')
  async onlineUsers() {
    return {
      users: await this.lobbyService.getOnlineUserProfiles(),
    };
  }
}
