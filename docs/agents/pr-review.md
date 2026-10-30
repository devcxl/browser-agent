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
- **`workflow_dispatch` events**: the payload has no `pull_request`, so a dedicated
  `resolve-base` job runs `gh pr view <n> --json baseRefName,baseRefOid` and passes the SHA to the
  review job via `base_sha`. The step validates the SHA (`^[0-9a-f]{40}$`) and fails loudly if
  `gh` fails. That job runs in `runner.temp` with **read-only** permissions; the write-scoped
  token only exists in the `review` job, which needs it to publish the comment.

`gh` needs `GH_TOKEN` (Actions does not export `secrets.GITHUB_TOKEN` into the environment by
itself). Without it the action falls back to its own `gh pr view` call and fails with an
infrastructure error (exit code `30`) that is easy to misdiagnose.

### Token scoping, stated precisely

`GITHUB_TOKEN` lives for the **whole job**, not per step. The workflow therefore splits the work
into two jobs with different permission sets:

| Job | Permissions | Why |
| --- | --- | --- |
| `resolve-base` | `contents: read`, `pull-requests: read` | Only needs to read the PR's base branch |
| `review` | `contents: read`, `issues: read`, `pull-requests: write` | Needs to publish the review comment |

The review step receives the write-scoped token through the action's `github_token` input —
GitHub exposes `with:` inputs to the step as `INPUT_*` environment variables, and the action
reads `INPUT_GITHUB_TOKEN` — because publishing the review comment needs `pull-requests: write`.
If that exposure matters further, the lever is the `permissions` block, not the step split.

The base SHA resolved by `resolve-base` may not be in the local object database when the base
branch moved after checkout. The action covers that case itself: in the pinned commit,
`packages/adapters/src/git.ts` (`resolveBaseSha`) verifies the object with `git rev-parse
--verify` and, if missing, fetches it with its own credentials (`git fetch --no-tags origin
<sha>`). This workflow therefore does not fetch again — checkout runs with
`persist-credentials: false`, so a local fetch would have no credentials to use.

## Tool isolation

The review agent gets an explicit allowlist (`tools: 'read,grep,find,ls'`), which the action
passes to the Pi CLI as `--tools`. That allowlist — not the deny-list — is the security boundary:
with no `bash`/`powershell` in it the agent cannot execute commands, and the action's
`CapabilityPolicy` only injects `GH_TOKEN` into the agent's child process when a shell tool is
enabled. `exclude_tools: 'bash,powershell'` is explicit redundancy; because it denies both, the
action's own shell check also fails closed. If you widen `tools`, re-check both.

The agent's tool surface is not only the allowlist:

- The action registers one extension tool of its own (`submit_review`, the structured findings
  contract) — that is the only tool outside the allowlist, and it is registered through a
  separate `-e` flag, so the allowlist does not remove it.
- MCP servers are off: the action always passes `--no-mcp` unless explicitly enabled, so MCP
  tools are not a way around the allowlist.
- Project-local configuration is ignored: the action passes `--no-approve` and
  `defaultProjectTrust: never`, so a PR cannot smuggle in its own agent config or extensions.

### What the agent process can actually see

The agent's environment is **built from scratch**, not inherited: the action starts from a fixed
base set plus an allowlist, skips every `INPUT_*` variable, and only injects `GH_TOKEN` when a
shell tool is enabled. So neither `INPUT_GITHUB_TOKEN` (the write-scoped token GitHub exposes to
the step) nor `INPUT_API_KEY` reaches the agent. The provider key (`HALF_CABBAGE_API_KEY`) *is*
deliberately present — the agent needs it to call the model.

**Treat `tools` as frozen.** Widening it to include a shell would hand the agent, in one step: the
write-scoped `GITHUB_TOKEN`, the provider API key, and command execution over untrusted PR content.
Any change to `tools` needs a security review, not just a CI run.

## Action inputs used

Verified against the pinned commit `c36590a8ab4a8d4c8612de1f45c8f1cd6ed2b085`
(`pr-review/action.yml`, `packages/core/src/capability/policy.ts`,
`packages/adapters/src/git.ts`):
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
degrade silently rather than fail loudly. The `action-contract` job in `.github/workflows/ci.yml`
guards against that: it extracts the pinned commit from `pr-review.yml`, fetches that commit's
`pr-review/action.yml`, and fails if `base_sha` / `tools` / `exclude_tools` are no longer declared
or if the action's default tool set ever grows a shell tool. It runs on every PR, so a Dependabot
bump of the pinned SHA cannot silently change the contract — the bump has to pass the check
first, and the contract re-check happens in the same PR that moves the SHA.

## Known limits

- **Fork PRs get a read-only `GITHUB_TOKEN`**, so the review comment cannot be published there.
  Internal PRs (including Dependabot's) are unaffected.
- **Vendored third-party code is excluded** (`src/content/floating-widget/grokbot/**`); review it
  with the `security-audit` action instead.
- The action is referenced as `devcxl/agentic-action/pr-review@<commit>`, pinned to the commit
  behind the `v1.0.0` tag (`c36590a8ab4a8d4c8612de1f45c8f1cd6ed2b085`, with the version kept in a
  trailing comment so Dependabot can bump it). Pinning removes the risk of a **moved tag**, but not
  the risk of an **input-contract change** in a newer version: Dependabot bumps the SHA
  automatically, and the guardrail is the `action-contract` CI job described above — it fails the
  bump if the inputs or the default tool set changed shape. Its internal
  `setup-node`/`upload-artifact` versions are the action's own concern, not this repo's.
- **Only this third-party action is SHA-pinned.** `actions/checkout@v7` still uses a movable tag,
  matching the rest of this repo's workflows; first-party GitHub actions are a different trust
  domain from a third-party action that runs an LLM with a write token.
- **The inline shell in `resolve-base` has no static analysis** (no `actionlint`/`shellcheck` in
  CI yet). Worth adding as a separate CI change, not here.
