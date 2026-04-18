export interface TimerThresholds {
	targetMinutes: number;
	warnMinutes: number;
	critMinutes: number;
}

export type TimerRunState = "idle" | "running" | "paused";
export type TimerColourState = "normal" | "warn" | "crit" | "overtime";

export class PreachTimer {
	private thresholds: TimerThresholds;
	private el: HTMLElement;
	private labelEl: HTMLElement;

	// Three-state machine
	private runState: TimerRunState = "idle";

	// Remaining seconds at the moment the timer was last paused or started
	private remainingAtPause: number;

	// Timestamp when the current running segment began
	private segmentStart: number | null = null;

	private intervalId: number | null = null;

	// Double-tap detection
	private lastTapTime: number = 0;
	private singleTapTimeout: number | null = null;

	constructor(container: HTMLElement, thresholds: TimerThresholds) {
		this.thresholds = thresholds;
		this.remainingAtPause = thresholds.targetMinutes * 60;

		this.el = container.createEl("div", { cls: "preach-timer" });
		this.el.setAttribute("role", "timer");
		this.el.setAttribute("aria-live", "off");
		this.el.dataset.runState = "idle";

		this.labelEl = container.createEl("div", { cls: "preach-timer-label" });
		this.labelEl.textContent = "Tap to start";

		this.el.addEventListener("pointerdown", (e) => {
			e.stopPropagation();
			this.handleTap();
		});

		this.renderDisplay();
	}

	// Called from preach-view after open - starts tick loop so display is live
	start(): void {
		// Just ensure the idle display is painted; user starts via tap
		this.renderDisplay();
	}

	stop(): void {
		this.clearInterval();
		if (this.singleTapTimeout !== null) {
			window.clearTimeout(this.singleTapTimeout);
			this.singleTapTimeout = null;
		}
	}

	updateThresholds(thresholds: TimerThresholds): void {
		this.thresholds = thresholds;
		if (this.runState === "idle") {
			this.remainingAtPause = thresholds.targetMinutes * 60;
		}
		this.renderDisplay();
	}

	// Single tap: toggle running/paused (or start if idle)
	// Double tap (within 300ms): reset to idle
	private handleTap(): void {
		const now = Date.now();
		const timeSinceLast = now - this.lastTapTime;
		this.lastTapTime = now;

		if (timeSinceLast < 300) {
			// Double-tap detected - cancel pending single-tap and reset
			if (this.singleTapTimeout !== null) {
				window.clearTimeout(this.singleTapTimeout);
				this.singleTapTimeout = null;
			}
			this.transitionToIdle();
			return;
		}

		// Schedule single-tap action after 300ms window
		this.singleTapTimeout = window.setTimeout(() => {
			this.singleTapTimeout = null;
			this.handleSingleTap();
		}, 300);
	}

	private handleSingleTap(): void {
		if (this.runState === "idle" || this.runState === "paused") {
			this.transitionToRunning();
		} else {
			this.transitionToPaused();
		}
	}

	private transitionToRunning(): void {
		this.segmentStart = Date.now();
		this.runState = "running";
		this.el.dataset.runState = "running";
		this.intervalId = window.setInterval(() => this.tick(), 250);
		this.tick();
	}

	private transitionToPaused(): void {
		this.remainingAtPause = this.computeRemaining();
		this.clearInterval();
		this.segmentStart = null;
		this.runState = "paused";
		this.el.dataset.runState = "paused";
		this.renderDisplay();
	}

	private transitionToIdle(): void {
		this.clearInterval();
		this.segmentStart = null;
		this.runState = "idle";
		this.el.dataset.runState = "idle";
		this.remainingAtPause = this.thresholds.targetMinutes * 60;
		this.renderDisplay();
	}

	private clearInterval(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	private computeRemaining(): number {
		if (this.segmentStart === null) return this.remainingAtPause;
		const elapsed = (Date.now() - this.segmentStart) / 1000;
		return this.remainingAtPause - elapsed;
	}

	private tick(): void {
		this.renderDisplay();
	}

	private renderDisplay(): void {
		const remaining = this.runState === "running"
			? this.computeRemaining()
			: this.remainingAtPause;

		const isOvertime = remaining < 0;
		const absSecs = Math.abs(Math.ceil(remaining));
		const mins = Math.floor(absSecs / 60);
		const secs = absSecs % 60;
		const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;
		const display = isOvertime ? `+${timeStr}` : timeStr;

		this.el.textContent = display;

		// Colour state
		const remainingMins = remaining / 60;
		let colourState: TimerColourState;
		if (isOvertime) {
			colourState = "overtime";
		} else if (remainingMins <= this.thresholds.critMinutes) {
			colourState = "crit";
		} else if (remainingMins <= this.thresholds.warnMinutes) {
			colourState = "warn";
		} else {
			colourState = "normal";
		}
		this.el.dataset.state = colourState;

		// Label
		if (this.runState === "idle") {
			this.labelEl.textContent = "Tap to start";
		} else if (this.runState === "running") {
			this.labelEl.textContent = "Tap to pause";
		} else {
			this.labelEl.textContent = "Tap to resume  |  Double-tap to reset";
		}
	}
}
