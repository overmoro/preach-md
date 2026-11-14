export type Pace = "ahead" | "on" | "behind";

const GRACE_SECONDS = 30;
const MAX_SECTION_MINUTES = 120;
const TIME_TOKEN = /\(\s*~?\s*(\d+(?:[.,]\d+)?)\s*(?:minutes?|mins?)\s*\)\s*$/i;

function parseTime(text: string): { minutes: number; rest: string } | null {
	const m = TIME_TOKEN.exec(text);
	if (!m) return null;
	const minutes = Number(m[1].replace(",", "."));
	if (!(minutes > 0 && minutes <= MAX_SECTION_MINUTES)) return null;
	return { minutes, rest: text.slice(0, m.index).replace(/\s+$/, "") };
}

/**
 * A planned time at the end of a heading, e.g. "(~5 min)". `full` is the whole
 * heading text; `lastText` is its final text node, which is what gets edited.
 * Null unless both end in the token and something remains before it.
 */
export function readHeadingTime(full: string, lastText: string): { minutes: number; lastRest: string } | null {
	const whole = parseTime(full);
	if (!whole || whole.rest.trim() === "") return null;
	const last = parseTime(lastText);
	if (!last) return null;
	return { minutes: whole.minutes, lastRest: last.rest };
}

/**
 * Where the plan says you are (`planned`, `fraction`) and whether the section
 * you're in is early or late against its window. Null while the timer is idle
 * or nothing has a plan.
 */
export function sectionPace(
	plans: readonly (number | null)[],
	current: number,
	elapsedSec: number | null,
): { pace: Pace | null; planned: number; fraction: number } | null {
	if (elapsedSec === null) return null;
	const secs = plans.map((p) => (p === null ? 0 : Math.round(p * 60)));
	const start: number[] = [];
	let total = 0;
	let lastTimed = -1;
	secs.forEach((s, i) => {
		start.push(total);
		total += s;
		if (plans[i] !== null) lastTimed = i;
	});
	if (lastTimed < 0) return null;

	let planned = lastTimed;
	let fraction = 1;
	for (let i = 0; i < plans.length; i++) {
		if (plans[i] !== null && elapsedSec < start[i] + secs[i]) {
			planned = i;
			fraction = Math.min(1, Math.max(0, (elapsedSec - start[i]) / secs[i]));
			break;
		}
	}

	let pace: Pace | null = null;
	if (current >= 0 && plans[current] !== null) {
		if (elapsedSec < start[current] - GRACE_SECONDS) pace = "ahead";
		else if (elapsedSec > start[current] + secs[current] + GRACE_SECONDS) pace = "behind";
		else pace = "on";
	}
	return { pace, planned, fraction };
}

/** Index of the section being read, or -1 above the first one. */
export function currentSectionIndex(
	tops: readonly number[],
	line: number,
	viewportHeight: number,
	atBottom: boolean,
): number {
	const limit = atBottom ? viewportHeight : line;
	let current = -1;
	tops.forEach((top, i) => {
		if (atBottom ? top < limit : top <= limit) current = i;
	});
	return current;
}

/** The section headings, shared by the outline and the strip so they always agree. */
export function sectionHeadingEls(root: HTMLElement, level: number): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>("h" + level));
}

const TEXT_NODE = 3;
const UNFOLD_MS = 100;

/** Unfold, outermost first, every folded callout around `el` via Obsidian's own title click. */
export function unfoldCallouts(el: HTMLElement): boolean {
	const folded: HTMLElement[] = [];
	for (let c = el.parentElement?.closest<HTMLElement>(".callout"); c; c = c.parentElement?.closest<HTMLElement>(".callout")) {
		if (c.classList.contains("is-collapsed")) folded.unshift(c);
	}
	for (const c of folded) c.querySelector<HTMLElement>(".callout-title")?.click();
	return folded.length > 0;
}

function lastTextNode(node: Node): Node | null {
	for (let n = node.lastChild; n; n = n.previousSibling) {
		if (n.nodeType === TEXT_NODE) {
			if ((n.textContent ?? "").trim() !== "") return n;
		} else {
			const found = lastTextNode(n);
			if (found) return found;
		}
	}
	return null;
}

/** Reads and hides a heading's planned time in the rendered DOM only. */
function tidy(heading: HTMLElement): number | null {
	const last = lastTextNode(heading);
	if (!last) return null;
	const read = readHeadingTime(heading.textContent ?? "", last.textContent ?? "");
	if (!read) return null;
	last.textContent = read.lastRest;
	return read.minutes;
}

export class SectionStrip {
	private nav: HTMLElement;
	private playhead: HTMLElement;
	private headings: HTMLElement[] = [];
	private segs: HTMLElement[] = [];
	private plans: (number | null)[] = [];
	private timeline = false;
	private lastKey = "";
	private downTarget: EventTarget | null = null;
	private pendingJump = 0;

	constructor(
		parent: HTMLElement,
		private scrollEl: HTMLElement,
		private elapsedSeconds: () => number | null,
		private onJump?: () => void,
	) {
		this.nav = parent.createEl("nav", {
			cls: "preach-strip preach-strip--hidden",
			attr: { "aria-label": "Sections", "data-ignore-swipe": "true" },
		});
		this.playhead = createDiv({ cls: "preach-strip-playhead" });
	}

	/** Remember where the gesture began; iOS targets the click at finger-up, after the controls have woken. */
	noteDown(target: EventTarget | null): void {
		this.downTarget = target;
	}

	build(headings: HTMLElement[], pacing: boolean): void {
		window.clearTimeout(this.pendingJump);
		this.playhead.remove();
		this.nav.empty();
		this.headings = [];
		this.segs = [];
		this.plans = [];
		this.timeline = false;
		this.lastKey = "";
		this.nav.removeAttribute("data-pace");
		this.nav.classList.remove("preach-strip--timeline");
		if (headings.length < 2) {
			this.nav.classList.add("preach-strip--hidden");
			return;
		}

		this.headings = headings;
		this.plans = headings.map((h) => (pacing ? tidy(h) : null));
		this.timeline = this.plans.some((p) => p !== null);
		this.nav.classList.toggle("preach-strip--timeline", this.timeline);
		this.nav.classList.remove("preach-strip--hidden");

		headings.forEach((heading, i) => {
			const plan = this.plans[i];
			const label = (heading.textContent ?? "").trim();
			const seg = this.nav.createEl("button", {
				cls: "preach-strip-seg",
				attr: { "aria-label": plan === null ? label : `${label}, ${plan} min` },
			});
			if (this.timeline) seg.setCssProps({ "--preach-strip-weight": String(plan ?? 0) });
			seg.addEventListener("click", (e) => {
				// detail 0: activated without a pointer, e.g. the keyboard
				if (e.detail !== 0 && !seg.contains(this.downTarget as Node | null)) return;
				this.onJump?.();
				window.clearTimeout(this.pendingJump);
				const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
				const go = () => heading.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
				// Obsidian toggles on a 0ms timeout, then animates height for 100ms
				if (unfoldCallouts(heading)) this.pendingJump = window.setTimeout(go, UNFOLD_MS + 100);
				else go();
			});
			this.segs.push(seg);
		});
	}

	refresh(): void {
		const first = this.headings[0];
		const height = this.scrollEl.clientHeight;
		if (!first || !first.isConnected || height === 0) return;

		const base = this.scrollEl.getBoundingClientRect().top;
		// Headings in folded callouts have no box; count them as below the line
		const tops = this.headings.map((h) =>
			h.getClientRects().length === 0 ? Infinity : h.getBoundingClientRect().top - base,
		);
		// ponytail: fixed reading line and 30s grace; revisit if Don reports early switching or flicker on stage
		const line = Math.max(0.25 * height, 100);
		const atBottom = this.scrollEl.scrollTop + height >= this.scrollEl.scrollHeight - 2;
		const current = currentSectionIndex(tops, line, height, atBottom);
		const result = this.timeline ? sectionPace(this.plans, current, this.elapsedSeconds()) : null;

		const key = [
			current,
			result?.pace ?? "",
			result?.planned ?? "",
			result ? Math.round(result.fraction * 200) : "",
		].join("|");
		if (key === this.lastKey) return;
		this.lastKey = key;

		this.segs.forEach((seg, i) => {
			seg.classList.toggle("is-current", i === current);
			if (i === current) seg.setAttribute("aria-current", "location");
			else seg.removeAttribute("aria-current");
		});
		if (result?.pace) this.nav.dataset.pace = result.pace;
		else this.nav.removeAttribute("data-pace");

		if (result) {
			this.playhead.setCssProps({ "--preach-strip-at": String(result.fraction) });
			this.segs[result.planned].appendChild(this.playhead);
		} else {
			this.playhead.remove();
		}
	}
}
