import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapCandidates, markCandidates } from "./.build/format.mjs";

test("wrapCandidates proposes one edit per exact occurrence, in source order", () => {
	assert.deepEqual(wrapCandidates("Grace and grace", "grace", "**", "**"), ["Grace and **grace**"]);
	assert.deepEqual(wrapCandidates("grace and grace", "grace", "**", "**"), [
		"**grace** and grace",
		"grace and **grace**",
	]);
});

test("wrapCandidates keeps open and close distinct", () => {
	assert.deepEqual(wrapCandidates("a b", "b", "<u>", "</u>"), ["a <u>b</u>"]);
});

test("wrapCandidates proposes nothing for text that is not a literal substring", () => {
	assert.deepEqual(wrapCandidates("**grace** alone", "grace alone", "**", "**"), []);
});

test("wrapCandidates refuses past 12 occurrences", () => {
	const words = (n) => Array(n).fill("grace").join(" ");
	assert.equal(wrapCandidates(words(12), "grace", "**", "**").length, 12);
	assert.deepEqual(wrapCandidates(words(13), "grace", "**", "**"), []);
});

test("markCandidates recolours, unwraps and makes plain", () => {
	const src = "x ==\u{1F534}Grace== y";
	assert.deepEqual(markCandidates(src, "Grace", "blue"), ["x ==\u{1F535}Grace== y"]);
	assert.deepEqual(markCandidates(src, "Grace", null), ["x Grace y"]);
	assert.deepEqual(markCandidates(src, "Grace", ""), ["x ==Grace== y"]);
});

test("markCandidates finds a square-emoji highlight and writes circles", () => {
	assert.deepEqual(markCandidates("==\u{1F7E5}sq==", "sq", "green"), ["==\u{1F7E2}sq=="]);
});

test("markCandidates drops a stray variation selector only on unwrap", () => {
	const src = "==\u{1F534}\uFE0Fvs==";
	assert.deepEqual(markCandidates(src, "\uFE0Fvs", null), ["vs"]);
	assert.deepEqual(markCandidates(src, "\uFE0Fvs", "blue"), ["==\u{1F535}\uFE0Fvs=="]);
});

test("markCandidates proposes one edit per identical highlight", () => {
	assert.deepEqual(markCandidates("==\u{1F534}a== and ==\u{1F534}a==", "a", "blue"), [
		"==\u{1F535}a== and ==\u{1F534}a==",
		"==\u{1F534}a== and ==\u{1F535}a==",
	]);
});
