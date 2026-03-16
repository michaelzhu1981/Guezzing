'use client';

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(token: string) {
  if (socket && socketToken === token) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(process.env.NEXT_PUBLIC_WS_BASE || '/', {
    path: '/socket.io',
    transports: ['websocket'],
    auth: {
      token,
    },
  });
  socketToken = token;

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
