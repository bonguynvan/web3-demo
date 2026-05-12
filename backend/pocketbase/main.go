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

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/cron"
)

func main() {
	app := pocketbase.New()

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/api/siwe/nonce", siweNonceHandler(app))
		e.Router.POST("/api/siwe/verify", siweVerifyHandler(app))
		e.Router.POST("/api/webhooks/nowpay", nowpayWebhookHandler(app))
		e.Router.GET("/api/me", meHandler(app))
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
