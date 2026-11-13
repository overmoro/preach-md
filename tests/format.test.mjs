// Tests for the pure highlight wrap / recolour / unwrap string logic.
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyHighlight } from "./.build/format.mjs";

/** Runs applyHighlight over the first occurrence of `sel` in `data`. */
function run(data, sel, colour) {
	const start = data.indexOf(sel);
	return applyHighlight(data, start, start + sel.length, colour);
}

test("wraps plain text with the default highlight", () => {
	assert.equal(run("Grace is free", "Grace", null), "==Grace== is free");
});

test("wraps plain text with a colour emoji", () => {
	assert.equal(run("Grace is free", "Grace", "red"), "==🔴Grace== is free");
	assert.equal(run("a b c", "b", "purple"), "a ==🟣b== c");
});

test("recolours an existing coloured highlight without nesting", () => {
	assert.equal(run("x ==🔴Grace== y", "Grace", "blue"), "x ==🔵Grace== y");
});

test("adds a colour to a plain highlight", () => {
	assert.equal(run("x ==Grace== y", "Grace", "green"), "x ==🟢Grace== y");
});

test("default on a coloured highlight strips the colour", () => {
	assert.equal(run("x ==🟠Grace== y", "Grace", null), "x ==Grace== y");
});

test("same colour on a coloured highlight unwraps it", () => {
	assert.equal(run("x ==🟡Grace== y", "Grace", "yellow"), "x Grace y");
});

test("default on a plain highlight unwraps it", () => {
	assert.equal(run("x ==Grace== y", "Grace", null), "x Grace y");
});

test("recognises the square emoji and rewrites to the circle", () => {
	assert.equal(run("==🟥Grace==", "Grace", "green"), "==🟢Grace==");
	assert.equal(run("==🟥Grace==", "Grace", "red"), "Grace");
});

test("leaves a neighbouring highlight alone", () => {
	assert.equal(run("==🔴a== and b", "b", "blue"), "==🔴a== and ==🔵b==");
});
