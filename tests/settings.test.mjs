// Tests for the declarative settings definitions.
//
// The definitions are a second description of the same five settings that
// display() builds by hand. Nothing in the type system ties a control's `key`
// to a real settings field, so a typo there compiles cleanly and silently makes
// that setting a no-op when edited from Obsidian's settings search.
import { test } from "node:test";
import assert from "node:assert/strict";

import { PreachMDSettingTab, DEFAULT_SETTINGS, parseStoredSettings } from "./.build/settings.mjs";

/** A settings tab wired to a fake plugin that records saves. */
function makeTab() {
	const saves = [];
	const plugin = {
		settings: { ...DEFAULT_SETTINGS },
		saveSettings() {
			saves.push({ ...plugin.settings });
			return Promise.resolve();
		},
	};
	return { tab: new PreachMDSettingTab({}, plugin), plugin, saves };
}

/** Flattens the group structure down to the individual controls. */
function controls(tab) {
	return tab
		.getSettingDefinitions()
		.flatMap((group) => group.items ?? [])
		.filter((item) => item.control);
}

test("every declared control key is a real settings field", () => {
	const { tab } = makeTab();
	const known = Object.keys(DEFAULT_SETTINGS);
	for (const item of controls(tab)) {
		assert.ok(
			known.includes(item.control.key),
			`control "${item.name}" uses key "${item.control.key}", which is not a field of PreachMDSettings`,
		);
	}
});

test("every settings field is reachable from the declarations", () => {
	const { tab } = makeTab();
	const declared = controls(tab).map((i) => i.control.key).sort();
	assert.deepEqual(declared, Object.keys(DEFAULT_SETTINGS).sort());
});

test("declared defaults match the real defaults", () => {
	const { tab } = makeTab();
	for (const item of controls(tab)) {
		assert.equal(
			item.control.defaultValue,
			DEFAULT_SETTINGS[item.control.key],
			`default for "${item.control.key}" disagrees with DEFAULT_SETTINGS`,
		);
	}
});

test("every control has a name and a description", () => {
	const { tab } = makeTab();
	for (const item of controls(tab)) {
		assert.ok(item.name && item.name.length > 0, "a control is missing a name");
		assert.ok(item.desc && item.desc.length > 0, `"${item.name}" is missing a description`);
	}
});

test("setControlValue accepts valid values and persists them", async () => {
	const { tab, plugin, saves } = makeTab();
	await tab.setControlValue("targetMinutes", 45);
	await tab.setControlValue("sectionHeadingLevel", 3);
	await tab.setControlValue("csbFolderPath", "  Bible/CSB  ");
	assert.equal(plugin.settings.targetMinutes, 45);
	assert.equal(plugin.settings.sectionHeadingLevel, 3);
	assert.equal(plugin.settings.csbFolderPath, "Bible/CSB", "path should be trimmed");
	assert.equal(saves.length, 3);
});

test("setControlValue rejects values the hand-built inputs would reject", async () => {
	const { tab, plugin, saves } = makeTab();
	const before = { ...plugin.settings };
	for (const [key, bad] of [
		["targetMinutes", 0],
		["targetMinutes", -5],
		["targetMinutes", "not a number"],
		["warnMinutes", 0],
		["critMinutes", -1],
		["sectionHeadingLevel", 0],
		["sectionHeadingLevel", 7],
	]) {
		await tab.setControlValue(key, bad);
		assert.equal(
			plugin.settings[key],
			before[key],
			`${key} accepted ${JSON.stringify(bad)}, which display() would have ignored`,
		);
	}
	assert.equal(saves.length, 0, "a rejected value should not trigger a save");
});

test("an unknown key is ignored rather than added to settings", async () => {
	const { tab, plugin, saves } = makeTab();
	await tab.setControlValue("nonsense", 1);
	assert.ok(!("nonsense" in plugin.settings));
	assert.equal(saves.length, 0);
});

// ---------------------------------------------------------------------------
// Stored settings validation
//
// Obsidian's loadData() is typed Promise<any>, so before parseStoredSettings
// existed a hand-edited or partly written data.json went into settings
// unchecked. A string in targetMinutes would have reached the timer.
// ---------------------------------------------------------------------------

test("valid stored settings are kept", () => {
	const out = parseStoredSettings({
		targetMinutes: 45,
		warnMinutes: 10,
		critMinutes: 2,
		sectionHeadingLevel: 3,
		csbFolderPath: "  Bible/CSB  ",
	});
	assert.deepEqual(out, {
		targetMinutes: 45,
		warnMinutes: 10,
		critMinutes: 2,
		sectionHeadingLevel: 3,
		csbFolderPath: "Bible/CSB",
	});
});

test("unusable stored values are dropped so the default applies", () => {
	const out = parseStoredSettings({
		targetMinutes: "30",        // string, not number
		warnMinutes: 0,             // below range
		critMinutes: 1.5,           // not a whole number
		sectionHeadingLevel: 7,     // above range
		csbFolderPath: 42,          // not a string
	});
	assert.deepEqual(out, {}, "no unusable field should survive");
	assert.deepEqual({ ...DEFAULT_SETTINGS, ...out }, DEFAULT_SETTINGS);
});

test("a partial file keeps what it has and defaults the rest", () => {
	const merged = { ...DEFAULT_SETTINGS, ...parseStoredSettings({ targetMinutes: 20 }) };
	assert.equal(merged.targetMinutes, 20);
	assert.equal(merged.warnMinutes, DEFAULT_SETTINGS.warnMinutes);
	assert.equal(merged.csbFolderPath, DEFAULT_SETTINGS.csbFolderPath);
});

test("a corrupt or absent file falls back entirely", () => {
	for (const raw of [null, undefined, "not an object", 7, []]) {
		const merged = { ...DEFAULT_SETTINGS, ...parseStoredSettings(raw) };
		assert.deepEqual(merged, DEFAULT_SETTINGS, `failed for ${JSON.stringify(raw)}`);
	}
});

test("prototype keys in stored data cannot reach settings", () => {
	const out = parseStoredSettings(JSON.parse('{"__proto__":{"targetMinutes":999}}'));
	assert.deepEqual(out, {});
	assert.equal({ ...DEFAULT_SETTINGS, ...out }.targetMinutes, DEFAULT_SETTINGS.targetMinutes);
});
