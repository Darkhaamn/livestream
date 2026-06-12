'use client'

import { useState } from 'react'
import { IconX, IconVideo } from '@tabler/icons-react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'

interface AuthModalProps {
  open: boolean
  onClose: () => void
  defaultTab?: 'login' | 'register'
}

export function AuthModal({ open, onClose, defaultTab = 'login' }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register'>(defaultTab)
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()

  if (!open) return null

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(form.email, form.password)
      } else {
        await register(form.username, form.email, form.password)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg border border-white/[0.06] bg-[#141417] p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
        >
          <IconX className="size-4" />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[#53fc18]">
            <IconVideo className="size-5 text-black" />
          </div>
          <h2 className="text-xl font-bold text-white">
            {tab === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
        </div>

        <div className="mb-6 flex rounded-lg bg-white/5 p-1">
          {(['login', 'register'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-[#53fc18] text-black shadow'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {t === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={set('username')}
                required
                minLength={3}
                maxLength={32}
                placeholder="your_username"
                className="w-full rounded-md border border-white/[0.06] bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-[#53fc18] focus:ring-1 focus:ring-[#53fc18]/40"
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              required
              placeholder="you@example.com"
              className="w-full rounded-md border border-white/[0.06] bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-[#53fc18] focus:ring-1 focus:ring-[#53fc18]/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full rounded-md border border-white/[0.06] bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-[#53fc18] focus:ring-1 focus:ring-[#53fc18]/40"
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#53fc18] font-semibold text-black hover:bg-[#46d614] disabled:opacity-50"
          >
            {loading ? 'Loading...' : tab === 'login' ? 'Log in' : 'Create account'}
          </Button>
        </form>
      </div>
    </div>
  )
}
