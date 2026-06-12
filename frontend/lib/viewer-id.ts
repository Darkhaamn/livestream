const STORAGE_KEY = "livestream-viewer-id"

export function getViewerId() {
  if (typeof window === "undefined") {
    return ""
  }

  const existing = window.sessionStorage.getItem(STORAGE_KEY)
  if (existing) {
    return existing
  }

  const id = crypto.randomUUID()
  window.sessionStorage.setItem(STORAGE_KEY, id)
  return id
}
