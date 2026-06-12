const CHAT_BASE = process.env.NEXT_PUBLIC_CHAT_URL ?? 'ws://localhost:8082'

export type ChatMessageType = 'chat' | 'system' | 'join' | 'leave' | 'error'

export interface ChatMessage {
  type: ChatMessageType
  room: string
  user_id?: string
  username?: string
  color?: string
  text?: string
  timestamp: string
}

export type ChatListener = (msg: ChatMessage) => void

export class ChatSocket {
  private ws: WebSocket | null = null
  private listeners = new Set<ChatListener>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private room: string
  private token: string | null

  constructor(room: string, token?: string | null) {
    this.room = room
    this.token = token ?? null
  }

  connect() {
    const url = new URL(`${CHAT_BASE}/ws/${this.room}`)
    if (this.token) url.searchParams.set('token', this.token)
    this.ws = new WebSocket(url.toString())

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ChatMessage
        this.listeners.forEach(l => l(msg))
      } catch {}
    }

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }

    this.ws.onerror = () => this.ws?.close()
  }

  send(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ text }))
    }
  }

  subscribe(listener: ChatListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}
