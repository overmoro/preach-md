# Preach MD

An Obsidian plugin that turns any .md file into a distraction-free preach mode, optimised for delivering sermons or giving any kind of presentation from an iPad.

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
- **Bible folder path** - vault-relative path to your Bible chapter files (default: `30_Knowledge/Theology/Bible/CSB`). See [Bible vault format](#bible-vault-format) below for the expected folder structure.

---

## Bible vault format

The plugin supports two folder conventions for your Bible chapter files:

**Numbered (canon-order) folders** - e.g. `40 - Matthew/Matt-03.md`
- Each book folder is prefixed with its canon number: `{number} - {Book}`
- Chapter files: `{Abbreviation}-{ZeroPaddedChapter}.md` (dash, zero-padded to 2 digits)
- Verse headings: `###### v1` (optionally with lower/uppercase "v", with or without a dot)
- Single-chapter books (Obadiah, Philemon, 2 John, 3 John, Jude) use `{Abbreviation}.md`

**Plain folders** (original CSB convention) - e.g. `Matthew/Matt 3.md`
- Each book folder uses the canonical book name directly
- Chapter files: `{Abbreviation} {Chapter}.md` (space, no zero-padding)
- Verse headings: `###### 1`

The plugin auto-detects the convention per reference: it looks for the numbered path first, then falls back to the plain path. Both vault layouts work with the same plugin.

---

## Screenshots

_Coming after iPad testing._

---

## Credits

- Reference-parsing approach ported from [obsidian-bible-linker](https://github.com/kuchejak/obsidian-bible-linker) by Jakub Kuchejda (MIT).
- Mobile-compatible plugin patterns informed by [obsidian-bible-reference](https://github.com/tim-hub/obsidian-bible-reference) by tim-hub (MIT).

---

## Known limitations

For the best experience, open Preach MD in a non-stacked tab. When tabs are stacked, the back-pill in the editor view and the auto-fading bottom buttons may sit in awkward positions, and the full preach surface gets squeezed into a panel.

---

## Privacy

Preach MD makes **no network requests**. Everything runs locally:

- Sermon content stays in your vault. Nothing is sent anywhere.
- Scripture popups read CSB Bible files from your own vault folder.
- The plugin uses the browser **Wake Lock API** to keep your iPad's screen from sleeping during preach mode. This is a local device API, not a network call.
- No analytics, no telemetry, no external services.

Code reviewers: the `nav.wakeLock.request("screen")` call in `src/preach-view.ts` is the Wake Lock API mentioned above, not a network request.

---

## License

MIT
