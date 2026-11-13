// Paragraph highlight toggle for Preach MD.
// Tapping a paragraph in highlight mode wraps its content in ==...== in the source file.
// Highlights are persisted to the file via vault.process().

import { App, TFile, Component } from "obsidian";

export interface Block {
	/** Source character offset: start of this block in the raw markdown. */
	start: number;
	/** Source character offset: end of this block (exclusive). */
	end: number;
	/** Raw text of the block (trimmed content, not the surrounding blank lines). */
	content: string;
	/** Whether this block is a plain paragraph (eligible for highlight). */
	highlightable: boolean;
	/** 0-indexed line number in the source file where this block begins. */
	startLine: number;
	/** 0-indexed character offset from start of file where this block begins. */
	startOffset: number;
}

const HEADING_RE = /^#{1,6}\s/;
const HR_RE = /^(\*{3,}|-{3,}|_{3,})\s*$/;
const FENCE_RE = /^```|^~~~/;
const QUOTE_RE = /^>/;
const LIST_RE = /^[-*+]\s|^\d+[.)]\s/;

/** Whether `line` starts a new block when it follows `blockLines` with no blank line between. */
function startsNewBlock(line: string, blockLines: string[]): boolean {
	const first = blockLines[0];
	if (HEADING_RE.test(blockLines[blockLines.length - 1]) || HR_RE.test(blockLines[blockLines.length - 1])) {
		return true;
	}
	if (HEADING_RE.test(line) || HR_RE.test(line) || FENCE_RE.test(line)) return true;
	if (QUOTE_RE.test(line) && !QUOTE_RE.test(first)) return true;
	if (LIST_RE.test(line) && !LIST_RE.test(first)) return true;
	return false;
}

/**
 * Parse markdown source into top-level blocks. Blocks are separated by blank
 * lines, and also split where a heading, thematic break, code fence, quote or
 * list item starts with no blank line before it.
 * Returns block metadata including source offsets for vault.process() writes.
 *
 * Non-highlightable blocks: YAML frontmatter, headings, code fences,
 * blockquotes, callouts, list items, thematic breaks.
 */
export function parseBlocks(markdown: string): Block[] {
	const blocks: Block[] = [];

	// Skip YAML frontmatter at the very top
	let bodyStart = 0;
	if (markdown.startsWith("---")) {
		const end = markdown.indexOf("\n---", 3);
		if (end !== -1) {
			bodyStart = end + 4;
			// Advance past any trailing newline
			if (markdown[bodyStart] === "\n") bodyStart++;
		}
	}

	const body = markdown.slice(bodyStart);
	let inCodeFence = false;

	// Work line-by-line to identify blocks
	const lines = body.split("\n");
	let i = 0;
	let charOffset = bodyStart;

	// Count how many lines the frontmatter consumed so startLine is file-absolute
	const frontmatterLineCount = markdown.slice(0, bodyStart).split("\n").length - 1;
	let lineNumber = frontmatterLineCount;

	while (i < lines.length) {
		const line = lines[i];

		// Track code fences
		if (/^```/.test(line) || /^~~~/.test(line)) {
			inCodeFence = !inCodeFence;
		}

		if (inCodeFence || line.trim() === "") {
			// Blank line or inside fence - advance
			charOffset += line.length + 1;
			i++;
			lineNumber++;
			continue;
		}

		// Collect a contiguous block (non-blank lines)
		const blockStartOffset = charOffset;
		const blockStartLine = lineNumber;
		const blockLines: string[] = [];
		let inFence: boolean = inCodeFence;

		while (i < lines.length && lines[i].trim() !== "") {
			if (!inFence && blockLines.length > 0 && startsNewBlock(lines[i], blockLines)) break;
			if (FENCE_RE.test(lines[i])) {
				inFence = !inFence;
			}
			blockLines.push(lines[i]);
			charOffset += lines[i].length + 1;
			i++;
			lineNumber++;
		}

		const blockText = blockLines.join("\n");
		const blockEnd = charOffset;
		const firstLine = blockLines[0];

		// Determine if this block is a plain paragraph
		const isHeading = HEADING_RE.test(firstLine);
		const isHr = HR_RE.test(firstLine);
		const isCodeFenceBlock = FENCE_RE.test(firstLine);
		const isBlockquote = QUOTE_RE.test(firstLine);
		const isList = LIST_RE.test(firstLine);
		const isCallout = /^>\s*\[!/.test(firstLine);

		const highlightable =
			!isHeading &&
			!isHr &&
			!isCodeFenceBlock &&
			!isBlockquote &&
			!isList &&
			!isCallout &&
			blockText.trim().length > 0;

		blocks.push({
			start: blockStartOffset,
			end: blockEnd,
			content: blockText,
			highlightable,
			startLine: blockStartLine,
			startOffset: blockStartOffset,
		});
	}

	return blocks;
}

/**
 * Toggle ==...== highlighting on a block's content string.
 * If the entire content is already wrapped in == ... ==, strip them.
 * Otherwise, wrap the whole content.
 */
export function toggleHighlight(content: string): string {
	const trimmed = content.trim();
	if (trimmed.startsWith("==") && trimmed.endsWith("==") && trimmed.length > 4) {
		// Strip all == markers in this block (whole-block highlight toggle)
		return content.replace(/==/g, "");
	}
	// Wrap the content preserving leading/trailing whitespace
	const leadMatch = content.match(/^(\s*)/);
	const trailMatch = content.match(/(\s*)$/);
	const lead = leadMatch ? leadMatch[1] : "";
	const trail = trailMatch ? trailMatch[1] : "";
	const inner = content.slice(lead.length, content.length - trail.length);
	return `${lead}==${inner}==${trail}`;
}

export class HighlightManager {
	private app: App;
	private file: TFile | null;
	private blocks: Block[] = [];
	private active = false;
	private btn: HTMLElement | null = null;
	private scrollEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private renderComponent: Component;

	constructor(app: App, file: TFile | null, renderComponent: Component) {
		this.app = app;
		this.file = file;
		this.renderComponent = renderComponent;
	}

	/** Call once after the preach view is built to wire the button and content area. */
	init(btn: HTMLElement | null, scrollEl: HTMLElement, bodyEl: HTMLElement): void {
		this.btn = btn;
		this.scrollEl = scrollEl;
		this.bodyEl = bodyEl;
		this.updateButtonState();
	}

	updateFile(file: TFile): void {
		this.file = file;
	}

	isActive(): boolean {
		return this.active;
	}

	toggle(): void {
		this.active = !this.active;
		this.updateButtonState();
	}

	/**
	 * Called after the preach view renders a new file.
	 * Rebuilds block map and attaches tap listeners to block wrappers.
	 */
	attachBlocks(blocks: Block[]): void {
		this.blocks = blocks;
	}

	/**
	 * Handle a tap on a block element. If highlight mode is on and the block
	 * is highlightable, toggle ==...== in the source file and re-render the block.
	 */
	async handleBlockTap(blockIndex: number): Promise<void> {
		if (!this.active) return;

		const block = this.blocks[blockIndex];
		if (!block || !block.highlightable || !this.file) return;
		const file = this.file;

		const scrollTop = this.scrollEl.scrollTop;

		await this.app.vault.process(file, (source) => {
			const before = source.slice(0, block.start);
			const content = source.slice(block.start, block.end);
			const after = source.slice(block.end);
			const toggled = toggleHighlight(content);

			// Update our in-memory block content for the next toggle
			block.content = toggled.trim();

			return before + toggled + after;
		});

		// Re-read and re-parse after the write so offsets stay accurate
		const updated = await this.app.vault.read(file);
		this.blocks = parseBlocks(updated);

		// Restore scroll
		window.requestAnimationFrame(() => {
			this.scrollEl.scrollTop = scrollTop;
		});
	}

	private updateButtonState(): void {
		if (!this.btn) return;
		if (this.active) {
			this.btn.classList.add("preach-highlight-btn--on");
			this.btn.setAttribute("aria-pressed", "true");
		} else {
			this.btn.classList.remove("preach-highlight-btn--on");
			this.btn.setAttribute("aria-pressed", "false");
		}
	}
}
