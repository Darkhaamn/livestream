"use client"

import { IconCheck, IconCopy, IconEye, IconEyeOff } from "@tabler/icons-react"
import { useEffect, useState } from "react"

import BroadcastDashboard from "@/components/broadcast-dashboard"
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
      <label className="text-xs text-white/40">{label}</label>
      <div className="flex gap-2">
        <input
          readOnly
          type={masked ? "password" : "text"}
          value={value}
          className="h-9 min-w-0 flex-1 rounded-md bg-black/40 px-3 font-mono text-sm text-white/90 outline-none"
        />
        {mask ? (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-white/70 transition-colors hover:bg-white/15"
          >
            {revealed ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
            <span className="sr-only">{revealed ? "Hide" : "Reveal"}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-white/70 transition-colors hover:bg-white/15"
        >
          {copied ? <IconCheck className="size-4 text-[#53fc18]" /> : <IconCopy className="size-4" />}
          <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  )
}

/** Strip path from an rtmp URL, keeping scheme://host:port, then append /live */
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

  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void getBroadcastConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [])

  useEffect(() => {
    if (!user) return
    setTitle(user.stream_title ?? "")
    setCategory(user.stream_category ?? "")
    if (user.stream_key) {
      setStreamKey(user.stream_key)
    } else if (accessToken) {
      void api.users
        .me(accessToken)
        .then((me) => setStreamKey(me.stream_key ?? ""))
        .catch(() => {})
    }
  }, [user, accessToken])

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-24 md:px-6">
        <div className="w-full max-w-md rounded-xl border border-white/[0.06] bg-[#141417] p-8 text-center">
          <p className="text-lg font-bold tracking-tight">
            <span className="text-[#53fc18]">Log in</span> to start streaming
          </p>
          <p className="mt-2 text-sm text-white/50">
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
  const obsStreamKey = streamKey
    ? `${username}?user=${username}&pass=${streamKey}`
    : ""

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

  async function handleSaveInfo() {
    if (!accessToken) return
    setSaving(true)
    setSaved(false)
    try {
      await api.users.updateMe(accessToken, { stream_title: title, stream_category: category })
      await refreshUser()
      setSaved(true)
      setError(null)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save stream info")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">Creator dashboard</h1>
          <p className="text-sm text-white/50">
            Connect your encoder with your personal stream key and monitor stream health in real
            time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRegenerate()}
          disabled={regenerating}
          className="rounded-lg bg-[#53fc18] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#46d614] disabled:pointer-events-none disabled:opacity-50"
        >
          {regenerating ? "Regenerating…" : "Regenerate key"}
        </button>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-[#eb0400]/30 bg-[#eb0400]/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="rounded-xl border border-white/[0.06] bg-[#141417] p-5">
            <p className="text-xs font-bold tracking-widest text-white/40 uppercase">
              Stream credentials
            </p>
            <p className="mt-1 text-sm text-white/50">
              Use these in OBS or any RTMP-compatible encoder. Your stream goes live at{" "}
              <span className="font-mono text-white/70">{streamPath}</span>.
            </p>

            <div className="mt-5 space-y-4">
              <CopyField label="Server (RTMP)" value={rtmpServer} />
              <CopyField
                label="Stream key (paste into OBS)"
                value={obsStreamKey || "No stream key on your account yet — regenerate one"}
                mask={Boolean(obsStreamKey)}
              />
            </div>

            <div className="my-5 h-px bg-white/[0.06]" />

            <p className="text-xs font-bold tracking-widest text-white/40 uppercase">
              Connect with OBS
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-[#1c1c21] p-4">
                <p className="text-sm font-semibold">OBS RTMP</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/60">
                  <li>Settings → Stream → Custom</li>
                  <li>
                    Server:{" "}
                    <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">
                      {rtmpServer}
                    </span>
                  </li>
                  <li>Stream key: paste the key above</li>
                  <li>Start streaming</li>
                </ol>
              </div>
              <div className="rounded-lg bg-[#1c1c21] p-4">
                <p className="text-sm font-semibold">How it works</p>
                <p className="mt-2 text-sm text-white/60">
                  OBS appends the key to the server URL, so the final URL is{" "}
                  <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs break-all">
                    {rtmpServer}/{username}?user=…&pass=…
                  </span>{" "}
                  — your username and stream key authenticate the broadcast.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-[#141417] p-5">
            <p className="text-xs font-bold tracking-widest text-white/40 uppercase">
              Stream info
            </p>
            <p className="mt-1 text-sm text-white/50">
              Shown to viewers on your channel and the homepage.
            </p>
            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="stream-title" className="text-xs text-white/40">
                  Title
                </label>
                <input
                  id="stream-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What are you streaming?"
                  className="h-9 w-full rounded-md bg-white/[0.06] px-3 text-sm text-white/90 outline-none placeholder:text-white/30 focus:ring-2 focus:ring-[#53fc18]"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="stream-category" className="text-xs text-white/40">
                  Category
                </label>
                <input
                  id="stream-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Just Chatting"
                  className="h-9 w-full rounded-md bg-white/[0.06] px-3 text-sm text-white/90 outline-none placeholder:text-white/30 focus:ring-2 focus:ring-[#53fc18]"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSaveInfo()}
                disabled={saving}
                className="rounded-lg bg-[#53fc18] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#46d614] disabled:pointer-events-none disabled:opacity-50"
              >
                {saving ? "Saving…" : saved ? "Saved" : "Save"}
              </button>
            </div>
          </div>
        </div>

        <BroadcastDashboard streamKey={streamPath} />
      </div>
    </div>
  )
}
