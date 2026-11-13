// Expectations were worked out by hand from the spec, not from running the code.
import { test } from "node:test";
import assert from "node:assert/strict";

import { readHeadingTime, sectionPace, currentSectionIndex } from "./.build/section-strip.mjs";

const accepted = [
	["Intro (~3 min)", 3, "Intro"],
	["I. Circumcised in Him (v.11) (~5 min)", 5, "I. Circumcised in Him (v.11)"],
	["Hook (~1.5 min)", 1.5, "Hook"],
	["Close (~0.5 min)", 0.5, "Close"],
	["Ice Breaker (5 mins)", 5, "Ice Breaker"],
	["Intro (~5 Min)", 5, "Intro"],
	["Intro (5minutes)", 5, "Intro"],
	["Intro ( ~5 min )", 5, "Intro"],
	["Intro(~5 min)", 5, "Intro"],
	["Intro (~1,5 min)", 1.5, "Intro"],
	["Intro (~5 min)  ", 5, "Intro"],
	["Intro (~120 min)", 120, "Intro"],
	["Intro (~1.25 min)", 1.25, "Intro"],
	["A (~2 min) (~3 min)", 3, "A (~2 min)"],
];

test("readHeadingTime reads a trailing planned time", () => {
	for (const [input, minutes, lastRest] of accepted) {
		assert.deepEqual(readHeadingTime(input, input), { minutes, lastRest }, input);
	}
});

test("readHeadingTime leaves everything else alone", () => {
	const rejected = [
		"The 5 min rule", "Intro (~5m)", "Intro (~5 m)", "Intro (~0 min)", "Intro (~0.0 min)",
		"Intro (~500 min)", "Intro (~121 min)", "Intro (~120.5 min)", "INTO COMMUNION (~3-4 min)",
		"Nailed Up (full version, ~7-8 min)", "Preaching Flow (30–35 minutes)",
		"Nailed Up (5-minute cut, ~620 words)", "(~5 min) Intro", "Intro (~5 min) extended",
		"Intro (~5 min):", "Intro (~5 min.)", "Intro (about 5 min)", "Intro (~5 hrs)",
		"Intro (~-5 min)", "Intro (~.5 min)", "Intro (~5.5.5 min)", "Intro ~5 min", "Intro [~5 min]",
		"Intro (~5 min", "Intro ((~5 min))", "(~5 min)", "   (~5 min)",
		"Intro (~99999999999999999999 min)", "Intro (~5 minss)", "Intro (≈5 min)",
	];
	for (const input of rejected) assert.equal(readHeadingTime(input, input), null, input);
});

test("readHeadingTime handles a token split across DOM text nodes", () => {
	const full = "I. Circumcised in Him (v.11) (~5 min)";
	assert.deepEqual(readHeadingTime(full, ") (~5 min)"), { minutes: 5, lastRest: ")" });
	assert.deepEqual(readHeadingTime(full, " (~5 min)"), { minutes: 5, lastRest: "" });
	assert.deepEqual(readHeadingTime("Intro (~3 min)", "(~3 min)"), { minutes: 3, lastRest: "" });
	assert.equal(readHeadingTime("Intro (~3 min)", ")"), null);
	assert.equal(readHeadingTime("(~3 min)", "(~3 min)"), null);
});

const D = [3, 5, 7, 4, 6, 5, 3];
const M = [null, 3, null, 5];
const S = [1.5, 2, 2, 1.5, 0.5];

function check(plans, current, elapsed, expected) {
	const got = sectionPace(plans, current, elapsed);
	if (expected === null) return assert.equal(got, null, `${current}/${elapsed}`);
	assert.equal(got.pace, expected.pace, `pace ${current}/${elapsed}`);
	assert.equal(got.planned, expected.planned, `planned ${current}/${elapsed}`);
	assert.ok(Math.abs(got.fraction - expected.fraction) < 1e-9, `fraction ${current}/${elapsed}: ${got.fraction}`);
}

test("sectionPace against Don's plan", () => {
	check(D, 0, 0, { pace: "on", planned: 0, fraction: 0 });
	check(D, 0, 90, { pace: "on", planned: 0, fraction: 0.5 });
	check(D, 0, 210, { pace: "on", planned: 1, fraction: 0.1 });
	check(D, 0, 240, { pace: "behind", planned: 1, fraction: 0.2 });
	check(D, 2, 420, { pace: "ahead", planned: 1, fraction: 0.8 });
	check(D, 2, 450, { pace: "on", planned: 1, fraction: 0.9 });
	check(D, 6, 1980, { pace: "on", planned: 6, fraction: 1 });
	check(D, 6, 2011, { pace: "behind", planned: 6, fraction: 1 });
	check(D, -1, 90, { pace: null, planned: 0, fraction: 0.5 });
	check(D, 0, null, null);
});

test("sectionPace skips untimed sections", () => {
	check(M, 3, 90, { pace: "ahead", planned: 1, fraction: 0.5 });
	check(M, 2, 330, { pace: null, planned: 3, fraction: 0.5 });
});

test("sectionPace with decimal minutes", () => {
	check(S, 4, 435, { pace: "on", planned: 4, fraction: 0.5 });
	check(S, 4, 480, { pace: "on", planned: 4, fraction: 1 });
	check(S, 4, 481, { pace: "behind", planned: 4, fraction: 1 });
});

test("sectionPace is null when nothing has a plan", () => {
	assert.equal(sectionPace([null, null], 0, 10), null);
});

test("currentSectionIndex", () => {
	const cases = [
		[[], 250, 1000, false, -1],
		[[300, 900], 250, 1000, false, -1],
		[[0, 900], 250, 1000, false, 0],
		[[250, 900], 250, 1000, false, 0],
		[[-800, -20, 600], 250, 1000, false, 1],
		[[-800, -20, 600], 250, 1000, true, 2],
		[[-800, -20, 1000], 250, 1000, true, 1],
	];
	for (const [tops, line, vh, atBottom, expected] of cases) {
		assert.equal(currentSectionIndex(tops, line, vh, atBottom), expected, JSON.stringify([tops, atBottom]));
	}
});
