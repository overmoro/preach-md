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

test("a selection inside a coloured highlight recolours the whole span", () => {
	assert.equal(run("==🔴Grace alone saves==", "alone", "blue"), "==🔵Grace alone saves==");
	assert.equal(run("==🔴Grace alone==", "Grace", "blue"), "==🔵Grace alone==");
});

test("a selection inside a highlight unwraps the whole span on the same colour", () => {
	assert.equal(run("x ==🔴Grace alone== y", "alone", "red"), "x Grace alone y");
	assert.equal(run("x ==Grace alone== y", "alone", null), "x Grace alone y");
});

test("only the span holding the selection changes", () => {
	assert.equal(run("==🔴a== then ==🟢b c==", "c", "blue"), "==🔴a== then ==🔵b c==");
});

test("refuses a selection that crosses a highlight boundary", () => {
	assert.equal(run("==🔴Grace== alone", "Grace alone", "blue"), null);
	assert.equal(run("x ==Grace== alone", "x ==Grace", "blue"), null);
});

test("refuses a selection that contains ==", () => {
	assert.equal(run("a ==b== c", "a ==b== c", "blue"), null);
});

test("refuses text sitting between two highlights", () => {
	assert.equal(run("==a==b==c==", "b", "blue"), null);
});

test("a highlight on another line does not affect the selection", () => {
	assert.equal(run("==🔴a==\nplain text", "plain", "blue"), "==🔴a==\n==🔵plain== text");
});
