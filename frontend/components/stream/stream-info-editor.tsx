"use client"

import { useEffect, useState } from "react"

import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

type StreamInfoEditorProps = {
  className?: string
  compact?: boolean
  onSaved?: () => void
}

export function StreamInfoEditor({ className, compact = false, onSaved }: StreamInfoEditorProps) {
  const { user, accessToken, refreshUser } = useAuth()
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setTitle(user.stream_title ?? "")
    setCategory(user.stream_category ?? "")
    setDescription(user.stream_description ?? "")
  }, [user])

  async function handleSave() {
    if (!accessToken) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await api.users.updateMe(accessToken, {
        stream_title: title.trim() || "Live Stream",
        stream_category: category.trim() || "Just Chatting",
        stream_description: description.trim(),
      })
      await refreshUser()
      setSaved(true)
      onSaved?.()
      window.setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className={cn("space-y-4", className)}>
      {!compact ? (
        <p className="text-sm text-muted-foreground">
          Shown to viewers on your channel and browse pages. Updates apply immediately while live.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="stream-info-title" className="text-xs font-medium text-muted-foreground">
            Title
          </label>
          <input
            id="stream-info-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you streaming?"
            maxLength={100}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="stream-info-category" className="text-xs font-medium text-muted-foreground">
            Category
          </label>
          <input
            id="stream-info-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Just Chatting"
            maxLength={50}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="stream-info-description" className="text-xs font-medium text-muted-foreground">
            Description
          </label>
          <textarea
            id="stream-info-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell viewers what this stream is about…"
            maxLength={500}
            rows={compact ? 3 : 4}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save stream info"}
      </button>
    </div>
  )
}
