# Simulate Loader + Review Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing page's SIMULATE demo show a spinning-logo loader, then a review modal with an inline diff of the proposed fix, before the visitor accepts or cancels it — instead of applying the fix instantly.

**Architecture:** Split the existing instant `fixSelection()` in `src/scripts/interactive.js` into a pure computation step (`prepareFix`, producing a diff description) and a DOM-mutation step (`applyFix`, unchanged from today's behavior). Insert a loader (CSS animation over the demo box) and a modal (new markup in `LandingPage.astro`, driven by new JS) between the two, gated by a module-level `pendingFix` state variable.

**Tech Stack:** Plain Astro + vanilla JS + CSS (no framework, no new dependencies), consistent with the rest of this repo.

## Global Constraints

- No automated test framework exists in this repo (`package.json` has only `astro`). Every step is verified manually with a real browser against the dev server — do not add a test runner as part of this work.
- Start the dev server in background mode per this repo's `CLAUDE.md`: `astro dev --background` (check with `astro dev status`, logs with `astro dev logs`).
- Do NOT run `git commit` at any point while executing this plan. The user has explicitly instructed not to commit automatically this session. Leave all changes in the working tree — the user will commit themselves when ready. Skip every "Commit" step below; a note is left in its place.
- `SIMULATE_DELAY_MS = 700` is a hardcoded constant, not user-configurable.
- New color `#2f6f47` (muted forest green) is introduced only for `.diff-added` chips in the modal — do not reuse it elsewhere on the page.
- `.diff-removed` reuses the existing accent red `#b3392e`.
- The modal's buttons get their own dedicated CSS classes (`.demo-modal-accept`, `.demo-modal-cancel`) rather than reusing `.btn-primary`/`.btn-reset` — `.btn-primary` is currently only applied to an `<a>` and lacks a `border`/`cursor` reset needed for a `<button>`, and reusing it risks unintended side effects on the hero CTA.
- SIMULATE stays selection-based: it never scans or fixes the whole sentence unprompted. The modal shows the full demo sentence as context only; just the current selection is corrected.
- Reference spec: `docs/superpowers/specs/2026-07-06-simulate-loader-and-review-modal-design.md`.

---

### Task 1: Loader overlay + fix-computation refactor

**Files:**
- Modify: `src/components/LandingPage.astro` (markup around line 103-110, styles around line 450-497)
- Modify: `src/scripts/interactive.js` (replaces `fixSelection` at lines 90-134, and its call sites at lines 141 and 154)

**Interfaces:**
- Produces: `prepareFix(range) -> { range, start, end, fullText, count, correctedText, pieces } | null` — `pieces` is an array of `{ type: 'plain', text } | { type: 'diff', original, corrected }` covering the selected text word-by-word.
- Produces: `applyFix(fix)` — mutates the DOM exactly as today's instant fix did (delete selection, insert corrected text in a fading red `<span>`, set status, reveal Reset).
- Produces: `showLoader()`, `hideLoader()`, `setButtonsDisabled(disabled)` — DOM toggles keyed off `[data-demo-loader]`, `[data-demo-simulate]`, `[data-demo-reset]`.
- Produces: `handleSimulateClick()` — the new click/shortcut entry point, replacing `fixSelection` as the event handler.
- Consumed by: Task 2 (`prepareFix`'s return value feeds the modal's diff rendering; `applyFix` is called from the modal's Accept handler instead of directly here).

- [ ] **Step 1: Add the loader markup**

In `src/components/LandingPage.astro`, replace the demo-text block:

```html
						<div
							class="erratly-demo-text demo-text"
							contenteditable="false"
							spellcheck="false"
							tabindex="0"
							data-demo-text
						>
						</div>
```

with:

```html
						<div class="demo-text-wrap">
							<div
								class="erratly-demo-text demo-text"
								contenteditable="false"
								spellcheck="false"
								tabindex="0"
								data-demo-text
							>
							</div>
							<div class="demo-loader" data-demo-loader hidden>
								<img
									src="/erratly-icon-placeholder.svg"
									alt=""
									class="demo-loader-icon"
								/>
							</div>
						</div>
```

- [ ] **Step 2: Add the loader CSS (and move the demo-text's margin onto its new wrapper)**

In the same file's `<style>` block, replace:

```css
	.demo-text {
		font:
			400 20px / 1.9 "JetBrains Mono",
			monospace;
		color: #20180f;
		outline: none;
		min-height: 100px;
		caret-color: #b3392e;
		border-bottom: 1px dashed #20180f33;
		padding-bottom: 16px;
		margin-bottom: 16px;
	}
```

with:

```css
	.demo-text-wrap {
		position: relative;
		margin-bottom: 16px;
	}
	.demo-text {
		font:
			400 20px / 1.9 "JetBrains Mono",
			monospace;
		color: #20180f;
		outline: none;
		min-height: 100px;
		caret-color: #b3392e;
		border-bottom: 1px dashed #20180f33;
		padding-bottom: 16px;
	}
	.demo-loader {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(246, 239, 216, 0.85);
	}
	.demo-loader-icon {
		width: 40px;
		height: 40px;
		transform-origin: center;
		animation: demo-loader-spin 1.1s ease-in-out infinite;
	}
	@keyframes demo-loader-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.demo-loader-icon {
			animation: none;
		}
	}
```

- [ ] **Step 3: Add a disabled style for the demo buttons**

In the same `<style>` block, right after the existing `.demo-status` rule, add:

```css
	.btn-simulate:disabled,
	.btn-reset:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
```

- [ ] **Step 4: Replace `fixSelection` with `prepareFix` / `applyFix` / loader helpers**

In `src/scripts/interactive.js`, replace the entire `fixSelection` function (currently lines 90-134):

```js
function fixSelection() {
	const lang = getLang();
	const strings = STATUS[lang];
	const typoMap = TYPO_MAP[lang];

	if (!savedRange) {
		const liveSelection = window.getSelection();
		const hasOutsideSelection = liveSelection && liveSelection.rangeCount > 0 && !liveSelection.isCollapsed;
		setStatus(hasOutsideSelection ? strings.selectInside : strings.selectFirst);
		return;
	}

	const range = savedRange;
	const selectedText = range.toString();
	let count = 0;
	const corrected = selectedText.replace(/[A-Za-zÀ-ÿ]+/g, (word) => {
		const lower = word.toLowerCase();
		const replacement = typoMap[lower];
		if (!replacement) return word;
		count++;
		return word[0] === word[0].toUpperCase()
			? replacement[0].toUpperCase() + replacement.slice(1)
			: replacement;
	});

	if (count === 0) {
		setStatus(strings.noTypos);
		return;
	}

	range.deleteContents();
	const span = document.createElement('span');
	span.textContent = corrected;
	span.style.color = '#b3392e';
	span.style.transition = 'color .6s ease';
	range.insertNode(span);
	window.getSelection().removeAllRanges();
	savedRange = null;
	setTimeout(() => {
		span.style.color = '';
	}, 750);

	setStatus(strings.fixed(count));
	showResetButton();
}
```

with:

```js
const SIMULATE_DELAY_MS = 700;

let pendingFix = null;

function getOffsetsWithinDemo(demo, range) {
	const preRange = document.createRange();
	preRange.selectNodeContents(demo);
	preRange.setEnd(range.startContainer, range.startOffset);
	const start = preRange.toString().length;
	return { start, end: start + range.toString().length };
}

// Splits on word tokens (odd array indices) so plain separators between them
// survive untouched — this doubles as the corrected-string builder and the
// per-word diff-piece builder the review modal renders (see Task 2).
function buildPieces(selectedText, typoMap) {
	const tokens = selectedText.split(/([A-Za-zÀ-ÿ]+)/);
	const pieces = [];
	let count = 0;
	let correctedText = '';
	tokens.forEach((token, i) => {
		const isWord = i % 2 === 1;
		if (!isWord) {
			if (token) pieces.push({ type: 'plain', text: token });
			correctedText += token;
			return;
		}
		const lower = token.toLowerCase();
		const replacement = typoMap[lower];
		if (!replacement) {
			pieces.push({ type: 'plain', text: token });
			correctedText += token;
			return;
		}
		const correctedWord = token[0] === token[0].toUpperCase()
			? replacement[0].toUpperCase() + replacement.slice(1)
			: replacement;
		count++;
		pieces.push({ type: 'diff', original: token, corrected: correctedWord });
		correctedText += correctedWord;
	});
	return { pieces, count, correctedText };
}

function prepareFix(range) {
	const demo = document.querySelector('[data-demo-text]');
	const typoMap = TYPO_MAP[getLang()];
	const { start, end } = getOffsetsWithinDemo(demo, range);
	const fullText = demo.textContent;
	const selectedText = range.toString();
	const { pieces, count, correctedText } = buildPieces(selectedText, typoMap);
	if (count === 0) return null;
	return { range, start, end, fullText, count, correctedText, pieces };
}

function applyFix(fix) {
	const { range, correctedText, count } = fix;
	const lang = getLang();
	range.deleteContents();
	const span = document.createElement('span');
	span.textContent = correctedText;
	span.style.color = '#b3392e';
	span.style.transition = 'color .6s ease';
	range.insertNode(span);
	window.getSelection().removeAllRanges();
	savedRange = null;
	setTimeout(() => {
		span.style.color = '';
	}, 750);
	setStatus(STATUS[lang].fixed(count));
	showResetButton();
}

function showLoader() {
	const loader = document.querySelector('[data-demo-loader]');
	if (loader) loader.hidden = false;
}

function hideLoader() {
	const loader = document.querySelector('[data-demo-loader]');
	if (loader) loader.hidden = true;
}

function setButtonsDisabled(disabled) {
	const simulateBtn = document.querySelector('[data-demo-simulate]');
	const resetBtn = document.querySelector('[data-demo-reset]');
	if (simulateBtn) simulateBtn.disabled = disabled;
	if (resetBtn) resetBtn.disabled = disabled;
}

function handleSimulateClick() {
	const lang = getLang();
	const strings = STATUS[lang];

	if (!savedRange) {
		const liveSelection = window.getSelection();
		const hasOutsideSelection = liveSelection && liveSelection.rangeCount > 0 && !liveSelection.isCollapsed;
		setStatus(hasOutsideSelection ? strings.selectInside : strings.selectFirst);
		return;
	}

	const fix = prepareFix(savedRange);
	if (!fix) {
		setStatus(strings.noTypos);
		return;
	}

	setButtonsDisabled(true);
	showLoader();
	setTimeout(() => {
		hideLoader();
		applyFix(fix);
		setButtonsDisabled(false);
	}, SIMULATE_DELAY_MS);
}
```

Note: the `setTimeout` body above (`applyFix(fix); setButtonsDisabled(false);`) is intentionally the pre-modal behavior — Task 2 replaces it with `openModal(fix);`.

- [ ] **Step 5: Wire the new handler in `initDemo`**

In the same file, in `initDemo()`, replace:

```js
	if (simulateBtn) simulateBtn.addEventListener('click', fixSelection);
```

with:

```js
	if (simulateBtn) simulateBtn.addEventListener('click', handleSimulateClick);
```

And replace the Ctrl-Ctrl shortcut's call:

```js
			if (now - lastCtrlTap < 450) {
				event.preventDefault();
				fixSelection();
				lastCtrlTap = 0;
```

with:

```js
			if (now - lastCtrlTap < 450) {
				event.preventDefault();
				handleSimulateClick();
				lastCtrlTap = 0;
```

- [ ] **Step 6: Start the dev server**

```bash
astro dev --background
astro dev status
```

Expected: status shows the server running; note the printed local URL (e.g. `http://localhost:4321`).

- [ ] **Step 7: Manually verify in a browser**

Open the local URL (and `/fr/`) and check:
1. Select a typo word in the demo box (e.g. "becuase" on `/`, "deja" on `/fr/`), click SIMULATE — a dimmed overlay with a spinning logo appears over the sentence for about 700ms, then disappears and the word is corrected in place with the existing brief red-fade highlight, status shows "Fixed 1 typo ✓", Reset button appears.
2. While the loader is visible, confirm the SIMULATE and Reset buttons look disabled (dimmed) and don't respond to clicks.
3. Select non-typo text, click SIMULATE — no loader appears at all; status immediately shows "No typos there — try a misspelled word".
4. Click SIMULATE with no selection — no loader; status immediately shows "Select a word first".
5. Toggle "Emulate CSS media feature prefers-reduced-motion: reduce" in devtools' Rendering tab, repeat check 1 — the loader still appears/disappears on the same timing, but the icon does not visibly spin.

Check logs if anything looks wrong: `astro dev logs`.

- [ ] **Step 8: Do not commit**

Per the Global Constraints, skip committing. Leave the working tree as-is for the user to review.

---

### Task 2: Review modal with inline diff

**Files:**
- Modify: `src/data/strings.json` (add 3 keys to `en` and `fr`)
- Modify: `src/components/LandingPage.astro` (add modal markup after the `try-section`, add modal/diff CSS)
- Modify: `src/scripts/interactive.js` (add `buildDiffFragment`, `openModal`, `closeModal`; rewire `handleSimulateClick`'s timeout callback; wire Accept/Cancel/backdrop/Escape in `initDemo`)

**Interfaces:**
- Consumes: `prepareFix`, `applyFix`, `pendingFix`, `setButtonsDisabled`, `showLoader`/`hideLoader`, `SIMULATE_DELAY_MS` from Task 1 — used as-is, unmodified.
- Produces: `buildDiffFragment(fix) -> DocumentFragment` — builds the modal's diff content from `fix.fullText`/`fix.start`/`fix.end`/`fix.pieces`.
- Produces: `openModal(fix)`, `closeModal()` — modal lifecycle, toggling `[data-demo-modal]`'s `hidden` attribute and managing `pendingFix`/focus/button-disabled state.

- [ ] **Step 1: Add modal strings**

In `src/data/strings.json`, in the `"en"` object, right after `"resetBtn": "RESET",`, add:

```json
			"modalLabel": "PROPOSED FIX",
			"cancelBtn": "Cancel",
			"acceptBtn": "Accept",
```

In the `"fr"` object, right after `"resetBtn": "RÉINITIALISER",`, add:

```json
			"modalLabel": "CORRECTION PROPOSÉE",
			"cancelBtn": "Annuler",
			"acceptBtn": "Accepter",
```

(Keep the file valid JSON — no trailing comma after the last key in each object.)

- [ ] **Step 2: Add the modal markup**

In `src/components/LandingPage.astro`, right after the closing `</section>` of `id="try"` (the `try-section`) and before the next `<div class="section-label-row">` (the "How it works" label), add:

```html
					<div class="demo-modal-backdrop" data-demo-modal hidden>
						<div
							class="demo-modal"
							role="dialog"
							aria-modal="true"
							aria-labelledby="demo-modal-label"
						>
							<div class="demo-modal-label" id="demo-modal-label">
								{t.modalLabel}
							</div>
							<p class="demo-modal-diff" data-demo-modal-diff></p>
							<div class="demo-modal-actions">
								<button
									type="button"
									class="demo-modal-cancel"
									data-demo-modal-cancel>{t.cancelBtn}</button
								>
								<button
									type="button"
									class="demo-modal-accept"
									data-demo-modal-accept>{t.acceptBtn}</button
								>
							</div>
						</div>
					</div>
```

- [ ] **Step 3: Add the modal/diff CSS**

In the same file's `<style>` block, right after the `.demo-status` rule (and its new `:disabled` sibling from Task 1), add:

```css
	.demo-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(32, 24, 15, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		z-index: 10;
	}
	.demo-modal {
		background: #fbf6e6;
		border: 2px solid #20180f;
		border-radius: 3px;
		box-shadow: 0 10px 30px rgba(32, 24, 15, 0.14);
		padding: 28px 32px;
		max-width: 560px;
		width: 100%;
	}
	.demo-modal-label {
		font:
			700 12px "JetBrains Mono",
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #8a7f63;
		margin-bottom: 14px;
	}
	.demo-modal-diff {
		font:
			400 20px / 1.9 "JetBrains Mono",
			monospace;
		color: #20180f;
		margin: 0 0 24px;
	}
	.diff-removed {
		background: #b3392e1f;
		color: #b3392e;
		text-decoration: line-through;
		border-radius: 2px;
		padding: 1px 3px;
	}
	.diff-added {
		background: #2f6f4724;
		color: #2f6f47;
		border-radius: 2px;
		padding: 1px 3px;
	}
	.demo-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
	}
	.demo-modal-cancel {
		font:
			700 12px "JetBrains Mono",
			monospace;
		background: transparent;
		color: #b3392e;
		border: 1px solid #b3392e;
		border-radius: 2px;
		padding: 10px 16px;
		cursor: pointer;
	}
	.demo-modal-accept {
		font:
			700 13px "JetBrains Mono",
			monospace;
		letter-spacing: 0.04em;
		background: #20180f;
		color: #f6efd8;
		border: none;
		border-radius: 3px;
		padding: 13px 22px;
		cursor: pointer;
	}
```

- [ ] **Step 4: Add `buildDiffFragment`, `openModal`, `closeModal`**

In `src/scripts/interactive.js`, right after the `applyFix` function (added in Task 1), add:

```js
function buildDiffFragment(fix) {
	const { fullText, start, end, pieces } = fix;
	const fragment = document.createDocumentFragment();
	const prefix = fullText.slice(0, start);
	const suffix = fullText.slice(end);
	if (prefix) fragment.appendChild(document.createTextNode(prefix));
	pieces.forEach((piece) => {
		if (piece.type === 'plain') {
			fragment.appendChild(document.createTextNode(piece.text));
			return;
		}
		const removed = document.createElement('span');
		removed.className = 'diff-removed';
		removed.textContent = piece.original;
		const added = document.createElement('span');
		added.className = 'diff-added';
		added.textContent = piece.corrected;
		fragment.appendChild(removed);
		fragment.appendChild(added);
	});
	if (suffix) fragment.appendChild(document.createTextNode(suffix));
	return fragment;
}

function openModal(fix) {
	pendingFix = fix;
	const modal = document.querySelector('[data-demo-modal]');
	const diffContainer = document.querySelector('[data-demo-modal-diff]');
	if (!modal || !diffContainer) return;
	diffContainer.textContent = '';
	diffContainer.appendChild(buildDiffFragment(fix));
	modal.hidden = false;
	const acceptBtn = document.querySelector('[data-demo-modal-accept]');
	if (acceptBtn) acceptBtn.focus();
}

function closeModal() {
	const modal = document.querySelector('[data-demo-modal]');
	const diffContainer = document.querySelector('[data-demo-modal-diff]');
	if (modal) modal.hidden = true;
	if (diffContainer) diffContainer.textContent = '';
	pendingFix = null;
	setButtonsDisabled(false);
	const simulateBtn = document.querySelector('[data-demo-simulate]');
	if (simulateBtn) simulateBtn.focus();
}
```

- [ ] **Step 5: Replace the instant-apply timeout with the modal**

In the same file, in `handleSimulateClick`, replace:

```js
	setButtonsDisabled(true);
	showLoader();
	setTimeout(() => {
		hideLoader();
		applyFix(fix);
		setButtonsDisabled(false);
	}, SIMULATE_DELAY_MS);
```

with:

```js
	setButtonsDisabled(true);
	showLoader();
	setTimeout(() => {
		hideLoader();
		openModal(fix);
	}, SIMULATE_DELAY_MS);
```

- [ ] **Step 6: Wire Accept, Cancel, backdrop, and Escape**

In the same file's `initDemo()`, right after the existing `if (resetBtn) resetBtn.addEventListener('click', resetDemo);` line, add:

```js
	const modal = document.querySelector('[data-demo-modal]');
	const modalAccept = document.querySelector('[data-demo-modal-accept]');
	const modalCancel = document.querySelector('[data-demo-modal-cancel]');

	if (modalAccept) {
		modalAccept.addEventListener('click', () => {
			if (pendingFix) applyFix(pendingFix);
			closeModal();
		});
	}
	if (modalCancel) modalCancel.addEventListener('click', closeModal);
	if (modal) {
		modal.addEventListener('click', (event) => {
			if (event.target === modal) closeModal();
		});
	}
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
	});
```

- [ ] **Step 7: Restart the dev server and verify strings/markup loaded**

```bash
astro dev stop
astro dev --background
astro dev status
```

- [ ] **Step 8: Manually verify the full flow in a browser**

Open the local URL (and `/fr/`) and check every scenario from the spec's Testing section:
1. Select a typo (e.g. "becuase"), click SIMULATE — loader plays (~700ms), then a modal opens: dimmed backdrop, cream panel, "PROPOSED FIX" label, full sentence shown with the selected word struck through in a red chip immediately followed by the correction in a green chip, rest of the sentence plain. Cancel and Accept buttons are visible, Accept is focused.
2. Click **Accept** — modal closes, the word is corrected in place with the existing brief red-fade highlight, status shows "Fixed 1 typo ✓", Reset button appears, SIMULATE/Reset are usable again.
3. Select a different typo, repeat — cycle works a second time (Reset already visible).
4. Select a typo, open the modal, click **Cancel** — modal closes, demo text is completely unchanged, status stays empty, SIMULATE/Reset re-enabled.
5. Repeat step 4 but close by clicking the dimmed backdrop (not the panel) — same no-op result.
6. Repeat step 4 but close by pressing **Escape** — same no-op result.
7. Select non-typo text, click SIMULATE — no loader, no modal; "No typos there" status shows immediately (unchanged from Task 1).
8. Click SIMULATE with no selection, or a selection outside the demo box — no loader, no modal; the correct "Select a word first" / "Select inside the box" status shows immediately.
9. Select a longer span covering multiple typos (e.g. the whole `fr` sentence, which has 5 typos) — the modal shows all five corrections as separate diff-chip pairs in the same sentence, and Accept fixes all five at once, matching the count in "Fixed 5 typos ✓".
10. Toggle `prefers-reduced-motion: reduce` in devtools and repeat step 1 — loader icon is static (no spin), everything else unchanged.
11. Repeat 1-2 on `/fr/` — modal label, button labels, and status messages are in French, and the diff chips show the correct French corrections (déjà, problème, être, résolu, bientôt).

Check `astro dev logs` if anything looks wrong.

- [ ] **Step 9: Do not commit**

Per the Global Constraints, skip committing. Leave the working tree as-is for the user to review.
