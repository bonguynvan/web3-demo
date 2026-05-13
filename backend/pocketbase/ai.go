// AI signal explainer — POST /api/ai/explain.
//
// Authenticated, Pro-gated, rate-limited Claude call. The SPA sends a
// signal context; we hand it to Claude with a tight system prompt
// that demands a two-sentence explanation + a one-line risk note.
// We never invent numbers — only echo the data we received.
//
// Cost model (claude-haiku-4-5):
//   ~$0.001/call (500 tok in, 100 tok out)
//   30 calls/user/hour cap → max $0.03/user/hour
//
// Rate-limit is in-memory per process. For a single-instance Coolify
// deploy that's fine; horizontal scaling would want Redis.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const (
	anthropicURL     = "https://api.anthropic.com/v1/messages"
	anthropicVersion = "2023-06-01"
	defaultAIModel   = "claude-haiku-4-5"
	aiRateWindow     = time.Hour
	aiRateLimit      = 30
	aiMaxTokens      = 200
)

const aiSystemPrompt = `You are TradingDek's signal explainer. The user just saw a market signal fire. Explain in plain English why this signal might matter, then give one specific risk to watch.

Rules:
- Exactly 2 sentences for the explanation, exactly 1 sentence for the risk.
- Never invent numbers, percentages, or outcomes — only reason from the data given.
- Never give financial advice or recommend buying/selling.
- Be direct and concrete; do not hedge unnecessarily.
- Output strictly valid JSON: {"explanation": string, "risk": string}.`

type explainBody struct {
	Source     string   `json:"source"`
	MarketID   string   `json:"market_id"`
	Direction  string   `json:"direction"`
	Confidence float64  `json:"confidence"`
	Title      string   `json:"title"`
	Detail     string   `json:"detail"`
	Price      *float64 `json:"price,omitempty"`
	Change24h  *float64 `json:"change_24h,omitempty"`
}

type explainResponse struct {
	Explanation string `json:"explanation"`
	Risk        string `json:"risk"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

var (
	aiRateMu    sync.Mutex
	aiRateCalls = map[string][]time.Time{}
)

func checkAIRate(userID string) bool {
	aiRateMu.Lock()
	defer aiRateMu.Unlock()
	cutoff := time.Now().Add(-aiRateWindow)
	calls := aiRateCalls[userID]
	fresh := calls[:0]
	for _, t := range calls {
		if t.After(cutoff) {
			fresh = append(fresh, t)
		}
	}
	if len(fresh) >= aiRateLimit {
		aiRateCalls[userID] = fresh
		return false
	}
	aiRateCalls[userID] = append(fresh, time.Now())
	return true
}

func aiExplainHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		model = defaultAIModel
	}
	return func(e *core.RequestEvent) error {
		if apiKey == "" {
			return e.JSON(http.StatusServiceUnavailable, map[string]string{
				"error": "AI explainer not configured",
			})
		}
		user := e.Auth
		if user == nil {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "sign in required"})
		}

		ent, _ := app.FindFirstRecordByFilter(
			"entitlements", "user = {:u}",
			map[string]any{"u": user.Id},
		)
		if ent == nil || !ent.GetBool("pro_active") {
			return e.JSON(http.StatusPaymentRequired, map[string]string{"error": "Pro required"})
		}
		if !checkAIRate(user.Id) {
			return e.JSON(http.StatusTooManyRequests, map[string]string{
				"error": "rate limit (30/hour)",
			})
		}

		var body explainBody
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
		}
		if body.Source == "" || body.MarketID == "" || body.Direction == "" {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "missing fields"})
		}

		userPrompt := buildAIUserPrompt(&body)
		out, err := callAnthropic(apiKey, model, userPrompt)
		if err != nil {
			return e.JSON(http.StatusBadGateway, map[string]string{"error": err.Error()})
		}
		return e.JSON(http.StatusOK, out)
	}
}

func buildAIUserPrompt(b *explainBody) string {
	var s strings.Builder
	s.WriteString("Signal:\n")
	s.WriteString("- Source: " + b.Source + "\n")
	s.WriteString("- Market: " + b.MarketID + "\n")
	s.WriteString("- Direction: " + b.Direction + "\n")
	s.WriteString("- Title: " + b.Title + "\n")
	if b.Detail != "" {
		s.WriteString("- Detail: " + b.Detail + "\n")
	}
	s.WriteString("- Confidence: " + formatAIFloat(b.Confidence*100, 0) + "%\n")
	if b.Price != nil {
		s.WriteString("- Current price: $" + formatAIFloat(*b.Price, 2) + "\n")
	}
	if b.Change24h != nil {
		s.WriteString("- 24h change: " + formatAIFloat(*b.Change24h, 2) + "%\n")
	}
	return s.String()
}

func formatAIFloat(f float64, decimals int) string {
	if decimals == 0 {
		b, _ := json.Marshal(int64(f + 0.5))
		return string(b)
	}
	mul := 1.0
	for i := 0; i < decimals; i++ {
		mul *= 10
	}
	rounded := float64(int64(f*mul+0.5)) / mul
	b, _ := json.Marshal(rounded)
	return string(b)
}

func callAnthropic(apiKey, model, userPrompt string) (*explainResponse, error) {
	reqBody := anthropicRequest{
		Model:     model,
		MaxTokens: aiMaxTokens,
		System:    aiSystemPrompt,
		Messages:  []anthropicMessage{{Role: "user", Content: userPrompt}},
	}
	buf, _ := json.Marshal(reqBody)

	req, err := http.NewRequest("POST", anthropicURL, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", anthropicVersion)

	client := &http.Client{Timeout: 20 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(res.Body)
	var parsed anthropicResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, errors.New("anthropic decode failed")
	}
	if parsed.Error != nil {
		return nil, errors.New("anthropic: " + parsed.Error.Message)
	}
	if len(parsed.Content) == 0 || parsed.Content[0].Type != "text" {
		return nil, errors.New("anthropic empty response")
	}

	// Tolerate Claude's occasional prose preamble by trimming to the
	// first '{' and last '}' before JSON parsing.
	text := parsed.Content[0].Text
	if i := strings.Index(text, "{"); i > 0 {
		text = text[i:]
	}
	if j := strings.LastIndex(text, "}"); j != -1 && j < len(text)-1 {
		text = text[:j+1]
	}

	var out explainResponse
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		return nil, errors.New("anthropic returned non-JSON")
	}
	return &out, nil
}
