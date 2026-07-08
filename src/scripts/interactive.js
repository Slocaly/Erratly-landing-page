// Plain JS behavior for the Erratly landing page: the live typo-fixing demo
// and the FAQ accordion. No framework involved. Language is fixed per page
// (via <html lang>) — Astro's i18n routing serves each locale its own URL.

const TYPO_MAP = {
	en: {
		jumpps: 'jumps',
		recieve: 'receive',
		teh: 'the',
		seperate: 'separate',
		definately: 'definitely',
		occured: 'occurred',
		untill: 'until',
		wich: 'which',
		becuase: 'because',
		adress: 'address',
	},
	fr: {
		deja: 'déjà',
		probleme: 'problème',
		etre: 'être',
		bientot: 'bientôt',
	},
};

const DEMO_TEXT = {
	en: 'Please make sure the report is sent becuase the deadline occured earlier then we expected, wich means teh client is waiting.',
	fr: 'Merci de confirmer votre adresse rapidement car la date limite est deja passée et le probleme doit etre resolu bientot.',
};

const STATUS = {
	en: {
		selectFirst: 'Select a word first',
		selectInside: 'Select inside the box',
		noTypos: 'No typos there — try a misspelled word',
		fixed: (n) => `Fixed ${n} ${n === 1 ? 'typo' : 'typos'} ✓`,
	},
	fr: {
		selectFirst: 'Sélectionnez un mot d’abord',
		selectInside: 'Sélectionnez dans le cadre',
		noTypos: 'Pas de faute ici — essayez un mot mal orthographié',
		fixed: (n) => `${n} faute${n === 1 ? '' : 's'} corrigée${n === 1 ? '' : 's'} ✓`,
	},
};

function getLang() {
	return document.documentElement.lang === 'fr' ? 'fr' : 'en';
}

// Plain-text selections (unlike contenteditable ones) can be collapsed by
// browser default behavior before a button's click handler runs, so the
// selection is captured as soon as it's made and reused later instead of
// re-read from window.getSelection() at click time.
let savedRange = null;
let isBusy = false;

function captureSelectionIfInsideDemo() {
	const demo = document.querySelector('[data-demo-text]');
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		savedRange = null;
		updateButtonStates();
		return;
	}
	const range = selection.getRangeAt(0);
	if (!demo || !demo.contains(range.startContainer)) {
		savedRange = null;
		updateButtonStates();
		return;
	}
	// Chrome's triple-click selects the whole demo paragraph but pushes the
	// range's end boundary into the next sibling (offset 0) even though only
	// demo's own text is visibly highlighted; clamp it back inside demo
	// instead of discarding an otherwise valid selection.
	const clonedRange = range.cloneRange();
	if (!demo.contains(clonedRange.endContainer)) {
		clonedRange.setEnd(demo, demo.childNodes.length);
	}
	savedRange = clonedRange;
	updateButtonStates();
}

function selectAllDemoText() {
	const demo = document.querySelector('[data-demo-text]');
	if (!demo) return;
	const range = document.createRange();
	range.selectNodeContents(demo);
	const selection = window.getSelection();
	selection.removeAllRanges();
	selection.addRange(range);
	savedRange = range.cloneRange();
	demo.focus();
	updateButtonStates();
}

// Simulate is only actionable once something inside the demo box is
// selected; reset/loading state (isBusy) always overrides that.
function updateButtonStates() {
	const simulateBtn = document.querySelector('[data-demo-simulate]');
	const resetBtn = document.querySelector('[data-demo-reset]');
	if (simulateBtn) simulateBtn.disabled = isBusy || !savedRange;
	if (resetBtn) resetBtn.disabled = isBusy;
}

function loadDemoText() {
	const demo = document.querySelector('[data-demo-text]');
	if (demo) demo.textContent = DEMO_TEXT[getLang()];
}

function setStatus(message) {
	const status = document.querySelector('[data-demo-status]');
	if (status) status.textContent = message;
}

function showResetButton() {
	const resetBtn = document.querySelector('[data-demo-reset]');
	if (resetBtn) resetBtn.hidden = false;
}

function resetDemo() {
	loadDemoText();
	setStatus('');
	savedRange = null;
	const resetBtn = document.querySelector('[data-demo-reset]');
	if (resetBtn) resetBtn.hidden = true;
	updateButtonStates();
}

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
	updateButtonStates();
	setTimeout(() => {
		span.style.color = '';
	}, 750);
	setStatus(STATUS[lang].fixed(count));
	showResetButton();
}

function buildDiffFragment(fix) {
	console.log('buildDiffFragment', fix);

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
	setBusy(false);
	const simulateBtn = document.querySelector('[data-demo-simulate]');
	if (simulateBtn) simulateBtn.focus();
}

function showLoader() {
	const loader = document.querySelector('[data-demo-loader]');
	if (loader) loader.hidden = false;
}

function hideLoader() {
	const loader = document.querySelector('[data-demo-loader]');
	if (loader) loader.hidden = true;
}

function setBusy(busy) {
	isBusy = busy;
	updateButtonStates();
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

	setBusy(true);
	showLoader();
	setTimeout(() => {
		hideLoader();
		openModal(fix);
	}, SIMULATE_DELAY_MS);
}

function initDemo() {
	const demo = document.querySelector('[data-demo-text]');
	const simulateBtn = document.querySelector('[data-demo-simulate]');
	const resetBtn = document.querySelector('[data-demo-reset]');
	const selectAllBtn = document.querySelector('[data-demo-select-all]');

	if (simulateBtn) {
		// Safari collapses/moves the page selection on mousedown for a plain
		// button click, unlike Chrome/Firefox — before the click handler
		// below ever runs. Preventing the default mousedown action keeps the
		// user's word selection in the demo box intact.
		simulateBtn.addEventListener('mousedown', (event) => event.preventDefault());
		simulateBtn.addEventListener('click', handleSimulateClick);
	}
	if (resetBtn) resetBtn.addEventListener('click', resetDemo);
	if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllDemoText);
	updateButtonStates();

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

	document.addEventListener('mouseup', captureSelectionIfInsideDemo);
	document.addEventListener('keyup', captureSelectionIfInsideDemo);

	if (demo) {
		let lastCtrlTap = 0;
		demo.addEventListener('keydown', (event) => {
			if (event.key !== 'Control') return;
			const now = Date.now();
			if (now - lastCtrlTap < 450) {
				event.preventDefault();
				handleSimulateClick();
				lastCtrlTap = 0;
			} else {
				lastCtrlTap = now;
			}
		});
	}
}

function initFaqAccordion() {
	document.querySelectorAll('[data-faq-item]').forEach((item) => {
		const question = item.querySelector('[data-faq-question]');
		const marker = item.querySelector('[data-faq-marker]');
		if (!question) return;
		question.addEventListener('click', () => {
			const isOpen = item.classList.toggle('is-open');
			if (marker) marker.textContent = isOpen ? '−' : '+';
		});
	});
}

loadDemoText();
initDemo();
initFaqAccordion();
