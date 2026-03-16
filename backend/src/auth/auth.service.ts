import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  private normalizeUsername(username: string) {
    return username.trim();
  }

  async register(username: string, password: string) {
    const normalizedUsername = this.normalizeUsername(username);
    const existingUser = await this.usersService.findByUsername(normalizedUsername);
    if (existingUser) {
      throw new BadRequestException('注册信息无效');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.create(normalizedUsername, passwordHash);

    return {
      userId: user.id,
      username: user.username,
    };
  }

  async login(username: string, password: string) {
    const normalizedUsername = this.normalizeUsername(username);
    const user = await this.usersService.findByUsername(normalizedUsername);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return {
      token: await this.jwtService.signAsync({
        sub: user.id,
        username: user.username,
      }),
      user: {
        userId: user.id,
        username: user.username,
        score: user.score,
        wins: user.wins,
        games: user.games,
        winRate: user.winRate,
      },
    };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    if (!(await bcrypt.compare(oldPassword, user.passwordHash))) {
      throw new UnauthorizedException('旧密码错误');
    }

    if (oldPassword === newPassword) {
      throw new BadRequestException('新密码不能与旧密码相同');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(userId, passwordHash);

    return { message: '密码修改成功' };
  }
}
