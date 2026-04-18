export interface TimerThresholds {
	warnMinutes: number;
	critMinutes: number;
}

export type TimerState = "normal" | "warn" | "crit";

export class PreachTimer {
	private startTime: number;
	private intervalId: number | null = null;
	private el: HTMLElement;
	private thresholds: TimerThresholds;
	private onResetRequest: () => void;
	private confirmTimeout: number | null = null;
	private confirming = false;

	constructor(
		container: HTMLElement,
		thresholds: TimerThresholds,
		onResetRequest: () => void
	) {
		this.thresholds = thresholds;
		this.onResetRequest = onResetRequest;
		this.startTime = Date.now();

		this.el = container.createEl("div", { cls: "preach-timer" });
		this.el.setAttribute("role", "timer");
		this.el.setAttribute("aria-live", "off");
		this.el.textContent = "0:00";

		this.el.addEventListener("pointerdown", (e) => {
			e.stopPropagation();
			this.handleTap();
		});
	}

	start(): void {
		this.startTime = Date.now();
		this.intervalId = window.setInterval(() => this.tick(), 1000);
		this.tick();
	}

	stop(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		if (this.confirmTimeout !== null) {
			window.clearTimeout(this.confirmTimeout);
			this.confirmTimeout = null;
		}
	}

	reset(): void {
		this.startTime = Date.now();
		this.confirming = false;
		this.el.classList.remove("preach-timer--confirm");
		if (this.confirmTimeout !== null) {
			window.clearTimeout(this.confirmTimeout);
			this.confirmTimeout = null;
		}
		this.tick();
	}

	updateThresholds(thresholds: TimerThresholds): void {
		this.thresholds = thresholds;
		this.tick();
	}

	private tick(): void {
		const elapsed = Date.now() - this.startTime;
		const totalSecs = Math.floor(elapsed / 1000);
		const mins = Math.floor(totalSecs / 60);
		const secs = totalSecs % 60;
		const display = `${mins}:${secs.toString().padStart(2, "0")}`;

		if (!this.confirming) {
			this.el.textContent = display;
		}

		const state = this.computeState(mins);
		this.el.dataset.state = state;
	}

	private computeState(mins: number): TimerState {
		if (mins >= this.thresholds.critMinutes) return "crit";
		if (mins >= this.thresholds.warnMinutes) return "warn";
		return "normal";
	}

	private handleTap(): void {
		if (this.confirming) {
			// Second tap: reset
			this.reset();
			this.onResetRequest();
			return;
		}

		// First tap: enter confirm state
		this.confirming = true;
		this.el.classList.add("preach-timer--confirm");
		this.el.textContent = "Reset?";

		this.confirmTimeout = window.setTimeout(() => {
			this.confirming = false;
			this.el.classList.remove("preach-timer--confirm");
			this.tick();
			this.confirmTimeout = null;
		}, 3000);
	}
}
