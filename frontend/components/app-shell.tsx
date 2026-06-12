'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconBroadcast,
  IconCategory,
  IconChevronDown,
  IconCompass,
  IconHeart,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSun,
  IconUser,
  IconVideo,
} from '@tabler/icons-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { AuthModal } from '@/components/auth/auth-modal'

type AppShellProps = { children: React.ReactNode }

const NAV_ITEMS = [
  { label: 'Browse', href: '/', icon: IconCompass },
  { label: 'Following', href: '/', icon: IconHeart },
  { label: 'Categories', href: '/', icon: IconCategory },
]

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const { user, isLoading, logout } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const openLogin = () => { setAuthTab('login'); setAuthOpen(true) }
  const openRegister = () => { setAuthTab('register'); setAuthOpen(true) }

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-white/90">
      {/* Top navbar */}
      <header className="sticky top-0 z-30 h-14 border-b border-white/[0.06] bg-[#0b0b0f]/95 backdrop-blur">
        <div className="flex h-full w-full items-center gap-4 px-4">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#53fc18]">
              <IconVideo className="size-4 text-black" />
            </div>
            <span className="text-base font-extrabold italic tracking-tight text-white">
              LIVESTREAM
            </span>
          </Link>

          {/* Search (decorative) */}
          <div className="hidden flex-1 justify-center md:flex">
            <div className="flex w-full max-w-md items-center gap-2 rounded-md bg-white/[0.07] px-3 py-1.5">
              <IconSearch className="size-4 text-white/40" />
              <input
                type="text"
                placeholder="Search"
                className="w-full bg-transparent text-sm text-white placeholder-white/40 outline-none"
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
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-[#53fc18] px-3 text-sm font-semibold text-black transition-colors hover:bg-[#46d614]"
                    >
                      <IconBroadcast className="size-4" />
                      Go Live
                    </Link>
                    <div className="relative">
                      <button
                        onClick={() => setUserMenuOpen(o => !o)}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        <div className="flex size-7 items-center justify-center rounded-full bg-[#53fc18] text-xs font-bold text-black">
                          {(user.display_name ?? user.username).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-white">{user.display_name ?? user.username}</span>
                        <IconChevronDown className="size-3 opacity-50" />
                      </button>
                      {userMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-white/[0.06] bg-[#1c1c21] p-1 shadow-xl">
                          <Link
                            href={`/${user.username}`}
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white"
                          >
                            <IconUser className="size-4" />
                            Channel
                          </Link>
                          <button
                            onClick={() => { logout(); setUserMenuOpen(false) }}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white"
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
                      className="h-8 rounded-lg bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/15"
                    >
                      Log in
                    </button>
                    <button
                      onClick={openRegister}
                      className="h-8 rounded-lg bg-[#53fc18] px-3 text-sm font-semibold text-black transition-colors hover:bg-[#46d614]"
                    >
                      Sign up
                    </button>
                  </>
                )}
              </>
            )}

            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              className="flex size-8 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {resolvedTheme === 'dark' ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
            </button>
          </nav>
        </div>
      </header>

      {/* Left sidebar */}
      <aside className="fixed bottom-0 top-14 z-20 hidden w-[220px] flex-col border-r border-white/[0.06] bg-[#0e0e12] lg:flex">
        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-4 pb-2 text-[10px] font-semibold tracking-widest text-white/30">
            MENU
          </div>
          <nav className="space-y-0.5 px-2">
            {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
              const isActive = label === 'Browse' && pathname === '/'
              return (
                <Link
                  key={label}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white/[0.06] text-[#53fc18]'
                      : 'text-white/60 hover:bg-white/[0.04] hover:text-white',
                  )}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="p-3">
          <div className="rounded-lg border border-white/[0.06] bg-[#141417] p-3">
            <p className="mb-2 text-xs font-medium text-white/50">Start streaming today</p>
            <Link
              href="/broadcast"
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#53fc18] text-sm font-semibold text-black transition-colors hover:bg-[#46d614]"
            >
              <IconBroadcast className="size-4" />
              Go Live
            </Link>
          </div>
        </div>
      </aside>

      <main className="lg:pl-[220px]">{children}</main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab={authTab} />
    </div>
  )
}
