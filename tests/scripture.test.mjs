// Regression tests for the canon table and scripture path building.
//
// Run with `npm test`, which bundles src/scripture.ts first (see
// esbuild.test.mjs). These assertions deliberately restate the expected canon
// independently of the table that produces it: a test that derived its
// expectations from CANON would agree with any typo CANON contained.
import { test } from "node:test";
import assert from "node:assert/strict";

import { TFile, net } from "./obsidian-stub.mjs";

import {
	BOOKS,
	bibleStatus,
	chapterPaths,
	downloadBible,
	fetchVerses,
	normaliseBook,
	parseBibleText,
	parseReferences,
	removeBible,
	setBibleFile,
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
		refs.map((r) => [r.raw, r.book, r.chapter, r.verseStart, r.chapterEnd, r.verseEnd]),
		[
			["John 3:16-4:2", "John", 3, 16, 4, 2],
			["Gen 1:1-3:5", "Genesis", 1, 1, 3, 5],
			["Rom 8:28-30", "Romans", 8, 28, 8, 30],
		],
	);
});

test("same-chapter forms keep chapterEnd equal to chapter", () => {
	const [a, b] = parseReferences("John 3:16 and John 3:16-18");
	assert.deepEqual([a.chapterEnd, a.verseEnd], [3, 16]);
	assert.deepEqual([b.chapterEnd, b.verseEnd], [3, 18]);
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
	const log = [];
	return {
		log,
		vault: {
			getAbstractFileByPath: (p) => (p in files ? Object.assign(Object.create(TFile.prototype), { path: p }) : null),
			read: async (f) => files[f.path],
			adapter: {
				read: async (p) => {
					if (!(p in files)) throw new Error("ENOENT");
					return files[p];
				},
				exists: async (p) => p in files,
				write: async (p, t) => (log.push(`write ${p}`), void (files[p] = t)),
				remove: async (p) => (log.push(`remove ${p}`), void delete files[p]),
				rename: async (a, b) => (log.push(`rename ${a} -> ${b}`), (files[b] = files[a]), void delete files[a]),
			},
		},
	};
}

function chapterFile(n, count) {
	let out = `# Chapter ${n}\n`;
	for (let v = 1; v <= count; v++) out += `\n###### ${v}\nc${n}v${v} text\n`;
	return out;
}

function ref(over) {
	return { raw: "x", book: "John", chapter: 3, verseStart: 1, chapterEnd: 3, verseEnd: 1, ...over };
}

const flat = (rows) => rows.map((r) => `${r.chapter}:${r.verse}=${r.text}`);

test("a two-chapter range reads to the end of the first chapter then from verse 1", async () => {
	const app = fakeApp({
		"B1/John/John 3.md": chapterFile(3, 4),
		"B1/John/John 4.md": chapterFile(4, 5),
	});
	const rows = await fetchVerses(app, "B1", ref({ verseStart: 3, chapterEnd: 4, verseEnd: 2 }));
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
		ref({ book: "Genesis", chapter: 1, verseStart: 2, chapterEnd: 3, verseEnd: 1 }),
	);
	assert.deepEqual(rows.map((r) => `${r.chapter}:${r.verse}`), ["1:2", "1:3", "2:1", "2:2", "3:1"]);
});

test("cross-chapter ranges read the numbered vault layout", async () => {
	const app = fakeApp({
		"B3/43 - John/John-03.md": chapterFile(3, 2),
		"B3/43 - John/John-04.md": chapterFile(4, 2),
	});
	const rows = await fetchVerses(app, "B3", ref({ verseStart: 2, chapterEnd: 4, verseEnd: 1 }));
	assert.deepEqual(rows.map((r) => `${r.chapter}:${r.verse}`), ["3:2", "4:1"]);
});

test("malformed spans fail with the passage-not-found message", async () => {
	const app = fakeApp({
		"B4/John/John 3.md": chapterFile(3, 4),
		"B4/John/John 4.md": chapterFile(4, 3),
	});
	const cases = {
		"end chapter before start": ref({ chapter: 4, chapterEnd: 3, verseEnd: 1 }),
		"same chapter, end verse before start": ref({ verseStart: 5, verseEnd: 2 }),
		"end chapter missing from vault": ref({ chapterEnd: 5, verseEnd: 1 }),
		"end verse past the last verse": ref({ chapterEnd: 4, verseEnd: 9 }),
		"start verse missing": ref({ verseStart: 9, chapterEnd: 4, verseEnd: 1 }),
		"end verse zero": ref({ verseStart: 2, chapterEnd: 4, verseEnd: 0 }),
		"start verse past end of chapter": ref({ verseStart: 5, chapterEnd: 4, verseEnd: 1 }),
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
		fetchVerses(app, "B5", ref({ chapterEnd: 5, verseEnd: 1 })),
		/Passage not found/,
	);
});

test("every chapter read is cached", async () => {
	const files = { "B6/John/John 3.md": chapterFile(3, 2), "B6/John/John 4.md": chapterFile(4, 2) };
	let reads = 0;
	const app = fakeApp(files);
	const read = app.vault.read;
	app.vault.read = async (f) => (reads++, read(f));
	const r = ref({ chapterEnd: 4, verseEnd: 1 });
	await fetchVerses(app, "B6", r);
	await fetchVerses(app, "B6", r);
	assert.equal(reads, 2);
});

// Offline Bible. Written by hand: 188 chapters of 27 verses plus 1001 of 26 is
// 5,076 + 26,026 = 31,102 verses in 1,189 chapters. The parser checks totals,
// not per-book shape, so one book can carry them all.
const HEADER = [
	"The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub, Discovery Bible, unfoldingWord, Bible Aquifer, OpenBible.com, and the Berean Bible Translation Committee. \t",
	"This text of God's Word has been dedicated to the public domain. Free resources and databases are available at BereanBible.com.\t",
	"Verse\tBerean Standard Bible",
];

function bibleLines({ john = false } = {}) {
	const lines = [];
	for (let c = 1; c <= 1189; c++) {
		for (let v = 1; v <= (c <= 188 ? 27 : 26); v++) {
			const book = john && c <= 2 ? "John" : "Genesis";
			const ch = john && c <= 2 ? c + 2 : c;
			lines.push(`${book} ${ch}:${v}\t${book === "John" ? "b" : "g"}${ch}v${v}`);
		}
	}
	return lines;
}

const bibleText = (opts, edit = (l) => l) =>
	"\ufeff" + [...HEADER, ...edit(bibleLines(opts))].join("\r\n") + "\r\n";

test("parseBibleText accepts a whole BSB with BOM, CRLF and header lines", () => {
	const chapters = parseBibleText(bibleText());
	assert.equal(chapters.size, 1189);
	assert.equal(chapters.get("Genesis 1").get(1), "g1v1");
	assert.equal(chapters.get("Genesis 1189").get(26), "g1189v26");
});

test("parseBibleText rejects anything cut, padded or foreign", () => {
	const full = bibleText();
	const bad = {
		"cut mid-line": full.slice(0, -8),
		"last line removed": bibleText({}, (l) => l.slice(0, -1)),
		"unknown book": bibleText({}, (l) => l.map((x) => x.replace(/^Genesis 1189:/, "Sirach 1189:"))),
		"duplicate plus a gap": bibleText({}, (l) => ((l[10] = l[9]), l)),
	};
	for (const [name, text] of Object.entries(bad)) assert.equal(parseBibleText(text), null, name);
});

test("parseBibleText refuses markup in verse text and accepts typography", () => {
	const withVerse = (t) => bibleText({}, (l) => ((l[0] = `Genesis 1:1\t${t}`), l));
	assert.equal(parseBibleText(withVerse("see ![x](https://e.x/a.png)")), null);
	assert.equal(parseBibleText(withVerse("go to www.example.com")), null);
	for (const t of ["- x", "---", "1. x", "3) x", "  2. x"]) assert.equal(parseBibleText(withVerse(t)), null, t);
	assert.notEqual(parseBibleText(withVerse("\u201cHe said\u201d \u2014 and then\u2026")), null);
});

test("the vault folder wins when it holds the chapter", async () => {
	setBibleFile("dl3/bsb.txt");
	const app = fakeApp({ "B7/John/John 3.md": chapterFile(3, 3), "dl3/bsb.txt": bibleText({ john: true }) });
	const rows = await fetchVerses(app, "B7", ref({ verseStart: 2, verseEnd: 3 }));
	assert.deepEqual(flat(rows), ["3:2=c3v2 text", "3:3=c3v3 text"]);
});

test("the download serves a book the vault lacks", async () => {
	setBibleFile("dl4/bsb.txt");
	const app = fakeApp({ "dl4/bsb.txt": bibleText({ john: true }) });
	const rows = await fetchVerses(app, "B8", ref({ verseStart: 1, verseEnd: 2 }));
	assert.deepEqual(flat(rows), ["3:1=b3v1", "3:2=b3v2"]);
});

test("a passage the vault can only half serve comes wholly from the download", async () => {
	setBibleFile("dl5/bsb.txt");
	const app = fakeApp({ "B9/John/John 3.md": chapterFile(3, 3), "dl5/bsb.txt": bibleText({ john: true }) });
	const rows = await fetchVerses(app, "B9", ref({ verseStart: 2, chapterEnd: 4, verseEnd: 1 }));
	assert.equal(rows.length, 27, "3:2 to 3:27, then 4:1");
	assert.deepEqual(flat(rows).slice(0, 2), ["3:2=b3v2", "3:3=b3v3"]);
	assert.ok(flat(rows).every((r) => /=b\d/.test(r)), "no vault rows mixed in");
	assert.equal(flat(rows).at(-1), "4:1=b4v1");
});

test("a damaged download plus a vault miss is not found", async () => {
	setBibleFile("dl6/bsb.txt");
	const app = fakeApp({ "dl6/bsb.txt": bibleText({ john: true }).slice(0, -8) });
	await assert.rejects(fetchVerses(app, "B10", { ...ref(), raw: "John 3:1" }), /^Error: Passage not found: John 3:1$/);
});

test("bibleStatus reports absent, ready and damaged", async () => {
	setBibleFile("dl7/bsb.txt");
	assert.equal(await bibleStatus(fakeApp({ "dl7/bsb.txt.part": bibleText() })), "absent");
	setBibleFile("dl7/bsb.txt");
	assert.equal(await bibleStatus(fakeApp({ "dl7/bsb.txt": bibleText() })), "ready");
	setBibleFile("dl7/bsb.txt");
	assert.equal(await bibleStatus(fakeApp({ "dl7/bsb.txt": bibleText().slice(0, -8) })), "damaged");
});

test("downloadBible refuses bad downloads and writes nothing", async () => {
	const attempts = {
		"cut short": async () => ({ text: bibleText().slice(0, 100_000) }),
		"plain text but not the Bible": async () => ({ text: "x".repeat(4_331_393) }),
		"markup in a verse": async () => ({ text: bibleText({}, (l) => ((l[3] = "Genesis 1:4\t<b>x</b>"), l)) }),
		"network drop": async () => {
			throw new Error("net down");
		},
	};
	const real = net.requestUrl;
	try {
		for (const [name, respond] of Object.entries(attempts)) {
			setBibleFile("dl8/bsb.txt");
			const app = fakeApp({ "dl8/bsb.txt": "old" });
			net.requestUrl = respond;
			await assert.rejects(downloadBible(app), undefined, name);
			assert.deepEqual(app.log, [], name);
		}
	} finally {
		net.requestUrl = real;
	}
});

test("downloadBible writes the part file, removes the old one, then renames", async () => {
	setBibleFile("dl9/bsb.txt");
	const files = { "dl9/bsb.txt": "old" };
	const app = fakeApp(files);
	await assert.rejects(fetchVerses(app, "B11", { ...ref(), raw: "John 3:1" }), /Passage not found/);
	const real = net.requestUrl;
	net.requestUrl = async () => ({ text: bibleText({ john: true }) });
	try {
		await downloadBible(app);
	} finally {
		net.requestUrl = real;
	}
	assert.deepEqual(app.log, ["write dl9/bsb.txt.part", "remove dl9/bsb.txt", "rename dl9/bsb.txt.part -> dl9/bsb.txt"]);
	assert.equal(await bibleStatus(app), "ready");
	assert.deepEqual(flat(await fetchVerses(app, "B11", ref({ verseStart: 1, verseEnd: 1 }))), ["3:1=b3v1"]);
});

test("removeBible deletes the file and any part file", async () => {
	setBibleFile("dl10/bsb.txt");
	const app = fakeApp({ "dl10/bsb.txt": bibleText({ john: true }), "dl10/bsb.txt.part": "half" });
	assert.equal((await fetchVerses(app, "B12", ref({ verseStart: 1, verseEnd: 1 }))).length, 1);
	await removeBible(app);
	await assert.rejects(fetchVerses(app, "B12", { ...ref(), raw: "John 3:1" }), /Passage not found/);
	assert.deepEqual(app.log, ["remove dl10/bsb.txt", "remove dl10/bsb.txt.part"]);
	assert.equal(await bibleStatus(app), "absent");
});

test("a failed read isn't remembered: the file appearing later is picked up", async () => {
	setBibleFile("dl11/bsb.txt");
	const files = {};
	const app = fakeApp(files);
	await assert.rejects(fetchVerses(app, "B13", { ...ref(), raw: "John 3:1" }), /Passage not found/);
	files["dl11/bsb.txt"] = bibleText({ john: true });
	assert.equal(await bibleStatus(app), "ready");
	assert.deepEqual(flat(await fetchVerses(app, "B13", ref({ verseStart: 1, verseEnd: 1 }))), ["3:1=b3v1"]);
});

test("a leftover part file is ignored by lookups", async () => {
	setBibleFile("dl12/bsb.txt");
	const app = fakeApp({ "dl12/bsb.txt.part": bibleText({ john: true }) });
	await assert.rejects(fetchVerses(app, "B14", { ...ref(), raw: "John 3:1" }), /Passage not found/);
});
