"use client"

import { IconPlayerPlay } from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { getVods, type Vod } from "@/lib/mtx-api"

type VodListProps = {
  streamKey: string
  onSelect: (vod: Vod) => void
  activeId?: string | null
  onLoaded?: (count: number) => void
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

function formatStartedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return `${day} · ${time}`
}

export function VodList({ streamKey, onSelect, activeId, onLoaded }: VodListProps) {
  const [vods, setVods] = useState<Vod[]>([])

  useEffect(() => {
    let active = true
    getVods(streamKey)
      .then(data => {
        if (!active) return
        const list = Array.isArray(data) ? data : []
        setVods(list)
        onLoaded?.(list.length)
      })
      .catch(() => {
        if (!active) return
        setVods([])
        onLoaded?.(0)
      })
    return () => {
      active = false
    }
  }, [streamKey])

  if (vods.length === 0) return null

  return (
    <div className="px-4 py-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">
        Past broadcasts
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {vods.map(vod => (
          <button
            key={vod.id}
            onClick={() => onSelect(vod)}
            className={`flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#141417] p-3 text-left transition-colors hover:border-[#53fc18]/40 ${
              activeId === vod.id ? "ring-2 ring-[#53fc18]" : ""
            }`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#53fc18]/10 text-[#53fc18]">
              <IconPlayerPlay className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">
                {formatStartedAt(vod.startedAt)}
              </span>
              <span className="block text-xs text-white/50">{formatBytes(vod.sizeBytes)}</span>
            </span>
            <span className="shrink-0 rounded-md bg-[#eb0400]/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#eb0400]">
              REC
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
