# Preach MD

An Obsidian plugin that turns any sermon note into a distraction-free preach-mode view. Designed for delivering sermons from an iPad - full screen, locked chrome, free scroll, and a live timer.

Inspired by the Preach function in Logos Bible Software.

---

## Features

### Session 1 (current)

- **Preach view** - full-screen reading surface, Obsidian sidebars hidden, no accidental state changes
- **Large serif typography** - high contrast, generous line-height, tuned for live delivery
- **Free vertical scroll** - scroll position remembered within the session
- **Section outline** - tap the top-left button for a section list; tap any heading to jump there
- **Exit confirmation** - two-step exit (tap once to see "Exit?", tap again to confirm)
- **Edit round-trip** - bottom-right button switches to edit mode at the current position
- **Live timer** - elapsed time with configurable amber and red thresholds
- **Screen wake lock** - keeps the display on while preach mode is active
- **Edge-swipe suppression** - prevents accidental sidebar openings

### Session 2 (coming)

- Paragraph highlight toggle - tap a paragraph to mark it `==like this==` (persisted to file)
- Scripture reference detection - tap a reference to inline-expand from vault Bible files

---

## Install via BRAT

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewer's Auto-update Tool) lets you install unreleased plugins directly from a GitHub repository.

1. Install the **Obsidian42 - BRAT** plugin from the Obsidian community plugins list.
2. Open BRAT settings and click **Add Beta Plugin**.
3. Enter the repository URL: `overmoro/preach-md`
4. Click **Add Plugin**. BRAT will download and install it.
5. Enable **Preach MD** in Settings > Community plugins.

To update: open BRAT settings and click **Check for updates**.

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
| Top-centre | Timer | Elapsed time. Tap to reset (two-step). |
| Bottom-right | Edit | Switches to edit mode at the current scroll position. |

---

## Settings

- **Amber warning** - timer turns amber at this many minutes (default: 25)
- **Red warning** - timer turns red at this many minutes (default: 35)
- **Section heading level** - heading level used for the outline (default: 2, i.e. `##`)

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
