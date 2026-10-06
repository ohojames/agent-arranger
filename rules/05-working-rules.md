# Working rules

These are conditions, not advice. They apply to every project on this machine.

## Verify before reporting

Never report work as done from having written it. Run the check that would
catch the failure, and quote the result.

- TypeScript project → `npx tsc --noEmit`, then the real build
- Anything deployed → hit the live URL and report the status code
- Data change → read the rows back and compare against what was intended
- A script that writes files → re-open a sample and confirm it still parses

If a check was not run, say which one and why. "น่าจะใช้ได้" is not a report.

## A computed number is a claim until the inputs are checked

Before showing a ratio, a percentage or a coverage figure, ask what is in the
denominator and whether every item in it *could* satisfy the condition. A метрик
that counts items which can never qualify reports a gap that does not exist.

When the user questions a number, do not explain the formula from memory —
recompute it from the source data and show the rows.

## Never fall back silently

If the intended path fails and a lesser one is taken — a mock instead of a real
service, an empty list instead of an error, a cached copy instead of the source —
say so in the result. A green result obtained a different way misrepresents what
was verified.

## Before deploying

1. Compare the deployed environment's variables against local. A deployment
   pointing at the wrong database starts fine and shows nothing.
2. Check auth redirect allow-lists cover **every** origin the app is served
   from, preview URLs included. Preview hostnames change on every build, so
   match them by pattern.
3. Send the user the stable production URL, not the per-build preview URL —
   sign-in and anything origin-bound will fail on the latter.

## Credentials

Tokens and keys are read from the environment, never written into a file, a
script, or a command that gets logged. After a task that needed one, tell the
user to revoke it. Never enter a password on the user's behalf.

## Windows

- `npx`, `npm` and other `.cmd` shims cannot be spawned without a shell. Call a
  package's JS entry point through `node` instead of quoting a shell command.
- Heredocs mangle backslashes. Write regexes and Windows paths with the Edit
  tool, not by piping a script through `bash`.
- Set `PYTHONIOENCODING=utf-8` before any Python that prints Thai.
- Source files may be UTF-16; read defensively and normalise to UTF-8.

## Language

Reply in Thai. Keep code, comments and identifiers in English.
