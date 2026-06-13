/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import {
  IconAt,
  IconBroadcast,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconLock,
  IconMessageCircle,
  IconUser,
  IconVideo,
  IconX,
} from '@tabler/icons-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

interface AuthModalProps {
  open: boolean
  onClose: () => void
  defaultTab?: 'login' | 'register'
}

const BRAND_POINTS = [
  { icon: IconBroadcast, text: 'Go live in minutes with any encoder' },
  { icon: IconMessageCircle, text: 'Real-time chat with your audience' },
  { icon: IconUser, text: 'Build your channel and grow followers' },
] as const

function Field({
  id,
  label,
  icon: Icon,
  hint,
  children,
}: {
  id: string
  label: string
  icon: typeof IconAt
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        {children}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

const inputClass =
  'h-11 w-full rounded-lg border border-border bg-input pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20'

export function AuthModal({ open, onClose, defaultTab = 'login' }: AuthModalProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  const [tab, setTab] = useState<'login' | 'register'>(defaultTab)
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login, register } = useAuth()

  const isLogin = tab === 'login'

  useEffect(() => {
    if (!open) {
      setForm({ username: '', email: '', password: '' })
      setError('')
      setShowPassword(false)
      return
    }
    setTab(defaultTab)
    setError('')
    panelRef.current?.focus()
  }, [open, defaultTab])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    setForm(f => ({ ...f, [k]: e.target.value }))
  }

  const switchTab = (next: 'login' | 'register') => {
    setTab(next)
    setError('')
    setShowPassword(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isLogin) {
        await login(form.email, form.password)
      } else {
        await register(form.username, form.email, form.password)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="relative flex w-full max-w-[880px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none sm:min-h-[520px]"
      >
        {/* Brand panel */}
        <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-sidebar p-8 text-sidebar-foreground sm:flex">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent"
            aria-hidden
          />
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
                <IconVideo className="size-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-extrabold italic tracking-tight">LIVESTREAM</span>
            </div>
            <p className="mt-6 text-2xl font-bold leading-snug tracking-tight">
              Your stage.<br />Your audience.<br />Your rules.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Join creators streaming live, connecting with viewers, and building communities.
            </p>
          </div>

          <ul className="relative space-y-4">
            {BRAND_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-sidebar-foreground/80">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                  <Icon className="size-4 text-primary" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </aside>

        {/* Form panel */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-start justify-between border-b border-border px-6 py-5 sm:px-8">
            <div>
              <h2 id={titleId} className="text-xl font-bold tracking-tight text-foreground">
                {isLogin ? 'Welcome back' : 'Create your account'}
              </h2>
              <p id={descId} className="mt-1 text-sm text-muted-foreground">
                {isLogin
                  ? 'Sign in to manage your channel and go live.'
                  : 'Set up your profile and start streaming today.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <IconX className="size-4" />
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-1 flex-col px-6 py-6 sm:px-8">
            <div className="space-y-4">
              {!isLogin && (
                <Field id="auth-username" label="Username" icon={IconUser} hint="3–32 characters, letters and numbers.">
                  <input
                    id="auth-username"
                    type="text"
                    value={form.username}
                    onChange={set('username')}
                    required
                    minLength={3}
                    maxLength={32}
                    autoComplete="username"
                    placeholder="yourname"
                    className={inputClass}
                  />
                </Field>
              )}

              <Field id="auth-email" label="Email" icon={IconAt}>
                <input
                  id="auth-email"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </Field>

              <Field
                id="auth-password"
                label="Password"
                icon={IconLock}
                hint={isLogin ? undefined : 'At least 6 characters.'}
              >
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  required
                  minLength={6}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  className={cn(inputClass, 'pr-10')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
                </button>
              </Field>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                >
                  {error}
                </div>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {loading ? (
                  <>
                    <IconLoader2 className="size-4 animate-spin" />
                    {isLogin ? 'Signing in…' : 'Creating account…'}
                  </>
                ) : (
                  isLogin ? 'Sign in' : 'Create account'
                )}
              </Button>

              <Separator />

              <p className="text-center text-sm text-muted-foreground">
                {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => switchTab(isLogin ? 'register' : 'login')}
                  className="font-semibold text-primary-text transition-colors hover:underline"
                >
                  {isLogin ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
