// NOWPayments IPN webhook + entitlement bookkeeping.
//
// NOWPayments POSTs payment.* events to /api/webhooks/nowpay with an
// HMAC-SHA512 signature in the `x-nowpayments-sig` header. The body is
// JSON; the signature is computed over the JSON re-emitted with keys
// sorted alphabetically (NOWPayments' specific quirk).
//
// We verify the signature, parse the event, and on payment_status ==
// "finished" / "confirmed" credit the user via creditEntitlement().
//
// Invoice "kind" → entitlement effect:
//
//   paygo_topup → paygo_balance_usd += amount_usd
//   sub_30      → pro_days_remaining += 30
//   sub_180     → pro_days_remaining += 180
//   sub_365     → pro_days_remaining += 365
//
// The kind is set when the SPA creates the invoice (via the NOWPayments
// REST API) and round-tripped in the `order_id` field, formatted as
// "<userId>:<kind>", so we don't need a server-side pending table
// beyond the invoices collection itself.
package main

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const paygoDailyRate = 0.10 // USD/day burned while Pro is active

type nowpayEvent struct {
	PaymentID     any     `json:"payment_id"`
	PaymentStatus string  `json:"payment_status"`
	PayCurrency   string  `json:"pay_currency"`
	OrderID       string  `json:"order_id"` // "<userId>:<kind>"
	PriceAmount   float64 `json:"price_amount"`
}

func nowpayWebhookHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	secret := os.Getenv("NOWPAY_IPN_SECRET")
	return func(e *core.RequestEvent) error {
		body, err := io.ReadAll(e.Request.Body)
		if err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "read failed"})
		}
		_ = e.Request.Body.Close()

		got := e.Request.Header.Get("x-nowpayments-sig")
		if got == "" {
			got = e.Request.Header.Get("X-Nowpayments-Sig")
		}
		if secret != "" {
			if !verifyNowpaySig(body, got, secret) {
				return e.JSON(http.StatusUnauthorized, map[string]string{"error": "bad signature"})
			}
		}

		var ev nowpayEvent
		if err := json.Unmarshal(body, &ev); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad json"})
		}

		credit := ev.PaymentStatus == "finished" || ev.PaymentStatus == "confirmed"
		if err := upsertInvoice(app, &ev, credit); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		return e.JSON(http.StatusOK, map[string]string{"ok": "1"})
	}
}

func verifyNowpaySig(body []byte, gotHex, secret string) bool {
	var generic map[string]any
	if err := json.Unmarshal(body, &generic); err != nil {
		return false
	}
	canonical, err := canonicalJSON(generic)
	if err != nil {
		return false
	}
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(canonical)
	want := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal(
		[]byte(strings.ToLower(strings.TrimSpace(gotHex))),
		[]byte(want),
	)
}

func canonicalJSON(v any) ([]byte, error) {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var b strings.Builder
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			kb, _ := json.Marshal(k)
			b.Write(kb)
			b.WriteByte(':')
			child, err := canonicalJSON(t[k])
			if err != nil {
				return nil, err
			}
			b.Write(child)
		}
		b.WriteByte('}')
		return []byte(b.String()), nil
	case []any:
		var b strings.Builder
		b.WriteByte('[')
		for i, child := range t {
			if i > 0 {
				b.WriteByte(',')
			}
			c, err := canonicalJSON(child)
			if err != nil {
				return nil, err
			}
			b.Write(c)
		}
		b.WriteByte(']')
		return []byte(b.String()), nil
	default:
		return json.Marshal(v)
	}
}

func upsertInvoice(app *pocketbase.PocketBase, ev *nowpayEvent, credit bool) error {
	parts := strings.SplitN(ev.OrderID, ":", 2)
	if len(parts) != 2 {
		return nil
	}
	userID, kind := parts[0], parts[1]
	paymentIDStr := toString(ev.PaymentID)

	col, err := app.FindCollectionByNameOrId("invoices")
	if err != nil {
		return err
	}
	inv, _ := app.FindFirstRecordByFilter(
		"invoices", "nowpay_invoice_id = {:id}",
		map[string]any{"id": paymentIDStr},
	)
	if inv == nil {
		inv = core.NewRecord(col)
		inv.Set("nowpay_invoice_id", paymentIDStr)
		inv.Set("user", userID)
		inv.Set("kind", kind)
		inv.Set("amount_usd", ev.PriceAmount)
	}
	inv.Set("status", normalizedStatus(ev.PaymentStatus))
	inv.Set("pay_currency", ev.PayCurrency)
	if credit {
		inv.Set("paid_at", types.NowDateTime())
	}
	if err := app.Save(inv); err != nil {
		return err
	}
	if credit {
		return creditEntitlement(app, userID, kind, ev.PriceAmount)
	}
	return nil
}

func normalizedStatus(s string) string {
	switch s {
	case "finished", "confirmed":
		return "paid"
	case "expired", "failed", "refunded":
		return "expired"
	default:
		return "pending"
	}
}

func creditEntitlement(app *pocketbase.PocketBase, userID, kind string, amount float64) error {
	ent, _ := app.FindFirstRecordByFilter(
		"entitlements", "user = {:u}",
		map[string]any{"u": userID},
	)
	if ent == nil {
		col, err := app.FindCollectionByNameOrId("entitlements")
		if err != nil {
			return err
		}
		ent = core.NewRecord(col)
		ent.Set("user", userID)
		ent.Set("pro_days_remaining", 0)
		ent.Set("paygo_balance_usd", 0)
		ent.Set("pro_active", true)
		ent.Set("last_decrement_at", types.NowDateTime())
	}
	switch kind {
	case "paygo_topup":
		ent.Set("paygo_balance_usd", ent.GetFloat("paygo_balance_usd")+amount)
	case "sub_30":
		ent.Set("pro_days_remaining", ent.GetInt("pro_days_remaining")+30)
	case "sub_180":
		ent.Set("pro_days_remaining", ent.GetInt("pro_days_remaining")+180)
	case "sub_365":
		ent.Set("pro_days_remaining", ent.GetInt("pro_days_remaining")+365)
	}
	return app.Save(ent)
}

func meHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		user := e.Auth
		if user == nil {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "not authenticated"})
		}
		ent, _ := app.FindFirstRecordByFilter(
			"entitlements", "user = {:u}",
			map[string]any{"u": user.Id},
		)
		resp := map[string]any{
			"user": map[string]any{
				"id":             user.Id,
				"wallet_address": user.GetString("wallet_address"),
			},
			"pro_active":         false,
			"pro_days_remaining": 0,
			"paygo_balance_usd":  0.0,
			"trial_expires_at":   nil,
		}
		if ent != nil {
			resp["pro_active"] = ent.GetBool("pro_active")
			resp["pro_days_remaining"] = ent.GetInt("pro_days_remaining")
			resp["paygo_balance_usd"] = ent.GetFloat("paygo_balance_usd")
			resp["trial_expires_at"] = ent.GetDateTime("trial_expires_at").String()
		}
		return e.JSON(http.StatusOK, resp)
	}
}

// dailyPaygoDecrement runs once per day. For every entitlement with
// pro_active=true:
//   - If still on trial → skip (touch last_decrement_at only).
//   - Else if pro_days_remaining > 0 → consume one.
//   - Else if paygo_balance_usd >= paygoDailyRate → deduct.
//   - Otherwise → flip pro_active=false.
func dailyPaygoDecrement(app *pocketbase.PocketBase) error {
	ents, err := app.FindRecordsByFilter(
		"entitlements", "pro_active = true", "", 1000, 0, nil,
	)
	if err != nil {
		return err
	}
	now := time.Now()
	for _, ent := range ents {
		trialExp := ent.GetDateTime("trial_expires_at").Time()
		stillOnTrial := !trialExp.IsZero() && now.Before(trialExp)
		if stillOnTrial {
			ent.Set("last_decrement_at", types.NowDateTime())
			_ = app.Save(ent)
			continue
		}
		days := ent.GetInt("pro_days_remaining")
		bal := ent.GetFloat("paygo_balance_usd")
		switch {
		case days > 0:
			ent.Set("pro_days_remaining", days-1)
		case bal >= paygoDailyRate:
			ent.Set("paygo_balance_usd", bal-paygoDailyRate)
		default:
			ent.Set("pro_active", false)
		}
		ent.Set("last_decrement_at", types.NowDateTime())
		_ = app.Save(ent)
	}
	return nil
}

func toString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		out, _ := json.Marshal(t)
		return string(out)
	default:
		out, _ := json.Marshal(v)
		return string(out)
	}
}
