---
name: security-check
description: Use when the user asks for a security check, VA (vulnerability assessment), security scan, "ตรวจความปลอดภัย", before a release or deploy, or when a change touches login, permissions, user input, file upload, payments or API endpoints.
---

# security-check — vulnerability assessment without installing tools

Finds what is already wrong; it does not attack. Uses `scan.mjs` in this folder (Node only, no install) plus the agent's own review. For active attack testing use the `pentest` skill.

## Levels

| Level | When | Steps |
|---|---|---|
| **diff** | every code change (called by ai-proceed) | `secrets --diff` |
| **change** | change touches auth, permission, input, upload, payment, API — or `.github/workflows/`, `action.yml` | `secrets --diff` + `/security-review` on the diff + OWASP checklist below on changed files; workflow files → skill `gha-security-review` on them |
| **gate** | before push/deploy | `secrets` + `deps --prod` — any **high/critical** blocks the deploy until the user decides |
| **full VA** | before a major release, or monthly | `secrets` + `deps` + OWASP checklist on the whole app + `web --url <local app>` if the app can run locally + `gha-security-review` if the repo has `.github/workflows/` |

## Commands (run from the project root)

```bash
node ~/.claude/skills/security-check/scan.mjs secrets [--diff]
node ~/.claude/skills/security-check/scan.mjs deps [--prod]
node ~/.claude/skills/security-check/scan.mjs web --url http://localhost:3000/
```

Exit 1 = high/critical found. Full JSON (values redacted) is in `.security-reports/`, already excluded from git.
`web` refuses non-local hosts. Before starting an app, read the DB host in `.env` (mask credentials); a production database means ask first.

## OWASP review checklist (the agent reads code; grep first, read only hits)

| Risk | Look for |
|---|---|
| Broken access control / IDOR | handlers that load a record by id without checking owner/role; RLS disabled; service-role key on the client |
| Injection | SQL built with string concat/template literals; `raw(`/`DB::raw`/`$queryRawUnsafe`; shell exec with user input |
| XSS | `dangerouslySetInnerHTML`, `v-html`, `{!! !!}`, `innerHTML =` with user data |
| Auth & session | missing rate limit on login/OTP; tokens in localStorage; JWT secret in code; no CSRF on cookie-auth forms |
| Sensitive data exposure | columns a role must not see sent to the client; stack traces / `getMessage()` in responses |
| SSRF / open redirect | server fetch of a user-supplied URL; redirect to `?next=` without allow-list |
| File upload | no type/size check; stored under the web root; original filename used as path |
| Misconfiguration | debug on in prod config; permissive CORS; default credentials |

## Report

Follow the global report format: high/critical findings are bad news — one bullet each (`ระดับ · รายการ · ที่ไหน · วิธีแก้`); a fix that needs the user's call goes in the `### ต้องตัดสินใจ` section as a yes/no question (also `AskUserQuestion` in Claude Code), never an option table; the full list stays in `.security-reports/` and is linked, not pasted. Give counts as the scanner prints them, including the package count for `deps` (advisories ≠ packages). Never paste a secret value — the scanner already redacts; keep it that way. A finding the agent judges a false positive stays in the table marked "false positive" with the reason.
