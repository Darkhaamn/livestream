package mediamtx

import "github.com/darkhanbayarerdenebat/mtx-manager/internal/device"

func ParseDevice(userAgent string) string {
	return device.FromUserAgent(userAgent)
}

func IsViewer(member StreamMember) bool {
	return member.State != "publish"
}

func CountViewers(members []StreamMember) int {
	count := 0
	for _, m := range members {
		if IsViewer(m) {
			count++
		}
	}
	return count
}
