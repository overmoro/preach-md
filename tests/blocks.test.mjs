// Tests for parseBlocks: block boundaries and source lines on tightly packed notes.
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseBlocks } from "./.build/highlight.mjs";

/** [startLine, endLine, content] per block; endLine is derived from the content. */
function shape(md) {
	return parseBlocks(md).map((b) => [b.startLine, b.startLine + b.content.split("\n").length - 1, b.content]);
}

test("heading straight into text", () => {
	assert.deepEqual(shape("# Title\nSome text\nmore text"), [
		[0, 0, "# Title"],
		[1, 2, "Some text\nmore text"],
	]);
});

test("text straight into a thematic break", () => {
	assert.deepEqual(shape("Some text\n---\nNext"), [
		[0, 0, "Some text"],
		[1, 1, "---"],
		[2, 2, "Next"],
	]);
});

test("list straight into a heading", () => {
	assert.deepEqual(shape("- one\n- two\n## Next\ntext"), [
		[0, 1, "- one\n- two"],
		[2, 2, "## Next"],
		[3, 3, "text"],
	]);
});

test("callout straight after text", () => {
	assert.deepEqual(shape("Intro\n> [!note] Hi\n> body\nafter"), [
		[0, 0, "Intro"],
		[1, 3, "> [!note] Hi\n> body\nafter"],
	]);
});

test("list straight after text, and nested items stay together", () => {
	assert.deepEqual(shape("Points:\n1. a\n   - nested\n2. b"), [
		[0, 0, "Points:"],
		[1, 3, "1. a\n   - nested\n2. b"],
	]);
});

test("code fence straight after text", () => {
	const b = shape("Text\n```js\nx\n```\n\nAfter");
	assert.deepEqual(b[0], [0, 0, "Text"]);
	assert.equal(b[1][0], 3);
});

test("consecutive plain lines stay one paragraph", () => {
	assert.deepEqual(shape("one\ntwo\nthree"), [[0, 2, "one\ntwo\nthree"]]);
});

test("frontmatter offsets lines", () => {
	assert.deepEqual(shape("---\ntitle: x\n---\n# H\ntext"), [
		[3, 3, "# H"],
		[4, 4, "text"],
	]);
});

test("offsets index the source", () => {
	const md = "# H\ntext\n- a\n- b\n> q";
	for (const b of parseBlocks(md)) assert.equal(md.slice(b.start, b.end).trimEnd(), b.content);
});

test("blank-line-separated notes parse as before", () => {
	const md = [
		"---",
		"title: x",
		"---",
		"",
		"# Heading",
		"",
		"Para one",
		"continues.",
		"",
		"- a",
		"- b",
		"",
		"> quote",
		"",
		"> [!note] Callout",
		"> body",
		"",
		"---",
		"",
		"Last",
	].join("\n");
	assert.deepEqual(
		parseBlocks(md).map((b) => [b.startLine, b.content, b.highlightable]),
		[
			[4, "# Heading", false],
			[6, "Para one\ncontinues.", true],
			[9, "- a\n- b", false],
			[12, "> quote", false],
			[14, "> [!note] Callout\n> body", false],
			[17, "---", false],
			[19, "Last", true],
		]
	);
});
