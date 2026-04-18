import {
	ItemView,
	MarkdownRenderer,
	TFile,
	WorkspaceLeaf,
	Component,
} from "obsidian";
import type PreachMDPlugin from "./main";
import { PreachTimer } from "./timer";

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

	// DOM elements (named to avoid conflict with ItemView.contentEl)
	private scrollEl!: HTMLElement;
	private timerEl!: HTMLElement;
	private outlineBtn!: HTMLElement;
	private exitBtn!: HTMLElement;
	private editBtn!: HTMLElement;
	private overlayEl!: HTMLElement;
	private exitChip!: HTMLElement;

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
		this.renderComponent = new Component();
		this.renderComponent.load();
		this.buildUI();
		await this.requestWakeLock();
		this.suppressEdgeSwipes();

		if (this.file) {
			await this.renderFile(this.file);
		}

		this.timer.start();
	}

	async onClose(): Promise<void> {
		this.timer.stop();
		await this.releaseWakeLock();
		this.restoreEdgeSwipes();
		this.renderComponent.unload();
	}

	async setFile(file: TFile): Promise<void> {
		this.file = file;
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
		});

		// Timer pill (top-centre)
		this.timerEl = root.createEl("div", { cls: "preach-timer-wrap" });
		this.timer = new PreachTimer(this.timerEl, {
			targetMinutes: this.plugin.settings.targetMinutes,
			warnMinutes: this.plugin.settings.warnMinutes,
			critMinutes: this.plugin.settings.critMinutes,
		});

		// Corner controls container
		const corners = root.createEl("div", { cls: "preach-corners" });

		// Top-left: outline
		this.outlineBtn = corners.createEl("button", {
			cls: "preach-corner preach-corner--top-left",
			attr: { "aria-label": "Outline", title: "Outline" },
		});
		this.outlineBtn.innerHTML =
			`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" ` +
			`fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
			`<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/>` +
			`<line x1="3" y1="18" x2="18" y2="18"/></svg>`;
		this.outlineBtn.addEventListener("pointerdown", (e: PointerEvent) => {
			e.stopPropagation();
			this.toggleOutline();
		});

		// Top-right: exit (with confirm chip above the button)
		const exitWrap = corners.createEl("div", {
			cls: "preach-corner-wrap preach-corner-wrap--top-right",
		});
		this.exitChip = exitWrap.createEl("span", {
			cls: "preach-exit-chip",
			text: "Exit?",
		});
		this.exitBtn = exitWrap.createEl("button", {
			cls: "preach-corner preach-corner--top-right",
			attr: { "aria-label": "Exit preach mode", title: "Exit" },
		});
		this.exitBtn.innerHTML =
			`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" ` +
			`fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
			`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		this.exitBtn.addEventListener("pointerdown", (e: PointerEvent) => {
			e.stopPropagation();
			this.handleExit();
		});

		// Bottom-right: edit
		this.editBtn = corners.createEl("button", {
			cls: "preach-corner preach-corner--bottom-right",
			attr: { "aria-label": "Edit note", title: "Edit" },
		});
		this.editBtn.innerHTML =
			`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" ` +
			`fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
			`<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>` +
			`<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
		this.editBtn.addEventListener("pointerdown", (e: PointerEvent) => {
			e.stopPropagation();
			this.goToEdit();
		});

		// Bottom-left: reserved for highlight toggle (Session 2)
		corners.createEl("div", {
			cls: "preach-corner preach-corner--bottom-left preach-corner--reserved",
		});

		// Outline overlay (hidden by default)
		this.overlayEl = root.createEl("div", {
			cls: "preach-outline-overlay preach-outline-overlay--hidden",
		});
		this.overlayEl.addEventListener("pointerdown", (e: PointerEvent) => {
			if (e.target === this.overlayEl) {
				this.closeOutline();
			}
		});
	}

	// Render the file into the scroll area
	private async renderFile(file: TFile): Promise<void> {
		this.scrollEl.empty();

		const markdown = await this.app.vault.read(file);
		const wrapper = this.scrollEl.createEl("div", { cls: "preach-body" });

		await MarkdownRenderer.render(
			this.app,
			markdown,
			wrapper,
			file.path,
			this.renderComponent
		);

		// Restore scroll position after render
		window.requestAnimationFrame(() => {
			this.scrollEl.scrollTop = this.savedScrollTop;
		});

		// Tag headings so outline scroll-to works
		this.tagRenderedHeadings(wrapper, markdown);
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
		let panel = this.overlayEl.querySelector<HTMLElement>(".preach-outline-panel");
		if (!panel) {
			panel = this.overlayEl.createEl("div", { cls: "preach-outline-panel" });
		}
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
				const btn = panel!.createEl("button", {
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

	// Edit round-trip: open the file in an edit leaf, preserving scroll
	private goToEdit(): void {
		if (!this.file) return;

		this.savedScrollTop = this.scrollEl.scrollTop;

		const existingLeaf = this.app.workspace
			.getLeavesOfType("markdown")
			.find(
				(l) =>
					(l.view as { file?: TFile }).file?.path === this.file?.path
			);

		if (existingLeaf) {
			this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
		} else {
			const leaf = this.app.workspace.getLeaf(false);
			if (this.file) {
				leaf.openFile(this.file, { active: true });
			}
		}
	}

	// Screen wake lock
	private async requestWakeLock(): Promise<void> {
		try {
			if ("wakeLock" in navigator) {
				const nav = navigator as Navigator & { wakeLock: WakeLockAPI };
				this.wakeLock = await nav.wakeLock.request("screen");
			}
		} catch (_err) {
			// Wake lock unavailable - non-fatal
		}
	}

	private async releaseWakeLock(): Promise<void> {
		try {
			if (this.wakeLock) {
				await this.wakeLock.release();
				this.wakeLock = null;
			}
		} catch (_err) {
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
