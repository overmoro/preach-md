import type { SectionCache, Loc } from "obsidian";

export interface Block {
	start: number;
	end: number;
	line: number;
}

export interface Snapshot {
	text: string;
	blocks: Block[];
}

const isEmpty = (s: SectionCache): boolean =>
	s.position.start.offset === s.position.end.offset;

/** True when the sections describe exactly this text. */
export function sectionsFit(text: string, sections: SectionCache[]): boolean {
	const lineStart = [0];
	for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
		lineStart.push(i + 1);
	}

	const locFits = (loc: Loc): boolean => {
		const base = lineStart[loc.line];
		if (base === undefined || base + loc.col !== loc.offset) return false;
		const lineEnd = loc.line + 1 < lineStart.length ? lineStart[loc.line + 1] - 1 : text.length;
		return loc.offset <= lineEnd;
	};

	let cursor = 0;
	for (const s of sections) {
		if (isEmpty(s)) continue;
		const { start, end } = s.position;
		if (!locFits(start) || !locFits(end)) return false;
		if (text.slice(cursor, start.offset).trim() !== "") return false;
		cursor = end.offset;
	}
	return text.slice(cursor).trim() === "";
}

export function toBlocks(_text: string, sections: SectionCache[]): Block[] {
	return sections
		.filter((s) => !isEmpty(s) && s.type !== "yaml" && s.type !== "comment")
		.map((s) => ({
			start: s.position.start.offset,
			end: s.position.end.offset,
			line: s.position.start.line,
		}));
}
