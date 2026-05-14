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

		type invoiceRow struct {
			Kind   string  `db:"kind"`
			Count  int64   `db:"count"`
			SumUSD float64 `db:"sum_usd"`
		}
		var invRows []invoiceRow
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

		var proofRows []struct {
			Count        int64 `db:"count"`
			Contributors int64 `db:"contributors"`
		}
		cutoff := time.Now().Add(-30 * 24 * time.Hour).UTC().Format(time.RFC3339)
		_ = app.DB().NewQuery(`
			SELECT
				COUNT(*) AS count,
				COUNT(DISTINCT device_id) AS contributors
			FROM proof_contributions
			WHERE created > {:c}
		`).Bind(dbx.Params{"c": cutoff}).All(&proofRows)
		if len(proofRows) > 0 {
			out["proof_contributions_30d"] = map[string]int64{
				"rows":         proofRows[0].Count,
				"contributors": proofRows[0].Contributors,
			}
		}

		return e.JSON(http.StatusOK, out)
	}
}

func countOrZero(rows []countRow) int64 {
	if len(rows) == 0 {
		return 0
	}
	return rows[0].N
}
