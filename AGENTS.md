# AGENTS.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `devcxl/browser-agent`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root (created lazily) plus `docs/adr/`. See `docs/agents/domain.md`.

### PR review

Pull requests are reviewed by `devcxl/agentic-action/pr-review` (`.github/workflows/pr-review.yml`). The review is advisory by default: it posts a `<!-- pi-review:begin -->` comment and does not block merges. See `docs/agents/pr-review.md`.
