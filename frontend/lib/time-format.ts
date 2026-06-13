export function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const ms = Date.now() - date.getTime()
  if (Number.isNaN(ms) || ms < 0) return ""

  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function formatSessionDuration(session: { started_at: string; ended_at: string | null }): string | null {
  if (!session.ended_at) return null
  const start = new Date(session.started_at).getTime()
  const end = new Date(session.ended_at).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null

  const totalSeconds = Math.floor((end - start) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
