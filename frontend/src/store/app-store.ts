'use client';

import { create } from 'zustand';

export type AuthUser = {
  userId: number;
  username: string;
  score: number;
  wins: number;
  games: number;
  winRate: number;
};

export type LobbyUser = {
  userId: number;
  username: string;
  status: 'ONLINE' | 'OFFLINE' | 'MATCHING' | 'PLAYING';
};

export type LobbyMessage = {
  id?: number;
  senderId: number;
  senderName?: string;
  receiverId: number | null;
  message: string;
  createdAt: string;
};

export type GameMessage = {
  id: string;
  senderId: number;
  senderName: string;
  message: string;
  createdAt: string;
};

export type GameView = {
  gameId: number;
  N: number;
  M: number;
  players: { id: number; username: string }[];
  secretSubmitted: boolean;
  started: boolean;
  startedAt?: string;
  endedAt?: string;
  winnerId?: number;
  invalidReason?: 'disconnect' | 'inactivity';
  opponentAnswer?: string;
  myGuesses: { guess: string; hitCharCount: number; hitPosCount: number }[];
  opponentGuesses: { guess: string; hitCharCount: number; hitPosCount: number }[];
  chatMessages: GameMessage[];
};

type AppState = {
  token: string | null;
  user: AuthUser | null;
  onlineUsers: LobbyUser[];
  leaderboard: AuthUser[];
  leaderboardUpdatedAt: string | null;
  messages: LobbyMessage[];
  game: GameView | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  setLobbySnapshot: (payload: Partial<AppState>) => void;
  setLeaderboard: (leaderboard: AuthUser[], updatedAt: string) => void;
  setUserProfile: (user: AuthUser) => void;
  addMessage: (message: LobbyMessage) => void;
  setGame: (game: GameView | null) => void;
  addGameMessage: (message: GameMessage) => void;
  pushMyGuess: (guess: { guess: string; hitCharCount: number; hitPosCount: number }) => void;
  pushOpponentGuess: (guess: { guess: string; hitCharCount: number; hitPosCount: number }) => void;
  setWinner: (winnerId: number, endedAt?: string, opponentAnswer?: string) => void;
  setInvalid: (reason: 'disconnect' | 'inactivity', endedAt?: string, opponentAnswer?: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  token: null,
  user: null,
  onlineUsers: [],
  leaderboard: [],
  leaderboardUpdatedAt: null,
  messages: [],
  game: null,
  setAuth: (token, user) => set({ token, user }),
  logout: () =>
    set({
      token: null,
      user: null,
      game: null,
      onlineUsers: [],
      leaderboard: [],
      leaderboardUpdatedAt: null,
      messages: [],
    }),
  setLobbySnapshot: (payload) =>
    set((state) => ({
      ...state,
      ...payload,
    })),
  setLeaderboard: (leaderboard, updatedAt) =>
    set((state) => {
      if (state.leaderboardUpdatedAt && updatedAt <= state.leaderboardUpdatedAt) {
        return state;
      }

      return {
        leaderboard,
        leaderboardUpdatedAt: updatedAt,
      };
    }),
  setUserProfile: (user) =>
    set((state) => ({
      user: state.user && state.user.userId === user.userId ? { ...state.user, ...user } : state.user,
    })),
  addMessage: (message) =>
    set((state) => ({
      messages: [message, ...state.messages.slice(0, 49)],
    })),
  setGame: (game) => set({ game }),
  addGameMessage: (message) =>
    set((state) =>
      state.game
        ? {
            game: {
              ...state.game,
              chatMessages: [...state.game.chatMessages, message],
            },
          }
        : state,
    ),
  pushMyGuess: (guess) =>
    set((state) =>
      state.game
        ? {
            game: {
              ...state.game,
              myGuesses: [...state.game.myGuesses, guess],
            },
          }
        : state,
    ),
  pushOpponentGuess: (guess) =>
    set((state) =>
      state.game
        ? {
            game: {
              ...state.game,
              opponentGuesses: [...state.game.opponentGuesses, guess],
            },
          }
        : state,
    ),
  setWinner: (winnerId, endedAt, opponentAnswer) =>
    set((state) =>
      state.game
        ? {
            game: {
              ...state.game,
              winnerId,
              endedAt,
              opponentAnswer,
            },
          }
        : state,
    ),
  setInvalid: (reason, endedAt, opponentAnswer) =>
    set((state) =>
      state.game
        ? {
            game: {
              ...state.game,
              endedAt,
              invalidReason: reason,
              opponentAnswer,
            },
          }
        : state,
    ),
}));
