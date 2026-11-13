// Minimal stand-in for the `obsidian` module, which only exists inside the app.
// The scripture module imports these for type positions and instanceof checks;
// none of the pure functions under test call into them.
export class App {}
export class Component {}
export class TFile {}
export const MarkdownRenderer = {};

// Enough of the settings surface for the declarative definitions to be read.
// display() is never called in tests, so Setting only needs to exist.
export class PluginSettingTab {
	constructor(app, plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = null;
	}
}

export class Setting {
	setName() { return this; }
	setDesc() { return this; }
	setHeading() { return this; }
	addText() { return this; }
}
