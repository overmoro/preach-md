// Scripture reference detection and inline expansion for Preach MD.
// Detects Bible references in rendered sermon text and expands them inline
// from vault Bible chapter files or the downloaded BSB. Expansion is in-memory only.
//
// Reference parsing approach ported from obsidian-bible-linker by Jakub Kuchejda.
// See: https://github.com/kuchejak/obsidian-bible-linker
// Used under MIT licence.

import { App, Component, MarkdownRenderer, TFile, requestUrl } from "obsidian";

// ---------------------------------------------------------------------------
// Book name normalisation
// ---------------------------------------------------------------------------

/**
 * Maps every recognised book name / abbreviation (lower-cased) to the
 * canonical folder name used in the CSB vault.
 *
 * Values are BookName, not string, so every alias must resolve to a book that
 * actually has a CANON row. Without that tie, an alias could normalise to a
 * name CANON does not carry, and every reference to that book would silently
 * stop resolving on both vault conventions.
 */
const BOOK_MAP: Record<string, BookName> = {
	// Genesis
	genesis: "Genesis", gen: "Genesis", ge: "Genesis", gn: "Genesis",
	// Exodus
	exodus: "Exodus", exod: "Exodus", ex: "Exodus", exo: "Exodus",
	// Leviticus
	leviticus: "Leviticus", lev: "Leviticus", le: "Leviticus", lv: "Leviticus",
	// Numbers
	numbers: "Numbers", num: "Numbers", nu: "Numbers", nm: "Numbers", nb: "Numbers",
	// Deuteronomy
	deuteronomy: "Deuteronomy", deut: "Deuteronomy", dt: "Deuteronomy", deu: "Deuteronomy",
	// Joshua
	joshua: "Joshua", josh: "Joshua", jos: "Joshua", jsh: "Joshua",
	// Judges
	judges: "Judges", judg: "Judges", jdg: "Judges", jg: "Judges", jdgs: "Judges",
	// Ruth
	ruth: "Ruth", rut: "Ruth", ru: "Ruth",
	// 1 Samuel
	"1 samuel": "1 Samuel", "1samuel": "1 Samuel", "1sam": "1 Samuel", "1sa": "1 Samuel", "1s": "1 Samuel", "i samuel": "1 Samuel", "i sam": "1 Samuel",
	// 2 Samuel
	"2 samuel": "2 Samuel", "2samuel": "2 Samuel", "2sam": "2 Samuel", "2sa": "2 Samuel", "ii samuel": "2 Samuel", "ii sam": "2 Samuel",
	// 1 Kings
	"1 kings": "1 Kings", "1kings": "1 Kings", "1kgs": "1 Kings", "1ki": "1 Kings", "1kg": "1 Kings", "i kings": "1 Kings",
	// 2 Kings
	"2 kings": "2 Kings", "2kings": "2 Kings", "2kgs": "2 Kings", "2ki": "2 Kings", "ii kings": "2 Kings",
	// 1 Chronicles
	"1 chronicles": "1 Chronicles", "1chronicles": "1 Chronicles", "1chr": "1 Chronicles", "1ch": "1 Chronicles", "i chronicles": "1 Chronicles",
	// 2 Chronicles
	"2 chronicles": "2 Chronicles", "2chronicles": "2 Chronicles", "2chr": "2 Chronicles", "2ch": "2 Chronicles", "ii chronicles": "2 Chronicles",
	// Ezra
	ezra: "Ezra", ezr: "Ezra",
	// Nehemiah
	nehemiah: "Nehemiah", neh: "Nehemiah", ne: "Nehemiah",
	// Esther
	esther: "Esther", est: "Esther", esth: "Esther",
	// Job
	job: "Job", jb: "Job",
	// Psalms
	psalms: "Psalms", psalm: "Psalms", ps: "Psalms", psa: "Psalms", psm: "Psalms", pss: "Psalms",
	// Proverbs
	proverbs: "Proverbs", prov: "Proverbs", pr: "Proverbs", prv: "Proverbs",
	// Ecclesiastes
	ecclesiastes: "Ecclesiastes", eccl: "Ecclesiastes", ecc: "Ecclesiastes", ec: "Ecclesiastes", qoh: "Ecclesiastes",
	// Song of Solomon
	"song of solomon": "Song of Solomon", "song of songs": "Song of Solomon", "song": "Song of Solomon", sos: "Song of Solomon", ss: "Song of Solomon", cant: "Song of Solomon",
	// Isaiah
	isaiah: "Isaiah", isa: "Isaiah", is: "Isaiah",
	// Jeremiah
	jeremiah: "Jeremiah", jer: "Jeremiah", je: "Jeremiah", jr: "Jeremiah",
	// Lamentations
	lamentations: "Lamentations", lam: "Lamentations", la: "Lamentations",
	// Ezekiel
	ezekiel: "Ezekiel", ezek: "Ezekiel", eze: "Ezekiel", ezk: "Ezekiel",
	// Daniel
	daniel: "Daniel", dan: "Daniel", da: "Daniel", dn: "Daniel",
	// Hosea
	hosea: "Hosea", hos: "Hosea", ho: "Hosea",
	// Joel
	joel: "Joel", joe: "Joel", jl: "Joel",
	// Amos
	amos: "Amos", am: "Amos",
	// Obadiah
	obadiah: "Obadiah", obad: "Obadiah", ob: "Obadiah",
	// Jonah
	jonah: "Jonah", jon: "Jonah", jnh: "Jonah",
	// Micah
	micah: "Micah", mic: "Micah", mi: "Micah",
	// Nahum
	nahum: "Nahum", nah: "Nahum", na: "Nahum",
	// Habakkuk
	habakkuk: "Habakkuk", hab: "Habakkuk",
	// Zephaniah
	zephaniah: "Zephaniah", zeph: "Zephaniah", zep: "Zephaniah", zp: "Zephaniah",
	// Haggai
	haggai: "Haggai", hag: "Haggai", hg: "Haggai",
	// Zechariah
	zechariah: "Zechariah", zech: "Zechariah", zec: "Zechariah", zc: "Zechariah",
	// Malachi
	malachi: "Malachi", mal: "Malachi", ml: "Malachi",
	// Matthew
	matthew: "Matthew", matt: "Matthew", mat: "Matthew", mt: "Matthew",
	// Mark
	mark: "Mark", mrk: "Mark", mar: "Mark", mk: "Mark", mr: "Mark",
	// Luke
	luke: "Luke", luk: "Luke", lk: "Luke",
	// John
	john: "John", joh: "John", jn: "John", jhn: "John",
	// Acts
	acts: "Acts", act: "Acts", ac: "Acts",
	// Romans
	romans: "Romans", rom: "Romans", ro: "Romans", rm: "Romans",
	// 1 Corinthians
	"1 corinthians": "1 Corinthians", "1corinthians": "1 Corinthians", "1cor": "1 Corinthians", "1co": "1 Corinthians", "i corinthians": "1 Corinthians", "i cor": "1 Corinthians", "1 cor": "1 Corinthians",
	// 2 Corinthians
	"2 corinthians": "2 Corinthians", "2corinthians": "2 Corinthians", "2cor": "2 Corinthians", "2co": "2 Corinthians", "ii corinthians": "2 Corinthians", "ii cor": "2 Corinthians", "2 cor": "2 Corinthians",
	// Galatians
	galatians: "Galatians", gal: "Galatians", ga: "Galatians",
	// Ephesians
	ephesians: "Ephesians", eph: "Ephesians",
	// Philippians
	philippians: "Philippians", phil: "Philippians", php: "Philippians", pp: "Philippians",
	// Colossians
	colossians: "Colossians", col: "Colossians",
	// 1 Thessalonians
	"1 thessalonians": "1 Thessalonians", "1thessalonians": "1 Thessalonians", "1thess": "1 Thessalonians", "1th": "1 Thessalonians", "i thessalonians": "1 Thessalonians", "1 thess": "1 Thessalonians",
	// 2 Thessalonians
	"2 thessalonians": "2 Thessalonians", "2thessalonians": "2 Thessalonians", "2thess": "2 Thessalonians", "2th": "2 Thessalonians", "ii thessalonians": "2 Thessalonians", "2 thess": "2 Thessalonians",
	// 1 Timothy
	"1 timothy": "1 Timothy", "1timothy": "1 Timothy", "1tim": "1 Timothy", "1ti": "1 Timothy", "i timothy": "1 Timothy", "1 tim": "1 Timothy",
	// 2 Timothy
	"2 timothy": "2 Timothy", "2timothy": "2 Timothy", "2tim": "2 Timothy", "2ti": "2 Timothy", "ii timothy": "2 Timothy", "2 tim": "2 Timothy",
	// Titus
	titus: "Titus", tit: "Titus", ti: "Titus",
	// Philemon
	philemon: "Philemon", phlm: "Philemon", phm: "Philemon",
	// Hebrews
	hebrews: "Hebrews", heb: "Hebrews",
	// James
	james: "James", jas: "James", jm: "James",
	// 1 Peter
	"1 peter": "1 Peter", "1peter": "1 Peter", "1pet": "1 Peter", "1pe": "1 Peter", "1pt": "1 Peter", "i peter": "1 Peter", "1 pet": "1 Peter",
	// 2 Peter
	"2 peter": "2 Peter", "2peter": "2 Peter", "2pet": "2 Peter", "2pe": "2 Peter", "2pt": "2 Peter", "ii peter": "2 Peter", "2 pet": "2 Peter",
	// 1 John
	"1 john": "1 John", "1john": "1 John", "1joh": "1 John", "1jn": "1 John", "1jo": "1 John", "i john": "1 John",
	// 2 John
	"2 john": "2 John", "2john": "2 John", "2joh": "2 John", "2jn": "2 John", "ii john": "2 John",
	// 3 John
	"3 john": "3 John", "3john": "3 John", "3joh": "3 John", "3jn": "3 John", "iii john": "3 John",
	// Jude
	jude: "Jude", jud: "Jude",
	// Revelation
	revelation: "Revelation", rev: "Revelation", re: "Revelation", rv: "Revelation",
};

/**
 * Return the canonical book name, or null if not recognised.
 *
 * The own-property check matters: BOOK_MAP is a plain object, so a bare lookup
 * also finds Object.prototype members. "Constructor 1:1" in a sermon would
 * otherwise normalise to the Object constructor function rather than to null,
 * and be rendered as a tappable reference whose book is not a string at all.
 * Lowercasing means `constructor` and `__proto__` are the only keys that can
 * collide, but the guard covers the class rather than those two names.
 */
export function normaliseBook(raw: string): BookName | null {
	let key = raw.trim().toLowerCase().replace(/\s+/g, " ");
	// Numbered abbreviations are keyed unspaced ("1jn"), so "1 Jn" retries without the space.
	if (!Object.prototype.hasOwnProperty.call(BOOK_MAP, key)) key = key.replace(/^([123]) /, "$1");
	if (!Object.prototype.hasOwnProperty.call(BOOK_MAP, key)) return null;
	return BOOK_MAP[key] ?? null;
}

// ---------------------------------------------------------------------------
// Reference parser
// ---------------------------------------------------------------------------

export interface ScriptureRef {
	/** Original text as it appears in the document, e.g. "John 3:16-18". */
	raw: string;
	/** Canonical book name, e.g. "John". */
	book: string;
	/** Chapter number. */
	chapter: number;
	/** Start verse. */
	verseStart: number;
	/** End chapter (same as chapter unless the range crosses chapters). */
	chapterEnd: number;
	/** End verse (same as start for single verse), in chapterEnd. Infinity means "to the end of chapterEnd" (a whole-chapter passage from frontmatter). */
	verseEnd: number;
}

/**
 * Regex for scripture references.
 * Captures:
 *   group 1: book name (possibly "1 Cor", "Matthew", etc.)
 *   group 2: (optional) the dot of an abbreviation, "Rom."
 *   group 3: chapter
 *   group 4: start verse
 *   group 5: (optional) end verse after a dash, or end chapter if group 6 follows
 *   group 6: (optional) end verse of a cross-chapter range, "John 3:16-4:2"
 *
 * Handles:
 *   - Numbered books: "1 Cor", "1Cor", "2 John"
 *   - Full names: "Matthew", "John", "Romans"
 *   - Names joined by "of": "Song of Solomon", "Song of Songs"
 *   - Verse ranges: "John 3:16-18", "Rom 8:28–30" (hyphen or en dash)
 *   - Cross-chapter ranges: "John 3:16-4:2", "Gen 1:1-3:5"
 *   - Dotted abbreviations: "Rom. 8:28", "1 Cor. 12:8"
 *   - List continuations that inherit the book: "Deut 30:6; 10:16" (see CONTINUATION_REGEX)
 *   - No verse (chapter only): not supported for now
 *
 * The optional "of" matters: without it the book name could only be one or two
 * capitalised words, so "Song of Solomon 1:1" captured "Solomon 1:1", which
 * normalises to nothing and was silently skipped. The alias table has always
 * carried both "song of solomon" and "song of songs", so those aliases were
 * unreachable from real sermon text.
 */
const SCRIPTURE_REGEX =
	/\b((?:[123]\s?)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)?)(\.)?\s+(\d+):(\d+)(?:[-–](\d+)(?::(\d+))?)?/g;

/** "; 10:16" or ", 10:30-33" straight after a reference. Sticky: it only matches at lastIndex. */
const CONTINUATION_REGEX =
	/[;,]\s?(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3})(?::(\d{1,3}))?)?\b(?!\s?[ap]\.?m\b)/iy;

/** "v.11", "vv. 14-15", "v11". Lowercase only; see the spec for what each guard rejects. */
const VERSE_ONLY_REGEX = /\bvv?(?:\.\s?|\s)?(\d{1,3})(?:[-–](\d{1,3}))?\b(?![:.]\d)/g;

/** Frontmatter only: "Amos 4", "Matthew 5–7". */
const CHAPTER_ONLY_REGEX = /^(.+?)\s+(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?$/;

/** Book tokens that are also English words or a title, so "Is. 5" and "Mr. 5" are not references. */
const DOTTED_EXCLUDED = ["is", "am", "mr"];

/**
 * Which chapter a bare verse number means, given the note's passage, or null
 * when it can't be told. Single chapter: that chapter. Two chapters: at or
 * after the first verse means the first, at or before the last verse means the
 * second, and neither or both is ambiguous. Three or more: ambiguous.
 */
function verseChapter(p: ScriptureRef, n: number): number | null {
	if (p.chapterEnd === p.chapter) return p.chapter;
	if (p.chapterEnd !== p.chapter + 1) return null;
	const inFirst = n >= p.verseStart;
	const inLast = n <= p.verseEnd;
	if (inFirst === inLast) return null;
	return inFirst ? p.chapter : p.chapterEnd;
}

type ParsedRef = ScriptureRef & { index: number; length: number };

/**
 * Detect references in text. With exactly one passage (the note's), also
 * detects verse-only references ("v.11") resolved against it. Results are in
 * ascending index order and never overlap.
 */
export function parseReferences(text: string, passages: ScriptureRef[] = []): ParsedRef[] {
	const results: ParsedRef[] = [];
	SCRIPTURE_REGEX.lastIndex = 0;
	let m: RegExpExecArray | null;

	while ((m = SCRIPTURE_REGEX.exec(text)) !== null) {
		const rawBook = m[1];

		// The book pattern can absorb a capitalised word that precedes the real
		// name, so "See John 3:16" captures "See John" and "In Romans 8:28"
		// captures "In Romans". Resolving only the whole capture silently dropped
		// every reference that began a sentence. Try the longest name first, then
		// progressively shorter suffixes, so "Song of Solomon" still wins over
		// "Solomon" and "1 Cor" over "Cor".
		const words = rawBook.split(" ");
		let book: BookName | null = null;
		let offset = 0;
		for (let w = 0; w < words.length; w++) {
			const candidate = words.slice(w).join(" ");
			const resolved = normaliseBook(candidate);
			if (resolved !== null) {
				// Dropping the number must never turn "2 Jo" into John.
				if (w === 1 && /^[123]$/.test(words[0]) && NUMBERED_STEMS.has(resolved)) break;
				book = resolved;
				offset = rawBook.length - candidate.length;
				break;
			}
		}
		if (book === null) continue;
		if (m[2] && DOTTED_EXCLUDED.includes(words[words.length - 1].toLowerCase())) continue;

		const chapter = parseInt(m[3], 10);
		const verseStart = parseInt(m[4], 10);
		const chapterEnd = m[6] ? parseInt(m[5], 10) : chapter;
		const verseEnd = m[6] ? parseInt(m[6], 10) : m[5] ? parseInt(m[5], 10) : verseStart;

		// Trim any absorbed prefix off the match, so the highlighted span covers
		// the reference itself and not the word before it.
		results.push({
			raw: m[0].slice(offset),
			book,
			chapter,
			verseStart,
			chapterEnd,
			verseEnd,
			index: m.index + offset,
			length: m[0].length - offset,
		});

		// List continuations ("; 10:16") inherit the book. Chain until one fails.
		let pos = m.index + m[0].length;
		for (;;) {
			CONTINUATION_REGEX.lastIndex = pos;
			const c = CONTINUATION_REGEX.exec(text);
			if (c === null) break;
			const raw = c[0].slice(c[0].search(/\d/));
			const cChapter = parseInt(c[1], 10);
			const cStart = parseInt(c[2], 10);
			results.push({
				raw,
				book,
				chapter: cChapter,
				verseStart: cStart,
				chapterEnd: c[4] ? parseInt(c[3], 10) : cChapter,
				verseEnd: c[4] ? parseInt(c[4], 10) : c[3] ? parseInt(c[3], 10) : cStart,
				index: pos + c[0].length - raw.length,
				length: raw.length,
			});
			pos += c[0].length;
		}
		SCRIPTURE_REGEX.lastIndex = pos;
	}

	if (passages.length === 1) {
		const passage = passages[0];
		VERSE_ONLY_REGEX.lastIndex = 0;
		while ((m = VERSE_ONLY_REGEX.exec(text)) !== null) {
			const verseStart = parseInt(m[1], 10);
			const chapter = verseChapter(passage, verseStart);
			if (chapter === null) continue;
			// "Corinthians v.15" or "Jude v.3": the verse belongs to that book, not the passage.
			const before = /((?:[123]\s?)?[A-Z][a-z]+)\.?\s*$/.exec(text.slice(0, m.index));
			if (before && (normaliseBook(before[1]) ?? normaliseBook(`1 ${before[1]}`))) continue;
			const start = m.index;
			const end = start + m[0].length;
			if (results.some((r) => r.index < end && start < r.index + r.length)) continue;
			results.push({
				raw: m[0],
				book: passage.book,
				chapter,
				verseStart,
				chapterEnd: chapter,
				verseEnd: m[2] ? parseInt(m[2], 10) : verseStart,
				index: m.index,
				length: m[0].length,
			});
		}
		results.sort((a, b) => a.index - b.index);
	}

	return results;
}

/**
 * The passage(s) a note names in its `passage` frontmatter key: a string or a
 * list of strings, each optionally a wikilink (its display text is used).
 * Whole chapters ("Amos 4", "Matthew 5–7") come back with verseEnd Infinity.
 */
export function notePassages(frontmatter: unknown): ScriptureRef[] {
	if (typeof frontmatter !== "object" || frontmatter === null) return [];
	const value = (frontmatter as Record<string, unknown>)["passage"];
	const entries: unknown[] = Array.isArray(value) ? value : [value];
	const refs: ScriptureRef[] = [];
	for (const entry of entries) {
		if (typeof entry !== "string") continue;
		const text = (entry.replace(/^\s*\[\[|\]\]\s*$/g, "").split("|").pop() ?? "").trim();
		const found = parseReferences(text);
		if (found.length > 0) {
			refs.push(...found);
			continue;
		}
		const m = CHAPTER_ONLY_REGEX.exec(text);
		const book = m ? normaliseBook(m[1]) : null;
		if (m === null || book === null) continue;
		const chapter = parseInt(m[2], 10);
		refs.push({ raw: text, book, chapter, verseStart: 1, chapterEnd: m[3] ? parseInt(m[3], 10) : chapter, verseEnd: Infinity });
	}
	return refs;
}

// ---------------------------------------------------------------------------
// Verse cache and extractor
// ---------------------------------------------------------------------------

/**
 * In-memory cache: canonical chapter path -> verse number -> verse text.
 * Lives for the session only.
 */
const verseCache = new Map<string, Map<number, string>>();

/** Marks a book that has only one chapter. See CANON. */
const SINGLE_CHAPTER = true;

/**
 * Every book of the Protestant canon, in canonical order, paired with the
 * filename prefix used inside its vault folder.
 *
 * Order is load-bearing. A book's canon number, used for numbered vault
 * folders like "40 - Matthew", is derived from its position in this list, so a
 * book cannot carry a filename prefix without also carrying a canon number,
 * and the two cannot drift apart. Reorder rows only if the canon itself
 * changes.
 *
 * The optional third field marks single-chapter books, whose filename in a
 * numbered vault is "{prefix}.md" rather than "{prefix}-01.md".
 */
const CANON = [
	["Genesis", "Gen"],
	["Exodus", "Exod"],
	["Leviticus", "Lev"],
	["Numbers", "Num"],
	["Deuteronomy", "Deut"],
	["Joshua", "Josh"],
	["Judges", "Judg"],
	["Ruth", "Ruth"],
	["1 Samuel", "1 Sam"],
	["2 Samuel", "2 Sam"],
	["1 Kings", "1 Kgs"],
	["2 Kings", "2 Kgs"],
	["1 Chronicles", "1 Chr"],
	["2 Chronicles", "2 Chr"],
	["Ezra", "Ezr"],
	["Nehemiah", "Neh"],
	["Esther", "Esth"],
	["Job", "Job"],
	["Psalms", "Ps"],
	["Proverbs", "Prov"],
	["Ecclesiastes", "Eccl"],
	["Song of Solomon", "Song"],
	["Isaiah", "Isa"],
	["Jeremiah", "Jer"],
	["Lamentations", "Lam"],
	["Ezekiel", "Ezek"],
	["Daniel", "Dan"],
	["Hosea", "Hos"],
	["Joel", "Joel"],
	["Amos", "Amos"],
	["Obadiah", "Obad", SINGLE_CHAPTER],
	["Jonah", "Jonah"],
	["Micah", "Mic"],
	["Nahum", "Nah"],
	["Habakkuk", "Hab"],
	["Zephaniah", "Zeph"],
	["Haggai", "Hag"],
	["Zechariah", "Zech"],
	["Malachi", "Mal"],
	["Matthew", "Matt"],
	["Mark", "Mark"],
	["Luke", "Luke"],
	["John", "John"],
	["Acts", "Acts"],
	["Romans", "Rom"],
	["1 Corinthians", "1 Cor"],
	["2 Corinthians", "2 Cor"],
	["Galatians", "Gal"],
	["Ephesians", "Eph"],
	["Philippians", "Phil"],
	["Colossians", "Col"],
	["1 Thessalonians", "1 Thess"],
	["2 Thessalonians", "2 Thess"],
	["1 Timothy", "1 Tim"],
	["2 Timothy", "2 Tim"],
	["Titus", "Titus"],
	["Philemon", "Phlm", SINGLE_CHAPTER],
	["Hebrews", "Heb"],
	["James", "Jas"],
	["1 Peter", "1 Pet"],
	["2 Peter", "2 Pet"],
	["1 John", "1 John"],
	["2 John", "2 John", SINGLE_CHAPTER],
	["3 John", "3 John", SINGLE_CHAPTER],
	["Jude", "Jude", SINGLE_CHAPTER],
	["Revelation", "Rev"],
] as const;

/**
 * A canonical book name, derived from CANON so the two cannot drift apart.
 * BOOK_MAP is typed to emit these, so renaming a CANON row without updating
 * every alias that resolves to it is a compile error.
 */
type BookName = (typeof CANON)[number][0];

/**
 * A well-formed canon row: [name, prefix], or [name, prefix, SINGLE_CHAPTER].
 *
 * The third field is typed as SINGLE_CHAPTER itself rather than as a boolean,
 * because the field is typed as the literal `true` rather than as a boolean, so
 * a stray `false` written to document "multi-chapter" is a compile error rather
 * than a value that quietly means something else.
 */
type BookRow = readonly [string, string, (typeof SINGLE_CHAPTER)?];

// ---------------------------------------------------------------------------
// Compile-time guards on CANON
//
// These are types, so they emit no runtime code. They are written inline inside
// CanonChecked rather than as named aliases so that nothing here is an unused
// symbol: a standalone `type _CanonAt0 = ...` is never referenced, which is a
// lint warning in the plugin review scan even though it is doing real work.
//
// Assert rejects anything but `true`, so a broken invariant reports at its own
// line and names the position that moved. Note a guard resolving to `never`
// would pass silently, since `never` satisfies every constraint, which is why
// IsExactly yields `false` rather than `never` on a mismatch.
// ---------------------------------------------------------------------------

type Assert<T extends true> = T;
type IsExactly<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
	? true
	: false;

/**
 * T, but only once CANON satisfies every invariant below.
 *
 * The row count pins the canon at 66 books, so losing or duplicating a row
 * fails the build instead of silently shifting every number after it. The
 * sentinels pin roughly every eighth position, since canon numbers derive from
 * row order, so a wholesale reordering, an alphabetised list, or an inserted
 * row fails rather than quietly renumbering books.
 *
 * What the sentinels do NOT catch, stated precisely: any permutation of CANON
 * that leaves every anchored position intact, however far apart the swapped
 * rows are. Closing that completely would mean anchoring all 66 positions,
 * which is the second table this design exists to remove. Runtime coverage for
 * it belongs in the test harness instead (see issue #4).
 */
type CanonChecked<T> = [
	Assert<IsExactly<(typeof CANON)["length"], 66>>,
	Assert<IsExactly<(typeof CANON)[0][0], "Genesis">>,
	Assert<IsExactly<(typeof CANON)[8][0], "1 Samuel">>,
	Assert<IsExactly<(typeof CANON)[16][0], "Esther">>,
	Assert<IsExactly<(typeof CANON)[24][0], "Lamentations">>,
	Assert<IsExactly<(typeof CANON)[32][0], "Micah">>,
	// Both sides of the OT/NT boundary.
	Assert<IsExactly<(typeof CANON)[38][0], "Malachi">>,
	Assert<IsExactly<(typeof CANON)[39][0], "Matthew">>,
	Assert<IsExactly<(typeof CANON)[47][0], "Galatians">>,
	Assert<IsExactly<(typeof CANON)[55][0], "Titus">>,
	Assert<IsExactly<(typeof CANON)[65][0], "Revelation">>,
] extends readonly true[]
	? T
	: never;

/**
 * CANON widened to the row contract, and gated on the invariants above.
 *
 * The assignment is itself the shape check: a malformed row fails to compile
 * here. Iterating this view rather than CANON directly also makes `row[2]`
 * legal whatever a given row's arity, which lets the derivation below read the
 * flag's value instead of the row's length. Reading length would silently mark
 * every book single-chapter the moment a fourth field is added to a row.
 */
const CANON_ROWS: CanonChecked<readonly BookRow[]> = CANON;

/** Everything the path builder needs to know about one book. */
interface BookMeta {
	/** Filename prefix inside the book folder, e.g. "Matt" for Matthew. */
	prefix: string;
	/** Zero-padded canon order number, e.g. "40", for "40 - Matthew" folders. */
	num: string;
	/** True when the book has a single chapter. */
	singleChapter: boolean;
}

/**
 * Canonical book name to its metadata, derived from CANON.
 *
 * A Map rather than a plain object so that a miss types as `undefined`, which
 * makes the guard in chapterPaths() compiler-enforced instead of merely
 * correct. (`tsconfig` has no `noUncheckedIndexedAccess`, so indexing a
 * `Record` would claim every lookup succeeds.)
 */
export const BOOKS = new Map<string, BookMeta>();
CANON_ROWS.forEach((row, index) => {
	BOOKS.set(row[0], {
		prefix: row[1],
		num: String(index + 1).padStart(2, "0"),
		singleChapter: row[2] === SINGLE_CHAPTER,
	});
});

/** Books that exist in numbered form ("John", "Samuel"...), derived from CANON. */
const NUMBERED_STEMS = new Set([...BOOKS.keys()].filter((b) => /^[123] /.test(b)).map((b) => b.slice(2)));

/**
 * Build candidate vault paths to a chapter file, in priority order.
 *
 * Supports two folder conventions:
 *
 *   Numbered (canon-order) folders - e.g. "40 - Matthew/Matt-03.md"
 *     Pattern: {csbFolder}/{num} - {Book}/{prefix}-{chapter}.md
 *     (zero-padded to 2 digits, dash separator)
 *
 *   Plain (CSB vault) folders - e.g. "Matthew/Matt 3.md"
 *     Pattern: {csbFolder}/{Book}/{prefix} {chapter}.md
 *
 * When the book has a canon number, the numbered path is tried first and the
 * plain path is returned as a fallback, so both vault layouts work with the
 * same plugin. Single-chapter books (Obadiah, Philemon, 2 John, 3 John, Jude)
 * use "{prefix}.md" instead of "{prefix}-01.md" in numbered folders.
 */
export function chapterPaths(csbFolder: string, book: string, chapter: number): string[] {
	const meta = BOOKS.get(book);
	const prefix = meta?.prefix ?? book;
	const candidates: string[] = [];

	if (meta !== undefined) {
		// Numbered folder: "40 - Matthew"
		const folder = `${meta.num} - ${book}`;

		if (meta.singleChapter) {
			candidates.push(`${csbFolder}/${folder}/${prefix}.md`);
		} else {
			candidates.push(`${csbFolder}/${folder}/${prefix}-${String(chapter).padStart(2, "0")}.md`);
		}
	}

	// Plain folder name (original CSB convention)
	candidates.push(`${csbFolder}/${book}/${prefix} ${chapter}.md`);
	return candidates;
}

/**
 * Parse a chapter file and extract verse text by heading number.
 * Verses are under "###### N" headings.
 */
function parseChapterFile(content: string): Map<number, string> {
	const map = new Map<number, string>();
	const lines = content.split(/\r?\n/);

	let currentVerse: number | null = null;
	let currentLines: string[] = [];

	const flush = () => {
		if (currentVerse !== null) {
			map.set(currentVerse, currentLines.join(" ").replace(/\s+/g, " ").trim());
		}
	};

	for (const line of lines) {
		// Match "###### v1", "###### v.1", or "###### 1" verse headings
		const headingMatch = line.match(/^#{6}\s+v?\.?(\d+)\s*$/i);
		if (headingMatch) {
			flush();
			currentVerse = parseInt(headingMatch[1], 10);
			currentLines = [];
		} else if (currentVerse !== null) {
			// Any heading level signals end of verse block
			if (/^#{1,5}\s/.test(line)) {
				flush();
				currentVerse = null;
				currentLines = [];
			} else if (line.trim().length > 0) {
				// Strip inline section headings (e.g. "## Heading" embedded mid-line)
				const stripped = line.replace(/\s*#{2,5}\s+[^#\n]+/g, "").trim();
				if (stripped.length > 0) {
					currentLines.push(stripped);
				}
			}
		}
	}
	flush();

	return map;
}

/**
 * Load and cache a chapter, then return the verse map.
 * Returns null if the file doesn't exist.
 */
async function loadVaultChapter(
	app: App,
	csbFolder: string,
	book: string,
	chapter: number
): Promise<Map<number, string> | null> {
	// Try each candidate convention in order (numbered first, then plain).
	for (const path of chapterPaths(csbFolder, book, chapter)) {
		if (verseCache.has(path)) {
			return verseCache.get(path)!;
		}

		const file = app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) continue;

		const content = await app.vault.read(file);
		const map = parseChapterFile(content);
		verseCache.set(path, map);
		return map;
	}

	return null;
}

// ---------------------------------------------------------------------------
// Downloaded Bible (Berean Standard Bible, public domain)
// ---------------------------------------------------------------------------

export const BSB_URL = "https://bereanbible.com/bsb.txt";
/** Display only; nothing checks the download against it. */
export const BSB_SIZE = "4.3 MB";
const BSB_CHAPTERS = 1189;
const BSB_VERSES = 31102;
// Verse text is rendered as Markdown, so anything Markdown or HTML could act on
// is refused, plus bare www. autolinks. The publisher's file contains none.
const MARKUP = /[[\]<>*_`#|\\~$^={}/&%@+]|www\./i;
// ...and a verse that starts like a list item or thematic break.
const BLOCK_START = /^\s*(?:-|\d+[.)](?:\s|$))/;

type BibleChapters = Map<string, Map<number, string>>;

let bibleFile: string | null = null;
let bible: Promise<BibleChapters | null> | null = null;

/** Where the downloaded Bible lives; also drops anything read from it before. */
export function setBibleFile(path: string): void {
	bibleFile = path;
	bible = null;
}

/** Chapters keyed `${book} ${chapter}`, or null unless the text is a whole, plain-text BSB. */
export function parseBibleText(text: string): BibleChapters | null {
	const chapters: BibleChapters = new Map();
	let verses = 0;
	for (const line of text.split(/\r?\n/)) {
		const m = /^(.+) (\d+):(\d+)\t(.*)$/.exec(line);
		if (!m) continue;
		const book = normaliseBook(m[1]);
		if (book === null || MARKUP.test(m[4]) || BLOCK_START.test(m[4])) return null;
		const key = `${book} ${parseInt(m[2], 10)}`;
		const verse = parseInt(m[3], 10);
		let chapter = chapters.get(key);
		if (!chapter) chapters.set(key, (chapter = new Map<number, string>()));
		if (!chapter.has(verse)) verses++;
		chapter.set(verse, m[4].trim());
	}
	return text.endsWith("\n") && chapters.size === BSB_CHAPTERS && verses === BSB_VERSES
		? chapters
		: null;
}

function loadDownloadedBible(app: App): Promise<BibleChapters | null> {
	if (bibleFile === null) return Promise.resolve(null);
	bible ??= app.vault.adapter.read(bibleFile).then(parseBibleText, () => (bible = null));
	return bible;
}

export async function bibleStatus(app: App): Promise<"absent" | "ready" | "damaged"> {
	if (bibleFile === null || !(await app.vault.adapter.exists(bibleFile))) return "absent";
	return (await loadDownloadedBible(app)) ? "ready" : "damaged";
}

export async function downloadBible(app: App): Promise<void> {
	const file = bibleFile;
	if (file === null) throw new Error("the plugin folder isn't known yet");
	// ponytail: no request timeout of our own; relies on the platform's. Revisit if a user reports a row stuck on "Downloading".
	const { text } = await requestUrl({ url: BSB_URL });
	if (parseBibleText(text) === null) {
		throw new Error("the download was incomplete or wasn't the expected Bible text. Nothing was saved.");
	}
	const adapter = app.vault.adapter;
	const part = `${file}.part`;
	await adapter.write(part, text);
	if (await adapter.exists(file)) await adapter.remove(file);
	await adapter.rename(part, file);
	setBibleFile(file);
}

export async function removeBible(app: App): Promise<void> {
	const file = bibleFile;
	if (file === null) return;
	const adapter = app.vault.adapter;
	for (const path of [file, `${file}.part`]) {
		if (await adapter.exists(path)) await adapter.remove(path);
	}
	setBibleFile(file);
}

type VerseRow = { chapter: number; verse: number; text: string };

/** The passage from one source, or null if that source can't serve all of it. */
async function readRange(
	ref: ScriptureRef,
	load: (chapter: number) => Promise<Map<number, string> | null>
): Promise<VerseRow[] | null> {
	const results: VerseRow[] = [];
	for (let c = ref.chapter; c <= ref.chapterEnd; c++) {
		const map = await load(c);
		if (!map) return null;

		const max = Math.max(...map.keys());
		const first = c === ref.chapter ? ref.verseStart : 1;
		const last = c === ref.chapterEnd && ref.verseEnd !== Infinity ? ref.verseEnd : max;
		if (first < 1 || last < first || last > max) return null;
		for (let v = first; v <= last; v++) {
			const text = map.get(v);
			if (text) results.push({ chapter: c, verse: v, text });
		}
	}
	return results.length > 0 ? results : null;
}

/**
 * Fetch verse text for a reference. Returns an array of { chapter, verse, text }
 * entries, in reading order. A cross-chapter range runs from the start verse to
 * the end of the first chapter, through any whole chapters between, then from
 * verse 1 to the end verse of the last chapter (verseEnd Infinity: to the end
 * of it). Verses inside a chapter's range that the translation omits are skipped.
 * The vault folder is tried first; the downloaded Bible is used only if the
 * folder can't serve the whole passage.
 * Throws a user-readable string on error.
 */
export async function fetchVerses(
	app: App,
	csbFolder: string,
	ref: ScriptureRef
): Promise<VerseRow[]> {
	const notFound = () => new Error(`Passage not found: ${ref.raw}`);
	if (ref.chapterEnd < ref.chapter) throw notFound();

	const rows =
		(await readRange(ref, (c) => loadVaultChapter(app, csbFolder, ref.book, c))) ??
		(await readRange(ref, async (c) => (await loadDownloadedBible(app))?.get(`${ref.book} ${c}`) ?? null));
	if (!rows) throw notFound();
	return rows;
}


export class ScriptureExpander {
	private app: App;
	private csbFolder: string;
	private component: Component;
	private sourcePath: string;
	private passages: ScriptureRef[] = [];

	/** Track which refs are currently expanded: span element -> expanded div. */
	private expanded = new Map<HTMLElement, HTMLElement>();

	constructor(app: App, csbFolder: string, component: Component, sourcePath: string) {
		this.app = app;
		this.csbFolder = csbFolder;
		this.component = component;
		this.sourcePath = sourcePath;
	}

	updateFolder(csbFolder: string): void {
		this.csbFolder = csbFolder;
	}

	updateSourcePath(sourcePath: string): void {
		this.sourcePath = sourcePath;
	}

	updatePassages(passages: ScriptureRef[]): void {
		this.passages = passages;
	}

	/**
	 * Walk the rendered DOM, find text nodes outside special blocks,
	 * and wrap detected scripture references in tappable spans.
	 */
	processElement(root: HTMLElement): void {
		this.walkNode(root);
	}

	private walkNode(node: Node): void {
		// Skip special containers
		if (node.nodeType === Node.ELEMENT_NODE) {
			const el = node as HTMLElement;
			const tag = el.tagName.toLowerCase();
			if (
				tag === "pre" ||
				tag === "code" ||
				el.classList.contains("preach-scripture-ref") ||
				el.classList.contains("preach-scripture-expand")
			) {
				return;
			}
		}

		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent ?? "";
			const refs = parseReferences(text, this.passages);
			if (refs.length === 0) return;

			// Build replacement fragment
			const frag = createFragment();
			let cursor = 0;

			for (const ref of refs) {
				// Text before this reference
				if (ref.index > cursor) {
					frag.appendText(text.slice(cursor, ref.index));
				}

				// Tappable span. createSpan appends as it creates, and nothing
				// else is added to the fragment in between, so document order is
				// the same as building it detached and appending at the end.
				const span = frag.createSpan({
					cls: "preach-scripture-ref",
					text: ref.raw,
				});
				span.dataset.ref = JSON.stringify({
					raw: ref.raw,
					book: ref.book,
					chapter: ref.chapter,
					verseStart: ref.verseStart,
					chapterEnd: ref.chapterEnd,
					verseEnd: ref.verseEnd,
				});

				span.addEventListener("pointerdown", (e: PointerEvent) => {
					e.stopPropagation();
					void this.handleTap(span, ref);
				});

				cursor = ref.index + ref.length;
			}

			// Remaining text
			if (cursor < text.length) {
				frag.appendText(text.slice(cursor));
			}

			node.parentNode?.replaceChild(frag, node);
			return;
		}

		// Recurse into child nodes (copy list since we may mutate)
		const children = Array.from(node.childNodes);
		for (const child of children) {
			this.walkNode(child);
		}
	}

	private async handleTap(span: HTMLElement, ref: ScriptureRef): Promise<void> {
		// If already expanded, collapse
		const existing = this.expanded.get(span);
		if (existing) {
			existing.remove();
			this.expanded.delete(span);
			span.classList.remove("preach-scripture-ref--open");
			return;
		}

		// Collapse any other open expansions
		this.expanded.forEach((el, s) => {
			el.remove();
			s.classList.remove("preach-scripture-ref--open");
		});
		this.expanded.clear();

		// Insert loading indicator
		const expandEl = createSpan();
		expandEl.className = "preach-scripture-expand";
		expandEl.textContent = "Loading...";
		span.insertAdjacentElement("afterend", expandEl);
		this.expanded.set(span, expandEl);
		span.classList.add("preach-scripture-ref--open");

		try {
			const verses = await fetchVerses(this.app, this.csbFolder, ref);
			expandEl.empty();
			expandEl.className = "preach-scripture-expand";

			await this.renderVerses(expandEl, ref.chapter, verses);

			// Tap on the expansion itself collapses it
			expandEl.addEventListener("pointerdown", (e: PointerEvent) => {
				e.stopPropagation();
				expandEl.remove();
				this.expanded.delete(span);
				span.classList.remove("preach-scripture-ref--open");
			});
		} catch (err: unknown) {
			expandEl.empty();
			expandEl.className = "preach-scripture-expand preach-scripture-expand--error";
			const msg = err instanceof Error ? err.message : `Could not load ${ref.raw}`;
			expandEl.createSpan({ cls: "preach-scripture-error-text", text: msg });

			expandEl.addEventListener("pointerdown", (e: PointerEvent) => {
				e.stopPropagation();
				expandEl.remove();
				this.expanded.delete(span);
				span.classList.remove("preach-scripture-ref--open");
			});
		}
	}

	/**
	 * Render verses as one flowing paragraph into el.
	 * Each verse gets an inline superscript number; no block breaks between verses.
	 */
	private async renderVerses(
		el: HTMLElement,
		firstChapter: number,
		verses: { chapter: number; verse: number; text: string }[]
	): Promise<void> {
		const passageEl = el.createSpan({ cls: "preach-scripture-passage" });

		let prevChapter = firstChapter;
		for (const { chapter, verse, text } of verses) {
			// Superscript verse number; "C:V" where the chapter changes
			const label = chapter !== prevChapter ? `${chapter}:${verse}` : String(verse);
			prevChapter = chapter;
			passageEl.createEl("sup", { cls: "preach-scripture-verse-num", text: label });

			// Render verse text into a temp container, then lift child nodes inline.
			// MarkdownRenderer wraps plain text in <p>; unwrap to keep flow continuous.
			const tmp = createDiv();
			await MarkdownRenderer.render(this.app, text, tmp, this.sourcePath, this.component);

			// Snapshot first: appending moves nodes out of tmp, and childNodes
			// is live, so iterating it directly would skip every second node.
			const nodes = Array.from(tmp.childNodes);
			for (const node of nodes) {
				if (node.instanceOf(HTMLElement) && node.tagName === "P") {
					// Unwrap the paragraph so verses stay on one flowing line.
					// Array.from, not a spread: tsconfig's lib is ES6 plus DOM
					// without dom.iterable, so a NodeList is array-like here
					// but not iterable. It also snapshots before the move.
					passageEl.append(...Array.from(node.childNodes));
				} else {
					passageEl.append(node);
				}
			}

			// Space between verses
			passageEl.appendText(" ");
		}
	}

	async renderPassage(el: HTMLElement, passages: ScriptureRef[]): Promise<void> {
		el.empty();
		for (const ref of passages) {
			el.createDiv({ cls: "preach-passage-ref", text: ref.raw });
			const textEl = el.createDiv({ cls: "preach-passage-text" });
			try {
				await this.renderVerses(textEl, ref.chapter, await fetchVerses(this.app, this.csbFolder, ref));
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : `Could not load ${ref.raw}`;
				textEl.createSpan({ cls: "preach-scripture-error-text", text: msg });
			}
		}
	}

	/** Collapse all expanded passages (call when view re-renders). */
	collapseAll(): void {
		this.expanded.forEach((el) => el.remove());
		this.expanded.clear();
	}
}
