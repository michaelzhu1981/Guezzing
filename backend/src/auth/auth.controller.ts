import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RateLimitService } from '../common/rate-limit.service';
import { AuthService } from './auth.service';

const USERNAME_PATTERN = /^[\p{L}\p{N}_]+$/u;

class AuthDto {
  @IsString()
  @Length(3, 20)
  @Matches(USERNAME_PATTERN, { message: '用户名只允许中文、字母、数字和下划线' })
  username!: string;

  @IsString()
  @Length(6, 40)
  password!: string;
}

class ChangePasswordDto {
  @IsString()
  @Length(6, 40)
  oldPassword!: string;

  @IsString()
  @Length(6, 40)
  newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  private getClientKey(forwardedFor: string | undefined, username?: string) {
    const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
    const normalizedUsername = username?.trim().toLowerCase() || 'anonymous';
    return { ip, normalizedUsername };
  }

  @Post('register')
  register(@Body() body: AuthDto, @Headers('x-forwarded-for') forwardedFor?: string) {
    const { ip, normalizedUsername } = this.getClientKey(forwardedFor, body.username);
    this.rateLimitService.consume(`auth:register:ip:${ip}`, 10, 60_000);
    this.rateLimitService.consume(`auth:register:user:${normalizedUsername}`, 5, 60_000);
    return this.authService.register(body.username, body.password);
  }

  @Post('login')
  login(@Body() body: AuthDto, @Headers('x-forwarded-for') forwardedFor?: string) {
    const { ip, normalizedUsername } = this.getClientKey(forwardedFor, body.username);
    this.rateLimitService.consume(`auth:login:ip:${ip}`, 20, 60_000);
    this.rateLimitService.consume(`auth:login:user:${normalizedUsername}`, 8, 60_000);
    return this.authService.login(body.username, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: { userId: number },
    @Body() body: ChangePasswordDto,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ) {
    const { ip } = this.getClientKey(forwardedFor);
    this.rateLimitService.consume(`auth:change-password:user:${user.userId}`, 5, 60_000);
    this.rateLimitService.consume(`auth:change-password:ip:${ip}`, 10, 60_000);
    return this.authService.changePassword(user.userId, body.oldPassword, body.newPassword);
  }
}
