---
name: release-qa
description: >-
  Runs the release QA git workflow (status check, git add ., commit, push) when
  the user sends /release/qa or asks to release QA / push QA changes. Use
  immediately on those triggers without asking for confirmation unless blocked.
---

# Release QA Git Workflow

## Trigger

Run this workflow when the user message is exactly or contains:

- `/release/qa`
- `release/qa` (same intent)

Do not run for unrelated git questions.

## Workflow

Execute in order using the Shell tool in the repository root.

### 1. Preflight

Run in parallel:

- `git status`
- `git diff` and `git diff --staged`
- `git log -3 --oneline`

Check:

- If **no changes** (clean tree): report「工作区无改动」, skip `add`/`commit`, still run `git push` only if user likely wants sync (if already up to date, report and stop).
- If staged files look like secrets (`.env`, `credentials`, `*.pem`, `id_rsa`): **stop**, warn user, do not `git add .`.
- Note current branch; if on `main` or `master`, proceed but do not use `--force`.

### 2. Stage

```bash
git add .
```

### 3. Commit message

Draft from the actual diff (1–2 sentences, focus on why). Prefer:

```text
chore(qa): <short summary of changes>
```

Commit with HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
<message>

EOF
)"
```

If `git add .` left nothing to commit (`nothing to commit`), skip commit and explain.

If pre-commit hook fails: fix if obvious; otherwise report error and **do not** `--amend` unless amending rules allow; create a new commit only after fix.

### 4. Push

```bash
git push
```

If no upstream: `git push -u origin HEAD` (never `--force` unless user explicitly requests force push in the same message).

### 5. Report

Reply briefly in 中文:

- branch name
- commit hash (if committed) and message
- push result (remote/branch)

## Safety (mandatory)

- NEVER change `git config`
- NEVER `git push --force` to `main`/`master` unless user explicitly requests force in that turn
- NEVER `--no-verify` unless user explicitly requests skipping hooks
- NEVER commit if user only asked *about* `/release/qa` without running it; this skill runs only when they invoke the trigger to **execute** the workflow

## Optional args

If user adds text after the command, e.g. `/release/qa fix e2e`, use that as extra context for the commit message subject.
