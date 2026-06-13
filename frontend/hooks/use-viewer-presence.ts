"use client"

import { useEffect } from "react"

import { acquireViewerPresence } from "@/lib/viewer-presence"

/** Register as a viewer only while enabled (e.g. stream is live). */
export function useViewerPresence(streamKey: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !streamKey) return
    return acquireViewerPresence(streamKey)
  }, [streamKey, enabled])
}
