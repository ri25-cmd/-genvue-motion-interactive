'use client'

import { io, type Socket } from 'socket.io-client'

// Single shared connection per browser tab. Connects back to the same host
// that served the page, so it works over local Wi-Fi with no configuration.
let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'] })
  }
  return socket
}
