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
  myGuesses: { guess: string; hitCharCount: number; hitPosCount: number }[];
  opponentGuesses: { guess: string; hitCharCount: number; hitPosCount: number }[];
  chatMessages: GameMessage[];
};

type AppState = {
  token: string | null;
  user: AuthUser | null;
  onlineUsers: LobbyUser[];
  leaderboard: AuthUser[];
  messages: LobbyMessage[];
  game: GameView | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  setLobbySnapshot: (payload: Partial<AppState>) => void;
  addMessage: (message: LobbyMessage) => void;
  setGame: (game: GameView | null) => void;
  addGameMessage: (message: GameMessage) => void;
  pushMyGuess: (guess: { guess: string; hitCharCount: number; hitPosCount: number }) => void;
  pushOpponentGuess: (guess: { guess: string; hitCharCount: number; hitPosCount: number }) => void;
  setWinner: (winnerId: number, endedAt?: string) => void;
  setInvalid: (reason: 'disconnect' | 'inactivity', endedAt?: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  token: null,
  user: null,
  onlineUsers: [],
  leaderboard: [],
  messages: [],
  game: null,
  setAuth: (token, user) => set({ token, user }),
  logout: () =>
    set({
      token: null,
      user: null,
      game: null,
      onlineUsers: [],
      messages: [],
    }),
  setLobbySnapshot: (payload) =>
    set((state) => ({
      ...state,
      ...payload,
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
  setWinner: (winnerId, endedAt) =>
    set((state) =>
      state.game
        ? {
            game: {
              ...state.game,
              winnerId,
              endedAt,
            },
          }
        : state,
    ),
  setInvalid: (reason, endedAt) =>
    set((state) =>
      state.game
        ? {
            game: {
              ...state.game,
              endedAt,
              invalidReason: reason,
            },
          }
        : state,
    ),
}));
