import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type LiveBadgeProps = {
  className?: string
  size?: "sm" | "md"
}

export function LiveBadge({ className, size = "md" }: LiveBadgeProps) {
  return (
    <Badge
      className={cn(
        "rounded-sm border-0 bg-[#eb0400] font-bold text-white uppercase hover:bg-[#eb0400]",
        size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-1.5 py-0.5 text-xs",
        className
      )}
    >
      Live
    </Badge>
  )
}
