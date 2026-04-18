// Session 2: Scripture reference detection and inline expansion.
// Detects references like "John 3:16", "Rom 8:28-30", "1 Cor 13:4-7" in rendered sermon text.
// Tapping a detected reference expands the passage inline from vault CSB files.
// Tapping again collapses it. Expansion state is in-memory only (not persisted).
//
// Reference parsing approach ported from obsidian-bible-linker by Jakub Kuchejda.
// See: https://github.com/kuchejak/obsidian-bible-linker
//
// CSB file structure:
//   {csbFolder}/BookName/BookName Chapter.md
//   Verse headings: ###### {verseNumber}
//   Range: extract from verse N through verse M inclusive.
//
// TODO (Session 2):
// - BookNameNormaliser: maps abbreviations to canonical folder names
//   e.g. "Rom" -> "Romans", "1 Cor" -> "1 Corinthians"
// - ReferenceParser: regex to detect references in text nodes
// - ScriptureExpander: reads vault file, extracts verse range, renders inline
// - In-memory chapter cache (Map<string, string>) per session for instant re-expansion
// - ScriptureOverlay: DOM element for expanded verse text, distinct styling

export {};
