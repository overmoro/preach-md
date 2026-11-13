// Regression tests for the canon table and scripture path building.
//
// Run with `npm test`, which bundles src/scripture.ts first (see
// esbuild.test.mjs). These assertions deliberately restate the expected canon
// independently of the table that produces it: a test that derived its
// expectations from CANON would agree with any typo CANON contained.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
	BOOKS,
	chapterPaths,
	fetchVerses,
	normaliseBook,
	parseReferences,
} from "./.build/scripture.mjs";

/**
 * Canon order, filename prefix, and canon number for all 66 books, written out
 * by hand. This is the independent source of truth: if a row in src/scripture.ts
 * is renamed, reordered, or has its prefix mistyped, this table disagrees.
 */
const EXPECTED = [
	["Genesis", "Gen", "01"], ["Exodus", "Exod", "02"], ["Leviticus", "Lev", "03"],
	["Numbers", "Num", "04"], ["Deuteronomy", "Deut", "05"], ["Joshua", "Josh", "06"],
	["Judges", "Judg", "07"], ["Ruth", "Ruth", "08"], ["1 Samuel", "1 Sam", "09"],
	["2 Samuel", "2 Sam", "10"], ["1 Kings", "1 Kgs", "11"], ["2 Kings", "2 Kgs", "12"],
	["1 Chronicles", "1 Chr", "13"], ["2 Chronicles", "2 Chr", "14"], ["Ezra", "Ezr", "15"],
	["Nehemiah", "Neh", "16"], ["Esther", "Esth", "17"], ["Job", "Job", "18"],
	["Psalms", "Ps", "19"], ["Proverbs", "Prov", "20"], ["Ecclesiastes", "Eccl", "21"],
	["Song of Solomon", "Song", "22"], ["Isaiah", "Isa", "23"], ["Jeremiah", "Jer", "24"],
	["Lamentations", "Lam", "25"], ["Ezekiel", "Ezek", "26"], ["Daniel", "Dan", "27"],
	["Hosea", "Hos", "28"], ["Joel", "Joel", "29"], ["Amos", "Amos", "30"],
	["Obadiah", "Obad", "31"], ["Jonah", "Jonah", "32"], ["Micah", "Mic", "33"],
	["Nahum", "Nah", "34"], ["Habakkuk", "Hab", "35"], ["Zephaniah", "Zeph", "36"],
	["Haggai", "Hag", "37"], ["Zechariah", "Zech", "38"], ["Malachi", "Mal", "39"],
	["Matthew", "Matt", "40"], ["Mark", "Mark", "41"], ["Luke", "Luke", "42"],
	["John", "John", "43"], ["Acts", "Acts", "44"], ["Romans", "Rom", "45"],
	["1 Corinthians", "1 Cor", "46"], ["2 Corinthians", "2 Cor", "47"], ["Galatians", "Gal", "48"],
	["Ephesians", "Eph", "49"], ["Philippians", "Phil", "50"], ["Colossians", "Col", "51"],
	["1 Thessalonians", "1 Thess", "52"], ["2 Thessalonians", "2 Thess", "53"], ["1 Timothy", "1 Tim", "54"],
	["2 Timothy", "2 Tim", "55"], ["Titus", "Titus", "56"], ["Philemon", "Phlm", "57"],
	["Hebrews", "Heb", "58"], ["James", "Jas", "59"], ["1 Peter", "1 Pet", "60"],
	["2 Peter", "2 Pet", "61"], ["1 John", "1 John", "62"], ["2 John", "2 John", "63"],
	["3 John", "3 John", "64"], ["Jude", "Jude", "65"], ["Revelation", "Rev", "66"],
];

/** Named explicitly rather than counted: a count stays green if one swaps for another. */
const SINGLE_CHAPTER_BOOKS = ["Obadiah", "Philemon", "2 John", "3 John", "Jude"];

test("canon has exactly 66 books", () => {
	assert.equal(BOOKS.size, 66);
	assert.equal(EXPECTED.length, 66);
});

test("every book has the expected prefix and canon number", () => {
	const wrong = [];
	for (const [name, prefix, num] of EXPECTED) {
		const meta = BOOKS.get(name);
		if (!meta) {
			wrong.push(`${name}: missing from CANON entirely`);
			continue;
		}
		if (meta.prefix !== prefix) wrong.push(`${name}: prefix ${meta.prefix}, expected ${prefix}`);
		if (meta.num !== num) wrong.push(`${name}: number ${meta.num}, expected ${num}`);
	}
	assert.deepEqual(wrong, [], `canon table disagrees with the expected values:\n  ${wrong.join("\n  ")}`);
});

test("canon numbers are unique", () => {
	const seen = new Map();
	for (const [name, meta] of BOOKS) {
		const clash = seen.get(meta.num);
		assert.equal(clash, undefined, `${name} and ${clash} share canon number ${meta.num}`);
		seen.set(meta.num, name);
	}
});

test("single-chapter books are exactly the expected five", () => {
	const actual = [...BOOKS].filter(([, m]) => m.singleChapter).map(([n]) => n).sort();
	assert.deepEqual(actual, [...SINGLE_CHAPTER_BOOKS].sort());
});

test("chapterPaths builds both vault conventions", () => {
	assert.deepEqual(chapterPaths("Bible", "Matthew", 3), [
		"Bible/40 - Matthew/Matt-03.md",
		"Bible/Matthew/Matt 3.md",
	]);
	// Chapters above 99 keep their digits rather than being truncated by padding.
	assert.deepEqual(chapterPaths("Bible", "Psalms", 119), [
		"Bible/19 - Psalms/Ps-119.md",
		"Bible/Psalms/Ps 119.md",
	]);
});

test("single-chapter books drop the chapter number in numbered vaults only", () => {
	assert.deepEqual(chapterPaths("Bible", "Obadiah", 1), [
		"Bible/31 - Obadiah/Obad.md",
		"Bible/Obadiah/Obad 1.md",
	]);
	assert.deepEqual(chapterPaths("Bible", "Jude", 1), [
		"Bible/65 - Jude/Jude.md",
		"Bible/Jude/Jude 1.md",
	]);
});

test("an unrecognised book yields only the plain path, with no canon number", () => {
	assert.deepEqual(chapterPaths("Bible", "Sirach", 2), ["Bible/Sirach/Sirach 2.md"]);
});

test("normaliseBook resolves aliases and rejects everything else", () => {
	assert.equal(normaliseBook("ps"), "Psalms");
	assert.equal(normaliseBook("1 cor"), "1 Corinthians");
	assert.equal(normaliseBook("Song of Songs"), "Song of Solomon");
	assert.equal(normaliseBook("  MATT  "), "Matthew");
	assert.equal(normaliseBook("Sirach"), null);
});

test("normaliseBook does not return inherited Object.prototype members", () => {
	// A bare BOOK_MAP[key] lookup returned the Object constructor for these,
	// which then reached chapterPaths as a non-string book name.
	for (const key of ["constructor", "Constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
		assert.equal(normaliseBook(key), null, `normaliseBook(${JSON.stringify(key)}) leaked a prototype member`);
	}
});

test("every book name the parser can emit has a canon row", () => {
	// Round-trips the alias table through the parser rather than reading it
	// directly, so an alias pointing at a book with no row is caught.
	const emitted = new Set();
	for (const [name] of EXPECTED) {
		const refs = parseReferences(`${name} 1:1`);
		assert.equal(refs.length, 1, `parser did not recognise ${name}`);
		emitted.add(refs[0].book);
		assert.ok(BOOKS.has(refs[0].book), `${refs[0].book} has no canon row`);
	}
	assert.equal(emitted.size, 66);
});

test("parser ignores a prototype key that looks like a reference", () => {
	assert.deepEqual(parseReferences("Constructor 1:1 opens the book."), []);
});

test("parser handles book names joined by 'of'", () => {
	for (const raw of ["Song of Solomon 2:1", "Song of Songs 2:1"]) {
		const refs = parseReferences(raw);
		assert.equal(refs.length, 1, `did not recognise ${raw}`);
		assert.equal(refs[0].book, "Song of Solomon");
		assert.equal(refs[0].raw, raw);
	}
});

test("an 'of' phrase that is not a book is still ignored", () => {
	assert.deepEqual(parseReferences("The Word of God 1:1 is not a reference."), []);
});

test("a capitalised word before the book does not swallow the reference", () => {
	// The book pattern matches up to two capitalised words, so these all used to
	// resolve the pair ("See John") to nothing and drop the reference silently.
	for (const [text, book] of [
		["See John 3:16", "John"],
		["Consider Matthew 5:3", "Matthew"],
		["In Romans 8:28 Paul says", "Romans"],
		["Read Job 1:1", "Job"],
	]) {
		const refs = parseReferences(text);
		assert.equal(refs.length, 1, `did not recognise a reference in ${JSON.stringify(text)}`);
		assert.equal(refs[0].book, book);
	}
});

test("the highlighted span covers the reference, not the word before it", () => {
	const text = "See John 3:16 today";
	const [ref] = parseReferences(text);
	assert.equal(ref.raw, "John 3:16");
	assert.equal(text.slice(ref.index, ref.index + ref.length), "John 3:16");
});

test("ordinary references are unaffected by the 'of' allowance", () => {
	const refs = parseReferences("See John 3:16-18 and 1 Cor 13:4 and Matthew 5:3.");
	assert.deepEqual(
		refs.map((r) => [r.book, r.chapter, r.verseStart, r.verseEnd]),
		[
			["John", 3, 16, 18],
			["1 Corinthians", 13, 4, 4],
			["Matthew", 5, 3, 3],
		],
	);
});

test("cross-chapter ranges are detected with their end chapter and verse", () => {
	const refs = parseReferences("See John 3:16-4:2 and Gen 1:1-3:5 then Rom 8:28-30.");
	assert.deepEqual(
		refs.map((r) => [r.raw, r.book, r.chapter, r.verseStart, r.chapterEnd, r.verseEnd, r.crossChapter]),
		[
			["John 3:16-4:2", "John", 3, 16, 4, 2, true],
			["Gen 1:1-3:5", "Genesis", 1, 1, 3, 5, true],
			["Rom 8:28-30", "Romans", 8, 28, 8, 30, false],
		],
	);
});

test("same-chapter forms keep chapterEnd equal to chapter", () => {
	const [a, b] = parseReferences("John 3:16 and John 3:16-18");
	assert.deepEqual([a.chapterEnd, a.verseEnd, a.crossChapter], [3, 16, false]);
	assert.deepEqual([b.chapterEnd, b.verseEnd, b.crossChapter], [3, 18, false]);
});

test("a cross-chapter range does not swallow the text after it", () => {
	const text = "Read John 3:16-4:2, then John 3:16-4: nothing, and John 3:16-4 alone.";
	const refs = parseReferences(text);
	assert.deepEqual(
		refs.map((r) => text.slice(r.index, r.index + r.length)),
		["John 3:16-4:2", "John 3:16-4", "John 3:16-4"],
	);
});

/** Builds a minimal vault: path -> file content, enough for fetchVerses. */
function fakeApp(files) {
	return {
		vault: {
			getAbstractFileByPath: (p) => (p in files ? { isTFile: true, path: p } : null),
			read: async (f) => files[f.path],
		},
	};
}

function chapterFile(n, count) {
	let out = `# Chapter ${n}\n`;
	for (let v = 1; v <= count; v++) out += `\n###### ${v}\nc${n}v${v} text\n`;
	return out;
}

function ref(over) {
	return { raw: "x", book: "John", chapter: 3, verseStart: 1, chapterEnd: 3, verseEnd: 1, crossChapter: false, ...over };
}

const flat = (rows) => rows.map((r) => `${r.chapter}:${r.verse}=${r.text}`);

test("a two-chapter range reads to the end of the first chapter then from verse 1", async () => {
	const app = fakeApp({
		"B1/John/John 3.md": chapterFile(3, 4),
		"B1/John/John 4.md": chapterFile(4, 5),
	});
	const rows = await fetchVerses(app, "B1", ref({ verseStart: 3, chapterEnd: 4, verseEnd: 2, crossChapter: true }));
	assert.deepEqual(flat(rows), [
		"3:3=c3v3 text", "3:4=c3v4 text", "4:1=c4v1 text", "4:2=c4v2 text",
	]);
});

test("a range over three chapters includes the whole middle chapter", async () => {
	const app = fakeApp({
		"B2/Genesis/Gen 1.md": chapterFile(1, 3),
		"B2/Genesis/Gen 2.md": chapterFile(2, 2),
		"B2/Genesis/Gen 3.md": chapterFile(3, 4),
	});
	const rows = await fetchVerses(
		app,
		"B2",
		ref({ book: "Genesis", chapter: 1, verseStart: 2, chapterEnd: 3, verseEnd: 1, crossChapter: true }),
	);
	assert.deepEqual(rows.map((r) => `${r.chapter}:${r.verse}`), ["1:2", "1:3", "2:1", "2:2", "3:1"]);
});

test("cross-chapter ranges read the numbered vault layout", async () => {
	const app = fakeApp({
		"B3/43 - John/John-03.md": chapterFile(3, 2),
		"B3/43 - John/John-04.md": chapterFile(4, 2),
	});
	const rows = await fetchVerses(app, "B3", ref({ verseStart: 2, chapterEnd: 4, verseEnd: 1, crossChapter: true }));
	assert.deepEqual(rows.map((r) => `${r.chapter}:${r.verse}`), ["3:2", "4:1"]);
});

test("malformed spans fail with the passage-not-found message", async () => {
	const app = fakeApp({
		"B4/John/John 3.md": chapterFile(3, 4),
		"B4/John/John 4.md": chapterFile(4, 3),
	});
	const cases = {
		"end chapter before start": ref({ chapter: 4, chapterEnd: 3, verseEnd: 1, crossChapter: false }),
		"same chapter, end verse before start": ref({ verseStart: 5, verseEnd: 2 }),
		"end chapter missing from vault": ref({ chapterEnd: 5, verseEnd: 1, crossChapter: true }),
		"end verse past the last verse": ref({ chapterEnd: 4, verseEnd: 9, crossChapter: true }),
		"start verse missing": ref({ verseStart: 9, chapterEnd: 4, verseEnd: 1, crossChapter: true }),
	};
	for (const [name, r] of Object.entries(cases)) {
		await assert.rejects(fetchVerses(app, "B4", { ...r, raw: "John X" }), /^Error: Passage not found: John X$/, name);
	}
});

test("a missing middle chapter fails the whole range", async () => {
	const app = fakeApp({
		"B5/John/John 3.md": chapterFile(3, 2),
		"B5/John/John 5.md": chapterFile(5, 2),
	});
	await assert.rejects(
		fetchVerses(app, "B5", ref({ chapterEnd: 5, verseEnd: 1, crossChapter: true })),
		/Passage not found/,
	);
});

test("every chapter read is cached", async () => {
	const files = { "B6/John/John 3.md": chapterFile(3, 2), "B6/John/John 4.md": chapterFile(4, 2) };
	let reads = 0;
	const app = fakeApp(files);
	const read = app.vault.read;
	app.vault.read = async (f) => (reads++, read(f));
	const r = ref({ chapterEnd: 4, verseEnd: 1, crossChapter: true });
	await fetchVerses(app, "B6", r);
	await fetchVerses(app, "B6", r);
	assert.equal(reads, 2);
});
