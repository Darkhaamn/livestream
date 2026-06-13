import { cn } from "@/lib/utils"

type ChannelAvatarProps = {
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  size?: "sm" | "md" | "lg"
  live?: boolean
  className?: string
}

const sizeClasses = {
  sm: "size-10 text-sm",
  md: "size-12 text-sm",
  lg: "size-20 text-2xl",
} as const

export function ChannelAvatar({
  username,
  displayName,
  avatarUrl,
  size = "md",
  live = false,
  className = "",
}: ChannelAvatarProps) {
  const label = displayName ?? username
  const initial = label.charAt(0).toUpperCase()
  const ring = live ? "ring-2 ring-primary" : "ring-1 ring-border"

  if (avatarUrl) {
    return (
      <span
        className={cn(
          "relative block shrink-0 overflow-hidden rounded-full bg-muted",
          sizeClasses[size],
          ring,
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={label} className="size-full object-cover" />
      </span>
    )
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-muted to-card font-bold text-primary-text",
        sizeClasses[size],
        ring,
        className
      )}
    >
      {initial}
    </span>
  )
}
