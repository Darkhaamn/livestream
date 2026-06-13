/* eslint-disable react-hooks/set-state-in-effect */
"use client"

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
} from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/lib/auth-context"

interface AuthModalProps {
  open: boolean
  onClose: () => void
  defaultTab?: "login" | "register"
}

const BRAND_POINTS = [
  { icon: IconBroadcast, text: "Go live in minutes with any encoder" },
  { icon: IconMessageCircle, text: "Real-time chat with your audience" },
  { icon: IconUser, text: "Build your channel and grow followers" },
] as const

function AuthFormField({
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
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="h-11">
        <InputGroupAddon align="inline-start">
          <Icon />
        </InputGroupAddon>
        {children}
      </InputGroup>
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  )
}

export function AuthModal({
  open,
  onClose,
  defaultTab = "login",
}: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "register">(defaultTab)
  const [form, setForm] = useState({ username: "", email: "", password: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login, register } = useAuth()

  const isLogin = tab === "login"

  useEffect(() => {
    if (!open) {
      setForm({ username: "", email: "", password: "" })
      setError("")
      setShowPassword(false)
      return
    }
    setTab(defaultTab)
    setError("")
  }, [open, defaultTab])

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setError("")
      setForm((f) => ({ ...f, [k]: e.target.value }))
    }

  const switchTab = (next: "login" | "register") => {
    setTab(next)
    setError("")
    setShowPassword(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      if (isLogin) {
        await login(form.email, form.password)
      } else {
        await register(form.username, form.email, form.password)
      }
      onClose()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl p-0 sm:min-h-[520px] sm:max-w-[880px]"
      >
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Brand panel */}
          <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-sidebar p-8 text-sidebar-foreground sm:flex">
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent"
              aria-hidden
            />
            <div className="relative">
              <div className="flex items-center gap-2.5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
                  <IconVideo className="text-primary-foreground" />
                </div>
                <span className="text-lg font-extrabold tracking-tight italic">
                  LIVESTREAM
                </span>
              </div>
              <p className="mt-6 text-2xl leading-snug font-bold tracking-tight">
                Your stage.
                <br />
                Your audience.
                <br />
                Your rules.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Join creators streaming live, connecting with viewers, and
                building communities.
              </p>
            </div>

            <ul className="relative flex flex-col gap-4">
              {BRAND_POINTS.map(({ icon: Icon, text }) => (
                <li
                  key={text}
                  className="flex items-start gap-3 text-sm text-sidebar-foreground/80"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                    <Icon className="text-primary" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </aside>

          {/* Form panel */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between border-b border-border px-6 py-5 sm:px-8">
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {isLogin ? "Welcome back" : "Create your account"}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {isLogin
                    ? "Sign in to manage your channel and go live."
                    : "Set up your profile and start streaming today."}
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label="Close"
              >
                <IconX />
              </Button>
            </div>

            <form
              onSubmit={submit}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6 sm:px-8"
            >
              <FieldGroup>
                {!isLogin && (
                  <AuthFormField
                    id="auth-username"
                    label="Username"
                    icon={IconUser}
                    hint="3–32 characters, letters and numbers."
                  >
                    <InputGroupInput
                      id="auth-username"
                      type="text"
                      value={form.username}
                      onChange={set("username")}
                      required
                      minLength={3}
                      maxLength={32}
                      autoComplete="username"
                      placeholder="yourname"
                    />
                  </AuthFormField>
                )}

                <AuthFormField id="auth-email" label="Email" icon={IconAt}>
                  <InputGroupInput
                    id="auth-email"
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </AuthFormField>

                <AuthFormField
                  id="auth-password"
                  label="Password"
                  icon={IconLock}
                  hint={isLogin ? undefined : "At least 6 characters."}
                >
                  <InputGroupInput
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={set("password")}
                    required
                    minLength={6}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    placeholder="••••••••"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-sm"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <IconEyeOff /> : <IconEye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </AuthFormField>

                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
              </FieldGroup>

              <div className="mt-6 flex flex-col gap-4">
                <Button
                  type="submit"
                  disabled={loading}
                  size="lg"
                  className="h-11 w-full rounded-lg"
                >
                  {loading ? (
                    <>
                      <IconLoader2
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                      {isLogin ? "Signing in…" : "Creating account…"}
                    </>
                  ) : isLogin ? (
                    "Sign in"
                  ) : (
                    "Create account"
                  )}
                </Button>

                <Separator />

                <p className="text-center text-sm text-muted-foreground">
                  {isLogin
                    ? "Don't have an account?"
                    : "Already have an account?"}{" "}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 font-semibold text-primary-text"
                    onClick={() => switchTab(isLogin ? "register" : "login")}
                  >
                    {isLogin ? "Sign up" : "Sign in"}
                  </Button>
                </p>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
