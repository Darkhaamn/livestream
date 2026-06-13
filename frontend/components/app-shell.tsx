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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { useAuth } from '@/lib/auth-context'

type AppShellProps = { children: React.ReactNode }

export default function AppShell({ children }: AppShellProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { user, isLoading, logout } = useAuth()
  const [themeMounted, setThemeMounted] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')

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
            <InputGroup className="max-w-md bg-input">
              <InputGroupAddon align="inline-start">
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput type="search" placeholder="Search" />
            </InputGroup>
          </div>

          {/* Right actions */}
          <nav className="ml-auto flex shrink-0 items-center gap-2">
            {!isLoading && (
              <>
                {user ? (
                  <>
                    <Button size="lg" className="rounded-lg" asChild>
                      <Link href="/broadcast">
                        <IconBroadcast data-icon="inline-start" />
                        Go Live
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="gap-1.5 px-2">
                          <Avatar className="size-7">
                            <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
                              {(user.display_name ?? user.username).charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span>{user.display_name ?? user.username}</span>
                          <IconChevronDown className="opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem asChild>
                          <Link href={`/${user.username}`}>
                            <IconUser data-icon="inline-start" />
                            Channel
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void logout()}>
                          <IconLogout data-icon="inline-start" />
                          Log out
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" size="lg" className="rounded-lg" onClick={openLogin}>
                      Log in
                    </Button>
                    <Button size="lg" className="rounded-lg" onClick={openRegister}>
                      Sign up
                    </Button>
                  </>
                )}
              </>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {themeMounted
                ? (resolvedTheme === 'dark' ? <IconSun /> : <IconMoon />)
                : <span className="size-4" aria-hidden />}
            </Button>
          </nav>
        </div>
      </header>

      <AppSidebar />

      <main className="lg:pl-[260px]">{children}</main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab={authTab} />
    </div>
  )
}
