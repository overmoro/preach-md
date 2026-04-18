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

		// Timer thresholds
		new Setting(containerEl).setName("Timer").setHeading();

		new Setting(containerEl)
			.setName("Target duration (minutes)")
			.setDesc("The countdown starts from this value.")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.targetMinutes))
					.onChange((value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.targetMinutes = n;
							void this.plugin.saveSettings();
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
					.onChange((value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.warnMinutes = n;
							void this.plugin.saveSettings();
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
					.onChange((value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.critMinutes = n;
							void this.plugin.saveSettings();
						}
					})
			);

		// Section navigation
		new Setting(containerEl).setName("Navigation").setHeading();

		new Setting(containerEl)
			.setName("Section heading level")
			.setDesc(
				"Heading level used to build the outline (2 = ##, 3 = ###)."
			)
			.addText((text) =>
				text
					.setPlaceholder("2")
					.setValue(String(this.plugin.settings.sectionHeadingLevel))
					.onChange((value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n >= 1 && n <= 6) {
							this.plugin.settings.sectionHeadingLevel = n;
							void this.plugin.saveSettings();
						}
					})
			);

		// Scripture
		new Setting(containerEl).setName("Scripture").setHeading();

		new Setting(containerEl)
			.setName("Bible folder path")
			.setDesc(
				"Vault path to your bible chapter files. Each book is a subfolder; each chapter is a separate .md file."
			)
			.addText((text) =>
				text
					.setPlaceholder("30_Knowledge/Theology/Bible/CSB")
					.setValue(this.plugin.settings.csbFolderPath)
					.onChange((value) => {
						this.plugin.settings.csbFolderPath = value.trim();
						void this.plugin.saveSettings();
					})
			);
	}
}
