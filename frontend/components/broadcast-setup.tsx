"use client"

import { IconCheck, IconCopy, IconEye, IconEyeOff } from "@tabler/icons-react"
import { useEffect, useState } from "react"

import BroadcastDashboard from "@/components/broadcast-dashboard"
import { StreamInfoEditor } from "@/components/stream/stream-info-editor"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { getBroadcastConfig } from "@/lib/mtx-api"
import type { BroadcastConfig } from "@/lib/mtx-types"

function CopyField({ label, value, mask = false }: { label: string; value: string; mask?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const masked = mask && !revealed

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <input
          readOnly
          type={masked ? "password" : "text"}
          value={value}
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-input px-3 font-mono text-sm text-foreground outline-none"
        />
        {mask ? (
          <Button type="button" variant="secondary" size="icon" onClick={() => setRevealed(r => !r)}>
            {revealed ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
            <span className="sr-only">{revealed ? "Hide" : "Reveal"}</span>
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="icon" onClick={() => void handleCopy()}>
          {copied ? <IconCheck className="size-4 text-primary-text" /> : <IconCopy className="size-4" />}
          <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
    </div>
  )
}

function deriveRtmpServer(rtmpBase: string | undefined) {
  const fallback = "rtmp://localhost:1935/live"
  if (!rtmpBase) return fallback
  const match = rtmpBase.match(/^(rtmps?:\/\/[^/]+)/)
  if (!match) return fallback
  return `${match[1]}/live`
}

export default function BroadcastSetup() {
  const { user, accessToken, isLoading, refreshUser } = useAuth()
  const [config, setConfig] = useState<BroadcastConfig | null>(null)
  const [streamKey, setStreamKey] = useState("")
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getBroadcastConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [])

  useEffect(() => {
    if (!user) return
    if (user.stream_key) {
      setStreamKey(user.stream_key)
    } else if (accessToken) {
      void api.users
        .me(accessToken)
        .then(me => setStreamKey(me.stream_key ?? ""))
        .catch(() => {})
    }
  }, [user, accessToken])

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-24 md:px-6">
        <div className="surface-card w-full max-w-md p-8 text-center">
          <p className="text-lg font-bold tracking-tight text-foreground">
            <span className="text-primary-text">Log in</span> to start streaming
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your stream key and broadcast tools are tied to your account. Log in or create an
            account to get your creator credentials.
          </p>
        </div>
      </div>
    )
  }

  const username = user.username
  const streamPath = `live/${username}`
  const rtmpServer = deriveRtmpServer(config?.rtmpUrl)
  const obsStreamKey = streamKey ? `${username}?user=${username}&pass=${streamKey}` : ""

  async function handleRegenerate() {
    if (!accessToken) return
    setRegenerating(true)
    try {
      const { stream_key } = await api.users.regenerateStreamKey(accessToken)
      setStreamKey(stream_key)
      await refreshUser()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate stream key")
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Creator dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Connect your encoder with your personal stream key and monitor stream health in real
            time.
          </p>
        </div>
        <Button type="button" onClick={() => void handleRegenerate()} disabled={regenerating}>
          {regenerating ? "Regenerating…" : "Regenerate key"}
        </Button>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="surface-card p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Stream credentials
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use these in OBS or any RTMP-compatible encoder. Your stream goes live at{" "}
              <span className="font-mono text-foreground">{streamPath}</span>.
            </p>

            <div className="mt-5 space-y-4">
              <CopyField label="Server (RTMP)" value={rtmpServer} />
              <CopyField
                label="Stream key (paste into OBS)"
                value={obsStreamKey || "No stream key on your account yet — regenerate one"}
                mask={Boolean(obsStreamKey)}
              />
            </div>

            <div className="my-5 h-px bg-border" />

            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Connect with OBS
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="surface-muted p-4">
                <p className="text-sm font-semibold text-foreground">OBS RTMP</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Settings → Stream → Custom</li>
                  <li>
                    Server:{" "}
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                      {rtmpServer}
                    </span>
                  </li>
                  <li>Stream key: paste the key above</li>
                  <li>Start streaming</li>
                </ol>
              </div>
              <div className="surface-muted p-4">
                <p className="text-sm font-semibold text-foreground">How it works</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  OBS appends the key to the server URL, so the final URL is{" "}
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all text-foreground">
                    {rtmpServer}/{username}?user=…&pass=…
                  </span>{" "}
                  — your username and stream key authenticate the broadcast.
                </p>
              </div>
            </div>
          </div>

          <div className="surface-card p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Stream info
            </p>
            <div className="mt-5">
              <StreamInfoEditor />
            </div>
          </div>
        </div>

        <BroadcastDashboard streamKey={streamPath} />
      </div>
    </div>
  )
}
