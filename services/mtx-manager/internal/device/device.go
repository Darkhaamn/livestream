package device

import "strings"

func FromUserAgent(userAgent string) string {
	ua := strings.ToLower(userAgent)
	if ua == "" {
		return "Unknown"
	}

	switch {
	case strings.Contains(ua, "iphone"):
		return "iPhone"
	case strings.Contains(ua, "ipad"):
		return "iPad"
	case strings.Contains(ua, "samsung"):
		return "Samsung"
	case strings.Contains(ua, "android"):
		return "Android"
	case strings.Contains(ua, "mac os") || strings.Contains(ua, "macintosh"):
		return "Mac"
	case strings.Contains(ua, "windows"):
		return "Windows"
	case strings.Contains(ua, "linux"):
		return "Linux"
	case strings.Contains(ua, "fmle"), strings.Contains(ua, "obs"), strings.Contains(ua, "ffmpeg"):
		return "Encoder"
	default:
		return "Other"
	}
}
