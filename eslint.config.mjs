// Lint configuration for Preach MD.
//
// eslint-plugin-obsidianmd is the same ruleset the Obsidian community plugin
// review runs against a release. Running it here means a finding shows up on
// the commit that introduced it, with a file and a line, rather than as a
// number on the plugin's scorecard days later with no location attached.
//
// Several of its rules need type information, so src is linted with the
// project's tsconfig. The tests and build scripts are plain .mjs and are not in
// that project, so they are left out rather than type-linted against a config
// that does not describe them.
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{
		ignores: ["main.js", "tests/.build/**", "node_modules/**"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		// Two strings in these files are not UI prose and should not be
		// sentence-cased. "← Preach" names the mode, so the rule's suggested
		// "← preach" is wrong, and the settings placeholder is a real vault path
		// that would no longer match any folder in lower case.
		//
		// The ruleset blocks disabling this rule with an inline comment
		// (eslint-comments/no-restricted-disable), so the override has to live
		// here. It is scoped to these two files rather than turned off globally,
		// and every other rule still applies to them.
		files: ["src/preach-view.ts", "src/settings.ts"],
		rules: {
			"obsidianmd/ui/sentence-case": "off",
		},
	},
);
