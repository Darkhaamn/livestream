const CHAT_BASE = process.env.NEXT_PUBLIC_CHAT_URL ?? "ws://localhost:8082"

export type ChatMessageType =
  | "chat"
  | "system"
  | "join"
  | "leave"
  | "error"
  | "clear"
  | "delete"

export interface ChatMessage {
  type: ChatMessageType
  id?: string
  room: string
  user_id?: string
  username?: string
  color?: string
  text?: string
  badges?: string[]
  target?: string // username (clear) or message id (delete)
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

  connect(onOpen?: () => void, onClose?: () => void) {
    const url = new URL(`${CHAT_BASE}/ws/${this.room}`)
    if (this.token) url.searchParams.set("token", this.token)
    this.ws = new WebSocket(url.toString())

    this.ws.onopen = () => {
      onOpen?.()
    }

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ChatMessage
        this.listeners.forEach((l) => l(msg))
      } catch {}
    }

    this.ws.onclose = () => {
      onClose?.()
      this.reconnectTimer = setTimeout(
        () => this.connect(onOpen, onClose),
        3000
      )
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
