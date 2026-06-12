package mediamtx

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
	samples    map[string]byteSample
	mu         sync.Mutex
}

func NewClient(baseURL, username, password string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
			Transport: &basicAuthTransport{
				username: username,
				password: password,
				base:     http.DefaultTransport,
			},
		},
		samples: make(map[string]byteSample),
	}
}

type basicAuthTransport struct {
	username string
	password string
	base     http.RoundTripper
}

func (t *basicAuthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	r := req.Clone(req.Context())
	r.SetBasicAuth(t.username, t.password)
	return t.base.RoundTrip(r)
}

func (c *Client) get(path string, dest any) error {
	u, err := url.JoinPath(c.baseURL, path)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Get(u)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("mediamtx %s: %s", resp.Status, string(body))
	}
	if dest == nil {
		return nil
	}
	return json.Unmarshal(body, dest)
}

func (c *Client) Info() (ServerInfo, error) {
	var info ServerInfo
	err := c.get("/v3/info", &info)
	return info, err
}

func (c *Client) ListPaths() (PathList, error) {
	var list PathList
	err := c.get("/v3/paths/list", &list)
	return list, err
}

func (c *Client) GetPath(name string) (Path, error) {
	var path Path
	err := c.get("/v3/paths/get/"+url.PathEscape(name), &path)
	return path, err
}

func (c *Client) ListRTMPConns() (ConnList[RTMPConn], error) {
	var list ConnList[RTMPConn]
	err := c.get("/v3/rtmpconns/list", &list)
	return list, err
}

func (c *Client) ListWebRTCSessions() (ConnList[WebRTCSession], error) {
	var list ConnList[WebRTCSession]
	err := c.get("/v3/webrtcsessions/list", &list)
	return list, err
}

func (c *Client) ListHLSSessions() (ConnList[HLSsession], error) {
	var list ConnList[HLSsession]
	err := c.get("/v3/hlssessions/list", &list)
	return list, err
}

func (c *Client) ListRTSPSessions() (ConnList[RTSPSession], error) {
	var list ConnList[RTSPSession]
	err := c.get("/v3/rtspsessions/list", &list)
	return list, err
}

func (c *Client) bandwidth(key string, inbound, outbound uint64) PathBandwidth {
	now := time.Now()

	c.mu.Lock()
	defer c.mu.Unlock()

	prev, ok := c.samples[key]
	c.samples[key] = byteSample{inbound: inbound, outbound: outbound, at: now}

	bw := PathBandwidth{
		InboundBytes:  inbound,
		OutboundBytes: outbound,
		SampledAt:     now.UTC().Format(time.RFC3339),
	}
	if !ok {
		return bw
	}

	elapsed := now.Sub(prev.at).Seconds()
	if elapsed <= 0 {
		return bw
	}

	bw.InboundMbps = bytesToMbps(inbound-prev.inbound, elapsed)
	bw.OutboundMbps = bytesToMbps(outbound-prev.outbound, elapsed)
	return bw
}

func bytesToMbps(delta uint64, seconds float64) float64 {
	if seconds <= 0 {
		return 0
	}
	return float64(delta) * 8 / seconds / 1_000_000
}

func (c *Client) collectMembers() ([]StreamMember, error) {
	var members []StreamMember

	rtmp, err := c.ListRTMPConns()
	if err != nil {
		return nil, fmt.Errorf("rtmp connections: %w", err)
	}
	for _, item := range rtmp.Items {
		members = append(members, finalizeMember(StreamMember{
			ID:         item.ID,
			Type:       "rtmp",
			State:      item.State,
			Path:       item.Path,
			RemoteAddr: item.RemoteAddr,
			Query:      item.Query,
			User:       item.User,
			UserAgent:  item.UserAgent,
			Created:    item.Created,
		}))
	}

	webrtc, err := c.ListWebRTCSessions()
	if err != nil {
		return nil, fmt.Errorf("webrtc sessions: %w", err)
	}
	for _, item := range webrtc.Items {
		members = append(members, finalizeMember(StreamMember{
			ID:         item.ID,
			Type:       "webrtc",
			State:      item.State,
			Path:       item.Path,
			RemoteAddr: item.RemoteAddr,
			Query:      item.Query,
			User:       item.User,
			UserAgent:  item.UserAgent,
			Created:    item.Created,
		}))
	}

	hls, err := c.ListHLSSessions()
	if err != nil {
		return nil, fmt.Errorf("hls sessions: %w", err)
	}
	for _, item := range hls.Items {
		members = append(members, finalizeMember(StreamMember{
			ID:         item.ID,
			Type:       "hls",
			State:      item.State,
			Path:       item.Path,
			RemoteAddr: item.RemoteAddr,
			Query:      item.Query,
			User:       item.User,
			UserAgent:  item.UserAgent,
			Created:    item.Created,
		}))
	}

	rtsp, err := c.ListRTSPSessions()
	if err != nil {
		return nil, fmt.Errorf("rtsp sessions: %w", err)
	}
	for _, item := range rtsp.Items {
		members = append(members, finalizeMember(StreamMember{
			ID:         item.ID,
			Type:       "rtsp",
			State:      item.State,
			Path:       item.Path,
			RemoteAddr: item.RemoteAddr,
			Query:      item.Query,
			User:       item.User,
			UserAgent:  item.UserAgent,
			Created:    item.Created,
		}))
	}

	return members, nil
}

func mergeStreamMember(a, b StreamMember) StreamMember {
	out := a
	if b.Type != "" {
		out.Type = b.Type
	}
	if b.State != "" {
		out.State = b.State
	}
	if b.Path != "" {
		out.Path = b.Path
	}
	if b.RemoteAddr != "" {
		out.RemoteAddr = b.RemoteAddr
	}
	if b.Query != "" {
		out.Query = b.Query
	}
	if b.User != "" {
		out.User = b.User
	}
	if b.UserAgent != "" {
		out.UserAgent = b.UserAgent
	}
	if b.Created != "" {
		out.Created = b.Created
	}
	if b.Device != "" && b.Device != "Unknown" {
		out.Device = b.Device
	}
	return finalizeMember(out)
}

func finalizeMember(m StreamMember) StreamMember {
	if m.Device == "" {
		m.Device = ParseDevice(m.UserAgent)
	}
	return m
}

func viewersFromMembers(members []StreamMember) []StreamMember {
	viewers := make([]StreamMember, 0)
	for _, m := range members {
		if IsViewer(m) {
			viewers = append(viewers, m)
		}
	}
	return viewers
}

func normalizeReaderType(readerType string) string {
	switch readerType {
	case "hlsSession":
		return "hls"
	case "rtmpConn", "rtmpsConn":
		return "rtmp"
	case "webRTCSession":
		return "webrtc"
	case "rtspSession", "rtspConn", "rtspsSession", "rtspsConn":
		return "rtsp"
	case "srtConn":
		return "srt"
	default:
		return readerType
	}
}

func membersForPath(pathName string, all []StreamMember, readers []PathReader) []StreamMember {
	byID := make(map[string]StreamMember, len(all))
	for _, m := range all {
		if existing, ok := byID[m.ID]; ok {
			byID[m.ID] = mergeStreamMember(existing, m)
			continue
		}
		byID[m.ID] = m
	}

	seen := make(map[string]struct{})
	var out []StreamMember

	for _, m := range all {
		if m.Path != pathName {
			continue
		}
		if _, ok := seen[m.ID]; ok {
			continue
		}
		seen[m.ID] = struct{}{}
		out = append(out, byID[m.ID])
	}

	for _, r := range readers {
		if _, ok := seen[r.ID]; ok {
			continue
		}
		seen[r.ID] = struct{}{}

		if m, ok := byID[r.ID]; ok {
			m.Path = pathName
			if m.State == "" {
				m.State = "read"
			}
			out = append(out, m)
			continue
		}

		out = append(out, finalizeMember(StreamMember{
			ID:    r.ID,
			Type:  normalizeReaderType(r.Type),
			State: "read",
			Path:  pathName,
		}))
	}

	return out
}

func (c *Client) Dashboard() (Dashboard, error) {
	info, err := c.Info()
	if err != nil {
		return Dashboard{}, err
	}

	paths, err := c.ListPaths()
	if err != nil {
		return Dashboard{}, err
	}

	members, err := c.collectMembers()
	if err != nil {
		return Dashboard{}, err
	}

	summaries := make([]PathSummary, 0, len(paths.Items))
	for _, p := range paths.Items {
		pathMembers := membersForPath(p.Name, members, p.Readers)
		summaries = append(summaries, PathSummary{
			Path: p,
			Bandwidth: c.bandwidth(
				"path:"+p.Name,
				p.InboundBytes,
				p.OutboundBytes,
			),
			ViewerCount: CountViewers(pathMembers),
			Members:     pathMembers,
			Viewers:     viewersFromMembers(pathMembers),
		})
	}

	return Dashboard{
		Server:    info,
		Paths:     summaries,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}
