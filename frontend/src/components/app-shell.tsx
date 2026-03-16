'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { App, Button, Card, Col, Form, Input, InputNumber, Layout, List, Modal, Row, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/services/api';
import { disconnectSocket, getSocket } from '@/services/socket';
import { useAppStore } from '@/store/app-store';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const LOBBY_PANEL_BODY_HEIGHT = 320;

function getSocketErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const maybeMessage = 'message' in error ? error.message : null;
    if (Array.isArray(maybeMessage)) {
      return maybeMessage.join('，');
    }
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
  }

  return '操作失败';
}

function formatDuration(startedAt?: string, endedAt?: string, now = Date.now()) {
  if (!startedAt) {
    return null;
  }

  const startMs = new Date(startedAt).getTime();
  const endMs = endedAt ? new Date(endedAt).getTime() : now;
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null;
  }

  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

function formatChatTimestamp(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

type AppShellProps = {
  currentPage: 'lobby' | 'game';
};

type GuessRecord = {
  guess: string;
  hitCharCount: number;
  hitPosCount: number;
};

type LobbyInvite = {
  inviteId: string;
  fromUserId: number;
  fromUsername: string;
  N: number;
  M: number;
};

type SegmentedCharInputProps = {
  length: number;
  poolSize?: number;
  value: string;
  onChange: (nextValue: string) => void;
  onEnter?: () => void;
  disabled?: boolean;
  placeholder?: string;
};

const SEGMENTED_CHAR_POOL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];
const USERNAME_PATTERN = /^[\p{L}\p{N}_]+$/u;

function getAllowedCharsByPoolSize(poolSize: number) {
  return SEGMENTED_CHAR_POOL.slice(0, Math.min(poolSize, SEGMENTED_CHAR_POOL.length));
}

function formatAllowedChars(poolSize: number) {
  return getAllowedCharsByPoolSize(poolSize).join('、');
}

function extractAllowedChars(value: string, poolSize: number) {
  const allowedChars = new Set(getAllowedCharsByPoolSize(poolSize));
  return value
    .toUpperCase()
    .replace(/\s+/g, '')
    .split('')
    .filter((char) => allowedChars.has(char));
}

function sanitizeSegmentedValue(value: string, length: number, poolSize: number) {
  return extractAllowedChars(value, poolSize).join('').slice(0, length);
}

function validateSegmentedSubmission(value: string, length: number, poolSize: number, label: string) {
  const normalized = value.toUpperCase().replace(/\s+/g, '');
  if (normalized.length !== length) {
    return { error: `${label}长度必须为 ${length}` };
  }

  const allowedChars = new Set(getAllowedCharsByPoolSize(poolSize));
  const chars = normalized.split('');
  if (!chars.every((char) => allowedChars.has(char))) {
    return { error: `${label}仅允许输入 ${formatAllowedChars(poolSize)}` };
  }

  if (new Set(chars).size !== chars.length) {
    return { error: `${label}中不能有重复字符` };
  }

  return { value: normalized };
}

function SegmentedCharInput({ length, poolSize = length, value, onChange, onEnter, disabled, placeholder }: SegmentedCharInputProps) {
  const inputRefs = useRef<Array<{ focus: () => void } | null>>([]);
  const normalizedValue = sanitizeSegmentedValue(value, length, poolSize);
  const chars = Array.from({ length }, (_, index) => normalizedValue[index] || '');

  const updateValue = (nextRawValue: string, focusIndex?: number) => {
    const nextValue = sanitizeSegmentedValue(nextRawValue, length, poolSize);
    onChange(nextValue);
    if (focusIndex === undefined) {
      return;
    }
    window.setTimeout(() => {
      inputRefs.current[Math.max(0, Math.min(length - 1, focusIndex))]?.focus();
    }, 0);
  };

  return (
    <Space size={8} wrap aria-label={placeholder}>
      {chars.map((char, index) => (
        <Input
          key={index}
          ref={(node) => {
            inputRefs.current[index] = node;
          }}
          value={char}
          inputMode="text"
          autoComplete="off"
          maxLength={1}
          disabled={disabled}
          onChange={(event) => {
            const inputChars = extractAllowedChars(event.target.value, poolSize);
            if (!inputChars.length) {
              const nextChars = [...chars];
              nextChars[index] = '';
              updateValue(nextChars.join(''), index);
              return;
            }

            const nextChars = [...chars];
            inputChars.forEach((inputChar, offset) => {
              const targetIndex = index + offset;
              if (targetIndex < length) {
                nextChars[targetIndex] = inputChar;
              }
            });
            const nextFocusIndex = Math.min(index + inputChars.length, length - 1);
            updateValue(nextChars.join(''), nextFocusIndex);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!disabled && normalizedValue.length === length) {
                onEnter?.();
              }
              return;
            }

            if (event.key === 'Backspace' && !chars[index] && index > 0) {
              const nextChars = [...chars];
              nextChars[index - 1] = '';
              event.preventDefault();
              updateValue(nextChars.join(''), index - 1);
            }

            if (event.key === 'ArrowLeft' && index > 0) {
              event.preventDefault();
              inputRefs.current[index - 1]?.focus();
            }

            if (event.key === 'ArrowRight' && index < length - 1) {
              event.preventDefault();
              inputRefs.current[index + 1]?.focus();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const pastedChars = extractAllowedChars(event.clipboardData.getData('text'), poolSize);
            if (!pastedChars.length) {
              return;
            }

            const nextChars = [...chars];
            pastedChars.forEach((inputChar, offset) => {
              const targetIndex = index + offset;
              if (targetIndex < length) {
                nextChars[targetIndex] = inputChar;
              }
            });
            const nextFocusIndex = Math.min(index + pastedChars.length, length - 1);
            updateValue(nextChars.join(''), nextFocusIndex);
          }}
          style={{
            width: 44,
            height: 44,
            padding: 0,
            borderRadius: 10,
            textAlign: 'center',
            fontSize: 20,
            fontWeight: 600,
          }}
        />
      ))}
    </Space>
  );
}

function GuessRecordList({ title, records, guessLength }: { title: string; records: GuessRecord[]; guessLength: number }) {
  const guessColumnWidth = guessLength * 44 + (guessLength - 1) * 8;
  const guessToMetricGap = 28 + Math.max(0, guessLength - 4) * 10;
  const metricGroupGap = 12;
  const metricColumnWidth = 56;

  return (
    <Card size="small" title={title}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            minWidth: guessColumnWidth + guessToMetricGap + metricColumnWidth * 2 + metricGroupGap,
            overflowX: 'auto',
            fontWeight: 600,
            color: '#445068',
          }}
        >
          <div style={{ width: guessColumnWidth, flex: '0 0 auto' }}>猜测内容</div>
          <div style={{ width: guessToMetricGap, flex: '0 0 auto' }} />
          <div style={{ width: metricColumnWidth, flex: '0 0 auto' }}>字符命中</div>
          <div style={{ width: metricGroupGap, flex: '0 0 auto' }} />
          <div style={{ width: metricColumnWidth, flex: '0 0 auto' }}>位置命中</div>
        </div>
        {records.length ? (
          <List
            dataSource={records}
            renderItem={(item) => (
              <List.Item style={{ paddingInline: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: guessColumnWidth + guessToMetricGap + metricColumnWidth * 2 + metricGroupGap,
                    overflowX: 'auto',
                    width: '100%',
                  }}
                >
                  <div style={{ width: guessColumnWidth, flex: '0 0 auto' }}>
                    <Space size={8}>
                      {Array.from({ length: guessLength }, (_, index) => (
                        <div
                          key={`${item.guess}-${index}`}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            border: '1px solid #d9e0ea',
                            background: '#f8fafc',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 20,
                            fontWeight: 600,
                          }}
                        >
                          {item.guess[index] || ''}
                        </div>
                      ))}
                    </Space>
                  </div>
                  <div style={{ width: guessToMetricGap, flex: '0 0 auto' }} />
                  <div style={{ width: metricColumnWidth, flex: '0 0 auto' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        border: '1px solid #c8d7ff',
                        background: '#eef4ff',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 18,
                        fontWeight: 600,
                      }}
                    >
                      {item.hitCharCount}
                    </div>
                  </div>
                  <div style={{ width: metricGroupGap, flex: '0 0 auto' }} />
                  <div style={{ width: metricColumnWidth, flex: '0 0 auto' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        border: '1px solid #bde4d4',
                        background: '#effaf5',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 18,
                        fontWeight: 600,
                      }}
                    >
                      {item.hitPosCount}
                    </div>
                  </div>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Text type="secondary">暂无记录</Text>
        )}
      </Space>
    </Card>
  );
}

function getStatusTagColor(status: 'ONLINE' | 'OFFLINE' | 'MATCHING' | 'PLAYING') {
  switch (status) {
    case 'MATCHING':
      return 'processing';
    case 'PLAYING':
      return 'error';
    case 'OFFLINE':
      return 'default';
    default:
      return 'success';
  }
}

function getStatusLabel(status: 'ONLINE' | 'OFFLINE' | 'MATCHING' | 'PLAYING') {
  switch (status) {
    case 'MATCHING':
      return '匹配中';
    case 'PLAYING':
      return '游戏中';
    case 'OFFLINE':
      return '离线';
    default:
      return '在线';
  }
}

export function AppShell({ currentPage }: AppShellProps) {
  const app = App.useApp();
  const router = useRouter();
  const { token, user, onlineUsers, leaderboard, messages, game } = useAppStore();
  const {
    setAuth,
    logout,
    setLobbySnapshot,
    addMessage,
    addGameMessage,
    setGame,
    pushMyGuess,
    pushOpponentGuess,
    setWinner,
    setInvalid,
  } =
    useAppStore();
  const [changePasswordForm] = Form.useForm<{ oldPassword: string; newPassword: string; confirmPassword: string }>();

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [matchSettings, setMatchSettings] = useState({ N: 9, M: 4 });
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [gameChatInput, setGameChatInput] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [incomingInvite, setIncomingInvite] = useState<LobbyInvite | null>(null);
  const [sentInviteId, setSentInviteId] = useState<string | null>(null);
  const [sentInviteTargetUserId, setSentInviteTargetUserId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const incomingInviteRef = useRef<LobbyInvite | null>(null);
  const sentInviteIdRef = useRef<string | null>(null);

  useEffect(() => {
    incomingInviteRef.current = incomingInvite;
  }, [incomingInvite]);

  useEffect(() => {
    sentInviteIdRef.current = sentInviteId;
  }, [sentInviteId]);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    const socket = getSocket(token);
    const handleLobbySnapshot = (payload: {
      onlineUsers?: typeof onlineUsers;
      leaderboard?: typeof leaderboard;
      messages?: typeof messages;
    }) => {
      setLobbySnapshot({
        onlineUsers: payload.onlineUsers || [],
        leaderboard: payload.leaderboard || [],
        messages: payload.messages || [],
      });
    };
    const handleChatMessage = (payload: (typeof messages)[number]) => addMessage(payload);
    const handleUserOnline = (payload: (typeof onlineUsers)[number]) =>
      setLobbySnapshot({
        onlineUsers: [
          ...useAppStore.getState().onlineUsers.filter((onlineUser) => onlineUser.userId !== payload.userId),
          payload,
        ],
      });
    const handleUserOffline = (payload: { userId: number }) =>
      setLobbySnapshot({
        onlineUsers: useAppStore.getState().onlineUsers.filter((onlineUser) => onlineUser.userId !== payload.userId),
      });
    const handleUserStatusChanged = (payload: (typeof onlineUsers)[number]) =>
      setLobbySnapshot({
        onlineUsers: useAppStore
          .getState()
          .onlineUsers.map((onlineUser) => (onlineUser.userId === payload.userId ? { ...onlineUser, ...payload } : onlineUser)),
      });
    const handleMatchFound = (payload: {
      gameId: number;
      N: number;
      M: number;
      players: { id: number; username: string }[];
      source?: 'invite';
    }) => {
      setIsMatchmaking(false);
      setIncomingInvite(null);
      setSentInviteId(null);
      setSentInviteTargetUserId(null);
      setGame({
        gameId: payload.gameId,
        N: payload.N,
        M: payload.M,
        players: payload.players,
        secretSubmitted: false,
        started: false,
        startedAt: undefined,
        endedAt: undefined,
        myGuesses: [],
        opponentGuesses: [],
        chatMessages: [],
      });
      app.message.success(payload.source === 'invite' ? `邀请对战已开始，对局 #${payload.gameId}` : `匹配成功，对局 #${payload.gameId}`);
      router.push('/game');
    };
    const handleMatchmakingWaiting = () => {
      setIsMatchmaking(true);
    };
    const handleMatchmakingCancelled = () => {
      setIsMatchmaking(false);
      app.message.info('已取消匹配');
    };
    const handleCurrentGame = (payload: NonNullable<typeof game>) => {
      setIsMatchmaking(false);
      setGame({
        gameId: payload.gameId,
        N: payload.N,
        M: payload.M,
        players: payload.players,
        secretSubmitted: payload.secretSubmitted,
        started: payload.started,
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
        winnerId: payload.winnerId,
        invalidReason: payload.invalidReason,
        myGuesses: payload.myGuesses || [],
        opponentGuesses: payload.opponentGuesses || [],
        chatMessages: payload.chatMessages || [],
      });
    };
    const handleGameStart = (payload: { gameId: number; startedAt?: string }) => {
      const current = useAppStore.getState().game;
      if (!current || current.gameId !== payload.gameId) {
        return;
      }
      setGame({
        ...current,
        started: true,
        startedAt: payload.startedAt,
      });
      app.message.success('双方答案已提交，游戏开始');
    };
    const handleSecretSaved = (payload: { gameId: number }) => {
      const current = useAppStore.getState().game;
      if (current && current.gameId === payload.gameId) {
        setGame({
          ...current,
          secretSubmitted: true,
        });
      }
      app.message.success('答案已提交');
    };
    const handleGuessResult = (payload: { guess: string; hitCharCount: number; hitPosCount: number }) =>
      pushMyGuess({
        guess: payload.guess,
        hitCharCount: payload.hitCharCount,
        hitPosCount: payload.hitPosCount,
      });
    const handleOpponentGuess = (payload: { guess: string; hitCharCount: number; hitPosCount: number }) =>
      pushOpponentGuess({
        guess: payload.guess,
        hitCharCount: payload.hitCharCount,
        hitPosCount: payload.hitPosCount,
      });
    const handleGameWin = (payload: { winnerId: number; endedAt?: string }) => {
      setWinner(payload.winnerId, payload.endedAt);
      app.message.info(`对局结束，胜者是玩家 #${payload.winnerId}`);
    };
    const handleGameInvalid = (payload: { reason: 'disconnect' | 'inactivity'; endedAt?: string }) => {
      setInvalid(payload.reason, payload.endedAt);
      app.message.warning(
        payload.reason === 'disconnect' ? '对局因双方掉线超时被判为无效局' : '对局因 5 分钟无操作被判为无效局',
      );
    };
    const handleGameChatMessage = (payload: { gameId: number; id: string; senderId: number; senderName: string; message: string; createdAt: string }) => {
      const current = useAppStore.getState().game;
      if (!current || current.gameId !== payload.gameId) {
        return;
      }
      addGameMessage({
        id: payload.id,
        senderId: payload.senderId,
        senderName: payload.senderName,
        message: payload.message,
        createdAt: payload.createdAt,
      });
    };
    const handlePlayerDisconnect = (payload: { playerId: number }) => {
      const currentUserId = useAppStore.getState().user?.userId;
      if (!currentUserId || payload.playerId === currentUserId) {
        return;
      }
      app.message.warning(`玩家 #${payload.playerId} 已掉线，1 分钟未重连将判负`);
    };
    const handlePlayerReconnect = (payload: { playerId: number }) => {
      const currentUserId = useAppStore.getState().user?.userId;
      if (!currentUserId || payload.playerId === currentUserId) {
        return;
      }
      app.message.success(`玩家 #${payload.playerId} 已重连`);
    };
    const handleInviteReceived = (payload: LobbyInvite) => {
      setIncomingInvite(payload);
      app.message.info(`${payload.fromUsername} 邀请你进行一场 ${payload.N}/${payload.M} 对战`);
    };
    const handleInviteSent = (payload: { inviteId: string; targetUserId: number }) => {
      setSentInviteId(payload.inviteId);
      setSentInviteTargetUserId(payload.targetUserId);
      app.message.success('邀请已发出');
    };
    const handleInviteDeclined = (payload: { inviteId: string; targetUserId: number }) => {
      if (payload.inviteId === sentInviteIdRef.current) {
        setSentInviteId(null);
        setSentInviteTargetUserId(null);
      }
      app.message.info(`玩家 #${payload.targetUserId} 拒绝了邀请`);
    };
    const handleInviteRejected = (payload: { inviteId: string }) => {
      if (incomingInviteRef.current?.inviteId === payload.inviteId) {
        setIncomingInvite(null);
      }
    };
    const handleInviteExpired = (payload: { inviteId: string; targetUserId?: number; fromUserId?: number }) => {
      if (payload.inviteId === sentInviteIdRef.current) {
        setSentInviteId(null);
        setSentInviteTargetUserId(null);
        app.message.warning('邀请已超时');
      }
      if (incomingInviteRef.current?.inviteId === payload.inviteId) {
        setIncomingInvite(null);
        app.message.warning('收到的邀请已超时');
      }
    };
    const handleInviteCancelled = (payload: { inviteId: string; userId: number; reason: 'cancelled' | 'offline' }) => {
      const cancelledSentInvite = payload.inviteId === sentInviteIdRef.current;
      const cancelledIncomingInvite = incomingInviteRef.current?.inviteId === payload.inviteId;
      if (payload.inviteId === sentInviteIdRef.current) {
        setSentInviteId(null);
        setSentInviteTargetUserId(null);
      }
      if (incomingInviteRef.current?.inviteId === payload.inviteId) {
        setIncomingInvite(null);
      }
      if (payload.reason === 'offline') {
        app.message.info(`玩家 #${payload.userId} 已离线，邀请已取消`);
        return;
      }
      if (cancelledSentInvite) {
        app.message.info('已取消邀请');
        return;
      }
      if (cancelledIncomingInvite) {
        app.message.info(`玩家 #${payload.userId} 取消了邀请`);
      }
    };
    const handleException = (payload: unknown) => {
      app.message.error(getSocketErrorMessage(payload));
    };
    const handleConnectError = (error: unknown) => {
      setIsMatchmaking(false);
      app.message.error(getSocketErrorMessage(error) || '连接失败');
    };

    socket.on('lobby_snapshot', handleLobbySnapshot);
    socket.on('chat_message', handleChatMessage);
    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);
    socket.on('user_status_changed', handleUserStatusChanged);
    socket.on('matchmaking_waiting', handleMatchmakingWaiting);
    socket.on('matchmaking_cancelled', handleMatchmakingCancelled);
    socket.on('match_found', handleMatchFound);
    socket.on('current_game', handleCurrentGame);
    socket.on('game_start', handleGameStart);
    socket.on('secret_saved', handleSecretSaved);
    socket.on('guess_result', handleGuessResult);
    socket.on('opponent_guess', handleOpponentGuess);
    socket.on('game_win', handleGameWin);
    socket.on('game_invalid', handleGameInvalid);
    socket.on('game_chat_message', handleGameChatMessage);
    socket.on('player_disconnect', handlePlayerDisconnect);
    socket.on('player_reconnect', handlePlayerReconnect);
    socket.on('invite_received', handleInviteReceived);
    socket.on('invite_sent', handleInviteSent);
    socket.on('invite_declined', handleInviteDeclined);
    socket.on('invite_rejected', handleInviteRejected);
    socket.on('invite_expired', handleInviteExpired);
    socket.on('invite_cancelled', handleInviteCancelled);
    socket.on('exception', handleException);
    socket.on('connect_error', handleConnectError);
    const emitHeartbeat = () => {
      socket.emit('heartbeat');
    };
    socket.on('connect', emitHeartbeat);
    emitHeartbeat();
    const heartbeatTimer = window.setInterval(emitHeartbeat, 5000);

    return () => {
      window.clearInterval(heartbeatTimer);
      socket.off('lobby_snapshot', handleLobbySnapshot);
      socket.off('chat_message', handleChatMessage);
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
      socket.off('user_status_changed', handleUserStatusChanged);
      socket.off('matchmaking_waiting', handleMatchmakingWaiting);
      socket.off('matchmaking_cancelled', handleMatchmakingCancelled);
      socket.off('match_found', handleMatchFound);
      socket.off('current_game', handleCurrentGame);
      socket.off('game_start', handleGameStart);
      socket.off('secret_saved', handleSecretSaved);
      socket.off('guess_result', handleGuessResult);
      socket.off('opponent_guess', handleOpponentGuess);
      socket.off('game_win', handleGameWin);
      socket.off('game_invalid', handleGameInvalid);
      socket.off('game_chat_message', handleGameChatMessage);
      socket.off('player_disconnect', handlePlayerDisconnect);
      socket.off('player_reconnect', handlePlayerReconnect);
      socket.off('invite_received', handleInviteReceived);
      socket.off('invite_sent', handleInviteSent);
      socket.off('invite_declined', handleInviteDeclined);
      socket.off('invite_rejected', handleInviteRejected);
      socket.off('invite_expired', handleInviteExpired);
      socket.off('invite_cancelled', handleInviteCancelled);
      socket.off('exception', handleException);
      socket.off('connect_error', handleConnectError);
      socket.off('connect', emitHeartbeat);
    };
  }, [
    token,
    addMessage,
    addGameMessage,
    app.message,
    pushMyGuess,
    pushOpponentGuess,
    router,
    setGame,
    setInvalid,
    setLobbySnapshot,
    setWinner,
  ]);

  useEffect(() => {
    if (!game?.startedAt || game.endedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [game?.endedAt, game?.startedAt]);

  const handleAuth = async (values: { username: string; password: string }) => {
    setAuthLoading(true);
    try {
      if (authMode === 'register') {
        await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify(values),
        });
      }
      const result = await apiRequest<{ token: string; user: NonNullable<typeof user> }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setAuth(result.token, result.user);
      app.message.success(authMode === 'register' ? '注册并登录成功' : '登录成功');
      router.push('/');
    } catch (error) {
      app.message.error(error instanceof Error ? error.message : '认证失败');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleChangePassword = async (values: { oldPassword: string; newPassword: string; confirmPassword: string }) => {
    if (!token) {
      app.message.error('尚未登录');
      return;
    }

    setChangePasswordLoading(true);
    try {
      await apiRequest<{ message: string }>(
        '/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({
            oldPassword: values.oldPassword,
            newPassword: values.newPassword,
          }),
        },
        token,
      );
      app.message.success('密码修改成功，请使用新密码重新登录');
      setChangePasswordOpen(false);
      changePasswordForm.resetFields();
      setIsMatchmaking(false);
      logout();
      router.push('/');
    } catch (error) {
      app.message.error(error instanceof Error ? error.message : '修改密码失败');
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const socket = token ? getSocket(token) : null;
  const durationText = game ? formatDuration(game.startedAt, game.endedAt, now) : null;
  const gameEnded = !!game?.endedAt;
  const secretLocked = !!game && (game.secretSubmitted || game.started || gameEnded);

  const handleSubmitSecret = () => {
    if (!socket || !game) {
      app.message.error('连接未建立');
      return;
    }

    const result = validateSegmentedSubmission(secretInput, game.M, game.N, '答案');
    if (result.error) {
      app.message.error(result.error);
      return;
    }

    socket.emit('submit_secret', { gameId: game.gameId, secret: result.value });
  };

  const handleSubmitGuess = () => {
    if (!socket || !game) {
      app.message.error('连接未建立');
      return;
    }
    if (!game.started) {
      app.message.error('游戏尚未开始');
      return;
    }

    const result = validateSegmentedSubmission(guessInput, game.M, game.N, '猜测');
    if (result.error) {
      app.message.error(result.error);
      return;
    }

    socket.emit('submit_guess', { gameId: game.gameId, guess: result.value });
    setGuessInput('');
  };

  const handleSendInvite = (targetUserId: number) => {
    if (!socket || isMatchmaking || sentInviteId || incomingInvite) {
      return;
    }

    socket.emit('invite_player', {
      targetUserId,
      ...matchSettings,
    });
  };

  const handleCancelInvite = () => {
    if (!socket || !sentInviteId) {
      return;
    }

    socket.emit('cancel_invite', {
      inviteId: sentInviteId,
    });
  };

  const handleSendLobbyChat = () => {
    if (!socket) {
      return;
    }

    const message = chatInput.trim();
    if (!message) {
      return;
    }

    socket.emit('send_chat', { message });
    setChatInput('');
  };

  const handleSendGameChat = () => {
    if (!socket || !game || gameEnded) {
      return;
    }

    const message = gameChatInput.trim();
    if (!message) {
      return;
    }

    socket.emit('send_game_chat', {
      gameId: game.gameId,
      message,
    });
    setGameChatInput('');
  };

  if (!token || !user) {
    return (
      <Layout style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #102542 0%, #f87060 100%)' }}>
        <Content style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <Card style={{ width: 360, borderRadius: 20 }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Title level={2} style={{ marginBottom: 0 }}>
                  Guezzing
                </Title>
                <Text type="secondary">在线多人猜数字对战</Text>
              </div>
              <Form layout="vertical" onFinish={handleAuth}>
                <Form.Item
                  name="username"
                  label="用户名"
                  rules={[
                    { required: true, message: '请输入用户名' },
                    { min: 3, max: 20, message: '用户名长度需为 3-20 位' },
                    {
                      validator: async (_, value) => {
                        if (!value || USERNAME_PATTERN.test(String(value))) {
                          return;
                        }
                        throw new Error('用户名只允许中文、字母、数字和下划线');
                      },
                    },
                  ]}
                >
                  <Input placeholder="支持中文、字母、数字和下划线" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="密码"
                  rules={[
                    { required: true, message: '请输入密码' },
                    { min: 6, max: 40, message: '密码长度需为 6-40 位' },
                  ]}
                >
                  <Input.Password placeholder="6-40 位" />
                </Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={authLoading}>
                    {authMode === 'login' ? '登录' : '注册'}
                  </Button>
                  <Button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                    切换到{authMode === 'login' ? '注册' : '登录'}
                  </Button>
                </Space>
              </Form>
            </Space>
          </Card>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f7fb' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#102542' }}>
        <Title level={3} style={{ color: '#fff', margin: 0 }}>
          Guezzing
        </Title>
        <Space>
          <Button type={currentPage === 'lobby' ? 'primary' : 'default'}>
            <Link href="/">游戏大厅</Link>
          </Button>
          <Button type={currentPage === 'game' ? 'primary' : 'default'}>
            <Link href="/game">对局</Link>
          </Button>
          <Tag color="geekblue">{user.username}</Tag>
          <Tag color="green">Score {user.score}</Tag>
          <Button onClick={() => setChangePasswordOpen(true)}>修改密码</Button>
          <Button
            onClick={() => {
              setIsMatchmaking(false);
              logout();
              router.push('/');
            }}
          >
            退出
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>
        <Modal
          title="修改密码"
          open={changePasswordOpen}
          confirmLoading={changePasswordLoading}
          onCancel={() => {
            setChangePasswordOpen(false);
            changePasswordForm.resetFields();
          }}
          onOk={() => changePasswordForm.submit()}
          okText="确认修改"
          cancelText="取消"
          destroyOnHidden
        >
          <Form form={changePasswordForm} layout="vertical" onFinish={handleChangePassword}>
            <Form.Item
              name="oldPassword"
              label="旧密码"
              rules={[
                { required: true, message: '请输入旧密码' },
                { min: 6, max: 40, message: '密码长度需为 6-40 位' },
              ]}
            >
              <Input.Password />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, max: 40, message: '密码长度需为 6-40 位' },
                ({ getFieldValue }) => ({
                  validator: async (_, value) => {
                    if (!value || value !== getFieldValue('oldPassword')) {
                      return;
                    }
                    throw new Error('新密码不能与旧密码相同');
                  },
                }),
              ]}
            >
              <Input.Password />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator: async (_, value) => {
                    if (!value || value === getFieldValue('newPassword')) {
                      return;
                    }
                    throw new Error('两次输入的新密码不一致');
                  },
                }),
              ]}
            >
              <Input.Password />
            </Form.Item>
          </Form>
        </Modal>
        {currentPage === 'lobby' ? (
          <Row gutter={[16, 16]} justify="center">
            <Col xs={24} xl={18}>
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card title="游戏大厅" style={{ borderRadius: 18 }}>
                  <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    <Space wrap size={[32, 16]}>
                      <Text>在线人数：{onlineUsers.length}</Text>
                      <Space size="small">
                        <Text>可用字符数量</Text>
                        <Tooltip
                          trigger={['focus']}
                          placement="top"
                          title="9个字符以内为数字1-9，超过9个字符则增加字母A、B、C等，以此类推"
                        >
                          <InputNumber
                            min={9}
                            max={15}
                            value={matchSettings.N}
                            placeholder="9-15"
                            onChange={(value) => setMatchSettings((state) => ({ ...state, N: value || 9 }))}
                          />
                        </Tooltip>
                      </Space>
                      <Space size="small">
                        <Text>猜测长度</Text>
                        <InputNumber
                          min={3}
                          max={matchSettings.N}
                          value={matchSettings.M}
                          placeholder={`3-${matchSettings.N}`}
                          onChange={(value) => setMatchSettings((state) => ({ ...state, M: value || 4 }))}
                        />
                      </Space>
                      <Button
                        type="primary"
                        disabled={isMatchmaking || Boolean(sentInviteId) || Boolean(incomingInvite)}
                        onClick={() => {
                          setIsMatchmaking(true);
                          socket?.emit('join_matchmaking', matchSettings);
                        }}
                      >
                        开始匹配
                      </Button>
                      <Button disabled={!isMatchmaking} onClick={() => socket?.emit('cancel_matchmaking')}>
                        取消匹配
                      </Button>
                      {isMatchmaking && <Tag color="processing">匹配中</Tag>}
                      {sentInviteId && <Tag color="gold">邀请已发送</Tag>}
                    </Space>

                    {incomingInvite && (
                      <Card size="small" style={{ borderColor: '#d4b106', background: '#fffbe6' }}>
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Text strong>{incomingInvite.fromUsername} 邀请你对战</Text>
                          <Text type="secondary">
                            规则：可用字符 {incomingInvite.N}，猜测长度 {incomingInvite.M}
                          </Text>
                          <Space wrap>
                            <Button
                              type="primary"
                              disabled={isMatchmaking}
                              onClick={() => socket?.emit('respond_invite', { inviteId: incomingInvite.inviteId, action: 'accept' })}
                            >
                              接受邀请
                            </Button>
                            <Button
                              onClick={() => {
                                socket?.emit('respond_invite', { inviteId: incomingInvite.inviteId, action: 'reject' });
                                setIncomingInvite(null);
                              }}
                            >
                              拒绝
                            </Button>
                          </Space>
                        </Space>
                      </Card>
                    )}

                    <Row gutter={[16, 16]}>
                      <Col xs={24} md={12}>
                        <Card
                          size="small"
                          title="在线玩家"
                          styles={{
                            body: {
                              height: LOBBY_PANEL_BODY_HEIGHT,
                              overflowY: 'auto',
                            },
                          }}
                        >
                          <List
                            dataSource={onlineUsers}
                            renderItem={(onlineUser) => {
                              const isSelf = onlineUser.userId === user.userId;
                              const isInviteTarget = sentInviteTargetUserId === onlineUser.userId;
                              const canInvite =
                                !isSelf &&
                                onlineUser.status === 'ONLINE' &&
                                !isMatchmaking &&
                                !sentInviteId &&
                                !incomingInvite;
                              const canCancelInvite = !isSelf && !isMatchmaking && isInviteTarget && !!sentInviteId;

                              return (
                                <List.Item
                                  actions={[
                                    <Tag key="status" color={getStatusTagColor(onlineUser.status)}>
                                      {getStatusLabel(onlineUser.status)}
                                    </Tag>,
                                    <Button
                                      key="invite"
                                      type="link"
                                      disabled={!canInvite && !canCancelInvite}
                                      onClick={() => (canCancelInvite ? handleCancelInvite() : handleSendInvite(onlineUser.userId))}
                                    >
                                      {canCancelInvite ? '取消邀请' : '邀请'}
                                    </Button>,
                                  ]}
                                >
                                  <Space>
                                    <Text>{onlineUser.username}</Text>
                                    {isSelf && <Tag color="blue">你</Tag>}
                                  </Space>
                                </List.Item>
                              );
                            }}
                          />
                        </Card>
                      </Col>
                      <Col xs={24} md={12}>
                        <Card
                          size="small"
                          title="大厅聊天"
                          styles={{
                            body: {
                              height: LOBBY_PANEL_BODY_HEIGHT,
                              overflowY: 'auto',
                            },
                          }}
                          extra={
                            <Space>
                              <Input
                                value={chatInput}
                                onChange={(event) => setChatInput(event.target.value)}
                                onPressEnter={handleSendLobbyChat}
                                placeholder="输入消息"
                              />
                              <Button type="primary" onClick={handleSendLobbyChat}>
                                发送
                              </Button>
                            </Space>
                          }
                        >
                          <List
                            size="small"
                            dataSource={messages}
                            renderItem={(item) => (
                              <List.Item>
                                <Space size={8}>
                                  <Text strong>{item.senderName || `玩家 #${item.senderId}`}</Text>
                                  <Text>：{item.message}</Text>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    {formatChatTimestamp(item.createdAt)}
                                  </Text>
                                </Space>
                              </List.Item>
                            )}
                          />
                        </Card>
                      </Col>
                    </Row>
                  </Space>
                </Card>

                <Card title="排行榜" style={{ borderRadius: 18 }}>
                  <Table
                    size="small"
                    rowKey="userId"
                    pagination={false}
                    dataSource={leaderboard.map((item, index) => ({
                      key: item.userId || index,
                      rank: index + 1,
                      username: item.username,
                      score: item.score,
                      wins: item.wins,
                      winRate: `${Math.round((item.winRate || 0) * 100)}%`,
                    }))}
                    columns={[
                      { title: 'Rank', dataIndex: 'rank', width: 70 },
                      { title: 'Player', dataIndex: 'username' },
                      { title: 'Score', dataIndex: 'score', width: 90 },
                      { title: 'Wins', dataIndex: 'wins', width: 90 },
                      { title: 'WinRate', dataIndex: 'winRate', width: 100 },
                    ]}
                  />
                </Card>
              </Space>
            </Col>
          </Row>
        ) : game ? (
          <Card title={`对局 #${game.gameId}`} style={{ borderRadius: 18 }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Text>对手：{game.players.find((player) => player.id !== user.userId)?.username || '等待中'}</Text>
              {durationText && <Text>{game.winnerId ? `本局用时：${durationText}` : `已进行：${durationText}`}</Text>}
              <Row gutter={[16, 16]} align="top">
                <Col xs={24} lg={14}>
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary">
                        提交答案（长度 {game.M}；当前仅允许：{formatAllowedChars(game.N)}；提交时不允许重复字符）
                      </Text>
                      <div style={{ marginTop: 8 }}>
                        <SegmentedCharInput
                          length={game.M}
                          poolSize={game.N}
                          value={secretInput}
                          onChange={setSecretInput}
                          onEnter={handleSubmitSecret}
                          placeholder="提交答案"
                          disabled={secretLocked}
                        />
                      </div>
                    </div>
                    <Space wrap>
                      <Button type="primary" onClick={handleSubmitSecret} disabled={secretLocked}>
                        提交答案
                      </Button>
                    </Space>
                    <div>
                      <Text type="secondary">输入猜测（长度 {game.M}；当前仅允许：{formatAllowedChars(game.N)}）</Text>
                      <div style={{ marginTop: 8 }}>
                        <SegmentedCharInput
                          length={game.M}
                          poolSize={game.N}
                          value={guessInput}
                          onChange={setGuessInput}
                          onEnter={handleSubmitGuess}
                          placeholder="输入猜测"
                          disabled={!game.started || gameEnded}
                        />
                      </div>
                    </div>
                    <Space wrap>
                      <Button
                        type="primary"
                        disabled={!game.started || gameEnded}
                        onClick={handleSubmitGuess}
                      >
                        提交猜测
                      </Button>
                      <Button danger disabled={gameEnded} onClick={() => socket?.emit('surrender', { gameId: game.gameId })}>
                        投降
                      </Button>
                      {game.winnerId && <Tag color={game.winnerId === user.userId ? 'green' : 'red'}>{game.winnerId === user.userId ? '你赢了' : '你输了'}</Tag>}
                      {game.invalidReason && <Tag color="orange">无效局</Tag>}
                    </Space>
                  </Space>
                </Col>
                <Col xs={24} lg={10}>
                  <Card
                    size="small"
                    title="对局聊天"
                    styles={{
                      body: {
                        height: 260,
                        overflowY: 'auto',
                      },
                    }}
                    extra={
                      <Space>
                        <Input
                          value={gameChatInput}
                          onChange={(event) => setGameChatInput(event.target.value)}
                          onPressEnter={handleSendGameChat}
                          placeholder={gameEnded ? '对局已结束' : '输入消息'}
                          disabled={gameEnded}
                        />
                        <Button type="primary" onClick={handleSendGameChat} disabled={gameEnded}>
                          发送
                        </Button>
                      </Space>
                    }
                  >
                    <List
                      size="small"
                      locale={{ emptyText: '暂无聊天记录' }}
                      dataSource={game.chatMessages}
                      renderItem={(item) => (
                        <List.Item>
                          <Space size={8}>
                            <Text strong={item.senderId === user.userId}>{item.senderId === user.userId ? '你' : item.senderName}</Text>
                            <Text>：{item.message}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {formatChatTimestamp(item.createdAt)}
                            </Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
              </Row>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <GuessRecordList title="我的猜测记录" records={game.myGuesses} guessLength={game.M} />
                </Col>
                <Col xs={24} md={12}>
                  <GuessRecordList title="对手猜测记录" records={game.opponentGuesses} guessLength={game.M} />
                </Col>
              </Row>
            </Space>
          </Card>
        ) : (
          <Card title="对局" style={{ borderRadius: 18 }}>
            <Space direction="vertical" size="middle">
              <Text type="secondary">当前没有进行中的对局。</Text>
              <Button type="primary">
                <Link href="/">返回游戏大厅</Link>
              </Button>
            </Space>
          </Card>
        )}
      </Content>
    </Layout>
  );
}
