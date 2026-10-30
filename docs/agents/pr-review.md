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

## Base SHA resolution

The action diffs against `git merge-base <base> <head>`, so it needs the base commit SHA:

- **`pull_request` events**: read straight from the event payload (`github.event.pull_request.base.sha`).
- **`workflow_dispatch` events**: the payload has no `pull_request`, so a short `Resolve base SHA`
  step runs `gh pr view <n> --json baseRefName,baseRefOid` and passes the SHA via the `base_sha`
  input. The step validates the SHA (`^[0-9a-f]{40}$`) and fails loudly if `gh` fails. If the base
  branch moved after checkout, the resolved commit may not be in the local object database. The
  action covers that case itself: `packages/adapters/src/git.ts` (`resolveBaseSha`) verifies the
  object with `git rev-parse --verify` and, if missing, fetches it using its own credentials
  (`git fetch --no-tags origin <sha>`). This workflow therefore does not fetch again — checkout
  runs with `persist-credentials: false`, so a local fetch would have no credentials to use.

`gh` needs `GH_TOKEN` (Actions does not export `secrets.GITHUB_TOKEN` into the environment by
itself). Without it the action falls back to its own `gh pr view` call and fails with an
infrastructure error (exit code `30`) that is easy to misdiagnose.

### Token scoping, stated precisely

`GITHUB_TOKEN` lives for the **whole job**, not per step — a separate step does not isolate it.
What the separate step does achieve is keeping the token out of the `env` of the review step,
which can run for up to 90 minutes, and out of the PR working directory (the step runs in
`runner.temp`). The review step still receives the same token through the action's `github_token`
input — GitHub exposes `with:` inputs to the step as `INPUT_*` environment variables, and the
action reads `INPUT_GITHUB_TOKEN` — because publishing the review comment needs
`pull-requests: write`. If that exposure matters, the lever is the workflow's `permissions`
block, not the step split.

## Tool isolation

The review agent gets an explicit allowlist (`tools: 'read,grep,find,ls'`), which the action
passes to the Pi CLI as `--tools`. That allowlist — not the deny-list — is the security boundary:
with no `bash`/`powershell` in it the agent cannot execute commands, and the action's
`CapabilityPolicy` only injects `GH_TOKEN` into the agent's child process when a shell tool is
enabled. `exclude_tools: 'bash,powershell'` is explicit redundancy; because it denies both, the
action's own shell check also fails closed. If you widen `tools`, re-check both.

The agent's tool surface is not only the allowlist:

- The action registers one extension tool of its own (`submit_review`, the structured findings
  contract) — that is the only tool outside the allowlist.
- MCP servers are off: the action always passes `--no-mcp` unless explicitly enabled, so MCP
  tools are not a way around the allowlist.
- Project-local configuration is ignored: the action passes `--no-approve` and
  `defaultProjectTrust: never`, so a PR cannot smuggle in its own agent config or extensions.

## Action inputs used

Verified against `devcxl/agentic-action/pr-review@v1.0.0` (`pr-review/action.yml`):

| Input | Value here | Effect |
| --- | --- | --- |
| `base_sha` | resolved above | Left end of the diff; the action still computes the merge-base itself |
| `tools` / `exclude_tools` | `read,grep,find,ls` / `bash,powershell` | Agent tool surface (`--tools` / `--exclude-tools`) |
| `context_files` | `AGENTS.md CONTEXT.md` | Prepended to the prompt with `@`; missing files are ignored |
| `triage_config` | `.github/triage.yml` | Issue-classification vocabulary for Issue linkage |
| `link_issues` | `true` | Reads the linked Issue to route review focus; needs `TYPESAFE_API_KEY` |
| `exclude` | build output + vendored dirs | Glob patterns kept out of the review |
| `fail_on` | `none` (default) | Severity at which the gate fails the job |

Inputs the action does not declare are ignored by GitHub with a warning, so a typo here would
degrade silently rather than fail loudly — the table above is the local record of what was checked.

## Known limits

- **Fork PRs get a read-only `GITHUB_TOKEN`**, so the review comment cannot be published there.
  Internal PRs (including Dependabot's) are unaffected.
- **Vendored third-party code is excluded** (`src/content/floating-widget/grokbot/**`); review it
  with the `security-audit` action instead.
- The action is referenced as `devcxl/agentic-action/pr-review@<commit>`, pinned to the commit
  behind the `v1.0.0` tag (`c36590a8ab4a8d4c8612de1f45c8f1cd6ed2b085`). It runs an LLM pipeline
  with a write-scoped token in the job and now also carries this repo's tool allowlist, so a moving
  tag could widen that boundary — pinning removes the risk. Dependabot bumps the SHA when a newer
  release appears. Its internal `setup-node`/`upload-artifact` versions are the action's own
  concern, not this repo's.
