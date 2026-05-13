// Community proof — POST /api/proof/contribute and GET /api/proof/aggregate.
//
// contribute: SPA forwards an opt-in user's resolved signal rows from
// localStorage. We validate shape (deviceId length, enum membership,
// timestamp parseable + recent), throttle per device_id, and persist
// to proof_contributions.
//
// aggregate: returns network-wide hit-rate per source plus total
// contributor count over the last 30 days. Cheap aggregate SQL.
package main

import (
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const (
	contributeMaxBatch = 100
	contributeRateHour = 200 // rows per device_id per rolling hour
	aggregateWindow    = 30 * 24 * time.Hour
)

var allowedSources = map[string]bool{
	"funding": true, "crossover": true, "rsi": true, "volatility": true,
	"liquidation": true, "news": true, "whale": true, "confluence": true,
}

type contribItem struct {
	Source    string `json:"source"`
	MarketID  string `json:"market_id"`
	Direction string `json:"direction"`
	Hit       bool   `json:"hit"`
	ClosedAt  string `json:"closed_at"` // ISO RFC3339
}

type contribBody struct {
	DeviceID      string        `json:"device_id"`
	Contributions []contribItem `json:"contributions"`
}

func proofContributeHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body contribBody
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
		}
		deviceID := strings.TrimSpace(body.DeviceID)
		if len(deviceID) == 0 || len(deviceID) > 64 {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad device_id"})
		}
		if len(body.Contributions) == 0 {
			return e.JSON(http.StatusOK, map[string]any{"accepted": 0})
		}
		if len(body.Contributions) > contributeMaxBatch {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "batch too large"})
		}

		// Throttle by device_id over the last hour.
		cutoff := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
		existing, _ := app.FindRecordsByFilter(
			"proof_contributions",
			"device_id = {:d} && created > {:c}",
			"-created", contributeRateHour+1, 0,
			map[string]any{"d": deviceID, "c": cutoff},
		)
		if len(existing) >= contributeRateHour {
			return e.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit"})
		}

		col, err := app.FindCollectionByNameOrId("proof_contributions")
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "collection missing"})
		}

		accepted := 0
		now := time.Now().UTC().Format(time.RFC3339)
		for _, c := range body.Contributions {
			if !allowedSources[c.Source] {
				continue
			}
			if c.Direction != "long" && c.Direction != "short" {
				continue
			}
			if len(c.MarketID) == 0 || len(c.MarketID) > 32 {
				continue
			}
			closedAt, err := time.Parse(time.RFC3339, c.ClosedAt)
			if err != nil || time.Since(closedAt) > aggregateWindow {
				continue
			}
			rec := core.NewRecord(col)
			rec.Set("device_id", deviceID)
			rec.Set("source", c.Source)
			rec.Set("market_id", c.MarketID)
			rec.Set("direction", c.Direction)
			rec.Set("hit", c.Hit)
			rec.Set("closed_at", closedAt.UTC().Format(time.RFC3339))
			rec.Set("created", now)
			if err := app.Save(rec); err == nil {
				accepted++
			}
		}
		return e.JSON(http.StatusOK, map[string]any{"accepted": accepted})
	}
}

type aggregateRow struct {
	Source  string  `db:"source" json:"source"`
	Total   int64   `db:"total"  json:"total"`
	Hits    int64   `db:"hits"   json:"hits"`
	HitRate float64 `json:"hit_rate"`
}

func proofAggregateHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		cutoff := time.Now().Add(-aggregateWindow).UTC().Format(time.RFC3339)

		var rows []aggregateRow
		err := app.DB().NewQuery(`
			SELECT
				source AS source,
				COUNT(*) AS total,
				SUM(CASE WHEN hit = TRUE THEN 1 ELSE 0 END) AS hits
			FROM proof_contributions
			WHERE created > {:c}
			GROUP BY source
		`).Bind(dbx.Params{"c": cutoff}).All(&rows)
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		for i := range rows {
			if rows[i].Total > 0 {
				rows[i].HitRate = float64(rows[i].Hits) / float64(rows[i].Total)
			}
		}

		var contributors []struct {
			N int64 `db:"n"`
		}
		_ = app.DB().NewQuery(`
			SELECT COUNT(DISTINCT device_id) AS n
			FROM proof_contributions
			WHERE created > {:c}
		`).Bind(dbx.Params{"c": cutoff}).All(&contributors)

		contribCount := int64(0)
		if len(contributors) > 0 {
			contribCount = contributors[0].N
		}

		return e.JSON(http.StatusOK, map[string]any{
			"window_days":  30,
			"contributors": contribCount,
			"by_source":    rows,
			"generated_at": time.Now().UTC().Format(time.RFC3339),
		})
	}
}
