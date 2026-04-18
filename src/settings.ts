import { App, PluginSettingTab, Setting } from "obsidian";
import type PreachMDPlugin from "./main";

export interface PreachMDSettings {
	warnMinutes: number;
	critMinutes: number;
	sectionHeadingLevel: number;
	// Session 2 stubs (not yet active):
	// csbFolderPath: string;
	// highlightColour: string;
}

export const DEFAULT_SETTINGS: PreachMDSettings = {
	warnMinutes: 25,
	critMinutes: 35,
	sectionHeadingLevel: 2,
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
			.setName("Amber warning (minutes)")
			.setDesc("Timer turns amber at this many minutes elapsed.")
			.addText((text) =>
				text
					.setPlaceholder("25")
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
			.setName("Red warning (minutes)")
			.setDesc("Timer turns red at this many minutes elapsed.")
			.addText((text) =>
				text
					.setPlaceholder("35")
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

		// Session 2 stubs (shown as disabled/informational)
		containerEl.createEl("h3", { text: "Scripture (coming soon)" });

		new Setting(containerEl)
			.setName("CSB Bible folder path")
			.setDesc(
				"Vault path to CSB chapter files. Available in a future update."
			)
			.setDisabled(true)
			.addText((text) =>
				text
					.setPlaceholder("30_Knowledge/Theology/Bible/CSB")
					.setDisabled(true)
			);

		containerEl.createEl("h3", { text: "Highlights (coming soon)" });

		new Setting(containerEl)
			.setName("Highlight colour")
			.setDesc("Colour used for paragraph highlights. Available in a future update.")
			.setDisabled(true)
			.addText((text) =>
				text.setPlaceholder("#ffe066").setDisabled(true)
			);
	}
}
