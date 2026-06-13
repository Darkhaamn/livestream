'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { IconMessageCircle, IconSend, IconSword, IconVideo } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { ChatSocket, type ChatMessage } from '@/lib/chat-ws'
import { Button } from '@/components/ui/button'

type ChatPanelProps = {
  className?: string
  streamKey: string
}

function Badge({ kind }: { kind: string }) {
  if (kind === 'broadcaster') {
    return (
      <span title="Broadcaster" className="mr-1 inline-flex size-4 items-center justify-center rounded-sm bg-destructive align-text-bottom">
        <IconVideo className="size-2.5 text-white" />
      </span>
    )
  }
  if (kind === 'mod') {
    return (
      <span title="Moderator" className="mr-1 inline-flex size-4 items-center justify-center rounded-sm bg-primary align-text-bottom">
        <IconSword className="size-2.5 text-primary-foreground" />
      </span>
    )
  }
  return null
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.type === 'system' || msg.type === 'join' || msg.type === 'leave' || msg.type === 'error') {
    return (
      <div className={cn('px-3 py-0.5 text-xs italic', msg.type === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
        {msg.type === 'join' && `${msg.username} joined`}
        {msg.type === 'leave' && `${msg.username} left`}
        {(msg.type === 'system' || msg.type === 'error') && msg.text}
      </div>
    )
  }
  return (
    <div className="group px-3 py-1 text-sm hover:bg-accent/50">
      {msg.badges?.map(b => <Badge key={b} kind={b} />)}
      <span className="font-bold" style={{ color: msg.color ?? 'var(--primary-text)' }}>
        {msg.username}
      </span>
      <span className="text-muted-foreground">: {msg.text}</span>
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
      setConnected(true)
      if (msg.type === 'join' || msg.type === 'leave') return
      if (msg.type === 'delete') {
        setMessages(prev => prev.filter(m => m.id !== msg.target))
        return
      }
      if (msg.type === 'clear') {
        setMessages(prev =>
          msg.target ? prev.filter(m => m.username !== msg.target) : [],
        )
        return
      }
      if (msg.type === 'system') {
        setMessages(prev => [...prev, msg])
        return
      }
      if (msg.type === 'error') {
        setMessages(prev => [...prev, msg])
        return
      }
      setMessages(prev => {
        const next = [...prev, msg]
        return next.length > 200 ? next.slice(-200) : next
      })
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
    <div className={cn('flex h-full min-h-0 flex-col bg-card', className)}>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-3">
        <h2 className="text-xs font-bold tracking-widest text-muted-foreground">CHAT</h2>
        <div
          className={cn(
            'size-2 rounded-full',
            connected ? 'bg-primary' : 'bg-destructive',
          )}
        />
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="flex min-h-full flex-col justify-end py-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                <IconMessageCircle className="size-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Waiting for messages...</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border p-3">
        {user ? (
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={500}
              placeholder="Send a message..."
              className="flex-1 rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <Button type="button" size="icon" onClick={send} disabled={!input.trim()}>
              <IconSend className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="rounded-md bg-muted px-3 py-2.5 text-center text-sm text-muted-foreground">
            <span className="font-semibold text-primary-text">Log in</span> to chat
          </div>
        )}
      </div>
    </div>
  )
}
