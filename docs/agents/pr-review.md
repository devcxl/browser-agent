# PR Review

Pull requests are reviewed automatically by the Pi Coding Agent, driven by
[`devcxl/agentic-action`](https://github.com/devcxl/agentic-action). The workflow lives in
`.github/workflows/pr-review.yml`; the Issue-classification config lives in `.github/triage.yml`.

## What it does

- Compares against `git merge-base` **inside the runner**, so large PRs are not capped by the
  GitHub diff API's 20000-line limit.
- Runs the review agent with **read-only tools** (`read,grep,find,ls`) and ignores any
  project-local agent config that the PR itself introduces.
- Returns findings through a structured `submit_review` contract, then publishes them as a
  single PR comment keyed by the `<!-- pi-review:begin -->` marker (re-runs update that
  comment instead of stacking new ones).
- Reads the linked Issue (via TypeSafe Jev classification) to decide review focus and
  thinking level. Issue titles and bodies are never interpolated into the prompt — they are
  materialized as untrusted files.

## How to read the result

| Exit code | Meaning | Action |
| --- | --- | --- |
| `0` | Passed, no findings, or skipped (no model key configured) | — |
| `10` | Findings reached the `fail_on` severity | Fix the findings, or re-run with a looser gate |
| `20` | The model did not honour the structured contract, or planned chunks were not completed | Usually transient; re-run |
| `30` | Infrastructure failure (git, network, credentials) | Check the run log |

The comment also reports two coverage ratios: `plannedCoverage` (reviewed / planned chunks) and
`totalCoverage` (reviewed / all chunks of the PR). A verdict of `approve` requires full total
coverage; partial reviews are capped at `comment`.

## Default posture: advisory, not a gate

`fail_on` defaults to `none` for pull-request events, so the reviewer comments but never blocks
a merge. Tighten it when you trust it:

```bash
# one-off stricter run on an existing PR
gh workflow run pr-review.yml -f pr_number=123 -f fail_on=high
```

To make the gate permanent, change `fail_on` in `.github/workflows/pr-review.yml` from `none` to
`high`.

## Required repository secrets

The action degrades gracefully (exit code `0`, verdict `skipped`) while these are missing, so the
workflow can be merged before the keys exist.

| Secret | Purpose |
| --- | --- |
| `HALF_CABBAGE_BASE_URL` | Provider base URL for the review model |
| `HALF_CABBAGE_API_KEY` | Provider API key for the review model |
| `TYPESAFE_API_KEY` | Jev Issue classification; without it, Issue linkage is skipped |

Set them from a shell (values never pass through the agent):

```bash
gh secret set HALF_CABBAGE_BASE_URL --repo devcxl/browser-agent
gh secret set HALF_CABBAGE_API_KEY --repo devcxl/browser-agent
gh secret set TYPESAFE_API_KEY --repo devcxl/browser-agent
```

## Known limits

- **Fork PRs get a read-only `GITHUB_TOKEN`**, so the review comment cannot be published there.
  Internal PRs (including Dependabot's) are unaffected.
- **Vendored third-party code is excluded** (`src/content/floating-widget/grokbot/**`); review it
  with the `security-audit` action instead.
- The action itself is pinned to `devcxl/agentic-action@v1.0.0`; its internal
  `setup-node`/`upload-artifact` versions are the action's own concern, not this repo's.
