// Format mode for Preach MD.
// Provides bold, italic, underline, and highlight wrapping applied directly
// to the source file from selected text in the preach view.

import { App, Component, MarkdownRenderer, TFile, requireApiVersion } from "obsidian";
import type { Block, Snapshot } from "./blocks";

export interface FormatWrapper {
	open: string;
	close: string;
	/** The element Obsidian renders this wrapper as. */
	tag: string;
	/** For `mark`: the expected data-highlight value, "" for a plain highlight. */
	colour?: string;
}

export const FORMAT_BOLD: FormatWrapper = { open: "**", close: "**", tag: "strong" };
export const FORMAT_ITALIC: FormatWrapper = { open: "*", close: "*", tag: "em" };
export const FORMAT_UNDERLINE: FormatWrapper = { open: "<u>", close: "</u>", tag: "u" };
export const FORMAT_HIGHLIGHT: FormatWrapper = { open: "==", close: "==", tag: "mark", colour: "" };

export const HIGHLIGHT_COLOURS: Record<string, string> = {
	red: "\u{1F534}",
	orange: "\u{1F7E0}",
	yellow: "\u{1F7E1}",
	green: "\u{1F7E2}",
	blue: "\u{1F535}",
	purple: "\u{1F7E3}",
};

const HIGHLIGHT_EMOJI = [
	"\u{1F534}", "\u{1F7E5}", "\u{1F7E0}", "\u{1F7E7}", "\u{1F7E1}", "\u{1F7E8}",
	"\u{1F7E2}", "\u{1F7E9}", "\u{1F535}", "\u{1F7E6}", "\u{1F7E3}", "\u{1F7EA}",
];

export function colourWrapper(colour: string): FormatWrapper {
	return { open: "==" + HIGHLIGHT_COLOURS[colour], close: "==", tag: "mark", colour };
}

// ponytail: a word that occurs more than this many times in one block refuses to format; raise it if that bites, each candidate costs one render.
const MAX_CANDIDATES = 12;

/** Every edit that wraps one occurrence of `sel` in `src`, in source order. */
export function wrapCandidates(src: string, sel: string, open: string, close: string): string[] {
	const edits: string[] = [];
	for (let i = src.indexOf(sel); i !== -1; i = src.indexOf(sel, i + 1)) {
		edits.push(src.slice(0, i) + open + sel + close + src.slice(i + sel.length));
		if (edits.length > MAX_CANDIDATES) return [];
	}
	return edits;
}

/**
 * Every edit that recolours (`colour` a name or "") or unwraps (`colour` null)
 * one highlight whose rendered text is `inner`, in source order.
 */
export function markCandidates(src: string, inner: string, colour: string | null): string[] {
	const replacement =
		colour === null ? inner.replace(/^\uFE0F/, "") : "==" + (HIGHLIGHT_COLOURS[colour] ?? "") + inner + "==";
	const edits: string[] = [];
	for (const emoji of ["", ...HIGHLIGHT_EMOJI]) {
		const target = "==" + emoji + inner + "==";
		for (let i = src.indexOf(target); i !== -1; i = src.indexOf(target, i + 1)) {
			edits.push(src.slice(0, i) + replacement + src.slice(i + target.length));
			if (edits.length > MAX_CANDIDATES) return [];
		}
	}
	return edits;
}

const textOffset = (root: Node, node: Node, offset: number): number => {
	const r = (root.ownerDocument ?? document).createRange();
	r.setStart(root, 0);
	r.setEnd(node, offset);
	return r.toString().length;
};

const span = (root: Node, el: Element): [number, number] => {
	const start = textOffset(root, el, 0);
	return [start, start + (el.textContent ?? "").length];
};

const isTarget = (el: Element, w: FormatWrapper): boolean =>
	w.tag !== "mark" || (el.getAttribute("data-highlight") ?? "") === (w.colour ?? "");

/** Result returned by captureFromSelection. */
export interface CaptureResult {
	/** Bounding rect of the selection range (for toolbar positioning). */
	rect: DOMRect;
}

/** Why a format action could not be applied. */
export type FormatFailReason =
	| "scripture-expand"
	| "cross-block"
	| "not-found"
	| "collision"
	| "stale"
	| "failed";

/**
 * Text shown for each bail condition. A total record rather than a lookup with
 * a fallback, so adding a reason to the union without a message is a compile
 * error, and no key can resolve through Object.prototype.
 */
const FORMAT_FAIL_MESSAGE: Record<FormatFailReason, string> = {
	"scripture-expand": "Close the open passage before formatting.",
	"cross-block": "Can't format across two paragraphs.",
	"not-found": "Can't match that text to the note source.",
	collision: "That text is already formatted.",
	stale: "The note is updating. Try again in a moment.",
	failed: "Couldn't apply that format. The note is unchanged.",
};

export class FormatManager {
	private app: App;
	private file: TFile | null;
	private snapshot: Snapshot | null = null;

	// The selection captured on pointerdown (before focus changes clear it)
	private capturedSelection: {
		snapshot: Snapshot;
		block: Block;
		text: string;
		a: number;
		b: number;
		rect: DOMRect;
	} | null = null;

	// Reused notice element
	private noticeEl: HTMLElement | null = null;
	private noticeTimeout: number | null = null;

	constructor(app: App, file: TFile | null) {
		this.app = app;
		this.file = file;
	}

	updateFile(file: TFile): void {
		this.file = file;
	}

	updateSnapshot(snapshot: Snapshot | null): void {
		this.snapshot = snapshot;
	}

	/**
	 * Inspect the current window selection, validate it is inside the preach body,
	 * not cross-block, not inside a scripture expand, and capture it.
	 *
	 * Returns a CaptureResult on success (with selection bounding rect),
	 * or null if the selection is empty, collapsed, or out of bounds.
	 * On a bail condition (cross-block, scripture, etc.) calls showFormatFailNotice
	 * and returns null.
	 */
	captureFromSelection(bodyEl: HTMLElement): CaptureResult | null {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

		const selectedText = sel.toString().trim();
		if (!selectedText) return null;

		// Check the selection is inside the preach body
		const range = sel.getRangeAt(0);
		if (!bodyEl.contains(range.commonAncestorContainer)) return null;

		const rect = range.getBoundingClientRect();

		const blockOf = (n: Node): HTMLElement | null => {
			for (let c: Node | null = n; c; c = c.parentNode) {
				if (c.instanceOf(HTMLElement) && c.classList.contains("preach-block")) return c;
			}
			return null;
		};
		const blockEl = blockOf(range.startContainer);
		if (!blockEl) return null;
		if (blockOf(range.endContainer) !== blockEl) {
			this.showFormatFailNotice("cross-block", rect);
			return null;
		}

		if (blockEl.querySelector(".preach-scripture-expand")) {
			this.showFormatFailNotice("scripture-expand", rect);
			return null;
		}

		const block = this.snapshot?.blocks[parseInt(blockEl.dataset.blockIndex ?? "", 10)];
		if (!this.snapshot || !block) {
			this.showFormatFailNotice("stale", rect);
			return null;
		}

		const text = blockEl.textContent ?? "";
		let a = textOffset(blockEl, range.startContainer, range.startOffset);
		let b = textOffset(blockEl, range.endContainer, range.endOffset);
		while (a < b && /\s/.test(text[a])) a++;
		while (b > a && /\s/.test(text[b - 1])) b--;
		if (a === b) return null;

		this.capturedSelection = { snapshot: this.snapshot, block, text, a, b, rect };
		return { rect };
	}

	/**
	 * Wrap the captured selection in `wrapper` and write it to the source file.
	 * A candidate edit is written only if it is the single one that renders to
	 * the original page with the wrapper's element around exactly the selection.
	 */
	async applyFormat(wrapper: FormatWrapper): Promise<void> {
		const captured = this.capturedSelection;
		this.capturedSelection = null;
		if (!captured || !this.file) return;
		const { snapshot, block, text, a, b, rect } = captured;
		const file = this.file;

		const src = snapshot.text.slice(block.start, block.end);
		const sel = text.slice(a, b);
		const component = new Component();
		component.load();
		let edit: string | null = null;
		let reason: FormatFailReason = "not-found";
		try {
			const renderInto = async (md: string): Promise<HTMLElement> => {
				const div = createDiv();
				await MarkdownRenderer.render(this.app, md, div, file.path, component);
				div.normalize();
				return div;
			};

			const base = await renderInto(src);
			if (base.textContent === text) {
				const covering = (tag: string): Element[] =>
					Array.from(base.querySelectorAll(tag)).filter((el) => {
						const [s, e] = span(base, el);
						return s <= a && e >= b;
					});
				const marks: Element[] = Array.from(base.querySelectorAll("mark"));
				const hit = wrapper.tag === "mark" ? covering("mark") : [];
				let candidates: string[] = [];
				let accepts: (d: HTMLElement) => boolean = () => false;

				if (hit.length > 1) {
					// refuse
				} else if (hit.length === 1) {
					const k = marks.indexOf(hit[0]);
					const cur = hit[0].getAttribute("data-highlight") ?? "";
					const t = wrapper.colour ?? "";
					const unwrap = t === cur;
					candidates = markCandidates(src, hit[0].textContent ?? "", unwrap ? null : t);
					accepts = (d) => {
						if (unwrap) {
							const expected = base.cloneNode(true) as HTMLElement;
							const m = expected.querySelectorAll("mark")[k];
							const first = m.firstChild;
							if (first?.nodeType === 3 && first.nodeValue) first.nodeValue = first.nodeValue.replace(/^\uFE0F/, "");
							m.replaceWith(...Array.from(m.childNodes));
							expected.normalize();
							return d.isEqualNode(expected);
						}
						const dm = d.querySelectorAll("mark");
						if (dm.length !== marks.length || (dm[k].getAttribute("data-highlight") ?? "") !== t) return false;
						if (cur === "" && !hit[0].hasAttribute("data-highlight")) dm[k].removeAttribute("data-highlight");
						else dm[k].setAttribute("data-highlight", cur);
						d.normalize();
						return d.isEqualNode(base);
					};
				} else if (wrapper.tag !== "mark" && covering(wrapper.tag).length > 0) {
					reason = "collision";
				} else {
					candidates = wrapCandidates(src, sel, wrapper.open, wrapper.close);
					accepts = (d) => {
						const hits = Array.from(d.querySelectorAll(wrapper.tag)).filter((el) => {
							if (!isTarget(el, wrapper)) return false;
							const [s, e] = span(d, el);
							return s === a && e === b;
						});
						if (hits.length !== 1) return false;
						hits[0].replaceWith(...Array.from(hits[0].childNodes));
						d.normalize();
						return d.isEqualNode(base);
					};
				}

				const landed: string[] = [];
				for (const candidate of candidates) {
					if (accepts(await renderInto(candidate))) landed.push(candidate);
				}
				if (landed.length === 1) edit = landed[0];
			}
		} finally {
			component.unload();
		}

		if (edit === null) {
			this.showFormatFailNotice(reason, rect);
			return;
		}

		let stale = false;
		await this.app.vault.process(file, (data) => {
			if (data !== snapshot.text) {
				stale = true;
				return data;
			}
			return data.slice(0, block.start) + edit + data.slice(block.end);
		});
		if (stale) this.showFormatFailNotice("stale", rect);
	}

	/**
	 * Show a brief notice explaining why formatting could not be applied.
	 *
	 * Pass the selection's bounding rect where one is available, and the notice
	 * sits beside the text it is about. Without a rect it falls back to the
	 * centre of the viewport. The fallback is a modifier class rather than a
	 * default in the base rule, because the base rule is position: fixed with
	 * auto offsets, which pins the element at its hypothetical static position
	 * instead of anywhere meaningful.
	 */
	showFormatFailNotice(reason: FormatFailReason, rect?: DOMRect): void {
		// Ensure a single notice element exists
		if (!this.noticeEl) {
			// Created straight into body. destroy() nulls this field whenever it
			// removes the element, so a non-null noticeEl is always connected and
			// there is no detached state to re-attach from.
			this.noticeEl = document.body.createDiv({ cls: "preach-format-fail-notice" });
			this.noticeEl.addEventListener("pointerdown", () => this.hideFormatFailNotice());
		}

		// Set on every call, not just on creation: the element is reused, so a
		// later failure would otherwise show the previous reason's message.
		this.noticeEl.textContent = FORMAT_FAIL_MESSAGE[reason];

		// The element is reused across calls, so each mode has to undo the
		// other's placement rather than assume a clean slate.
		if (rect) {
			this.noticeEl.classList.remove("preach-format-fail-notice--centred");
			this.positionNotice(rect);
		} else {
			this.noticeEl.setCssStyles({ top: "", left: "", visibility: "" });
			this.noticeEl.classList.add("preach-format-fail-notice--centred");
		}

		this.noticeEl.classList.add("preach-format-fail-notice--visible");

		if (this.noticeTimeout !== null) window.clearTimeout(this.noticeTimeout);
		this.noticeTimeout = window.setTimeout(() => this.hideFormatFailNotice(), 3000);
	}

	private hideFormatFailNotice(): void {
		if (this.noticeTimeout !== null) {
			window.clearTimeout(this.noticeTimeout);
			this.noticeTimeout = null;
		}
		this.noticeEl?.classList.remove("preach-format-fail-notice--visible");
	}

	private positionNotice(rect: DOMRect): void {
		if (!this.noticeEl) return;
		const TOOLBAR_H = 36;
		const MARGIN = 8;
		const vpW = window.innerWidth;

		// Temporarily show off-screen to measure width
		this.noticeEl.setCssStyles({ visibility: "hidden", top: "-9999px", left: "-9999px" });

		const noticeW = this.noticeEl.offsetWidth || 260;
		const midX = rect.left + rect.width / 2;
		let left = midX - noticeW / 2;
		left = Math.max(8, Math.min(vpW - noticeW - 8, left));

		let top: number;
		if (rect.top > TOOLBAR_H + MARGIN) {
			top = rect.top - TOOLBAR_H - MARGIN;
		} else {
			top = rect.bottom + MARGIN;
		}

		this.noticeEl.setCssStyles({ left: `${left}px`, top: `${top}px`, visibility: "" });
	}

	/** Clean up any notice elements (call on view close). */
	destroy(): void {
		if (this.noticeTimeout !== null) window.clearTimeout(this.noticeTimeout);
		this.noticeEl?.remove();
		this.noticeEl = null;
	}
}

/**
 * Manages a floating format toolbar in the preach view.
 * Registers a selectionchange listener; shows/hides the toolbar
 * based on whether a valid selection exists inside .preach-body.
 *
 * bodyElGetter is called on each selection event so it always has
 * the current body element (which is replaced on every render).
 */
export class PreachFormatToolbar {
	private formatManager: FormatManager;
	private bodyElGetter: () => HTMLElement | null;
	private containerEl: HTMLElement;
	private toolbarEl: HTMLElement;
	private selectionChangeHandler: () => void;
	private touchStartHandler: () => void;
	private touchEndHandler: () => void;
	private visible = false;

	// Touch-gating state. iOS's selection finalisation must complete
	// before we mutate the DOM, or the word-boundary detection breaks
	// and the selection falls back to "press point to end of container".
	// We hold the toolbar during active touch and for 200ms after release.
	private touchActive = false;
	private settleTimer: number | null = null;
	private readonly SETTLE_MS = 200;

	constructor(
		formatManager: FormatManager,
		bodyElGetter: () => HTMLElement | null,
		containerEl: HTMLElement
	) {
		this.formatManager = formatManager;
		this.bodyElGetter = bodyElGetter;
		this.containerEl = containerEl;

		this.toolbarEl = this.buildToolbar(this.containerEl);

		this.touchStartHandler = (): void => {
			this.touchActive = true;
			// Hide immediately. No layout reads, no DOM mutations beyond
			// removing a class - safe during active gesture.
			this.hide();
			if (this.settleTimer !== null) {
				window.clearTimeout(this.settleTimer);
				this.settleTimer = null;
			}
		};

		this.touchEndHandler = (): void => {
			if (this.settleTimer !== null) {
				window.clearTimeout(this.settleTimer);
			}
			this.settleTimer = window.setTimeout(() => {
				this.touchActive = false;
				this.settleTimer = null;
				this.onSelectionChange();
			}, this.SETTLE_MS);
		};

		this.selectionChangeHandler = (): void => this.onSelectionChange();

		// Touchstart on the scroll container so taps on the toolbar itself
		// don't gate it. Touchend on document so we catch the release even
		// if the finger drifts off-screen.
		const body = this.bodyElGetter();
		const touchTarget = body?.closest(".preach-content") ?? document;
		touchTarget.addEventListener("touchstart", this.touchStartHandler, { passive: true });
		document.addEventListener("touchend", this.touchEndHandler, { passive: true });
		document.addEventListener("touchcancel", this.touchEndHandler, { passive: true });
		document.addEventListener("selectionchange", this.selectionChangeHandler);
	}

	private buildToolbar(parent: HTMLElement): HTMLElement {
		const bar = parent.createDiv({ cls: "preach-inline-format-bar" });
		bar.setAttribute("aria-label", "Format selection");

		const makeBtn = (
			label: string,
			title: string,
			wrapper: FormatWrapper,
			row: HTMLElement,
			extraClass?: string
		): void => {
			const btn = row.createEl("button", {
				cls: "preach-inline-fmt-btn" + (extraClass ? " " + extraClass : ""),
			});
			btn.setAttribute("aria-label", title);
			btn.setAttribute("title", title);
			if (label === "H") {
				// Highlight icon: small coloured square
				btn.createSpan({ cls: "preach-fmt-swatch" });
			} else {
				btn.textContent = label;
			}

			// pointerdown + preventDefault keeps the selection alive while focus moves
			btn.addEventListener("pointerdown", (e: PointerEvent) => {
				e.preventDefault();
				e.stopPropagation();

				const currentBody = this.bodyElGetter();
				if (!currentBody) { this.hide(); return; }

				// Capture from the live selection right now
				const result = this.formatManager.captureFromSelection(currentBody);
				if (!result) {
					// captureFromSelection already called showFormatFailNotice on bail conditions
					this.hide();
					return;
				}
				// Apply asynchronously
				void this.formatManager
					.applyFormat(wrapper)
					.catch((err) => {
						console.error("Preach MD: format failed", err);
						this.formatManager.showFormatFailNotice("failed", result.rect);
					})
					.finally(() => {
						this.hide();
						window.getSelection()?.removeAllRanges();
					});
			});
		};

		const row = bar.createDiv({ cls: "preach-inline-fmt-row" });
		makeBtn("B", "Bold", FORMAT_BOLD, row, "preach-inline-fmt-btn--bold");
		makeBtn("I", "Italic", FORMAT_ITALIC, row, "preach-inline-fmt-btn--italic");
		makeBtn("U", "Underline", FORMAT_UNDERLINE, row, "preach-inline-fmt-btn--underline");
		makeBtn("H", "Highlight", FORMAT_HIGHLIGHT, row, "preach-inline-fmt-btn--highlight");

		if (requireApiVersion("1.14.4")) {
			const colourRow = bar.createDiv({ cls: "preach-inline-fmt-row" });
			for (const [name, emoji] of Object.entries(HIGHLIGHT_COLOURS)) {
				makeBtn(emoji, `Highlight ${name}`, colourWrapper(name), colourRow, "preach-inline-fmt-btn--colour");
			}
		}

		return bar;
	}

	private onSelectionChange(): void {
		// Gate: while a touch is active, or while we're inside the
		// post-touch settle window, do nothing. iOS needs uninterrupted
		// DOM stability through its selection finalisation, or it
		// falls back to "select to end of container".
		if (this.touchActive || this.settleTimer !== null) return;

		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
			this.hide();
			return;
		}

		const selectedText = sel.toString().trim();
		if (!selectedText) {
			this.hide();
			return;
		}

		// Check the common ancestor is inside the preach body
		const range = sel.getRangeAt(0);
		const currentBody = this.bodyElGetter();
		if (!currentBody || !currentBody.contains(range.commonAncestorContainer)) {
			this.hide();
			return;
		}

		const rect = range.getBoundingClientRect();
		this.position(rect);
		this.show();
	}

	private position(rect: DOMRect): void {
		// Clearance has to make room for iOS's own selection menu
		// (Copy / Look Up / Translate), which sits ~44px above the
		// selection by default. We leave 80px of space so both fit.
		const CLEARANCE = 80;
		const vpW = window.innerWidth;
		const vpH = window.innerHeight;

		const toolbarW = this.toolbarEl.offsetWidth || 200;
		const toolbarH = this.toolbarEl.offsetHeight || 44;

		const midX = rect.left + rect.width / 2;
		let left = midX - toolbarW / 2;
		left = Math.max(8, Math.min(vpW - toolbarW - 8, left));

		// Prefer below the selection (iOS gets its preferred above spot).
		// Fall back to above if below has no room. Final fallback to
		// viewport edge if the selection occupies most of the screen.
		const spaceBelow = vpH - rect.bottom;
		const spaceAbove = rect.top;

		let top: number;
		if (spaceBelow >= toolbarH + CLEARANCE) {
			top = rect.bottom + CLEARANCE;
		} else if (spaceAbove >= toolbarH + CLEARANCE) {
			top = rect.top - toolbarH - CLEARANCE;
		} else {
			top = spaceBelow > spaceAbove
				? vpH - toolbarH - 8
				: 8;
		}

		this.toolbarEl.setCssStyles({ left: `${left}px`, top: `${top}px` });
	}

	private show(): void {
		if (!this.visible) {
			this.toolbarEl.classList.add("preach-inline-format-bar--visible");
			this.visible = true;
		}
	}

	private hide(): void {
		if (this.visible) {
			this.toolbarEl.classList.remove("preach-inline-format-bar--visible");
			this.visible = false;
		}
	}

	destroy(): void {
		document.removeEventListener("selectionchange", this.selectionChangeHandler);
		document.removeEventListener("touchend", this.touchEndHandler);
		document.removeEventListener("touchcancel", this.touchEndHandler);
		// Touchstart was added to the scroll container (or document if not found).
		// Try both removals - removeEventListener is a no-op if the listener wasn't there.
		const body = this.bodyElGetter();
		const touchTarget = body?.closest(".preach-content") ?? document;
		touchTarget.removeEventListener("touchstart", this.touchStartHandler);
		if (this.settleTimer !== null) {
			window.clearTimeout(this.settleTimer);
			this.settleTimer = null;
		}
		this.toolbarEl.remove();
	}
}
