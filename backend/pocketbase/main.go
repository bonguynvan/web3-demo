// TradingDek backend — PocketBase + SIWE (wallet auth) + NOWPayments webhook.
//
// Boots PocketBase with custom routes layered on top:
//
//   GET  /api/siwe/nonce?address=0x…     → issues a one-time nonce
//   POST /api/siwe/verify                → verifies signature, returns auth token
//   POST /api/webhooks/nowpay            → credits user balance on confirmed payment
//   GET  /api/me                         → returns entitlement + balance for the
//                                          caller (Authorization: Bearer <token>)
//
// All other PocketBase routes (admin UI at /_/, generic CRUD at
// /api/collections/*) are unchanged and protected by collection-level
// rules defined in pb_migrations/.
//
// Cron jobs:
//   - paygo-decrement (daily, 00:05 UTC): deducts $0.10 / active Pro user
//   - siwe-nonce-gc   (every 15 min):     prunes consumed/expired nonces
package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/cron"
)

// corsOrigin returns the SPA origin that's allowed to cross-origin call
// this backend. Production sets it to https://tradingdek.com; dev
// leaves it empty and we fall back to "*" so localhost works.
func corsOrigin() string {
	v := strings.TrimSpace(os.Getenv("CORS_ORIGIN"))
	if v == "" {
		return "*"
	}
	return v
}

func main() {
	app := pocketbase.New()

	origin := corsOrigin()

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// Global CORS — stamps every response and short-circuits
		// preflight OPTIONS requests so the browser doesn't reject
		// cross-origin POSTs from the SPA. Without this, /api/siwe/*
		// and /api/me silently fail in production with no console
		// signal beyond "CORS preflight failed".
		e.Router.BindFunc(func(re *core.RequestEvent) error {
			re.Response.Header().Set("Access-Control-Allow-Origin", origin)
			re.Response.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			re.Response.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
			re.Response.Header().Set("Access-Control-Max-Age", "86400")
			if re.Request.Method == http.MethodOptions {
				re.Response.WriteHeader(http.StatusNoContent)
				return nil
			}
			return re.Next()
		})

		e.Router.GET("/api/siwe/nonce", siweNonceHandler(app))
		e.Router.POST("/api/siwe/verify", siweVerifyHandler(app))
		e.Router.POST("/api/webhooks/nowpay", nowpayWebhookHandler(app))
		e.Router.GET("/api/me", meHandler(app))

		// Public-data proxy — Binance REST endpoints. PB's router uses
		// `{path...}` wildcards to forward anything below this prefix.
		e.Router.GET("/api/proxy/binance/{path...}", binanceProxyHandler(app))
		e.Router.OPTIONS("/api/proxy/binance/{path...}", binanceProxyHandler(app))

		// Community proof — opt-in aggregate. contribute is anonymous
		// (deviceId only); aggregate is fully public + cacheable.
		e.Router.POST("/api/proof/contribute", proofContributeHandler(app))
		e.Router.GET("/api/proof/aggregate", proofAggregateHandler(app))

		// AI signal explainer — Pro-gated Claude call. Rate-limited
		// in-memory at 30 calls/user/hour.
		e.Router.POST("/api/ai/explain", aiExplainHandler(app))

		// Opt-in 14-day trial. Replaces the auto-grant that used to
		// fire on first sign-in.
		e.Router.POST("/api/trial/start", trialStartHandler(app))

		return e.Next()
	})

	scheduler := cron.New()
	scheduler.MustAdd("paygo-decrement", "5 0 * * *", func() {
		if err := dailyPaygoDecrement(app); err != nil {
			log.Printf("paygo decrement failed: %v", err)
		}
	})
	scheduler.MustAdd("siwe-nonce-gc", "*/15 * * * *", func() {
		_ = pruneOldNonces(app)
	})
	scheduler.Start()

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
