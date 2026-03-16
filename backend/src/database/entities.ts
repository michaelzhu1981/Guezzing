import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum GameState {
  WAITING_SECRET = 'WAITING_SECRET',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED',
  INVALID = 'INVALID',
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  username!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ default: 0 })
  score!: number;

  @Column({ default: 0 })
  wins!: number;

  @Column({ default: 0 })
  games!: number;

  @Column({ type: 'float', default: 0 })
  winRate!: number;

  @Column({ default: 0 })
  streak!: number;

  @Column({ type: 'float', default: 0 })
  avgTime!: number;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('games')
export class GameEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  N!: number;

  @Column()
  M!: number;

  @Column({ type: 'enum', enum: GameState, default: GameState.WAITING_SECRET })
  state!: GameState;

  @Column({ type: 'int', nullable: true })
  winnerId!: number | null;

  @Column({ type: 'timestamp', nullable: true })
  startTime!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endTime!: Date | null;

  @Column({ default: true })
  isValid!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('game_players')
@Unique(['gameId', 'playerId'])
export class GamePlayerEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  gameId!: number;

  @Column()
  playerId!: number;

  @Column({ default: 'ACTIVE' })
  status!: string;

  @CreateDateColumn()
  joinTime!: Date;
}

@Entity('secrets')
@Unique(['gameId', 'playerId'])
export class SecretEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  gameId!: number;

  @Column()
  playerId!: number;

  @Column()
  secretString!: string;
}

@Entity('guesses')
export class GuessEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  gameId!: number;

  @Column()
  playerId!: number;

  @Column()
  guessString!: string;

  @Column()
  hitCharCount!: number;

  @Column()
  hitPosCount!: number;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('chat_messages')
@Index('IDX_chat_messages_receiver_created_at', ['receiverId', 'createdAt'])
export class ChatMessageEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  senderId!: number;

  @Column({ type: 'int', nullable: true })
  receiverId!: number | null;

  @Column()
  message!: string;

  @CreateDateColumn()
  createdAt!: Date;
}

export const DatabaseEntities = [
  UserEntity,
  GameEntity,
  GamePlayerEntity,
  SecretEntity,
  GuessEntity,
  ChatMessageEntity,
];
