// Admin metrics — GET /api/admin/metrics.
//
// Single-tenant operator dashboard. Authentication is a shared secret
// in the `x-admin-key` header matched against env ADMIN_DASHBOARD_KEY
// using constant-time comparison. No user auth flow needed; the
// secret only ever lives in the operator's browser tab (via the
// SPA's VITE_ADMIN_KEY env at build time).
//
// If ADMIN_DASHBOARD_KEY is unset, the endpoint returns 503 — fail
// closed rather than fail open.
package main

import (
	"crypto/subtle"
	"net/http"
	"os"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type countRow struct {
	N int64 `db:"n"`
}

func adminMetricsHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	expected := os.Getenv("ADMIN_DASHBOARD_KEY")
	return func(e *core.RequestEvent) error {
		if expected == "" {
			return e.JSON(http.StatusServiceUnavailable, map[string]string{
				"error": "admin dashboard not configured",
			})
		}
		got := e.Request.Header.Get("x-admin-key")
		if got == "" {
			got = e.Request.Header.Get("X-Admin-Key")
		}
		if subtle.ConstantTimeCompare([]byte(got), []byte(expected)) != 1 {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "bad admin key"})
		}

		out := map[string]any{
			"generated_at": time.Now().UTC().Format(time.RFC3339),
		}

		// ── Aggregate counts ──────────────────────────────────────────────
		var userCount []countRow
		_ = app.DB().NewQuery(`SELECT COUNT(*) AS n FROM users`).All(&userCount)
		out["users_total"] = countOrZero(userCount)

		var entRows []struct {
			Total      int64 `db:"total"`
			Active     int64 `db:"active"`
			OnTrial    int64 `db:"on_trial"`
			PaidDays   int64 `db:"paid_days"`
			PaygoCount int64 `db:"paygo_count"`
		}
		_ = app.DB().NewQuery(`
			SELECT
				COUNT(*) AS total,
				SUM(CASE WHEN pro_active = TRUE THEN 1 ELSE 0 END) AS active,
				SUM(CASE WHEN pro_active = TRUE AND trial_expires_at > datetime('now') THEN 1 ELSE 0 END) AS on_trial,
				SUM(CASE WHEN pro_active = TRUE AND pro_days_remaining > 0 THEN 1 ELSE 0 END) AS paid_days,
				SUM(CASE WHEN pro_active = TRUE AND paygo_balance_usd > 0 THEN 1 ELSE 0 END) AS paygo_count
			FROM entitlements
		`).All(&entRows)
		if len(entRows) > 0 {
			out["entitlements"] = map[string]int64{
				"total":            entRows[0].Total,
				"pro_active":       entRows[0].Active,
				"on_trial":         entRows[0].OnTrial,
				"paid_days_active": entRows[0].PaidDays,
				"paygo_active":     entRows[0].PaygoCount,
			}
		}

		type invoiceKindRow struct {
			Kind   string  `db:"kind"`
			Count  int64   `db:"count"`
			SumUSD float64 `db:"sum_usd"`
		}
		var invRows []invoiceKindRow
		_ = app.DB().NewQuery(`
			SELECT kind, COUNT(*) AS count, COALESCE(SUM(amount_usd), 0) AS sum_usd
			FROM invoices
			WHERE status = 'paid'
			GROUP BY kind
		`).All(&invRows)
		invoiceByKind := map[string]map[string]any{}
		var revenueTotal float64
		var paidCount int64
		for _, r := range invRows {
			invoiceByKind[r.Kind] = map[string]any{
				"count":   r.Count,
				"sum_usd": r.SumUSD,
			}
			revenueTotal += r.SumUSD
			paidCount += r.Count
		}
		out["revenue_usd"] = revenueTotal
		out["invoices_paid"] = paidCount
		out["invoices_by_kind"] = invoiceByKind

		var proofCounts []struct {
			Count        int64 `db:"count"`
			Contributors int64 `db:"contributors"`
		}
		cutoff := time.Now().Add(-30 * 24 * time.Hour).UTC().Format("2006-01-02 15:04:05.000Z")
		_ = app.DB().NewQuery(`
			SELECT
				COUNT(*) AS count,
				COUNT(DISTINCT device_id) AS contributors
			FROM proof_contributions
			WHERE created > {:c}
		`).Bind(dbx.Params{"c": cutoff}).All(&proofCounts)
		if len(proofCounts) > 0 {
			out["proof_contributions_30d"] = map[string]int64{
				"rows":         proofCounts[0].Count,
				"contributors": proofCounts[0].Contributors,
			}
		}

		// ── Daily trend — last 30 days ────────────────────────────────────
		type dailyCount struct {
			Day string `db:"day"`
			N   int64  `db:"n"`
		}
		type dailyRevenue struct {
			Day string  `db:"day"`
			Sum float64 `db:"sum"`
		}
		var signupsDaily []dailyCount
		_ = app.DB().NewQuery(`
			SELECT substr(created, 1, 10) AS day, COUNT(*) AS n
			FROM users
			WHERE created > {:c}
			GROUP BY day
			ORDER BY day
		`).Bind(dbx.Params{"c": cutoff}).All(&signupsDaily)
		out["signups_daily"] = signupsDaily

		var revenueDaily []dailyRevenue
		_ = app.DB().NewQuery(`
			SELECT substr(paid_at, 1, 10) AS day, COALESCE(SUM(amount_usd), 0) AS sum
			FROM invoices
			WHERE status = 'paid' AND paid_at > {:c}
			GROUP BY day
			ORDER BY day
		`).Bind(dbx.Params{"c": cutoff}).All(&revenueDaily)
		out["revenue_daily"] = revenueDaily

		// ── Recent rows — for operator visibility ─────────────────────────
		type recentUserRow struct {
			ID         string  `db:"id"`
			Wallet     string  `db:"wallet_address"`
			Created    string  `db:"created"`
			ProActive  bool    `db:"pro_active"`
			ProDays    int64   `db:"pro_days_remaining"`
			PaygoUSD   float64 `db:"paygo_balance_usd"`
			TrialExpAt string  `db:"trial_expires_at"`
		}
		var recentUsers []recentUserRow
		_ = app.DB().NewQuery(`
			SELECT u.id, u.wallet_address, u.created,
			       COALESCE(e.pro_active, 0) AS pro_active,
			       COALESCE(e.pro_days_remaining, 0) AS pro_days_remaining,
			       COALESCE(e.paygo_balance_usd, 0) AS paygo_balance_usd,
			       COALESCE(e.trial_expires_at, '') AS trial_expires_at
			FROM users u
			LEFT JOIN entitlements e ON e.user = u.id
			ORDER BY u.created DESC
			LIMIT 25
		`).All(&recentUsers)
		out["recent_users"] = recentUsers

		type recentInvoiceRow struct {
			ID        string  `db:"id"`
			Wallet    string  `db:"wallet_address"`
			Kind      string  `db:"kind"`
			AmountUSD float64 `db:"amount_usd"`
			Status    string  `db:"status"`
			PaidAt    string  `db:"paid_at"`
			Created   string  `db:"created"`
			Currency  string  `db:"pay_currency"`
		}
		var recentInvoices []recentInvoiceRow
		_ = app.DB().NewQuery(`
			SELECT i.id, COALESCE(u.wallet_address, '') AS wallet_address,
			       i.kind, i.amount_usd, i.status,
			       COALESCE(i.paid_at, '') AS paid_at,
			       i.created, COALESCE(i.pay_currency, '') AS pay_currency
			FROM invoices i
			LEFT JOIN users u ON u.id = i.user
			ORDER BY i.created DESC
			LIMIT 25
		`).All(&recentInvoices)
		out["recent_invoices"] = recentInvoices

		type recentProofRow struct {
			ID        string `db:"id"`
			Source    string `db:"source"`
			MarketID  string `db:"market_id"`
			Direction string `db:"direction"`
			Hit       *bool  `db:"hit"`
			ClosedAt  string `db:"closed_at"`
			Created   string `db:"created"`
		}
		var recentProof []recentProofRow
		_ = app.DB().NewQuery(`
			SELECT id, source, market_id, direction,
			       hit, COALESCE(closed_at, '') AS closed_at, created
			FROM proof_contributions
			ORDER BY created DESC
			LIMIT 30
		`).All(&recentProof)
		out["recent_proof"] = recentProof

		// ── Proof aggregates — last 30d ───────────────────────────────────
		type sourceRow struct {
			Source string `db:"source"`
			N      int64  `db:"n"`
			Hits   int64  `db:"hits"`
		}
		var proofBySource []sourceRow
		_ = app.DB().NewQuery(`
			SELECT source, COUNT(*) AS n,
			       SUM(CASE WHEN hit = TRUE THEN 1 ELSE 0 END) AS hits
			FROM proof_contributions
			WHERE created > {:c}
			GROUP BY source
			ORDER BY n DESC
		`).Bind(dbx.Params{"c": cutoff}).All(&proofBySource)
		out["proof_by_source"] = proofBySource

		type marketRow struct {
			Market string `db:"market_id"`
			N      int64  `db:"n"`
		}
		var proofByMarket []marketRow
		_ = app.DB().NewQuery(`
			SELECT market_id, COUNT(*) AS n
			FROM proof_contributions
			WHERE created > {:c}
			GROUP BY market_id
			ORDER BY n DESC
			LIMIT 10
		`).Bind(dbx.Params{"c": cutoff}).All(&proofByMarket)
		out["proof_by_market"] = proofByMarket

		return e.JSON(http.StatusOK, out)
	}
}

func countOrZero(rows []countRow) int64 {
	if len(rows) == 0 {
		return 0
	}
	return rows[0].N
}
