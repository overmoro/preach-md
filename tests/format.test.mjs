import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapCandidates } from "./.build/format.mjs";

test("wrapCandidates proposes one edit per exact occurrence, in source order", () => {
	assert.deepEqual(wrapCandidates("Grace and grace", "grace", "**", "**"), ["Grace and **grace**"]);
	assert.deepEqual(wrapCandidates("grace and grace", "grace", "**", "**"), [
		"**grace** and grace",
		"grace and **grace**",
	]);
});

test("wrapCandidates proposes nothing for text that is not a literal substring", () => {
	assert.deepEqual(wrapCandidates("**grace** alone", "grace alone", "**", "**"), []);
});

test("wrapCandidates refuses past 12 occurrences", () => {
	const words = (n) => Array(n).fill("grace").join(" ");
	assert.equal(wrapCandidates(words(12), "grace", "**", "**").length, 12);
	assert.deepEqual(wrapCandidates(words(13), "grace", "**", "**"), []);
});
