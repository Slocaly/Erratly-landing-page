# Interactive demo: lock editing + reset button

## Problem

The landing page's interactive typo-fixing demo (`try-section` in `src/components/LandingPage.astro`) is a `contenteditable` box. Visitors can currently type arbitrary text into it, which is out of scope for a demo meant only to showcase selecting a typo and fixing it. There's also no way to restore the demo to its original sentence once a fix has been made.

## Goals

1. Prevent free typing in the demo box — visitors can only select existing text and trigger fixes (via the SIMULATE button or the Ctrl-Ctrl shortcut).
2. Add a Reset button that restores the demo's original sentence and status, appearing only after a real fix has occurred.

## Design

### 1. Lock the demo box to selection-only

In `src/components/LandingPage.astro`, change the demo `<div>`'s `contenteditable="true"` to `contenteditable="false"`. `tabindex="0"` and `spellcheck="false"` stay as-is:
- `tabindex="0"` keeps the element focusable so the existing `keydown` listener (Ctrl-Ctrl shortcut) still fires.
- Text remains selectable via mouse or keyboard even when not editable; only text *insertion* is blocked.

### 2. Reset button

**Markup** — in the `try-actions` row, immediately after the SIMULATE button:

```html
<button type="button" class="btn-reset" data-demo-reset hidden>{t.resetBtn}</button>
```

Starts with the `hidden` attribute so it renders nothing until unlocked.

**Behavior** (`src/scripts/interactive.js`):
- `fixSelection()`: when a fix actually changes text (`count > 0`), remove `hidden` from `[data-demo-reset]`.
- New `resetDemo()`: sets `demo.textContent` back to `DEMO_TEXT[lang]` (reusing the existing `loadDemoText()` helper), clears the status text (empty string), and re-adds `hidden` to the reset button.
- `initDemo()`: adds a click listener on `[data-demo-reset]` → `resetDemo()`.

No other trigger unhides the reset button — since typing is now blocked, the only way the demo text can change is through a fix, so "only after an actual fix" and "only after any edit" collapse into the same condition.

### 3. Strings

Add to both locales in `src/data/strings.json`:
- `en.resetBtn`: `"RESET"`
- `fr.resetBtn`: `"RÉINITIALISER"`

### 4. Styling

Add `.btn-reset` near `.btn-simulate` in the `<style>` block of `LandingPage.astro`: same font (`700 12px 'JetBrains Mono', monospace`), same padding/border-radius, but outline style (transparent background, `1px solid #b3392e` border, `#b3392e` text) so it reads as a secondary action next to the filled SIMULATE button.

## Out of scope

- No change to FAQ accordion or any other part of the page.
- No persistence of demo state across reloads (page reload already resets everything via `loadDemoText()` on script load).
- No undo history — Reset always restores the original seed sentence, not a previous intermediate state.

## Testing

Manual verification via the `run` skill / dev server:
1. Load `/` and `/fr/` — demo box shows seed text, Reset is not visible, typing into the box does nothing.
2. Select a typo, click SIMULATE (or double-tap Ctrl) — text is corrected, status shows "Fixed n typo(s)", Reset button appears.
3. Click Reset — text reverts to the seed sentence, status clears, Reset button disappears again.
4. Repeat fix → reset cycle to confirm it isn't a one-shot.
