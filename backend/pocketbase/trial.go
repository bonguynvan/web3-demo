// Trial activation — POST /api/trial/start.
//
// The 14-day Pro trial is no longer auto-granted on sign-in (see
// siwe.go). The user must explicitly opt in here. Rationale (per
// memory/project_outcome_gated_funnel.md): a calendar trial that
// runs while users are still figuring out the product wastes their
// entitlement. Opt-in means the trial starts when they actually want
// to test Pro features.
//
// One-shot. Subsequent calls return 409 conflict.
package main

import (
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const trialBaseDays = 14

func trialStartHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		user := e.Auth
		if user == nil {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "sign in required"})
		}
		ent, err := app.FindFirstRecordByFilter(
			"entitlements", "user = {:u}",
			map[string]any{"u": user.Id},
		)
		if err != nil || ent == nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "entitlement missing"})
		}
		if !ent.GetDateTime("trial_expires_at").Time().IsZero() {
			return e.JSON(http.StatusConflict, map[string]string{
				"error": "trial already started",
			})
		}
		ent.Set("trial_expires_at", types.NowDateTime().Add(time.Duration(trialBaseDays)*24*time.Hour))
		ent.Set("pro_active", true)
		ent.Set("last_decrement_at", types.NowDateTime())
		if err := app.Save(ent); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		return e.JSON(http.StatusOK, map[string]any{
			"trial_expires_at":   ent.GetDateTime("trial_expires_at").String(),
			"pro_days_remaining": ent.GetInt("pro_days_remaining"),
			"pro_active":         true,
		})
	}
}
