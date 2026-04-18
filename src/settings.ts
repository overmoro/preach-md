import { App, PluginSettingTab, Setting } from "obsidian";
import type PreachMDPlugin from "./main";

export interface PreachMDSettings {
	targetMinutes: number;
	warnMinutes: number;
	critMinutes: number;
	sectionHeadingLevel: number;
	csbFolderPath: string;
}

export const DEFAULT_SETTINGS: PreachMDSettings = {
	targetMinutes: 30,
	warnMinutes: 5,
	critMinutes: 1,
	sectionHeadingLevel: 2,
	csbFolderPath: "30_Knowledge/Theology/Bible/CSB",
};

export class PreachMDSettingTab extends PluginSettingTab {
	plugin: PreachMDPlugin;

	constructor(app: App, plugin: PreachMDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Preach MD" });

		// Timer thresholds
		containerEl.createEl("h3", { text: "Timer" });

		new Setting(containerEl)
			.setName("Target duration (minutes)")
			.setDesc("The countdown starts from this value.")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.targetMinutes))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.targetMinutes = n;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Amber warning (minutes remaining)")
			.setDesc("Timer turns amber when this many minutes remain.")
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(String(this.plugin.settings.warnMinutes))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.warnMinutes = n;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Red warning (minutes remaining)")
			.setDesc("Timer turns red when this many minutes remain.")
			.addText((text) =>
				text
					.setPlaceholder("1")
					.setValue(String(this.plugin.settings.critMinutes))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.critMinutes = n;
							await this.plugin.saveSettings();
						}
					})
			);

		// Section navigation
		containerEl.createEl("h3", { text: "Navigation" });

		new Setting(containerEl)
			.setName("Section heading level")
			.setDesc(
				"Heading level used to build the outline (2 = ##, 3 = ###)."
			)
			.addText((text) =>
				text
					.setPlaceholder("2")
					.setValue(String(this.plugin.settings.sectionHeadingLevel))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n >= 1 && n <= 6) {
							this.plugin.settings.sectionHeadingLevel = n;
							await this.plugin.saveSettings();
						}
					})
			);

		// Scripture
		containerEl.createEl("h3", { text: "Scripture" });

		new Setting(containerEl)
			.setName("Bible folder path")
			.setDesc(
				"Vault-relative path to your Bible chapter files. Each book should be a folder with files named like 'John 3.md'."
			)
			.addText((text) =>
				text
					.setPlaceholder("30_Knowledge/Theology/Bible/CSB")
					.setValue(this.plugin.settings.csbFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.csbFolderPath = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}
}
