# Publishing a strategy to the library

> Contributor reference. Not shown in-app.

Until the marketplace ships a backend, community strategies are merged
through pull requests. Authorship, performance numbers, and review
history live in version control so they can't be silently rewritten.

## Process

1. **Export your bot** from the app
   - Open the **Bots** panel
   - Click ⋮ on the bot card → **Share / export JSON**
   - Save the file locally

2. **Add an entry to the library**
   - File: `src/strategies/library.ts`
   - Append a new `PublishedStrategy` with:
     - `kind: 'community'`
     - Your `author` handle
     - The exported `bot` config (paste from JSON)
     - Optional `performance` snapshot (paper or live track record)

3. **Open a pull request**
   - Title: `feat(strategies): add <bot-name> by <handle>`
   - The team verifies:
     - Config compiles and matches the `BotConfig` schema
     - Performance claim is consistent with public hit-rate data on `/proof`
     - No malicious payload in `allowedMarkets` or other free-form fields

4. **Merge**
   - Once merged, the strategy appears in the **Community** tab on
     `/library` with your handle attached
   - Followers see new bots from you in the **Following** tab

## Curated vs Community

- **Curated** entries are reviewed by the TradingDek team and carry a
  verified badge. Performance numbers are independently checked
  against the proof feed.
- **Community** entries are unverified by default. Followers should
  paper-trade for a week and cross-reference `/proof` before flipping
  to live execution.

## When the backend ships

The PR-based flow is a stopgap. Once the marketplace server is live,
publishing will move to an in-app form with automated validation and
a reputation system. Until then, this is the path.
