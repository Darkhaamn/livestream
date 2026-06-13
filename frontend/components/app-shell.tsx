/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import {
  IconBroadcast,
  IconChevronDown,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSun,
  IconUser,
  IconVideo,
} from '@tabler/icons-react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AuthModal } from '@/components/auth/auth-modal'
import { AppSidebar } from '@/components/app-sidebar'
import { useAuth } from '@/lib/auth-context'

type AppShellProps = { children: React.ReactNode }

export default function AppShell({ children }: AppShellProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { user, isLoading, logout } = useAuth()
  const [themeMounted, setThemeMounted] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const openLogin = () => { setAuthTab('login'); setAuthOpen(true) }
  const openRegister = () => { setAuthTab('register'); setAuthOpen(true) }

  useEffect(() => setThemeMounted(true), [])

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light')
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top navbar */}
      <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-full w-full items-center gap-4 px-4">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <IconVideo className="size-4 text-primary-foreground" />
            </div>
            <span className="text-base font-extrabold italic tracking-tight text-foreground">
              LIVESTREAM
            </span>
          </Link>

          {/* Search (decorative) */}
          <div className="hidden flex-1 justify-center md:flex">
            <div className="flex w-full max-w-md items-center gap-2 rounded-md bg-input px-3 py-1.5">
              <IconSearch className="size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search"
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>

          {/* Right actions */}
          <nav className="ml-auto flex shrink-0 items-center gap-2">
            {!isLoading && (
              <>
                {user ? (
                  <>
                    <Link
                      href="/broadcast"
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <IconBroadcast className="size-4" />
                      Go Live
                    </Link>
                    <div className="relative">
                      <button
                        onClick={() => setUserMenuOpen(o => !o)}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {(user.display_name ?? user.username).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-foreground">{user.display_name ?? user.username}</span>
                        <IconChevronDown className="size-3 opacity-50" />
                      </button>
                      {userMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-popover p-1 shadow-xl">
                          <Link
                            href={`/${user.username}`}
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <IconUser className="size-4" />
                            Channel
                          </Link>
                          <button
                            onClick={() => { logout(); setUserMenuOpen(false) }}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <IconLogout className="size-4" />
                            Log out
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={openLogin}
                      className="h-8 rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                    >
                      Log in
                    </button>
                    <button
                      onClick={openRegister}
                      className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Sign up
                    </button>
                  </>
                )}
              </>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {themeMounted
                ? (resolvedTheme === 'dark' ? <IconSun className="size-4" /> : <IconMoon className="size-4" />)
                : <span className="size-4" aria-hidden />}
            </button>
          </nav>
        </div>
      </header>

      <AppSidebar />

      <main className="lg:pl-[260px]">{children}</main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab={authTab} />
    </div>
  )
}
