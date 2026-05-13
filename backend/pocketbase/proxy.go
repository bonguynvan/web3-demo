// Binance public-data proxy.
//
// Mounted at /api/proxy/binance/* — forwards the request to
// https://api.binance.com unchanged, then stamps a permissive CORS
// header so the SPA can read the response. We only proxy GET +
// OPTIONS because trading endpoints require a signed API key that the
// backend never sees.
//
// Rate limiting is delegated to Binance — they accept ~1200 weight/min
// per IP and the backend IP is one stable origin instead of dozens of
// user IPs, which is the whole point.
package main

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const binanceUpstream = "https://api.binance.com"

func binanceProxyHandler(_ *pocketbase.PocketBase) func(*core.RequestEvent) error {
	target, _ := url.Parse(binanceUpstream)
	rp := httputil.NewSingleHostReverseProxy(target)
	rp.Director = func(req *http.Request) {
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		req.Host = target.Host
		req.URL.Path = strings.TrimPrefix(req.URL.Path, "/api/proxy/binance")
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}
		// Drop browser-injected headers Binance doesn't care about and
		// occasionally trips on (CORS preflight artefacts).
		req.Header.Del("Origin")
		req.Header.Del("Referer")
	}
	rp.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set("Access-Control-Allow-Origin", "*")
		resp.Header.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		resp.Header.Set("Access-Control-Allow-Headers", "Content-Type")
		return nil
	}
	return func(e *core.RequestEvent) error {
		switch e.Request.Method {
		case http.MethodGet, http.MethodOptions:
			rp.ServeHTTP(e.Response, e.Request)
			return nil
		default:
			return e.JSON(http.StatusMethodNotAllowed, map[string]string{
				"error": "only GET supported on the public-data proxy",
			})
		}
	}
}
