import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { PREACH_VIEW_TYPE, PreachView } from "./preach-view";
import { PreachMDSettings, DEFAULT_SETTINGS, PreachMDSettingTab } from "./settings";

export default class PreachMDPlugin extends Plugin {
	settings!: PreachMDSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register the preach view type
		this.registerView(
			PREACH_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new PreachView(leaf, this)
		);

		// Command: open preach mode for the active file
		this.addCommand({
			id: "open-preach-mode",
			name: "Open preach mode",
			callback: () => this.openPreachMode(),
		});

		// Ribbon icon
		this.addRibbonIcon("book-open", "Preach MD: open preach mode", () => {
			this.openPreachMode();
		});

		// Settings tab
		this.addSettingTab(new PreachMDSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(PREACH_VIEW_TYPE);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async openPreachMode(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return;
		}

		// Check if a preach view already exists for this file
		const existingLeaves = this.app.workspace.getLeavesOfType(PREACH_VIEW_TYPE);
		for (const leaf of existingLeaves) {
			const view = leaf.view as PreachView;
			if (view.file?.path === activeFile.path) {
				this.app.workspace.setActiveLeaf(leaf, { focus: true });
				return;
			}
		}

		// Open a new full-screen preach leaf
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: PREACH_VIEW_TYPE,
			active: true,
		});

		// Set the file on the view after it opens
		const view = leaf.view as PreachView;
		await view.setFile(activeFile);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}
}
