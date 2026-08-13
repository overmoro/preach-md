import {
	ItemView,
	MarkdownRenderer,
	MarkdownView,
	TFile,
	WorkspaceLeaf,
	Component,
} from "obsidian";
import type PreachMDPlugin from "./main";
import { PreachTimer } from "./timer";
import { HighlightManager, parseBlocks } from "./highlight";
import { ScriptureExpander } from "./scripture";
import { FormatManager, PreachFormatToolbar } from "./format";

export const PREACH_VIEW_TYPE = "preach-md-view";

/**
 * Extracts all headings at a given level from raw markdown text.
 * Returns an array of { text, slug } objects.
 */
function extractHeadings(
	markdown: string,
	level: number
): { text: string; slug: string }[] {
	const prefix = "#".repeat(level) + " ";
	const results: { text: string; slug: string }[] = [];
	for (const line of markdown.split("\n")) {
		if (line.startsWith(prefix)) {
			const text = line.slice(prefix.length).trim();
			const slug = text
				.toLowerCase()
				.replace(/[^\w\s-]/g, "")
				.replace(/\s+/g, "-");
			results.push({ text, slug });
		}
	}
	return results;
}

// WakeLock API types (not present in all TS lib versions)
interface WakeLockSentinel {
	release(): Promise<void>;
	readonly released: boolean;
	readonly type: string;
}

interface WakeLockAPI {
	request(type: "screen"): Promise<WakeLockSentinel>;
}

export class PreachView extends ItemView {
	plugin: PreachMDPlugin;
	file: TFile | null = null;

	// Persisted scroll position within this session
	private savedScrollTop = 0;

	// Back-pill and format-toolbar tracking (keyed by editor leaf)
	private preachLeaf: WorkspaceLeaf | null = null;
	private editPills: Map<WorkspaceLeaf, HTMLElement> = new Map();
	private editFormatBars: Map<WorkspaceLeaf, HTMLElement> = new Map();

	// DOM elements
	private scrollEl!: HTMLElement;
	private timerEl!: HTMLElement;
	private outlineBtn!: HTMLElement;
	private exitBtn!: HTMLElement;
	private editBtn!: HTMLElement;
	private bottomBtns!: HTMLElement;
	private overlayEl!: HTMLElement;
	private exitChip!: HTMLElement;

	// Idle-fade timeout handle
	private idleTimeout: number | null = null;

	// Timer
	private timer!: PreachTimer;

	// Wake lock
	private wakeLock: WakeLockSentinel | null = null;

	// Edge-swipe suppression
	private touchHandler: ((e: TouchEvent) => void) | null = null;

	// Exit confirm state
	private exitConfirming = false;
	private exitConfirmTimeout: number | null = null;

	// Component used by MarkdownRenderer
	private renderComponent!: Component;

	// Feature managers
	private highlightManager!: HighlightManager;
	private scriptureExpander!: ScriptureExpander;
	private formatManager!: FormatManager;
	private preachFormatToolbar: PreachFormatToolbar | null = null;

	// Current preach body element (replaced on each renderFile; toolbar queries via getter)
	private preachBodyEl: HTMLElement | null = null;

	// Parsed blocks (kept in sync after each renderFile call)
	private blocks: ReturnType<typeof parseBlocks> = [];

	// View header (hidden while preach mode is active)
	private viewHeaderEl: HTMLElement | null = null;

	// Sidebar collapse state - tracked per open so restore is accurate
	private leftSplitWasOpen = false;
	private rightSplitWasOpen = false;

	constructor(leaf: WorkspaceLeaf, plugin: PreachMDPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return PREACH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "Preach";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen(): Promise<void> {
		// Hide the leaf's view-header (tab/title bar) for a cleaner preach surface
		const leafContent = this.containerEl.closest<HTMLElement>(".workspace-leaf-content");
		if (leafContent) {
			this.viewHeaderEl = leafContent.querySelector<HTMLElement>(".view-header");
			if (this.viewHeaderEl) this.viewHeaderEl.classList.add("preach-view-header--hidden");
		}

		// Add body class so CSS can hide global chrome (ribbon, status bar, mobile toolbar, sidebars)
		document.body.addClass("preach-md-active");

		// Collapse sidebars and track whether they were open so onClose can restore them
		const ws = this.app.workspace;
		this.leftSplitWasOpen = !ws.leftSplit.collapsed;
		this.rightSplitWasOpen = !ws.rightSplit.collapsed;
		if (this.leftSplitWasOpen) ws.leftSplit.collapse();
		if (this.rightSplitWasOpen) ws.rightSplit.collapse();

		this.renderComponent = new Component();
		this.renderComponent.load();

		this.highlightManager = new HighlightManager(
			this.app,
			this.file,
			this.renderComponent
		);
		this.scriptureExpander = new ScriptureExpander(
			this.app,
			this.plugin.settings.csbFolderPath,
			this.renderComponent,
			""
		);
		this.formatManager = new FormatManager(this.app, this.file);

		this.buildUI();

		// Inline format toolbar restored in v0.6.6 with touch-gated listeners.
		// See PreachFormatToolbar for the gating logic that prevents DOM
		// mutations during iOS's selection finalisation.
		this.preachFormatToolbar = new PreachFormatToolbar(
			this.formatManager,
			() => this.preachBodyEl,
			this.containerEl
		);

		await this.requestWakeLock();
		this.suppressEdgeSwipes();

		if (this.file) {
			await this.renderFile(this.file);
		}

		// Re-render when the source file is saved (e.g. after editing)
		this.registerEvent(
			this.app.vault.on("modify", (modified) => {
				if (this.file && modified.path === this.file.path) {
					void this.renderFile(this.file);
				}
			})
		);

		// Track this leaf so pills can switch focus back to it
		this.preachLeaf = this.leaf;

		// Inject back-pill and format toolbar whenever a new leaf becomes active
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				this.maybeInjectEditUI(leaf);
			})
		);

		// Remove UI for leaves that have been closed
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.pruneEditUI();
			})
		);

		this.timer.start();
	}

	async onClose(): Promise<void> {
		if (this.idleTimeout !== null) {
			window.clearTimeout(this.idleTimeout);
			this.idleTimeout = null;
		}
		this.preachFormatToolbar?.destroy();
		this.preachFormatToolbar = null;
		this.formatManager?.destroy();
		this.preachBodyEl = null;
		this.cleanupEditUI();

		// Restore the view-header when leaving preach mode
		if (this.viewHeaderEl) {
			this.viewHeaderEl.classList.remove("preach-view-header--hidden");
			this.viewHeaderEl = null;
		}

		// Remove body class to restore global chrome
		document.body.removeClass("preach-md-active");

		// Restore sidebars only if they were open before preach mode started
		const ws = this.app.workspace;
		if (this.leftSplitWasOpen) ws.leftSplit.expand();
		if (this.rightSplitWasOpen) ws.rightSplit.expand();
		this.leftSplitWasOpen = false;
		this.rightSplitWasOpen = false;

		this.timer.stop();
		await this.releaseWakeLock();
		this.restoreEdgeSwipes();
		this.renderComponent.unload();
	}

	async setFile(file: TFile): Promise<void> {
		this.file = file;
		if (this.highlightManager) {
			this.highlightManager.updateFile(file);
		}
		if (this.formatManager) {
			this.formatManager.updateFile(file);
		}
		if (this.scrollEl) {
			await this.renderFile(file);
		}
	}

	// Build the full preach UI into containerEl
	private buildUI(): void {
		const root = this.containerEl;
		root.empty();
		root.addClass("preach-md-root");

		// Scrollable content area
		this.scrollEl = root.createEl("div", { cls: "preach-content" });
		this.scrollEl.addEventListener("scroll", () => {
			this.savedScrollTop = this.scrollEl.scrollTop;
			this.resetIdleTimer();
		});

		// Timer - top-centre, always visible, persistent
		this.timerEl = root.createEl("div", { cls: "preach-timer-corner" });
		this.timer = new PreachTimer(this.timerEl, {
			targetMinutes: this.plugin.settings.targetMinutes,
			warnMinutes: this.plugin.settings.warnMinutes,
			critMinutes: this.plugin.settings.critMinutes,
		});

		// Bottom buttons container - three floating icon-only buttons, auto-fade
		this.bottomBtns = root.createEl("div", { cls: "preach-bottom-btns" });

		// Outline button - bottom-left
		this.outlineBtn = this.bottomBtns.createEl("button", {
			cls: "preach-corner-btn preach-corner-btn--outline",
			attr: { "aria-label": "Outline", title: "Outline" },
		});
		const outlineSvg = this.outlineBtn.createSvg("svg", {
			attr: { xmlns: "http://www.w3.org/2000/svg", width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
		});
		outlineSvg.createSvg("line", { attr: { x1: "3", y1: "6", x2: "21", y2: "6" } });
		outlineSvg.createSvg("line", { attr: { x1: "3", y1: "12", x2: "15", y2: "12" } });
		outlineSvg.createSvg("line", { attr: { x1: "3", y1: "18", x2: "18", y2: "18" } });
		this.outlineBtn.addEventListener("pointerdown", (e: PointerEvent) => {
			e.stopPropagation();
			this.resetIdleTimer();
			this.toggleOutline();
		});

		// Right-side group: edit + exit
		const rightGroup = this.bottomBtns.createEl("div", { cls: "preach-bottom-right" });

		// Edit button - second from right
		this.editBtn = rightGroup.createEl("button", {
			cls: "preach-corner-btn",
			attr: { "aria-label": "Edit note", title: "Edit" },
		});
		const editSvg = this.editBtn.createSvg("svg", {
			attr: { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
		});
		editSvg.createSvg("path", { attr: { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" } });
		editSvg.createSvg("path", { attr: { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" } });
		this.editBtn.addEventListener("pointerdown", (e: PointerEvent) => {
			e.stopPropagation();
			this.resetIdleTimer();
			this.goToEdit();
		});

		// Exit button with confirm chip - bottom-right corner
		const exitWrap = rightGroup.createEl("div", { cls: "preach-exit-wrap" });
		this.exitChip = exitWrap.createEl("span", {
			cls: "preach-exit-chip",
			text: "Exit?",
		});
		this.exitBtn = exitWrap.createEl("button", {
			cls: "preach-corner-btn",
			attr: { "aria-label": "Exit preach mode", title: "Exit" },
		});
		const exitSvg = this.exitBtn.createSvg("svg", {
			attr: { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
		});
		exitSvg.createSvg("line", { attr: { x1: "18", y1: "6", x2: "6", y2: "18" } });
		exitSvg.createSvg("line", { attr: { x1: "6", y1: "6", x2: "18", y2: "18" } });
		this.exitBtn.addEventListener("pointerdown", (e: PointerEvent) => {
			e.stopPropagation();
			this.resetIdleTimer();
			this.handleExit();
		});

		// Idle-fade: reset on any tap on the scroll area
		this.scrollEl.addEventListener("pointerdown", () => {
			this.resetIdleTimer();
		});

		// Wire the highlight manager to its content area (button removed)
		this.highlightManager.init(null, this.scrollEl, this.scrollEl);

		// Outline overlay (hidden by default)
		this.overlayEl = root.createEl("div", {
			cls: "preach-outline-overlay preach-outline-overlay--hidden",
		});
		this.overlayEl.addEventListener("pointerdown", (e: PointerEvent) => {
			if (e.target === this.overlayEl) {
				this.closeOutline();
			}
		});

		// Start idle timer immediately
		this.resetIdleTimer();
	}

	// Idle-fade: show bottom buttons, then fade after 3 seconds of no interaction.
	private resetIdleTimer(): void {
		// Reveal all fadeable controls
		this.bottomBtns?.classList.remove("preach-bottom-btns--idle");

		if (this.idleTimeout !== null) {
			window.clearTimeout(this.idleTimeout);
		}
		this.idleTimeout = window.setTimeout(() => {
			this.bottomBtns?.classList.add("preach-bottom-btns--idle");
			this.idleTimeout = null;
		}, 3000);
	}

	// Render the file into the scroll area using block-by-block rendering
	private async renderFile(file: TFile): Promise<void> {
		const scrollTop = this.savedScrollTop;
		this.scriptureExpander.collapseAll();
		this.scrollEl.empty();

		const markdown = await this.app.vault.read(file);
		const blocks = parseBlocks(markdown);

		// Keep a reference for scroll-sync in goToEdit
		this.blocks = blocks;

		// Store blocks in highlight manager
		this.highlightManager.attachBlocks(blocks);

		const body = this.scrollEl.createEl("div", { cls: "preach-body" });
		this.preachBodyEl = body;
		if (this.formatManager) {
			this.formatManager.updateBlocks(blocks);
		}

		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			const wrapper = body.createEl("div", {
				cls: "preach-block",
				attr: {
					"data-block-index": String(i),
					"data-highlightable": block.highlightable ? "true" : "false",
				},
			});

			await MarkdownRenderer.render(
				this.app,
				block.content,
				wrapper,
				file.path,
				this.renderComponent
			);

			if (block.highlightable) {
				wrapper.addEventListener("pointerdown", (e: PointerEvent) => {
					// Only handle in highlight mode; ignore if user is tapping a scripture ref
					const target = e.target as HTMLElement;
					if (target.closest(".preach-scripture-ref") || target.closest(".preach-scripture-expand")) {
						return;
					}
					if (this.highlightManager.isActive()) {
						e.stopPropagation();
						void this.highlightManager.handleBlockTap(i).then(() => {
							// Re-render after highlight change
							void this.renderFile(file);
						});
					}
				});
			}
		}

		// Scripture detection pass
		this.scriptureExpander.updateSourcePath(file.path);
		this.scriptureExpander.processElement(body);

		// Tag headings so outline works
		this.tagRenderedHeadings(body, markdown);

		// Restore scroll position after render
		window.requestAnimationFrame(() => {
			this.scrollEl.scrollTop = scrollTop;
		});
	}

	/**
	 * Attach data-preach-slug to rendered heading elements so the outline
	 * can call scrollIntoView on them by reference.
	 */
	private tagRenderedHeadings(wrapper: HTMLElement, markdown: string): void {
		const level = this.plugin.settings.sectionHeadingLevel;
		const headings = extractHeadings(markdown, level);
		const tag = `h${level}`;
		const rendered = wrapper.querySelectorAll<HTMLElement>(tag);

		rendered.forEach((el, i) => {
			if (headings[i]) {
				el.dataset.preachSlug = headings[i].slug;
			}
		});
	}

	// Outline overlay controls
	private toggleOutline(): void {
		if (!this.overlayEl.classList.contains("preach-outline-overlay--hidden")) {
			this.closeOutline();
			return;
		}
		this.openOutline();
	}

	private openOutline(): void {
		if (!this.file) return;

		// Rebuild panel each time (file may have changed)
		const panel =
			this.overlayEl.querySelector<HTMLElement>(".preach-outline-panel") ??
			this.overlayEl.createEl("div", { cls: "preach-outline-panel" });
		panel.empty();

		const level = this.plugin.settings.sectionHeadingLevel;
		const tag = `h${level}`;
		const headingEls = this.scrollEl.querySelectorAll<HTMLElement>(tag);

		if (headingEls.length === 0) {
			panel.createEl("p", {
				cls: "preach-outline-empty",
				text: "No sections found.",
			});
		} else {
			headingEls.forEach((el) => {
				const btn = panel.createEl("button", {
					cls: "preach-outline-item",
					text: el.textContent ?? "",
				});
				btn.addEventListener("pointerdown", (e: PointerEvent) => {
					e.stopPropagation();
					el.scrollIntoView({ behavior: "smooth", block: "start" });
					this.closeOutline();
				});
			});
		}

		this.overlayEl.classList.remove("preach-outline-overlay--hidden");
	}

	private closeOutline(): void {
		this.overlayEl.classList.add("preach-outline-overlay--hidden");
	}

	// Exit two-step confirmation
	private handleExit(): void {
		if (this.exitConfirming) {
			this.confirmExit();
			return;
		}

		this.exitConfirming = true;
		this.exitChip.classList.add("preach-exit-chip--visible");

		this.exitConfirmTimeout = window.setTimeout(() => {
			this.exitConfirming = false;
			this.exitChip.classList.remove("preach-exit-chip--visible");
			this.exitConfirmTimeout = null;
		}, 3000);
	}

	private confirmExit(): void {
		if (this.exitConfirmTimeout !== null) {
			window.clearTimeout(this.exitConfirmTimeout);
			this.exitConfirmTimeout = null;
		}
		this.exitConfirming = false;
		this.exitChip.classList.remove("preach-exit-chip--visible");
		this.leaf.detach();
	}

	// Find the 0-indexed source line of the topmost visible preach block.
	private getTopmostVisibleLine(): number | null {
		const blockEls = this.scrollEl.querySelectorAll<HTMLElement>(".preach-block");
		for (const el of Array.from(blockEls)) {
			if (el.getBoundingClientRect().bottom > 0) {
				const idx = parseInt(el.dataset.blockIndex ?? "", 10);
				if (!isNaN(idx) && this.blocks[idx] !== undefined) {
					return this.blocks[idx].startLine;
				}
			}
		}
		return null;
	}

	// Edit round-trip: open the file in an edit leaf, scrolled to current position.
	private goToEdit(): void {
		if (!this.file) return;

		this.savedScrollTop = this.scrollEl.scrollTop;

		const startLine = this.getTopmostVisibleLine();

		const existingLeaf = this.app.workspace
			.getLeavesOfType("markdown")
			.find(
				(l) =>
					(l.view as { file?: TFile }).file?.path === this.file?.path
			);

		if (existingLeaf) {
			this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
			if (startLine !== null) {
				window.setTimeout(() => {
					(existingLeaf.view as { setEphemeralState?: (s: object) => void })
						.setEphemeralState?.({ line: startLine });
				}, 0);
			}
			window.setTimeout(() => this.maybeInjectEditUI(existingLeaf), 0);
		} else {
			const leaf = this.app.workspace.getLeaf("tab");
			if (this.file) {
				const eState: Record<string, unknown> = { mode: "source" };
				if (startLine !== null) eState.line = startLine;
				void leaf.openFile(this.file, { active: true, eState });
				window.setTimeout(() => this.maybeInjectEditUI(leaf), 0);
			}
		}
	}

	// Inject back-pill and format toolbar into editor leaves showing the sermon file
	private maybeInjectEditUI(leaf: WorkspaceLeaf | null): void {
		if (!leaf || !this.file || leaf === this.preachLeaf) return;

		const leafFile = (leaf.view as { file?: TFile }).file;
		if (leafFile?.path !== this.file.path) return;

		const host = leaf.view.containerEl;

		// Back-pill (if not already present)
		if (!this.editPills.has(leaf)) {
			const pill = createEl("button");
			pill.className = "preach-back-pill";
			pill.textContent = "← Preach";
			pill.setAttribute("aria-label", "Back to preach mode");

			pill.addEventListener("pointerdown", (e: PointerEvent) => {
				e.preventDefault();
				e.stopPropagation();
				if (this.preachLeaf) {
					this.app.workspace.setActiveLeaf(this.preachLeaf, { focus: true });
				}
			});

			host.appendChild(pill);
			this.editPills.set(leaf, pill);
		}

		// Format toolbar (if not already present)
		if (!this.editFormatBars.has(leaf)) {
			window.setTimeout(() => {
				const toolbar = this.buildEditorFormatBar(leaf);
				if (toolbar) {
					host.appendChild(toolbar);
					this.editFormatBars.set(leaf, toolbar);
				}
			}, 0);
		}
	}

	// Build a format toolbar for injection into an editor leaf
	private buildEditorFormatBar(leaf: WorkspaceLeaf): HTMLElement | null {
		const mdView = leaf.view as MarkdownView;
		if (!mdView || typeof mdView.editor === "undefined") return null;

		const toolbar = createDiv();
		toolbar.className = "preach-editor-format-bar";

		const makeBtn = (label: string, title: string, open: string, close: string, extraClass?: string): void => {
			const btn = createEl("button");
			btn.className = "preach-fmt-btn" + (extraClass ? " " + extraClass : "");
			btn.setAttribute("aria-label", title);
			btn.setAttribute("title", title);

			if (label === "highlight") {
				// Small highlight square icon
				btn.createSpan({ cls: "preach-fmt-swatch" });
			} else {
				btn.textContent = label;
			}

			// Use pointerdown + preventDefault to prevent editor blur losing the selection
			btn.addEventListener("pointerdown", (e: PointerEvent) => {
				e.preventDefault();
				e.stopPropagation();
				const editor = (leaf.view as MarkdownView).editor;
				if (!editor) return;
				const selected = editor.getSelection();
				if (!selected) return;
				editor.replaceSelection(open + selected + close);
			});

			toolbar.appendChild(btn);
		};

		makeBtn("B", "Bold", "**", "**", "preach-fmt-btn--bold");
		makeBtn("I", "Italic", "*", "*", "preach-fmt-btn--italic");
		makeBtn("U", "Underline", "<u>", "</u>", "preach-fmt-btn--underline");
		makeBtn("highlight", "Highlight", "==", "==", "preach-fmt-btn--highlight");

		return toolbar;
	}

	// Remove UI elements for leaves that are no longer in the workspace
	private pruneEditUI(): void {
		for (const [leaf, pill] of this.editPills) {
			if (!pill.isConnected) {
				pill.remove();
				this.editPills.delete(leaf);
				const bar = this.editFormatBars.get(leaf);
				if (bar) {
					bar.remove();
					this.editFormatBars.delete(leaf);
				}
			}
		}
	}

	// Remove all edit UI - called when preach mode exits
	private cleanupEditUI(): void {
		for (const [, pill] of this.editPills) {
			pill.remove();
		}
		this.editPills.clear();
		for (const [, bar] of this.editFormatBars) {
			bar.remove();
		}
		this.editFormatBars.clear();
		this.preachLeaf = null;
	}

	// Screen wake lock.
	// The .request("screen") call below is the browser Wake Lock API
	// (https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).
	// It is NOT a network request. The plugin makes no network calls at all -
	// sermons stay in the vault, scripture popups read local CSB files.
	private async requestWakeLock(): Promise<void> {
		try {
			if ("wakeLock" in navigator) {
				const nav = navigator as Navigator & { wakeLock: WakeLockAPI };
				this.wakeLock = await nav.wakeLock.request("screen");
			}
		} catch {
			// Wake lock unavailable - non-fatal
		}
	}

	private async releaseWakeLock(): Promise<void> {
		try {
			if (this.wakeLock) {
				await this.wakeLock.release();
				this.wakeLock = null;
			}
		} catch {
			// Ignore release errors
		}
	}

	// Suppress edge-swipe gestures (Obsidian Mobile sidebar open)
	private suppressEdgeSwipes(): void {
		this.touchHandler = (e: TouchEvent) => {
			if (e.touches.length === 1) {
				const x = e.touches[0].clientX;
				if (x < 30 || x > window.innerWidth - 30) {
					e.stopPropagation();
				}
			}
		};
		document.addEventListener("touchstart", this.touchHandler, {
			capture: true,
			passive: true,
		});
	}

	private restoreEdgeSwipes(): void {
		if (this.touchHandler) {
			document.removeEventListener("touchstart", this.touchHandler, {
				capture: true,
			});
			this.touchHandler = null;
		}
	}
}
