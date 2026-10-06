---
name: claude-bughunter
description: Perform a security audit on the active file or directory to detect potential web vulnerabilities (SQLi, XSS, CSRF, IDOR).
---

# Claude BugHunter Security Scan

Scan target files or API routes to detect security flaws and harden the application code.

## Instructions for Agent:
1. Load target files or endpoints.
2. Search for common vulnerability patterns (unescaped inputs, non-parameterized queries, lack of auth checks).
3. Draft a list of vulnerabilities found and implement the fixes.
