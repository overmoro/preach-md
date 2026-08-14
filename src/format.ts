// Format mode for Preach MD.
// Provides bold, italic, underline, and highlight wrapping applied directly
// to the source file from selected text in the preach view.

import { App, TFile } from "obsidian";
import type { Block } from "./highlight";

export interface FormatWrapper {
	open: string;
	close: string;
}

export const FORMAT_BOLD: FormatWrapper = { open: "**", close: "**" };
export const FORMAT_ITALIC: FormatWrapper = { open: "*", close: "*" };
export const FORMAT_UNDERLINE: FormatWrapper = { open: "<u>", close: "</u>" };
export const FORMAT_HIGHLIGHT: FormatWrapper = { open: "==", close: "==" };

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
	| "collision";

/**
 * Text shown for each bail condition. A total record rather than a lookup with
 * a fallback, so adding a reason to the union without a message is a compile
 * error, and no key can resolve through Object.prototype.
 */
const FORMAT_FAIL_MESSAGE: Record<FormatFailReason, string> = {
	"scripture-expand": "Can't format inside an expanded passage.",
	"cross-block": "Can't format across two paragraphs.",
	"not-found": "Can't find that text in the note source.",
	collision: "That text is already formatted.",
};

export class FormatManager {
	private app: App;
	private file: TFile | null;
	private blocks: Block[] = [];

	// The selection captured on pointerdown (before focus changes clear it)
	private capturedSelection: { text: string; blockIndex: number } | null = null;

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

	updateBlocks(blocks: Block[]): void {
		this.blocks = blocks;
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

		// Bail if selection is inside a scripture expansion
		let node: Node | null = sel.anchorNode;
		while (node) {
			if (node.instanceOf(HTMLElement)) {
				if (node.classList.contains("preach-scripture-expand")) {
					this.showFormatFailNotice("scripture-expand", range.getBoundingClientRect());
					return null;
				}
			}
			node = node.parentNode;
		}

		// Walk anchor node up to find .preach-block
		let blockEl: HTMLElement | null = null;
		node = sel.anchorNode;
		while (node) {
			if (node.instanceOf(HTMLElement) && node.classList.contains("preach-block")) {
				blockEl = node;
				break;
			}
			node = node.parentNode;
		}

		if (!blockEl) return null;

		// Check selection doesn't span multiple preach-blocks
		let focusBlockEl: HTMLElement | null = null;
		let fn: Node | null = sel.focusNode;
		while (fn) {
			if (fn.instanceOf(HTMLElement) && fn.classList.contains("preach-block")) {
				focusBlockEl = fn;
				break;
			}
			fn = fn.parentNode;
		}
		if (focusBlockEl !== blockEl) {
			this.showFormatFailNotice("cross-block", range.getBoundingClientRect());
			return null;
		}

		const blockIndex = parseInt(blockEl.dataset.blockIndex ?? "", 10);
		if (isNaN(blockIndex)) return null;

		const block = this.blocks[blockIndex];
		if (!block) return null;

		const sourceContent = block.content;

		// Try to find selected text in source block
		let sourceIdx = sourceContent.indexOf(selectedText);

		if (sourceIdx === -1) {
			// Fuzzy fallback: strip common markdown markers from source before searching.
			const stripped = sourceContent.replace(/[*_~=<>/]/g, "");
			const strippedIdx = stripped.indexOf(selectedText);
			if (strippedIdx !== -1) {
				// Map the stripped index back to source index
				let srcPos = 0;
				let strippedCount = 0;
				while (srcPos < sourceContent.length && strippedCount < strippedIdx) {
					if (!/[*_~=<>/]/.test(sourceContent[srcPos])) strippedCount++;
					srcPos++;
				}
				sourceIdx = srcPos;
			}
		}

		if (sourceIdx === -1) {
			this.showFormatFailNotice("not-found", range.getBoundingClientRect());
			return null;
		}

		// Collision check: is this position already inside an existing wrapper?
		const before = sourceContent.slice(0, sourceIdx);
		const after = sourceContent.slice(sourceIdx + selectedText.length);
		const wrappers = ["**", "*", "==", "<u>"];
		for (const w of wrappers) {
			if (before.endsWith(w) && after.startsWith(w === "**" ? "**" : w === "*" ? "*" : w === "==" ? "==" : "</u>")) {
				this.showFormatFailNotice("collision", range.getBoundingClientRect());
				return null;
			}
		}

		this.capturedSelection = { text: selectedText, blockIndex };

		const rect = range.getBoundingClientRect();
		return { rect };
	}

	/**
	 * Apply a format wrapper around the previously captured selection.
	 * Writes to the source file via vault.process().
	 */
	async applyFormat(wrapper: FormatWrapper): Promise<void> {
		if (!this.capturedSelection || !this.file) return;

		const { text: selectedText, blockIndex } = this.capturedSelection;
		const block = this.blocks[blockIndex];
		if (!block) return;

		const sourceContent = block.content;

		let sourceIdx = sourceContent.indexOf(selectedText);

		if (sourceIdx === -1) {
			const stripped = sourceContent.replace(/[*_~=]/g, "");
			const strippedIdx = stripped.indexOf(selectedText);
			if (strippedIdx !== -1) {
				let srcPos = 0;
				let strippedCount = 0;
				while (srcPos < sourceContent.length && strippedCount < strippedIdx) {
					if (!/[*_~=]/.test(sourceContent[srcPos])) strippedCount++;
					srcPos++;
				}
				sourceIdx = srcPos;
			}
		}

		if (sourceIdx === -1) {
			// Same condition captureFromSelection reports, reached on the apply
			// side instead. It used to warn to the console, so a format tap that
			// could not be applied did nothing at all from the user's side.
			this.showFormatFailNotice("not-found");
			return;
		}

		const absoluteStart = block.startOffset + sourceIdx;
		const absoluteEnd = absoluteStart + selectedText.length;

		await this.app.vault.process(this.file, (data) => {
			return (
				data.slice(0, absoluteStart) +
				wrapper.open +
				data.slice(absoluteStart, absoluteEnd) +
				wrapper.close +
				data.slice(absoluteEnd)
			);
		});

		this.capturedSelection = null;
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
 * the current body element (which is replaced on every renderFile call).
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
			extraClass?: string
		): void => {
			const btn = bar.createEl("button", {
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
				void this.formatManager.applyFormat(wrapper).then(() => {
					this.hide();
					window.getSelection()?.removeAllRanges();
				});
			});
		};

		makeBtn("B", "Bold", FORMAT_BOLD, "preach-inline-fmt-btn--bold");
		makeBtn("I", "Italic", FORMAT_ITALIC, "preach-inline-fmt-btn--italic");
		makeBtn("U", "Underline", FORMAT_UNDERLINE, "preach-inline-fmt-btn--underline");
		makeBtn("H", "Highlight", FORMAT_HIGHLIGHT, "preach-inline-fmt-btn--highlight");

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
