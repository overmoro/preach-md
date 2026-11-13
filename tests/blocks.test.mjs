import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionsFit, toBlocks } from "./.build/blocks.mjs";

// Section fixtures are the output of Obsidian 1.15.1's own parser for these texts.
const sec = (type, sl, sc, so, el, ec, eo) => ({
	type,
	position: { start: { line: sl, col: sc, offset: so }, end: { line: el, col: ec, offset: eo } },
});

const fenceText = "Intro para.\n\n```\nline one\n\nline two\n```\n\nAfter.\n";
const fence = [
	sec("paragraph", 0, 0, 0, 0, 11, 11),
	sec("code", 2, 0, 13, 6, 3, 39),
	sec("paragraph", 8, 0, 41, 8, 6, 47),
];
const mixedText =
	"---\na: 1\n---\n\nBefore.\n\n%%\nprivate\n\nstill private\n%%\n\nAfter[^1].\n\n[^1]: note\n";
const mixed = [
	sec("yaml", 0, 0, 0, 2, 3, 12),
	sec("paragraph", 4, 0, 14, 4, 7, 21),
	sec("comment", 6, 0, 23, 10, 2, 51),
	sec("paragraph", 12, 0, 53, 12, 10, 63),
	sec("footnoteDefinition", 14, 0, 65, 14, 10, 75),
	sec("text", 15, 0, 75, 15, 0, 75),
	sec("element", 15, 0, 75, 15, 0, 75),
];
const tightText = "# Title\n```js\nlet x = 1;\n```\nText right after.\n";
const tight = [
	sec("heading", 0, 0, 0, 0, 7, 7),
	sec("code", 1, 0, 8, 3, 3, 28),
	sec("paragraph", 4, 0, 29, 4, 17, 46),
];
const unclosedText = "Para.\n\n%%\nnever closed\n\nstill hidden?\n";
const unclosed = [sec("paragraph", 0, 0, 0, 0, 5, 5), sec("comment", 2, 0, 7, 6, 0, 38)];

const slices = (text, sections) => toBlocks(text, sections).map((b) => text.slice(b.start, b.end));

test("toBlocks keeps a fence with a blank line whole", () => {
	const blocks = toBlocks(fenceText, fence);
	assert.equal(blocks.length, 3);
	assert.equal(fenceText.slice(blocks[1].start, blocks[1].end), "```\nline one\n\nline two\n```");
	assert.deepEqual(blocks.map((b) => b.line), [0, 2, 8]);
});

test("toBlocks drops yaml, comment and zero-length sections", () => {
	const got = slices(mixedText, mixed);
	assert.deepEqual(got, ["Before.", "After[^1].", "[^1]: note"]);
	assert.ok(!got.some((s) => s.includes("private")));
});

test("toBlocks splits a fence right after a heading", () => {
	const blocks = toBlocks(tightText, tight);
	assert.deepEqual(slices(tightText, tight), ["# Title", "```js\nlet x = 1;\n```", "Text right after."]);
	assert.deepEqual(blocks.map((b) => b.line), [0, 1, 4]);
});

test("toBlocks hides everything after an unclosed comment", () => {
	assert.deepEqual(slices(unclosedText, unclosed), ["Para."]);
});

test("sectionsFit accepts each text with its own sections", () => {
	assert.ok(sectionsFit(fenceText, fence));
	assert.ok(sectionsFit(mixedText, mixed));
	assert.ok(sectionsFit(tightText, tight));
	assert.ok(sectionsFit(unclosedText, unclosed));
});

test("sectionsFit rejects text that has moved on from its sections", () => {
	assert.ok(!sectionsFit(fenceText + "\nNew para.\n", fence));
	assert.ok(!sectionsFit(fenceText.replace("Intro ", ""), fence));
	assert.ok(!sectionsFit(fenceText.replace("Intro", "Intro**"), fence));
	assert.ok(!sectionsFit("Extra line\n" + fenceText, fence));
	// Sections from the parser for "A\n\n  \nB"; only the gap between them differs.
	const gap = [sec("paragraph", 0, 0, 0, 0, 1, 1), sec("paragraph", 3, 0, 6, 3, 1, 7)];
	assert.ok(sectionsFit("A\n\n  \nB", gap));
	assert.ok(!sectionsFit("A\n\nXY\nB", gap));
});

test("sectionsFit handles notes with no sections", () => {
	assert.ok(!sectionsFit("Some text\n", []));
	assert.ok(sectionsFit("\n\n", []));
});
