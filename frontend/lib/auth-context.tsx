"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { api, type TokenPair, type User } from "./api"

interface AuthState {
  user: User | null
  accessToken: string | null
  isLoading: boolean
}

interface AuthContext extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const Ctx = createContext<AuthContext | null>(null)

const REFRESH_KEY = "ls_refresh_token"

function readInitialAuthState(): AuthState {
  if (typeof window === "undefined") {
    return { user: null, accessToken: null, isLoading: true }
  }

  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!refreshToken) {
    return { user: null, accessToken: null, isLoading: false }
  }

  return { user: null, accessToken: null, isLoading: true }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(readInitialAuthState)

  const applyTokens = useCallback(async (pair: TokenPair) => {
    localStorage.setItem(REFRESH_KEY, pair.refresh_token)
    const user = await api.users.me(pair.access_token)
    setState({ user, accessToken: pair.access_token, isLoading: false })
  }, [])

  useEffect(() => {
    const rt = localStorage.getItem(REFRESH_KEY)
    if (!rt) return

    api.auth
      .refresh(rt)
      .then(applyTokens)
      .catch(() => {
        localStorage.removeItem(REFRESH_KEY)
        setState({ user: null, accessToken: null, isLoading: false })
      })
  }, [applyTokens])

  const login = useCallback(
    async (email: string, password: string) => {
      const pair = await api.auth.login(email, password)
      await applyTokens(pair)
    },
    [applyTokens]
  )

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const pair = await api.auth.register(username, email, password)
      await applyTokens(pair)
    },
    [applyTokens]
  )

  const logout = useCallback(async () => {
    const rt = localStorage.getItem(REFRESH_KEY)
    if (rt) await api.auth.logout(rt).catch(() => {})
    localStorage.removeItem(REFRESH_KEY)
    setState({ user: null, accessToken: null, isLoading: false })
  }, [])

  const refreshUser = useCallback(async () => {
    if (!state.accessToken) return
    const user = await api.users.me(state.accessToken)
    setState((s) => ({ ...s, user }))
  }, [state.accessToken])

  return (
    <Ctx.Provider value={{ ...state, login, register, logout, refreshUser }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
