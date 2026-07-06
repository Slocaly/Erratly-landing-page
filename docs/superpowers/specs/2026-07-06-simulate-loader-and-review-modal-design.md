# Interactive demo: loader + review modal on Simulate

## Problem

The landing page's interactive typo-fixing demo (`try-section` in `src/components/LandingPage.astro`, behavior in `src/scripts/interactive.js`) currently applies a fix the instant SIMULATE is clicked (or Ctrl is double-tapped): the selected typo is swapped in place with no review step. For the product demo, this is too abrupt — it doesn't showcase that Erratly is proposing a correction the user can accept or reject; it just silently rewrites text.

## Goals

1. When SIMULATE is triggered, show a brief loading state (the app logo spinning) over the demo box before anything changes.
2. Then show a modal presenting the proposed fix as an inline diff — full sentence for context, with only the selected/changed words struck through (removed) and replaced (added) — that the visitor can Accept or Cancel.
3. Accept applies the fix exactly as today (instant swap, brief highlight fade, status message, Reset button reveal). Cancel (or closing the modal any other way) leaves the demo text untouched.

## Non-goals / out of scope

- No change to `TYPO_MAP`, `DEMO_TEXT`, or which words count as typos.
- SIMULATE stays selection-based — it does not scan and fix the whole sentence unprompted. The modal shows the whole sentence as context, but only the current selection is corrected.
- No animation library — pure CSS keyframes/transitions, consistent with the rest of the page.
- No multi-step diff history. Cancel/Accept only ever concerns the single pending selection; there's no undo stack beyond the existing Reset-to-seed-text button.
- No change to the Reset button's own behavior (`docs/superpowers/specs/2026-07-06-demo-reset-button-design.md`).

## Design

### 1. Flow

```
click SIMULATE / double-tap Ctrl
  -> validate selection (existing checks: selectFirst / selectInside)
  -> validate selection contains at least one real typo (existing noTypos check)
       -> if none: show "noTypos" status immediately, stop (no loader/modal)
  -> disable SIMULATE + Reset buttons
  -> show loader over .demo-text (~700ms)
  -> hide loader, show review modal (full-sentence diff)
       -> Accept  -> apply fix (today's logic), close modal, re-enable buttons
       -> Cancel / backdrop click / Escape -> close modal, no DOM change, re-enable buttons
```

### 2. Loader

**Markup** — inside `.try-inner`, sibling to `.erratly-demo-text`, so it can overlay it:

```html
<div class="demo-loader" data-demo-loader hidden>
  <img src="/erratly-icon-placeholder.svg" alt="" class="demo-loader-icon" />
</div>
```

**Positioning**: `.erratly-demo-text`'s wrapper (or the element itself) becomes `position: relative`; `.demo-loader` is `position: absolute; inset: 0`, centers its icon with flexbox, and sits over the text with a semi-transparent cream backdrop (`rgba(246, 239, 216, 0.85)`) so the sentence is dimmed/hidden underneath while "processing".

**Animation**: `.demo-loader-icon` is 40px, `transform-origin: center`, and spins via:

```css
@keyframes demo-loader-spin {
  to { transform: rotate(360deg); }
}
.demo-loader-icon {
  animation: demo-loader-spin 1.1s ease-in-out infinite;
}
```

`ease-in-out` per iteration gives the accelerate/decelerate "breathing" spin rather than a constant mechanical rate.

`@media (prefers-reduced-motion: reduce)`: `.demo-loader-icon { animation: none; }` (static icon, no motion), consistent with the existing reduced-motion block for the hero animations.

**Timing**: a `setTimeout` of 700ms between showing the loader and swapping to the modal. Not configurable; hardcoded constant `SIMULATE_DELAY_MS = 700` in `interactive.js`.

### 3. Computing the diff (before showing the modal)

Today, `fixSelection()` immediately mutates the DOM. This gets split into two phases:

**Phase A — compute (`prepareFix(range)`)**, runs right when SIMULATE is clicked (before the loader delay, so the loader duration is purely cosmetic and not masking real work):
- Reads `demo.textContent` as `fullText`.
- Finds `start`/`end` character offsets of `range` within `fullText` using a helper:
  ```js
  function getOffsetsWithinDemo(demo, range) {
    const preRange = document.createRange();
    preRange.selectNodeContents(demo);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    return { start, end: start + range.toString().length };
  }
  ```
  (Needed because the demo box may already contain a `<span>` from a prior fix — `textContent` flattens it, so plain slicing is safe.)
- Re-uses the existing per-word regex replace (`selectedText.replace(/[A-Za-zÀ-ÿ]+/g, ...)`) but instead of just building the corrected string, also builds an array of pieces: `{ type: 'plain' | 'diff', original, corrected }` per word/separator, so the modal can render chips only where a real replacement happened.
- Returns `{ start, end, fullText, count, correctedText, pieces }`, or `null` if `count === 0` (caller falls back to the existing `noTypos` status, no loader/modal).

**Phase B — render modal (`renderDiffHtml(fullText, start, end, pieces)`)**:
- `prefix = fullText.slice(0, start)`, `suffix = fullText.slice(end)` — both inserted as plain text nodes (via `textContent`, not `innerHTML`, to avoid injecting the demo sentence as markup).
- `pieces` rendered in order: plain pieces as text, diff pieces as two adjacent `<span>`s:
  ```html
  <span class="diff-removed">deja</span><span class="diff-added">déjà</span>
  ```
- The three parts are assembled into the modal's `.modal-diff` container as DOM nodes (not string concatenation), so no escaping bugs are possible even though this demo's text is always trusted/static.

### 4. Modal

**Markup** — appended once, hidden by default, e.g. right after `.try-section`:

```html
<div class="demo-modal-backdrop" data-demo-modal hidden>
  <div class="demo-modal" role="dialog" aria-modal="true" aria-labelledby="demo-modal-label">
    <div class="demo-modal-label" id="demo-modal-label">{t.modalLabel}</div>
    <p class="demo-modal-diff" data-demo-modal-diff></p>
    <div class="demo-modal-actions">
      <button type="button" class="btn-reset" data-demo-modal-cancel>{t.cancelBtn}</button>
      <button type="button" class="btn-primary" data-demo-modal-accept>{t.acceptBtn}</button>
    </div>
  </div>
</div>
```

**Styling**:
- `.demo-modal-backdrop`: `position: fixed; inset: 0`, `background: rgba(32, 24, 15, 0.55)`, flex-centers `.demo-modal`.
- `.demo-modal`: `background: #fbf6e6`, `border: 2px solid #20180f`, `border-radius: 3px`, same `box-shadow` recipe as `.try-section`, `padding: 28px 32px`, `max-width: 560px`.
- `.demo-modal-label`: same treatment as `.section-label` (`700 12px`, uppercase, letter-spacing, `#8a7f63`).
- `.demo-modal-diff`: same font/line-height as `.demo-text` (`20px/1.9`), no border.
- `.diff-removed`: `background: #b3392e1f; color: #b3392e; text-decoration: line-through; border-radius: 2px; padding: 1px 3px;`
- `.diff-added`: `background: #2f6f4724; color: #2f6f47; border-radius: 2px; padding: 1px 3px;` — **new color `#2f6f47`** (muted forest green), used only for this addition-chip; no other element in the page uses green today.
- `.demo-modal-actions`: flex row, `justify-content: flex-end`, `gap: 12px`.
- Cancel button reuses `.btn-reset` styling (outline); Accept reuses `.btn-primary` (filled dark) — consistent with the rest of the page's two-button pattern, not the blue from the reference screenshot.

**Behavior** (`interactive.js`):
- `openModal(diffFragment)`: unhides backdrop, injects diff nodes into `[data-demo-modal-diff]`, focuses the Accept button, traps Escape (listener while open only).
- `closeModal()`: hides backdrop, clears diff content, returns focus to the SIMULATE button, re-enables SIMULATE/Reset buttons.
- Backdrop click: only when the click target *is* the backdrop itself (not a child of `.demo-modal`) — closes as Cancel.
- Cancel button click and Escape keydown — both close as Cancel (no state change).
- Accept button click — runs the existing apply logic (see below), then `closeModal()`.

### 5. Applying the fix (Accept)

Reuses today's `fixSelection()` body almost verbatim, just re-entered from the Accept handler instead of directly from the button click, and operating on the `range`/`correctedText` computed back in Phase A (stashed in a module-level `pendingFix` variable set when the loader starts and cleared on modal close):

- `range.deleteContents()`, insert the corrected-text `<span>` with the existing red-flash-then-fade transition.
- `setStatus(strings.fixed(count))`.
- `showResetButton()`.

No changes to this logic's actual DOM mutation — only how/when it's invoked changes.

### 6. State management in `interactive.js`

- `savedRange` stays as-is (captures selection on mouseup/keyup).
- New module-level `pendingFix` (object or `null`): holds `{ range, correctedText, count }` between "SIMULATE clicked" and "modal closed" (via either Accept or Cancel). Set in the click handler right after `prepareFix()` succeeds; cleared in `closeModal()`.
- SIMULATE and Reset buttons get a `disabled` attribute while `pendingFix` is non-null (i.e., loader showing or modal open), preventing overlapping triggers; re-enabled in `closeModal()`.

### 7. New strings (`src/data/strings.json`)

Add to both `en` and `fr`:
- `modalLabel`: `"PROPOSED FIX"` / `"CORRECTION PROPOSÉE"`
- `cancelBtn`: `"Cancel"` / `"Annuler"`
- `acceptBtn`: `"Accept"` / `"Accepter"`

## Testing

Manual verification via the `run` skill / dev server, both `/` and `/fr/`:

1. Select a typo, click SIMULATE (or double-tap Ctrl) — loader appears over the demo box (~700ms, spinning logo, dimmed text), then a modal opens showing the full sentence with the selected word struck-through/added as diff chips, rest of the sentence plain.
2. Click **Accept** — modal closes, text is corrected in place with the existing brief highlight-fade, status shows "Fixed n typo(s)", Reset button appears.
3. Repeat with a different typo — Reset already visible, cycle still works (loader → modal → accept).
4. Select a typo, open the modal, click **Cancel** — modal closes, demo text is completely unchanged, status stays empty, SIMULATE/Reset re-enabled and usable again.
5. Repeat step 4 but close via backdrop click, then again via Escape key — same no-op result both times.
6. Select text with no actual typos, click SIMULATE — no loader/modal at all; "No typos there" status shows immediately (matches today's behavior).
7. Try selecting outside the demo box, click SIMULATE — "Select a word first" (or "Select inside the box") status, no loader/modal (matches today's behavior).
8. Toggle `prefers-reduced-motion` (via devtools) and re-run step 1 — loader icon is static, no spin.
9. Click Reset while nothing is pending — behaves as before (unaffected by this change).
