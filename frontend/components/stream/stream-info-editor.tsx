"use client"

import { IconCheck } from "@tabler/icons-react"
import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { api, type User } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

type StreamInfoEditorProps = {
  className?: string
  compact?: boolean
  onSaved?: () => void
}

type StreamInfoEditorFormProps = {
  user: User
  accessToken: string
  compact: boolean
  className?: string
  onSaved?: () => void
  refreshUser: () => Promise<void>
}

function StreamInfoEditorForm({
  user,
  accessToken,
  compact,
  className,
  onSaved,
  refreshUser,
}: StreamInfoEditorFormProps) {
  const [title, setTitle] = useState(user.stream_title ?? "")
  const [category, setCategory] = useState(user.stream_category ?? "")
  const [description, setDescription] = useState(user.stream_description ?? "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
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

  return (
    <FieldGroup className={className}>
      {!compact ? (
        <FieldDescription>
          Shown to viewers on your channel and browse pages. Updates apply immediately while live.
        </FieldDescription>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="stream-info-title">Title</FieldLabel>
        <Input
          id="stream-info-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you streaming?"
          maxLength={100}
          aria-invalid={!!error}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="stream-info-category">Category</FieldLabel>
        <Input
          id="stream-info-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Just Chatting"
          maxLength={50}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="stream-info-description">Description</FieldLabel>
        <Textarea
          id="stream-info-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell viewers what this stream is about…"
          maxLength={500}
          rows={compact ? 3 : 4}
          className="min-h-0 resize-y"
        />
      </Field>

      <Button type="button" onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Saving…" : saved ? (
          <>
            <IconCheck data-icon="inline-start" />
            Saved
          </>
        ) : (
          "Save stream info"
        )}
      </Button>
    </FieldGroup>
  )
}

export function StreamInfoEditor({ className, compact = false, onSaved }: StreamInfoEditorProps) {
  const { user, accessToken, refreshUser } = useAuth()

  if (!user || !accessToken) return null

  return (
    <StreamInfoEditorForm
      key={user.id}
      user={user}
      accessToken={accessToken}
      compact={compact}
      className={cn(className)}
      onSaved={onSaved}
      refreshUser={refreshUser}
    />
  )
}
