'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { IconMessageCircle, IconSend } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { ChatSocket, type ChatMessage } from '@/lib/chat-ws'

type ChatPanelProps = {
  className?: string
  streamKey: string
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.type === 'system' || msg.type === 'join' || msg.type === 'leave') {
    return (
      <div className="px-3 py-0.5 text-xs italic text-white/25">
        {msg.type === 'join' && `${msg.username} joined`}
        {msg.type === 'leave' && `${msg.username} left`}
        {msg.type === 'system' && msg.text}
      </div>
    )
  }
  return (
    <div className="group px-3 py-1 text-sm hover:bg-white/[0.04]">
      <span className="font-bold" style={{ color: msg.color ?? '#53fc18' }}>
        {msg.username}
      </span>
      <span className="text-white/70">: {msg.text}</span>
    </div>
  )
}

export function ChatPanel({ className, streamKey }: ChatPanelProps) {
  const { user, accessToken } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<ChatSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    const socket = new ChatSocket(streamKey, accessToken)
    socketRef.current = socket

    const unsub = socket.subscribe((msg) => {
      if (msg.type === 'join' || msg.type === 'leave') return
      setMessages(prev => {
        const next = [...prev, msg]
        return next.length > 200 ? next.slice(-200) : next
      })
      setConnected(true)
    })

    socket.connect()
    setConnected(true)

    return () => {
      unsub()
      socket.disconnect()
    }
  }, [streamKey, accessToken])

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, autoScroll])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || !socketRef.current) return
    socketRef.current.send(text)
    setInput('')
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-[#141417]', className)}>
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-3">
        <h2 className="text-xs font-bold tracking-widest text-white/50">CHAT</h2>
        <div
          className={cn(
            'size-2 rounded-full',
            connected ? 'bg-[#53fc18]' : 'bg-[#eb0400]',
          )}
        />
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="flex min-h-full flex-col justify-end py-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-white/[0.06]">
                <IconMessageCircle className="size-6 text-white/25" />
              </div>
              <p className="text-sm font-medium text-white/50">Waiting for messages...</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        {user ? (
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={500}
              placeholder="Send a message..."
              className="flex-1 rounded-md border border-white/[0.06] bg-white/[0.07] px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#53fc18] focus:ring-1 focus:ring-[#53fc18]"
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#53fc18] text-black transition-colors hover:bg-[#46d614] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconSend className="size-4" />
            </button>
          </div>
        ) : (
          <div className="rounded-md bg-white/[0.06] px-3 py-2.5 text-center text-sm text-white/50">
            <span className="font-semibold text-[#53fc18]">Log in</span> to chat
          </div>
        )}
      </div>
    </div>
  )
}
