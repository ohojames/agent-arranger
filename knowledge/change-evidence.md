# Change evidence: boxed screenshot and review link

Read by `skills/ai-proceed` §3d. A bug fix always ends with a picture of where it changed, so the user can check it in a few seconds. Other page changes get one only when the page is already open. The whole capture work of one task gets 2 minutes; past that, or when blocked, write `ไม่ได้ capture เพราะ <reason>` (in the ผล line for a bug) and move on.

## The two files

| File | Runs in | Does |
|---|---|---|
| `core/mark.js` | the page, pasted by the agent | `aaMark([{ selector, label }])` scrolls the first element into view, draws a red box 8px around each element, an arrow from the side with room and a numbered label, and returns the boxes. `aaUnmark()` removes everything it drew |
| `core/evidence.mjs` | node | copies the shots into `<repo>/.claude/evidence/<stamp>-<slug>/`, writes `evidence.html` (shots side by side, page link, check output before and after, diff of the listed files) and prints the report line |

`.claude/` is git-excluded, so screenshots never land in a commit. Nothing is uploaded.

## Per tool

| Tool | Browser to use | Notes |
|---|---|---|
| Claude Code (CLI or desktop) | chrome-devtools MCP: `new_page`, `resize_page` 1280x800, `evaluate_script`, `take_screenshot` with `filePath` | Open the page in the foreground (`new_page` without `background`). Use a viewport shot; `fullPage` and background tabs can time out, so retry once and then count it against the 2 minutes. In the desktop app, send the after shot with SendUserFile |
| Claude desktop browser pane | `preview_start` (localhost only), `javascript_tool`, `computer` screenshot | It will not run scripts on `file://` pages. The screenshot path is printed in the tool result; pass it to `--after` |
| Antigravity | its own browser agent | Paste mark.js through its script step if it has one; otherwise take the shot without the box and say so |
| Codex, ZCode, Cursor | none built in | Skip the screenshot and say so; a bug still gets `evidence.mjs` with `--check-before` and `--check-after` |

## Selectors that box well

- Box the wrapper that holds the label and the value (the form row, the table cell, the card), not the bare input. The 8px gap then falls on empty space instead of crossing the label text.
- Two changes side by side: pass both in one `aaMark` call. Arrows avoid the other boxes.
- A change below the fold: it is scrolled into view, but only the first item is. Mark items that fit in one screen together, or take a second shot.

## Bug without a screen

Save the failing check output before the fix (`node --test ... > before.txt`, a curl, a SQL result) and the passing output after it, then:

```
node evidence.mjs --title "total subtracts" --files src/total.ts --check-before before.txt --check-after after.txt
```

The page frames the passing output and the diff. In Claude desktop send `evidence.html` with SendUserFile; elsewhere open it in chrome-devtools (`file://` works there) and take a viewport shot.

## Cost

About 1.5k tokens per image in context and 20 to 40 seconds per capture when the page is already open. A bug with before and after shots adds about 3k.
