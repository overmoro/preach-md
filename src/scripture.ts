// Scripture reference detection and inline expansion for Preach MD.
// Detects Bible references in rendered sermon text and expands them inline
// from vault CSB chapter files. Expansion is in-memory only.
//
// Reference parsing approach ported from obsidian-bible-linker by Jakub Kuchejda.
// See: https://github.com/kuchejak/obsidian-bible-linker
// Used under MIT licence.

import { App, TFile } from "obsidian";

// ---------------------------------------------------------------------------
// Book name normalisation
// ---------------------------------------------------------------------------

/**
 * Maps every recognised book name / abbreviation (lower-cased) to the
 * canonical folder name used in the CSB vault.
 */
const BOOK_MAP: Record<string, string> = {
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

/** Return the canonical book name, or null if not recognised. */
export function normaliseBook(raw: string): string | null {
	const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
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
	/** End verse (same as start for single verse). */
	verseEnd: number;
	/** True if this spans chapters (not supported in v0.3.0). */
	crossChapter: boolean;
}

/**
 * Regex for scripture references.
 * Captures:
 *   group 1: book name (possibly "1 Cor", "Matthew", etc.)
 *   group 2: chapter
 *   group 3: start verse
 *   group 4: (optional) end verse after hyphen
 *
 * Handles:
 *   - Numbered books: "1 Cor", "1Cor", "2 John"
 *   - Full names: "Matthew", "John", "Romans"
 *   - Verse ranges: "John 3:16-18"
 *   - No verse (chapter only): not supported for now
 */
const SCRIPTURE_REGEX =
	/\b((?:[123]\s?)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(\d+):(\d+)(?:-(\d+))?/g;

export function parseReferences(text: string): (ScriptureRef & { index: number; length: number })[] {
	const results: (ScriptureRef & { index: number; length: number })[] = [];
	SCRIPTURE_REGEX.lastIndex = 0;
	let m: RegExpExecArray | null;

	while ((m = SCRIPTURE_REGEX.exec(text)) !== null) {
		const rawBook = m[1];
		const book = normaliseBook(rawBook);
		if (!book) continue;

		const chapter = parseInt(m[2], 10);
		const verseStart = parseInt(m[3], 10);
		const verseEnd = m[4] ? parseInt(m[4], 10) : verseStart;

		results.push({
			raw: m[0],
			book,
			chapter,
			verseStart,
			verseEnd,
			crossChapter: false,
			index: m.index,
			length: m[0].length,
		});
	}

	return results;
}

// ---------------------------------------------------------------------------
// Verse cache and extractor
// ---------------------------------------------------------------------------

/**
 * In-memory cache: canonical chapter path -> verse number -> verse text.
 * Lives for the session only.
 */
const verseCache = new Map<string, Map<number, string>>();

/**
 * Build the vault path to a chapter file.
 * Pattern: {csbFolder}/{Book}/{Book} {Chapter}.md
 */
function chapterPath(csbFolder: string, book: string, chapter: number): string {
	return `${csbFolder}/${book}/${book} ${chapter}.md`;
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
		const headingMatch = line.match(/^#{6}\s+(\d+)\s*$/);
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
				currentLines.push(line.trim());
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
async function loadChapter(
	app: App,
	csbFolder: string,
	book: string,
	chapter: number
): Promise<Map<number, string> | null> {
	const path = chapterPath(csbFolder, book, chapter);

	if (verseCache.has(path)) {
		return verseCache.get(path)!;
	}

	const file = app.vault.getAbstractFileByPath(path);
	if (!file || !(file instanceof TFile)) return null;

	const content = await app.vault.read(file as TFile);
	const map = parseChapterFile(content);
	verseCache.set(path, map);
	return map;
}

/**
 * Fetch verse text for a reference. Returns an array of { verse, text } pairs.
 * Throws a user-readable string on error.
 */
export async function fetchVerses(
	app: App,
	csbFolder: string,
	ref: ScriptureRef
): Promise<{ verse: number; text: string }[]> {
	if (ref.crossChapter) {
		throw "Cross-chapter ranges not supported yet.";
	}

	const map = await loadChapter(app, csbFolder, ref.book, ref.chapter);
	if (!map) {
		throw `Passage not found: ${ref.raw}`;
	}

	const results: { verse: number; text: string }[] = [];
	for (let v = ref.verseStart; v <= ref.verseEnd; v++) {
		const text = map.get(v);
		if (text === undefined) {
			throw `Passage not found: ${ref.raw}`;
		}
		results.push({ verse: v, text });
	}

	return results;
}

// ---------------------------------------------------------------------------
// ScriptureExpander - DOM wiring
// ---------------------------------------------------------------------------

export class ScriptureExpander {
	private app: App;
	private csbFolder: string;

	/** Track which refs are currently expanded: span element -> expanded div. */
	private expanded = new Map<HTMLElement, HTMLElement>();

	constructor(app: App, csbFolder: string) {
		this.app = app;
		this.csbFolder = csbFolder;
	}

	updateFolder(csbFolder: string): void {
		this.csbFolder = csbFolder;
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
				el.classList.contains("callout") ||
				el.classList.contains("preach-scripture-ref") ||
				el.classList.contains("preach-scripture-expand")
			) {
				return;
			}
		}

		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent ?? "";
			const refs = parseReferences(text);
			if (refs.length === 0) return;

			// Build replacement fragment
			const frag = document.createDocumentFragment();
			let cursor = 0;

			for (const ref of refs) {
				// Text before this reference
				if (ref.index > cursor) {
					frag.appendChild(document.createTextNode(text.slice(cursor, ref.index)));
				}

				// Tappable span
				const span = document.createElement("span");
				span.className = "preach-scripture-ref";
				span.textContent = ref.raw;
				span.dataset.ref = JSON.stringify({
					raw: ref.raw,
					book: ref.book,
					chapter: ref.chapter,
					verseStart: ref.verseStart,
					verseEnd: ref.verseEnd,
					crossChapter: ref.crossChapter,
				});

				span.addEventListener("pointerdown", (e: PointerEvent) => {
					e.stopPropagation();
					this.handleTap(span, ref);
				});

				frag.appendChild(span);
				cursor = ref.index + ref.length;
			}

			// Remaining text
			if (cursor < text.length) {
				frag.appendChild(document.createTextNode(text.slice(cursor)));
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
		const expandEl = document.createElement("span");
		expandEl.className = "preach-scripture-expand";
		expandEl.textContent = "Loading...";
		span.insertAdjacentElement("afterend", expandEl);
		this.expanded.set(span, expandEl);
		span.classList.add("preach-scripture-ref--open");

		try {
			const verses = await fetchVerses(this.app, this.csbFolder, ref);
			expandEl.empty();
			expandEl.className = "preach-scripture-expand";

			for (const { verse, text } of verses) {
				const row = expandEl.createEl("span", { cls: "preach-scripture-verse" });
				const num = row.createEl("sup", { cls: "preach-scripture-verse-num", text: String(verse) });
				row.appendChild(num);
				row.appendChild(document.createTextNode(" " + text + " "));
			}

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
			const msg = typeof err === "string" ? err : `Could not load ${ref.raw}`;
			expandEl.createEl("span", { cls: "preach-scripture-error-text", text: msg });

			expandEl.addEventListener("pointerdown", (e: PointerEvent) => {
				e.stopPropagation();
				expandEl.remove();
				this.expanded.delete(span);
				span.classList.remove("preach-scripture-ref--open");
			});
		}
	}

	/** Collapse all expanded passages (call when view re-renders). */
	collapseAll(): void {
		this.expanded.forEach((el) => el.remove());
		this.expanded.clear();
	}
}
