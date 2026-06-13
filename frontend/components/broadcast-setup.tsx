"use client"

import {
  IconActivity,
  IconBroadcast,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconSettings,
  IconUser,
} from "@tabler/icons-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import BroadcastLiveStats from "@/components/broadcast-live-stats"
import BroadcastStability from "@/components/broadcast-stability"
import { StreamInfoEditor } from "@/components/stream/stream-info-editor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { getBroadcastConfig, getPath } from "@/lib/mtx-api"
import type { BroadcastConfig } from "@/lib/mtx-types"

function CopyField({
  label,
  value,
  mask = false,
}: {
  label: string
  value: string
  mask?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const masked = mask && !revealed

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup className="h-9 font-mono">
        <InputGroupInput
          readOnly
          type={masked ? "password" : "text"}
          value={value}
        />
        {mask ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-sm"
              onClick={() => setRevealed((r) => !r)}
              aria-label={revealed ? "Hide" : "Reveal"}
            >
              {revealed ? <IconEyeOff /> : <IconEye />}
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-sm"
            variant={copied ? "default" : "ghost"}
            onClick={() => void handleCopy()}
            aria-label={copied ? "Copied" : "Copy"}
          >
            {copied ? <IconCheck /> : <IconCopy />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}

function SetupStep({
  step,
  title,
  children,
}: {
  step: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary-text">
        {step}
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-2 font-semibold text-foreground">{title}</p>
        {children}
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
  const [streamKeyOverride, setStreamKeyOverride] = useState<string | null>(
    null
  )
  const [fallbackStreamKey, setFallbackStreamKey] = useState("")
  const [isLive, setIsLive] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getBroadcastConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [])

  useEffect(() => {
    if (!user || user.stream_key || !accessToken) return
    let active = true
    void api.users
      .me(accessToken)
      .then((me) => {
        if (active) setFallbackStreamKey(me.stream_key ?? "")
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [user, accessToken])

  const streamKey = streamKeyOverride ?? user?.stream_key ?? fallbackStreamKey

  const username = user?.username ?? ""
  const streamPath = `live/${username}`

  useEffect(() => {
    if (!user) return
    let active = true

    async function pollLive() {
      try {
        const data = await getPath(streamPath)
        if (active) setIsLive(data.online)
      } catch {
        if (active) setIsLive(false)
      }
    }

    void pollLive()
    const timer = window.setInterval(() => void pollLive(), 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [user, streamPath])

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-24 md:px-6">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/15">
              <IconBroadcast className="size-7 text-primary-text" />
            </div>
            <CardTitle>Log in to stream</CardTitle>
            <CardDescription>
              Your stream key and creator tools are tied to your account.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const rtmpServer = deriveRtmpServer(config?.rtmpUrl)
  const obsStreamKey = streamKey
    ? `${username}?user=${username}&pass=${streamKey}`
    : ""

  async function handleRegenerate() {
    if (!accessToken) return
    setRegenerating(true)
    try {
      const { stream_key } = await api.users.regenerateStreamKey(accessToken)
      setStreamKeyOverride(stream_key)
      await refreshUser()
      setStreamKeyOverride(null)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to regenerate stream key"
      )
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="min-h-full">
      <div className="border-b border-border bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/20">
                <IconBroadcast className="size-6 text-primary-text" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                    Creator Studio
                  </h1>
                  {isLive ? (
                    <Badge className="gap-1.5 bg-primary/15 text-primary-text hover:bg-primary/15">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                        <span className="relative inline-flex size-2 rounded-full bg-primary" />
                      </span>
                      Live
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Offline</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Monitor stream health and configure your encoder
                </p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {streamPath}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/${username}`}>
                  <IconUser className="size-4" data-icon="inline-start" />
                  Channel
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/watch/${encodeURIComponent(streamPath)}`}>
                  <IconExternalLink
                    className="size-4"
                    data-icon="inline-start"
                  />
                  Preview
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs defaultValue="status" className="w-full">
          <TabsList className="mb-2 grid h-10 w-full max-w-md grid-cols-2">
            <TabsTrigger value="status" className="gap-2">
              <IconActivity className="size-4" />
              Status
            </TabsTrigger>
            <TabsTrigger value="setup" className="gap-2">
              <IconSettings className="size-4" />
              Setup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="mt-6 flex flex-col gap-6">
            <BroadcastStability streamKey={streamPath} isLive={isLive} />

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Stream info</CardTitle>
                  <CardDescription>
                    Title, category, and description shown on your channel and
                    live page.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StreamInfoEditor compact />
                </CardContent>
              </Card>

              <BroadcastLiveStats streamKey={streamPath} />
            </div>
          </TabsContent>

          <TabsContent value="setup" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle>OBS credentials</CardTitle>
                    <CardDescription className="mt-1.5">
                      Paste these into OBS → Settings → Stream → Custom
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRegenerate()}
                    disabled={regenerating}
                  >
                    {regenerating ? "Regenerating…" : "Regenerate key"}
                  </Button>
                </CardHeader>
                <CardContent className="flex flex-col gap-8">
                  <SetupStep step={1} title="Copy RTMP server">
                    <CopyField label="Server URL" value={rtmpServer} />
                  </SetupStep>

                  <SetupStep step={2} title="Copy stream key">
                    <CopyField
                      label="Stream key"
                      value={
                        obsStreamKey || "No stream key — click Regenerate key"
                      }
                      mask={Boolean(obsStreamKey)}
                    />
                  </SetupStep>

                  <SetupStep step={3} title="Start streaming in OBS">
                    <p className="text-sm text-muted-foreground">
                      Click{" "}
                      <strong className="font-medium text-foreground">
                        Start Streaming
                      </strong>{" "}
                      in OBS. Your dashboard will switch to Live within a few
                      seconds.
                    </p>
                  </SetupStep>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quick reference</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                    <div>
                      <p className="text-xs font-medium tracking-wide text-foreground uppercase">
                        Stream path
                      </p>
                      <p className="mt-1 font-mono text-xs">{streamPath}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium tracking-wide text-foreground uppercase">
                        Full ingest URL
                      </p>
                      <p className="mt-1 font-mono text-xs break-all">
                        {rtmpServer}/{username}?user=…&pass=…
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-primary/20 bg-primary/[0.04]">
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-foreground">Tip</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Keep your stream key private. Regenerate it if you think
                      it was exposed.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
