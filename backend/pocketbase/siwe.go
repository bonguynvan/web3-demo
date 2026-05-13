// SIWE-lite wallet authentication for PocketBase.
//
// Flow:
//
//   1. SPA calls GET /api/siwe/nonce?address=0xabc…
//      Backend stores (nonce, wallet_address, created) in siwe_nonces.
//
//   2. SPA prompts the user to sign an EIP-191 personal_sign message:
//
//        Sign in to TradingDek
//
//        address: 0xabc…
//        nonce: <nonce>
//        issued: <unix-ms>
//
//   3. SPA POSTs /api/siwe/verify with {address, message, signature}.
//      Backend looks up + burns the nonce, recovers the signer with
//      go-ethereum, checks recovered == claimed, finds/creates a users
//      row with that wallet_address, and returns a fresh PB auth token.
//
// We deliberately keep the message format simple (not full EIP-4361).
// The nonce is the security primitive; the message shape is informative
// for the wallet prompt, not load-bearing for verification.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	nonceTTL     = 5 * time.Minute
	nonceByteLen = 16
	trialDays    = 14
)

func siweNonceHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		address := strings.ToLower(strings.TrimSpace(e.Request.URL.Query().Get("address")))
		if !looksLikeAddress(address) {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid address"})
		}
		nonce, err := randomNonce()
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "nonce gen failed"})
		}
		col, err := app.FindCollectionByNameOrId("siwe_nonces")
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "collection missing"})
		}
		rec := core.NewRecord(col)
		rec.Set("nonce", nonce)
		rec.Set("wallet_address", address)
		rec.Set("created", time.Now().UTC().Format(time.RFC3339))
		if err := app.Save(rec); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "nonce store failed"})
		}
		return e.JSON(http.StatusOK, map[string]any{
			"nonce":   nonce,
			"expires": time.Now().Add(nonceTTL).Unix(),
		})
	}
}

type verifyBody struct {
	Address   string `json:"address"`
	Message   string `json:"message"`
	Signature string `json:"signature"`
	// Optional userId of the referrer captured by the SPA from ?ref=…
	// First-sign-in only — extends the trial by referralBonusDays for
	// both the new user and the referrer.
	Referrer string `json:"referrer,omitempty"`
}

const referralBonusDays = 7

func siweVerifyHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body verifyBody
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
		}
		address := strings.ToLower(strings.TrimSpace(body.Address))
		if !looksLikeAddress(address) {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid address"})
		}
		nonce, err := extractNonce(body.Message)
		if err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "missing nonce in message"})
		}

		// Look up and burn the nonce — single use, must match the
		// claimed address, and must be younger than nonceTTL.
		nonceRec, err := app.FindFirstRecordByFilter(
			"siwe_nonces",
			"nonce = {:nonce} && wallet_address = {:addr}",
			map[string]any{"nonce": nonce, "addr": address},
		)
		if err != nil || nonceRec == nil {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "unknown nonce"})
		}
		if created, err := time.Parse(time.RFC3339, nonceRec.GetString("created")); err == nil {
			if time.Since(created) > nonceTTL {
				_ = app.Delete(nonceRec)
				return e.JSON(http.StatusUnauthorized, map[string]string{"error": "nonce expired"})
			}
		}
		_ = app.Delete(nonceRec)

		recovered, err := recoverSigner(body.Message, body.Signature)
		if err != nil {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "signature recovery failed"})
		}
		if !strings.EqualFold(recovered, address) {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "signature mismatch"})
		}

		user, err := findOrCreateUser(app, address, body.Referrer)
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "user upsert failed: " + err.Error()})
		}
		token, err := user.NewAuthToken()
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "token mint failed"})
		}
		return e.JSON(http.StatusOK, map[string]any{
			"token": token,
			"user": map[string]any{
				"id":             user.Id,
				"wallet_address": user.GetString("wallet_address"),
			},
		})
	}
}

func pruneOldNonces(app *pocketbase.PocketBase) error {
	cutoff := time.Now().Add(-nonceTTL).UTC().Format(time.RFC3339)
	stale, err := app.FindRecordsByFilter(
		"siwe_nonces", "created < {:cutoff}", "-created", 500, 0,
		map[string]any{"cutoff": cutoff},
	)
	if err != nil {
		return err
	}
	for _, r := range stale {
		_ = app.Delete(r)
	}
	return nil
}

// --- helpers ---

func looksLikeAddress(a string) bool {
	return strings.HasPrefix(a, "0x") && len(a) == 42 && common.IsHexAddress(a)
}

func randomNonce() (string, error) {
	buf := make([]byte, nonceByteLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func extractNonce(msg string) (string, error) {
	for _, line := range strings.Split(msg, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "nonce:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "nonce:")), nil
		}
	}
	return "", errors.New("nonce line not found")
}

// recoverSigner implements EIP-191 personal_sign recovery.
func recoverSigner(message, sigHex string) (string, error) {
	sigHex = strings.TrimPrefix(sigHex, "0x")
	sig, err := hex.DecodeString(sigHex)
	if err != nil {
		return "", err
	}
	if len(sig) != 65 {
		return "", fmt.Errorf("bad signature length %d", len(sig))
	}
	if sig[64] >= 27 {
		sig[64] -= 27
	}
	prefixed := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(message), message)
	hash := crypto.Keccak256([]byte(prefixed))
	pub, err := crypto.SigToPub(hash, sig)
	if err != nil {
		return "", err
	}
	return strings.ToLower(crypto.PubkeyToAddress(*pub).Hex()), nil
}

// findOrCreateUser returns the users record for the given wallet_address,
// minting a fresh row + a 14-day trial entitlement on first sign-in.
//
// When `referrer` is a valid user id (and the new user is genuinely
// fresh), both parties get +referralBonusDays added to their trial
// window. Self-referrals are silently ignored.
func findOrCreateUser(app *pocketbase.PocketBase, address, referrer string) (*core.Record, error) {
	user, err := app.FindFirstRecordByFilter(
		"users", "wallet_address = {:addr}",
		map[string]any{"addr": address},
	)
	if err == nil && user != nil {
		return user, nil
	}
	usersCol, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return nil, err
	}
	user = core.NewRecord(usersCol)
	// PB auth collections require email — synthesize a stable, never-mailed
	// value tied to the wallet address. SIWE users never receive mail.
	user.SetEmail(address + "@wallet.local")
	user.SetVerified(true)
	user.Set("wallet_address", address)
	user.Set("name", short(address))
	if err := user.SetRandomPassword(); err != nil {
		return nil, err
	}
	if err := app.Save(user); err != nil {
		return nil, err
	}

	// Compute trial length — base 14 days + referral bonus when applicable.
	bonus := 0
	validReferrer := referrer != "" && referrer != user.Id
	if validReferrer {
		// Confirm referrer exists before crediting — silently no-op on
		// invalid/forged ids rather than 500-ing the sign-in.
		if r, _ := app.FindRecordById("users", referrer); r != nil {
			bonus = referralBonusDays
			extendReferrerTrial(app, referrer, referralBonusDays)
		} else {
			validReferrer = false
		}
	}

	entCol, err := app.FindCollectionByNameOrId("entitlements")
	if err != nil {
		return nil, err
	}
	ent := core.NewRecord(entCol)
	ent.Set("user", user.Id)
	ent.Set("pro_days_remaining", 0)
	ent.Set("paygo_balance_usd", 0)
	ent.Set("pro_active", true)
	ent.Set("trial_expires_at", types.NowDateTime().Add(time.Duration(trialDays+bonus)*24*time.Hour))
	ent.Set("last_decrement_at", types.NowDateTime())
	if err := app.Save(ent); err != nil {
		return nil, err
	}
	return user, nil
}

// extendReferrerTrial pushes the referrer's trial_expires_at forward by
// `days`. If the referrer's existing trial has already lapsed (or was
// never set) we set it to now + days so they get a fresh window. Errors
// are non-fatal — referral credit is best-effort.
func extendReferrerTrial(app *pocketbase.PocketBase, referrerUserID string, days int) {
	ent, _ := app.FindFirstRecordByFilter(
		"entitlements", "user = {:u}",
		map[string]any{"u": referrerUserID},
	)
	if ent == nil {
		return
	}
	add := time.Duration(days) * 24 * time.Hour
	now := time.Now()
	current := ent.GetDateTime("trial_expires_at").Time()
	var next time.Time
	if current.After(now) {
		next = current.Add(add)
	} else {
		next = now.Add(add)
	}
	ent.Set("trial_expires_at", next.UTC().Format(time.RFC3339))
	ent.Set("pro_active", true)
	_ = app.Save(ent)
}

func short(a string) string {
	if len(a) < 10 {
		return a
	}
	return a[:6] + "…" + a[len(a)-4:]
}
