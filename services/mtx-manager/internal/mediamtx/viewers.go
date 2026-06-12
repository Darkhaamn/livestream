package mediamtx

import (
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/netutil"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/viewers"
)

func BuildViewers(path string, members []StreamMember, tracked []viewers.TrackedViewer) []StreamMember {
	pathTracked := make([]viewers.TrackedViewer, 0, len(tracked))
	for _, t := range tracked {
		if t.Path == path {
			pathTracked = append(pathTracked, t)
		}
	}

	if len(pathTracked) > 0 {
		out := make([]StreamMember, 0, len(pathTracked))
		for _, t := range pathTracked {
			out = append(out, trackedToMember(t))
		}

		for _, viewer := range viewersFromMembers(members) {
			if netutil.IsPrivateAddr(viewer.RemoteAddr) {
				continue
			}
			out = append(out, viewer)
		}
		return dedupeMembersByID(out)
	}

	mtxViewers := viewersFromMembers(members)
	usedTracked := make(map[string]struct{}, len(tracked))
	out := make([]StreamMember, 0, len(mtxViewers)+len(tracked))

	for _, viewer := range mtxViewers {
		enriched := enrichViewerFromTracked(viewer, tracked, usedTracked)
		out = append(out, enriched)
	}

	for _, trackedViewer := range tracked {
		if trackedViewer.Path != path {
			continue
		}
		if _, ok := usedTracked[trackedViewer.ID]; ok {
			continue
		}
		out = append(out, trackedToMember(trackedViewer))
	}

	return out
}

func enrichViewerFromTracked(
	viewer StreamMember,
	tracked []viewers.TrackedViewer,
	usedTracked map[string]struct{},
) StreamMember {
	if !netutil.IsPrivateAddr(viewer.RemoteAddr) {
		return viewer
	}

	for _, t := range tracked {
		if t.Path != viewer.Path {
			continue
		}
		if t.UserAgent != viewer.UserAgent {
			continue
		}
		if t.IP == "" {
			continue
		}
		viewer.RemoteAddr = t.IP
		usedTracked[t.ID] = struct{}{}
		return viewer
	}

	viewer.RemoteAddr = ""
	return viewer
}

func trackedToMember(tracked viewers.TrackedViewer) StreamMember {
	return StreamMember{
		ID:         tracked.ID,
		Type:       "web",
		State:      "read",
		Path:       tracked.Path,
		RemoteAddr: tracked.IP,
		UserAgent:  tracked.UserAgent,
		Device:     tracked.Device,
	}
}

func dedupeMembersByID(members []StreamMember) []StreamMember {
	seen := make(map[string]struct{}, len(members))
	out := make([]StreamMember, 0, len(members))
	for _, m := range members {
		if _, ok := seen[m.ID]; ok {
			continue
		}
		seen[m.ID] = struct{}{}
		out = append(out, m)
	}
	return out
}
