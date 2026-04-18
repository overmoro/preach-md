# Preach MD

An Obsidian plugin that turns any sermon note into a distraction-free preach-mode view. Designed for delivering sermons from an iPad - full screen, locked chrome, free scroll, and a live timer.

Inspired by the Preach function in Logos Bible Software.

---

## Features

- **Preach view** - full-screen reading surface, Obsidian sidebars hidden, no accidental state changes
- **Large serif typography** - high contrast, generous line-height, tuned for live delivery
- **Free vertical scroll** - scroll position remembered within the session
- **Section outline** - tap the top-left button for a section list; tap any heading to jump there
- **Exit confirmation** - two-step exit (tap once to see "Exit?", tap again to confirm)
- **Edit round-trip** - bottom-right button switches to edit mode at the current position
- **Live timer** - elapsed time with configurable amber and red thresholds
- **Screen wake lock** - keeps the display on while preach mode is active
- **Edge-swipe suppression** - prevents accidental sidebar openings
- **Scripture tap-to-expand** - Bible references (e.g. `John 3:16`, `Rom 8:28-30`) are detected automatically; tap one to expand the passage inline from your vault Bible files; tap again to collapse

---

## Install

1. Open Obsidian Settings.
2. Go to **Community plugins** and click **Browse**.
3. Search for **Preach MD**.
4. Click **Install**, then **Enable**.

Alternatively, on iPad: Settings → Community plugins → Browse → search "Preach MD" → Install → Enable.

---

## Usage

1. Open a sermon note.
2. Tap the book icon in the ribbon, or run the command **Preach: Open preach mode**.
3. The preach view opens full-screen.

### Controls

| Location | Control | Action |
|---|---|---|
| Top-left | Outline | Shows section headings. Tap a heading to jump. |
| Top-right | Exit | First tap shows "Exit?", second tap within 3s closes. |
| Top-centre | Timer | Countdown from target duration. Single tap pauses/resumes. Double-tap resets. Counts up in red after reaching zero. |
| Bottom-right | Edit | Switches to edit mode at the current scroll position. |

### Scripture expansion

When preach mode is open, detected Bible references appear with a dotted underline. Tap a reference to expand the passage inline. The verse text is read from your vault Bible files (configurable in settings). Tap the expanded passage to collapse it.

References in code blocks and callouts are intentionally skipped.

---

## Settings

- **Target duration** - countdown start value in minutes (default: 30)
- **Amber warning** - timer turns amber at this many minutes remaining (default: 5)
- **Red warning** - timer turns red at this many minutes remaining (default: 1)
- **Section heading level** - heading level used for the outline (default: 2, i.e. `##`)
- **Bible folder path** - vault-relative path to your Bible chapter files (default: `30_Knowledge/Theology/Bible/CSB`). Each book should be a subfolder with files named like `John 3.md`, with verses under `###### N` headings.

---

## Screenshots

_Coming after iPad testing._

---

## Credits

- Reference-parsing approach ported from [obsidian-bible-linker](https://github.com/kuchejak/obsidian-bible-linker) by Jakub Kuchejda (MIT).
- Mobile-compatible plugin patterns informed by [obsidian-bible-reference](https://github.com/tim-hub/obsidian-bible-reference) by tim-hub (MIT).

---

## License

MIT
