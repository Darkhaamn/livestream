const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081'

export interface TokenPair {
  access_token: string
  refresh_token: string
  user_id: string
  username: string
}

export interface User {
  id: string
  username: string
  email?: string
  display_name?: string | null
  bio?: string | null
  avatar_url?: string | null
  stream_key?: string
  stream_title: string
  stream_category: string
  stream_description: string
  is_live: boolean
  follower_count: number
  created_at: string
}

export interface StreamSession {
  id: number
  path: string
  title: string
  category: string
  description: string
  started_at: string
  ended_at: string | null
  recording_path: string | null
}

export interface FollowingChannel {
  username: string
  display_name: string | null
  avatar_url: string | null
  stream_title: string
  stream_category: string
  stream_description: string
  is_live: boolean
  viewer_count: number
  path: string
}

export interface LiveStream {
  username: string
  display_name: string | null
  avatar_url: string | null
  stream_title: string
  stream_category: string
  stream_description: string
  path: string
  viewer_count: number
  started_at: string | null
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body?.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export const api = {
  auth: {
    register: (username: string, email: string, password: string) =>
      request<TokenPair>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      }),
    login: (email: string, password: string) =>
      request<TokenPair>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    refresh: (refreshToken: string) =>
      request<TokenPair>('/api/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }),
    logout: (refreshToken: string) =>
      request('/api/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }),
  },
  users: {
    me: (token: string) =>
      request<User>('/api/v1/users/me', { headers: authHeader(token) }),
    myFollowing: (token: string) =>
      request<FollowingChannel[]>('/api/v1/users/me/following', { headers: authHeader(token) }),
    getByUsername: (username: string) =>
      request<User>(`/api/v1/users/${username}`),
    sessions: (username: string) =>
      request<StreamSession[]>(`/api/v1/users/${username}/sessions`),
    updateMe: (token: string, data: Partial<Pick<User, 'display_name' | 'bio' | 'stream_title' | 'stream_category' | 'stream_description'>>) =>
      request<User>('/api/v1/users/me', {
        method: 'PUT',
        headers: authHeader(token),
        body: JSON.stringify(data),
      }),
    regenerateStreamKey: (token: string) =>
      request<{ stream_key: string }>('/api/v1/users/me/stream-key', {
        method: 'POST',
        headers: authHeader(token),
      }),
    followStatus: (token: string, username: string) =>
      request<{ following: boolean }>(`/api/v1/users/${username}/follow-status`, {
        headers: authHeader(token),
      }),
    follow: (token: string, username: string) =>
      request<{ following: boolean; follower_count: number }>(`/api/v1/users/${username}/follow`, {
        method: 'POST',
        headers: authHeader(token),
      }),
    unfollow: (token: string, username: string) =>
      request<{ following: boolean; follower_count: number }>(`/api/v1/users/${username}/follow`, {
        method: 'DELETE',
        headers: authHeader(token),
      }),
  },
  streams: {
    live: () => request<LiveStream[]>('/api/v1/streams/live'),
    following: (token: string) =>
      request<LiveStream[]>('/api/v1/streams/following', { headers: authHeader(token) }),
  },
}
