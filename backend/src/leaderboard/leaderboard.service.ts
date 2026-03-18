import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { PublicUserProfile, UsersService } from '../users/users.service';

export type LeaderboardEntry = {
  rank: number;
  userId: number;
  username: string;
  score: number;
  wins: number;
  games: number;
  winRate: number;
};

export type LeaderboardPayload = {
  leaderboard: LeaderboardEntry[];
  updatedAt: string;
};

export type ProfileUpdatedPayload = {
  user: PublicUserProfile;
  updatedAt: string;
};

export type LeaderboardChangeEvent = {
  affectedUserIds: number[];
  reason: 'game_finished' | 'admin_adjusted';
  updatedAt: string;
};

@Injectable()
export class LeaderboardService {
  private readonly changesSubject = new Subject<LeaderboardChangeEvent>();
  private updatedAt = new Date().toISOString();

  constructor(private readonly usersService: UsersService) {}

  observeChanges() {
    return this.changesSubject.asObservable();
  }

  async getLeaderboardPayload(limit = 20): Promise<LeaderboardPayload> {
    const records = await this.usersService.getLeaderboard(limit);
    return {
      leaderboard: records.map((item, index) => {
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
      }),
      updatedAt: this.updatedAt,
    };
  }

  async getProfileUpdatedPayload(userId: number): Promise<ProfileUpdatedPayload | null> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      return null;
    }

    return {
      user: this.usersService.toPublicProfile(user),
      updatedAt: this.updatedAt,
    };
  }

  markChanged(reason: LeaderboardChangeEvent['reason'], affectedUserIds: number[]) {
    this.updatedAt = new Date().toISOString();
    this.changesSubject.next({
      affectedUserIds: [...new Set(affectedUserIds)],
      reason,
      updatedAt: this.updatedAt,
    });
  }
}
