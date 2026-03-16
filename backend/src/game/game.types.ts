import { GameState } from '../database/entities';

export type PlayerSummary = {
  id: number;
  username: string;
};

export type LiveGuess = {
  playerId: number;
  guessString: string;
  hitCharCount: number;
  hitPosCount: number;
  createdAt: string;
};

export type LiveGameChatMessage = {
  id: string;
  senderId: number;
  senderName: string;
  message: string;
  createdAt: string;
};

export type LiveGame = {
  id: number;
  N: number;
  M: number;
  state: GameState;
  players: PlayerSummary[];
  secrets: Record<number, string>;
  guesses: LiveGuess[];
  chatMessages: LiveGameChatMessage[];
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  updatedAt: string;
};

export type GameSnapshot = {
  gameId: number;
  N: number;
  M: number;
  players: PlayerSummary[];
  secretSubmitted: boolean;
  started: boolean;
  startedAt?: string;
  endedAt?: string;
  winnerId?: number;
  invalidReason?: 'disconnect' | 'inactivity';
  myGuesses: { guess: string; hitCharCount: number; hitPosCount: number }[];
  opponentGuesses: { guess: string; hitCharCount: number; hitPosCount: number }[];
  chatMessages: LiveGameChatMessage[];
};
