export type StreamDisplay = {
  title: string
  channel: string
  avatar: string
}

export function parseStreamDisplay(streamKey: string): StreamDisplay {
  const parts = streamKey.split("/").filter(Boolean)
  const title = parts.length > 1 ? parts[parts.length - 1]! : streamKey
  const channel = parts.length > 1 ? parts.slice(0, -1).join("/") : streamKey

  const avatar =
    title.length >= 2
      ? `${title[0]}${title[title.length - 1]}`.toUpperCase()
      : title.slice(0, 2).toUpperCase() || "LS"

  return { title, channel, avatar }
}
