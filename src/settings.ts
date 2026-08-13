import { App, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
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

	/**
	 * Declarative mirror of display(), so these settings are reachable from
	 * Obsidian's settings search on 1.13 and later.
	 *
	 * Added alongside display() rather than replacing it. Older Obsidian never
	 * calls this method, so minAppVersion stays at 1.4.0 and nobody is dropped
	 * for the sake of search.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "group",
				heading: "Timer",
				items: [
					{
						name: "Target duration (minutes)",
						desc: "The countdown starts from this value.",
						aliases: ["countdown", "length", "sermon length"],
						control: {
							type: "number",
							key: "targetMinutes",
							defaultValue: DEFAULT_SETTINGS.targetMinutes,
							placeholder: String(DEFAULT_SETTINGS.targetMinutes),
							min: 1,
						},
					},
					{
						name: "Amber warning (minutes remaining)",
						desc: "Timer turns amber when this many minutes remain.",
						aliases: ["warning", "orange"],
						control: {
							type: "number",
							key: "warnMinutes",
							defaultValue: DEFAULT_SETTINGS.warnMinutes,
							placeholder: String(DEFAULT_SETTINGS.warnMinutes),
							min: 1,
						},
					},
					{
						name: "Red warning (minutes remaining)",
						desc: "Timer turns red when this many minutes remain.",
						aliases: ["warning", "critical"],
						control: {
							type: "number",
							key: "critMinutes",
							defaultValue: DEFAULT_SETTINGS.critMinutes,
							placeholder: String(DEFAULT_SETTINGS.critMinutes),
							min: 1,
						},
					},
				],
			},
			{
				type: "group",
				heading: "Navigation",
				items: [
					{
						name: "Section heading level",
						desc: "Heading level used to build the outline (2 = ##, 3 = ###).",
						aliases: ["outline", "sections"],
						control: {
							type: "number",
							key: "sectionHeadingLevel",
							defaultValue: DEFAULT_SETTINGS.sectionHeadingLevel,
							placeholder: String(DEFAULT_SETTINGS.sectionHeadingLevel),
							min: 1,
							max: 6,
						},
					},
				],
			},
			{
				type: "group",
				heading: "Scripture",
				items: [
					{
						name: "Bible folder path",
						desc: "Vault path to your bible chapter files. Each book is a subfolder, either plain (e.g. \"Matthew\") or numbered canon-order (e.g. \"40 - Matthew\"); each chapter is a separate .md file.",
						aliases: ["bible", "csb", "scripture", "verses"],
						control: {
							type: "text",
							key: "csbFolderPath",
							defaultValue: DEFAULT_SETTINGS.csbFolderPath,
							placeholder: DEFAULT_SETTINGS.csbFolderPath,
						},
					},
				],
			},
		];
	}

	/**
	 * Applies the same validation the imperative controls in display() apply,
	 * so a value typed into settings search cannot land somewhere the
	 * hand-built inputs would have rejected. An out-of-range value is ignored
	 * rather than clamped, matching display()'s behaviour of simply not
	 * assigning.
	 */
	setControlValue(key: string, value: unknown): void | Promise<void> {
		const settings = this.plugin.settings;

		switch (key) {
			case "targetMinutes":
			case "warnMinutes":
			case "critMinutes": {
				const n = Number(value);
				if (!Number.isFinite(n) || n <= 0) return;
				settings[key] = n;
				break;
			}
			case "sectionHeadingLevel": {
				const n = Number(value);
				if (!Number.isFinite(n) || n < 1 || n > 6) return;
				settings.sectionHeadingLevel = n;
				break;
			}
			case "csbFolderPath":
				settings.csbFolderPath = String(value).trim();
				break;
			default:
				return;
		}

		return this.plugin.saveSettings();
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
				"Vault path to your bible chapter files. Each book is a subfolder, either plain (e.g. \"Matthew\") or numbered canon-order (e.g. \"40 - Matthew\"); each chapter is a separate .md file."
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
