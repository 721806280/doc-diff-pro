---
name: verify
description: Launch DocDiff Pro and drive it in a real browser to observe a change working end to end.
---

# Verifying DocDiff Pro

Browser-only DOCX comparison app (React 19 + Vite). Everything runs client
side, so the surface is always the rendered page.

## Handle

```bash
pnpm dev --host 127.0.0.1        # serves http://127.0.0.1:5173/doc-diff-pro/
```

Drive it with Playwright. **The driver script must live in the repo root** —
`@playwright/test` resolves from `node_modules`, so a script in `/tmp` fails
with `ERR_MODULE_NOT_FOUND`. Name it `*.tmp.mjs`; that pattern is gitignored.

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome' });
```

`channel: 'chrome'` matches `playwright.config.ts`. Locally the bundled
`chromium` build is usually not installed.

## Reaching a comparison

The app starts empty. Load the bundled samples:

```js
await page.goto('http://127.0.0.1:5173/doc-diff-pro/');
await page.locator('.local-processing-strip button').click();
await page.locator('.floating-navigator').waitFor({ timeout: 30000 });
```

## Seeding settings

Most review features are off by default (`enableDiffIgnore`,
`showReportExport`, `showTableHints`). Seed them before boot instead of
driving the settings panel:

```js
await page.addInitScript(() => {
  window.localStorage.setItem('doc-diff-settings', JSON.stringify({
    diffGranularity: 'char', themeColor: 'indigo', appearanceMode: 'light',
    showTableHints: true, enableDiffIgnore: true, showDiffMap: true, syncScroll: true
  }));
});
```

## Selectors that matter

| Thing | Selector |
|---|---|
| Scroll container per pane | `.render-viewport` (index 0 = A, 1 = B) |
| Active difference | `.diff-progress` → `aria-valuenow` / `aria-valuemax` |
| Diff elements | `[data-diff-id]` |
| Ignore popover | `.diff-action-popover`, main button `--main` |
| Difference map dot | `.diff-map__marker` (`aria-current="true"` = active) |
| Settings trigger | `button:has(.settings-sliders-icon)` |
| Toast | `.compare-toast` |
| Table hint tip | `.table-hint-tip`, close `.table-hint-tip__close` |

## Gotchas

- **Use real mouse input.** React's synthetic `onMouseEnter` / `onWheel` do
  not fire from `dispatchEvent(new Event(...))`. Pane activation for scroll
  sync depends on them, so use `page.mouse.move()` + `page.mouse.wheel()`.
  Without activating a pane first, scroll sync will look broken when it isn't.
- **Diff map dots overlap.** They are 16x12 and positioned by percentage, so
  a coordinate click can hit a neighbour even with `force: true`. Use
  `locator.dispatchEvent('click')`.
- **The map is `display:none` below 820px.**
- **Bundled samples never trigger a table-structure hint.** Some sample
  tables do have unequal row counts, but `resolveTableStructureHint` still
  returns null for every difference in them. Verified identical on both sides
  of the Phase 3 refactor, so it is long-standing, not a regression. Don't
  read a missing `.table-hint-tip` as a break you caused.

## A/B against a baseline

To tell a regression from pre-existing behaviour, run the same driver on
stashed code:

```bash
git stash push -u -m ab -- src/     # keeps your *.tmp.mjs driver in place
node ./driver.tmp.mjs
git stash pop
```
