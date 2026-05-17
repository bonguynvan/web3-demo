// AI signal explainer — POST /api/ai/explain.
//
// Authenticated, Pro-gated, rate-limited Claude call. The SPA sends a
// signal context; we hand it to Claude with a tight system prompt
// that demands a two-sentence explanation + a one-line risk note.
// We never invent numbers — only echo the data we received.
//
// Cost model (claude-haiku-4-5):
//
//	~$0.001/call (500 tok in, 100 tok out)
//	30 calls/user/hour cap → max $0.03/user/hour
//
// Rate-limit is in-memory per process. For a single-instance Coolify
// deploy that's fine; horizontal scaling would want Redis.
package main

import (
	"bufio"
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

const aiPostMortemSystemPrompt = `You are TradingDek's trade post-mortem writer. The user just had a bot close a trade. Write a SHORT analysis of why the trade played out the way it did, in 2 sentences max.

Format:
<one sentence describing the entry rationale and what happened to PnL>
<one sentence with a specific takeaway for future trades on this market or with this signal source>

Rules:
- Never invent prices or percentages — only reason from the data given.
- Be specific, not generic. ("Funding peaked late" beats "market was crowded".)
- Skip pleasantries — start straight into the analysis.
- Total response under 60 words. No code fences, no headers.`

const aiStrategySystemPrompt = `You are TradingDek's strategy assistant. The user gives you a trading hypothesis in plain English. You respond with a SPECIFIC bot configuration that tests that hypothesis, plus a brief plan.

Respond in this exact format:

Strategy: <1-line name for the bot>

Configuration:
- Signal sources: <one or more of: funding, crossover, rsi, volatility, liquidation, news, whale, confluence>
- Min confidence: <0.50 to 0.90>
- Position size: <USD, e.g. $50 — or risk-based 0.5%>
- Hold window: <minutes>
- Stop loss: <percent, e.g. 2%>
- Take profit: <percent, e.g. 4%>
- Markets: <specific list or "any">
- Max trades per day: <number>

Rationale: <2-3 sentences explaining why this setup tests the hypothesis>

Risks: <one specific way this can fail and what to watch for>

Keep the whole response under 250 words. Be specific — round numbers, not ranges. Don't recommend specific dollar amounts beyond conservative defaults; the user will tune their size in the studio.`

const aiSystemPrompt = `You are TradingDek's signal explainer. The user just saw a market signal fire. Explain in plain English why this signal might matter, then a specific risk to watch.

Output EXACTLY this format with these exact section headers and no preamble:

Explanation: <two sentences>

Risk: <one sentence>

Rules:
- Never invent numbers, percentages, or outcomes — only reason from the data given.
- Never give financial advice or recommend buying/selling.
- Be direct and concrete; do not hedge unnecessarily.
- Do NOT wrap output in JSON or code fences.`

type explainBody struct {
	SignalID   string   `json:"signal_id"`
	Source     string   `json:"source"`
	MarketID   string   `json:"market_id"`
	Direction  string   `json:"direction"`
	Confidence float64  `json:"confidence"`
	Title      string   `json:"title"`
	Detail     string   `json:"detail"`
	Price      *float64 `json:"price,omitempty"`
	Change24h  *float64 `json:"change_24h,omitempty"`
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

// Cached explanations — same signal id explained recently returns the
// stored text instantly, no Claude call. TTL is 1 hour; cache key is
// the signal id alone since the underlying prompt is deterministic
// given (source, market, direction, conf, detail) — and signal ids
// already encode those upstream.
const aiCacheTTL = time.Hour

type cachedExplanation struct {
	text      string
	createdAt time.Time
}

var (
	aiCacheMu sync.RWMutex
	aiCache   = map[string]cachedExplanation{}
)

func cacheGet(key string) (string, bool) {
	aiCacheMu.RLock()
	defer aiCacheMu.RUnlock()
	c, ok := aiCache[key]
	if !ok || time.Since(c.createdAt) > aiCacheTTL {
		return "", false
	}
	return c.text, true
}

func cachePut(key, text string) {
	aiCacheMu.Lock()
	defer aiCacheMu.Unlock()
	aiCache[key] = cachedExplanation{text: text, createdAt: time.Now()}
	// Cheap pruning: if the map grows past 2k entries, drop everything
	// older than the TTL. Avoids unbounded growth on long uptimes.
	if len(aiCache) > 2000 {
		cutoff := time.Now().Add(-aiCacheTTL)
		for k, v := range aiCache {
			if v.createdAt.Before(cutoff) {
				delete(aiCache, k)
			}
		}
	}
}

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

		var body explainBody
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
		}
		if body.Source == "" || body.MarketID == "" || body.Direction == "" {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "missing fields"})
		}

		// Cache hit — instant response, no Claude call, no rate-limit
		// debit. We still stream so the client renders progressively.
		if body.SignalID != "" {
			if cached, ok := cacheGet(body.SignalID); ok {
				return streamCached(e, cached)
			}
		}

		// Cache miss → check rate limit, then call Anthropic.
		if !checkAIRate(user.Id) {
			return e.JSON(http.StatusTooManyRequests, map[string]string{
				"error": "rate limit (30/hour)",
			})
		}
		userPrompt := buildAIUserPrompt(&body)
		return streamAnthropic(e, apiKey, model, userPrompt, body.SignalID)
	}
}

// strategyBody is what the SPA POSTs to /api/ai/strategy.
type strategyBody struct {
	Hypothesis string `json:"hypothesis"`
}

// aiStrategyHandler streams Claude's bot-config suggestion for a user
// trading hypothesis. Same Pro gate + rate limit as the explainer;
// no caching (each hypothesis is bespoke). Uses aiStrategySystemPrompt
// rather than aiSystemPrompt to shape the response format.
func aiStrategyHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		model = defaultAIModel
	}
	return func(e *core.RequestEvent) error {
		if apiKey == "" {
			return e.JSON(http.StatusServiceUnavailable, map[string]string{
				"error": "AI strategy assistant not configured",
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

		var body strategyBody
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
		}
		hyp := strings.TrimSpace(body.Hypothesis)
		if hyp == "" {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "hypothesis required"})
		}
		if len(hyp) > 1000 {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "hypothesis too long (max 1000 chars)"})
		}

		if !checkAIRate(user.Id) {
			return e.JSON(http.StatusTooManyRequests, map[string]string{
				"error": "rate limit (30/hour)",
			})
		}
		// Reuses streamAnthropicMessages with the strategy-specific system prompt.
		return streamAnthropicMessages(e, apiKey, model, aiStrategySystemPrompt,
			[]anthropicMessage{{Role: "user", Content: hyp}})
	}
}

// postMortemBody describes a closed trade for the AI to analyze.
type postMortemBody struct {
	BotName     string  `json:"bot_name"`
	MarketID    string  `json:"market_id"`
	Source      string  `json:"source"`
	Direction   string  `json:"direction"`
	EntryPrice  float64 `json:"entry_price"`
	ClosePrice  float64 `json:"close_price"`
	PnlUsd      float64 `json:"pnl_usd"`
	ExitReason  string  `json:"exit_reason"`
	HoldMinutes int     `json:"hold_minutes"`
}

// aiPostMortemHandler streams a short retrospective on a single closed
// trade. Pro-gated + rate-limited like the other AI endpoints. No
// caching (each trade is unique). Designed to write into the journal
// automatically when the user has the feature enabled.
func aiPostMortemHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		model = defaultAIModel
	}
	return func(e *core.RequestEvent) error {
		if apiKey == "" {
			return e.JSON(http.StatusServiceUnavailable, map[string]string{
				"error": "AI post-mortem not configured",
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
		var body postMortemBody
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
		}
		if body.MarketID == "" || body.Direction == "" {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "missing fields"})
		}
		if !checkAIRate(user.Id) {
			return e.JSON(http.StatusTooManyRequests, map[string]string{
				"error": "rate limit (30/hour)",
			})
		}
		userPrompt := buildPostMortemPrompt(&body)
		return streamAnthropicMessages(e, apiKey, model, aiPostMortemSystemPrompt,
			[]anthropicMessage{{Role: "user", Content: userPrompt}})
	}
}

func buildPostMortemPrompt(b *postMortemBody) string {
	return "Bot: " + b.BotName +
		"\nMarket: " + b.MarketID +
		"\nSignal source: " + b.Source +
		"\nDirection: " + b.Direction +
		"\nEntry price: " + formatAIFloat(b.EntryPrice, 4) +
		"\nClose price: " + formatAIFloat(b.ClosePrice, 4) +
		"\nRealized PnL (USD): " + formatAIFloat(b.PnlUsd, 2) +
		"\nExit reason: " + b.ExitReason +
		"\nHold duration: " + formatAIFloat(float64(b.HoldMinutes), 0) + " minutes"
}

// streamCached writes the cached text in one SSE frame and ends.
// Clients see identical chunk-handling semantics regardless of hit/miss.
func streamCached(e *core.RequestEvent, text string) error {
	w := e.Response
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	chunk, _ := json.Marshal(map[string]string{"text": text})
	if _, err := w.Write([]byte("data: " + string(chunk) + "\n\n")); err != nil {
		return err
	}
	if _, err := w.Write([]byte("data: [DONE]\n\n")); err != nil {
		return err
	}
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	return nil
}

// streamAnthropic POSTs to Anthropic with stream:true and forwards
// text_delta chunks back to the client as SSE. Caches the full text on
// successful completion.
func streamAnthropic(e *core.RequestEvent, apiKey, model, userPrompt, signalID string) error {
	w := e.Response
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, _ := w.(http.Flusher)

	reqBody := map[string]any{
		"model":      model,
		"max_tokens": aiMaxTokens,
		"system":     aiSystemPrompt,
		"messages":   []anthropicMessage{{Role: "user", Content: userPrompt}},
		"stream":     true,
	}
	buf, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", anthropicURL, bytes.NewReader(buf))
	if err != nil {
		return writeSSEError(w, flusher, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", anthropicVersion)

	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return writeSSEError(w, flusher, err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		raw, _ := io.ReadAll(res.Body)
		return writeSSEError(w, flusher, errors.New("anthropic "+res.Status+": "+string(raw)))
	}

	w.WriteHeader(http.StatusOK)
	var collected strings.Builder
	scanner := newSSEScanner(res.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := line[6:]
		if payload == "[DONE]" {
			break
		}
		var ev struct {
			Type  string `json:"type"`
			Delta struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"delta"`
		}
		if err := json.Unmarshal([]byte(payload), &ev); err != nil {
			continue
		}
		if ev.Type != "content_block_delta" || ev.Delta.Type != "text_delta" {
			continue
		}
		collected.WriteString(ev.Delta.Text)
		chunk, _ := json.Marshal(map[string]string{"text": ev.Delta.Text})
		if _, err := w.Write([]byte("data: " + string(chunk) + "\n\n")); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
	}

	// Cache the full text. Even if scanner errors mid-stream we cache
	// what we got — partial response is still useful on a re-click.
	if signalID != "" && collected.Len() > 20 {
		cachePut(signalID, collected.String())
	}

	if _, err := w.Write([]byte("data: [DONE]\n\n")); err != nil {
		return err
	}
	if flusher != nil {
		flusher.Flush()
	}
	return nil
}

func writeSSEError(w http.ResponseWriter, flusher http.Flusher, err error) error {
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	chunk, _ := json.Marshal(map[string]string{"error": err.Error()})
	_, _ = w.Write([]byte("event: error\ndata: " + string(chunk) + "\n\n"))
	if flusher != nil {
		flusher.Flush()
	}
	return nil
}

// sseScanner is a thin bufio.Scanner with a larger buffer so long
// Anthropic SSE lines (system prompts) don't trip ErrTooLong.
type sseScanner struct {
	*bufio.Scanner
}

func newSSEScanner(r io.Reader) *sseScanner {
	s := bufio.NewScanner(r)
	s.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	return &sseScanner{s}
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

// (Streaming version above replaces the old one-shot callAnthropic.
// The anthropicRequest/anthropicResponse/anthropicMessage types remain
// in case we want a non-streaming fallback later.)

// ─── Follow-up Q&A ─────────────────────────────────────────────────────
//
// POST /api/ai/followup — same auth/Pro/rate-limit gates as
// /api/ai/explain, but accepts a conversation history. Lets a Pro
// user ask "how is this different from yesterday's funding signal?"
// after the initial streamed explanation. Same rate-limit pool —
// a follow-up still counts as one Claude call.

const followupSystemPrompt = `You are TradingDek's signal analyst. The user has already received an initial explanation of a market signal and is asking a follow-up question.

Answer in plain English, 2-3 sentences max. Be specific and direct.

Rules:
- Never invent numbers, percentages, or outcomes you weren't given.
- Never give financial advice or recommend buying/selling.
- If the question is off-topic or unanswerable from context, say so briefly.
- No JSON, no markdown headers, just prose.`

type followupBody struct {
	SignalContext explainBody `json:"signal_context"`
	History       []struct {
		Role    string `json:"role"` // user | assistant
		Content string `json:"content"`
	} `json:"history"`
	Question string `json:"question"`
}

func aiFollowupHandler(app *pocketbase.PocketBase) func(*core.RequestEvent) error {
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

		var body followupBody
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
		}
		body.Question = strings.TrimSpace(body.Question)
		if body.Question == "" {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "empty question"})
		}
		if len(body.Question) > 500 {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "question too long"})
		}
		if len(body.History) > 8 {
			// Cap history depth so the prompt stays cheap and the convo
			// doesn't snowball. Recent turns matter more.
			body.History = body.History[len(body.History)-8:]
		}

		// Build the message list: original signal context as the first
		// user turn, then the previous history, then the new question.
		messages := []anthropicMessage{
			{Role: "user", Content: "Signal under discussion:\n" + buildAIUserPrompt(&body.SignalContext)},
		}
		for _, h := range body.History {
			role := h.Role
			if role != "user" && role != "assistant" {
				continue
			}
			messages = append(messages, anthropicMessage{Role: role, Content: h.Content})
		}
		messages = append(messages, anthropicMessage{Role: "user", Content: body.Question})

		return streamAnthropicMessages(e, apiKey, model, followupSystemPrompt, messages)
	}
}

// streamAnthropicMessages is the multi-turn counterpart to
// streamAnthropic. Same SSE forwarding logic, different message list.
func streamAnthropicMessages(e *core.RequestEvent, apiKey, model, system string, messages []anthropicMessage) error {
	w := e.Response
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, _ := w.(http.Flusher)

	reqBody := map[string]any{
		"model":      model,
		"max_tokens": aiMaxTokens,
		"system":     system,
		"messages":   messages,
		"stream":     true,
	}
	buf, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", anthropicURL, bytes.NewReader(buf))
	if err != nil {
		return writeSSEError(w, flusher, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", anthropicVersion)

	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return writeSSEError(w, flusher, err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		raw, _ := io.ReadAll(res.Body)
		return writeSSEError(w, flusher, errors.New("anthropic "+res.Status+": "+string(raw)))
	}

	w.WriteHeader(http.StatusOK)
	scanner := newSSEScanner(res.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := line[6:]
		if payload == "[DONE]" {
			break
		}
		var ev struct {
			Type  string `json:"type"`
			Delta struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"delta"`
		}
		if err := json.Unmarshal([]byte(payload), &ev); err != nil {
			continue
		}
		if ev.Type != "content_block_delta" || ev.Delta.Type != "text_delta" {
			continue
		}
		chunk, _ := json.Marshal(map[string]string{"text": ev.Delta.Text})
		if _, err := w.Write([]byte("data: " + string(chunk) + "\n\n")); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
	}
	if _, err := w.Write([]byte("data: [DONE]\n\n")); err != nil {
		return err
	}
	if flusher != nil {
		flusher.Flush()
	}
	return nil
}
