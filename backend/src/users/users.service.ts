import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities';

export type PublicUserProfile = {
  userId: number;
  username: string;
  score: number;
  wins: number;
  games: number;
  winRate: number;
  streak: number;
  avgTime: number;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async findById(id: number) {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByUsername(username: string) {
    return this.usersRepository.findOne({ where: { username } });
  }

  async create(username: string, passwordHash: string) {
    const user = this.usersRepository.create({ username, passwordHash });
    return this.usersRepository.save(user);
  }

  async updatePassword(userId: number, passwordHash: string) {
    await this.usersRepository.update({ id: userId }, { passwordHash });
    return this.findById(userId);
  }

  async getLeaderboard(limit = 20) {
    return this.usersRepository.find({
      select: {
        id: true,
        username: true,
        score: true,
        wins: true,
        games: true,
        winRate: true,
        streak: true,
        avgTime: true,
      },
      order: {
        score: 'DESC',
        wins: 'DESC',
      },
      take: limit,
    });
  }

  async updateStats(userId: number, patch: Partial<UserEntity>) {
    await this.usersRepository.update({ id: userId }, patch);
    return this.findById(userId);
  }

  toPublicProfile(user: Pick<UserEntity, 'id' | 'username' | 'score' | 'wins' | 'games' | 'winRate' | 'streak' | 'avgTime'>): PublicUserProfile {
    return {
      userId: user.id,
      username: user.username,
      score: user.score,
      wins: user.wins,
      games: user.games,
      winRate: user.winRate,
      streak: user.streak,
      avgTime: user.avgTime,
    };
  }
}
