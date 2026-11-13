# Preach MD

An Obsidian plugin that turns any .md file into a distraction-free preach mode, optimised for delivering sermons or giving any kind of presentation from an iPad.

Inspired by the Preach function in Logos Bible Software.

---

## Features

- **Preach view** - full-screen reading surface, Obsidian sidebars hidden, no accidental state changes
- **Large serif typography** - high contrast, generous line-height, tuned for live delivery
- **Free vertical scroll** - scroll position remembered within the session
- **Section outline** - tap the bottom-left button for a section list; tap any heading to jump there
- **Section strip** - a thin strip on the right edge with one segment per section; the section you're reading is lit. Tap the screen to wake the controls, then tap a segment to jump there
- **Section pacing (optional)** - end a section heading with a planned time like `(~5 min)`, and the strip shows whether you're on time, ahead or behind while the timer runs
- **Exit confirmation** - two-step exit (tap once to see "Exit?", tap again to confirm)
- **Edit round-trip** - bottom-right button switches to edit mode at the current position
- **Live timer** - elapsed time with configurable amber and red thresholds
- **Screen wake lock** - keeps the display on while preach mode is active
- **Edge-swipe suppression** - prevents accidental sidebar openings
- **Highlight colours** - highlights coloured in Obsidian 1.14.4 or later keep their colour in preach view
- **Scripture tap-to-expand** - Bible references (e.g. `John 3:16`, `Rom 8:28-30`, or across chapters, `John 3:16-4:2`, `Gen 1:1-3:5`, en dash ranges like `Rom 8:28–30`, and lists like `Deut 30:6; 10:16`) are detected automatically; tap one to expand the passage inline from your vault Bible files, or from an optional offline Bible download; tap again to collapse
- **Verse-only references** - in a note with a `passage` in its frontmatter, `v.11`, `vv. 14-15` and the like expand from that passage
- **Passage view** - one tap shows the whole sermon passage, large, for reading aloud; one tap anywhere closes it

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
| Bottom-left | Outline | Shows section headings. Tap a heading to jump. |
| Bottom-right | Exit | First tap shows "Exit?", second tap within 3s closes. |
| Top-centre | Timer | Countdown from target duration. Single tap pauses/resumes. Double-tap resets. Counts up in red after reaching zero. |
| Bottom-centre | A- / A+ | Steps the text size by 10% and remembers it for the next sermon. |
| Bottom-left, beside Outline | Passage | Shows the note's passage full-screen for reading aloud. Tap anywhere to close; your place in the sermon doesn't move. Only shown when the note has a `passage`. |
| Right edge | Section strip | The lit segment is the section you're reading. When the controls have faded, tap the screen once, then tap a segment to jump. |
| Bottom-right | Edit | Switches to edit mode at the current scroll position. |

### Highlight colours

In Obsidian 1.14.4 or later, a second row of six coloured circles appears under B, I, U and H. Select text and tap a colour to highlight it. Tap a different colour on a highlight to recolour the whole highlight, its own colour to remove it, or H to make it plain (H on a plain highlight removes it). Preach MD writes the change only when Obsidian's own rendering confirms it landed on exactly the text you selected, and says so otherwise. A highlight with bold or other markup inside it can't be changed from here.

### Scripture expansion

When preach mode is open, detected Bible references appear with a dotted underline. Tap a reference to expand the passage inline. The verse text is read from your vault Bible files (configurable in settings). If you don't keep a Bible in your vault, download the Berean Standard Bible once from settings and every reference expands offline. Your own Bible folder is always checked first. Tap the expanded passage to collapse it.

References in code blocks and callouts are intentionally skipped.

### Sermon passage

Name the passage in the note's frontmatter with `passage`:

    passage: John 3:16-21

or as a list of links, the way Obsidian's property editor writes them:

    passage:
      - "[[Colossians 2:11-15]]"

A link's display text is used, so `[[Rom 8|Romans 8:28]]` means Romans 8:28. A whole chapter works too (`passage: Amos 4`, `passage: Matthew 5–7`). Quote links in the YAML; Obsidian does this for you.

With a passage set:

- The **Passage** button shows it in full, every entry if the list has several.
- Verse-only references (`v.11`, `v. 10`, `vv.14-15`, `v11`) expand from the passage's chapter, including verses just outside it (`v.10` in a note on Colossians 2:11-15 means Colossians 2:10). This only happens when the note has a single passage. If the passage crosses into the next chapter, a number at or after its first verse means the first chapter and one at or before its last verse means the second; any other number isn't marked, rather than guess.

Ranges that cross a verse your translation leaves out (Mark 9:44, Matthew 17:21) skip it rather than failing.

### Section strip and pacing

The strip on the right edge has one segment for each section heading (the same headings the outline lists, set by **Section heading level**). A section is lit once its heading reaches the upper quarter of the screen.

Set **Section strip** to **Sections and pacing** to plan your timing. End a section heading with the minutes you plan to spend on it:

    ## Intro (~3 min)
    ## I. Circumcised in Him (v.11) (~5 min)

The time must be the last thing in the heading, in brackets: `(~5 min)`, `(5 min)`, `(~5 mins)`, `(5 minutes)` and decimals like `(~1.5 min)` all work, up to 120 minutes. Ranges such as `(~3-4 min)` aren't read. Preach view hides each time it reads; if a time still shows, it wasn't read. Your note is never changed.

With pacing on, each segment's length follows its planned time. Start the timer and a small tick shows where your plan says you should be. The lit segment turns amber when you're more than 30 seconds behind your plan for that section and blue when you're more than 30 seconds ahead. Sections without a time aren't judged. Pacing follows the times in your headings, not the timer's length.

---

## Settings

- **Target duration** - countdown start value in minutes (default: 30)
- **Amber warning** - timer turns amber at this many minutes remaining (default: 5)
- **Red warning** - timer turns red at this many minutes remaining (default: 1)
- **Section heading level** - heading level used for the outline (default: 2, i.e. `##`)
- **Section strip** - Off, Sections (default), or Sections and pacing. Applies the next time you open preach mode.
- **Text size** - sermon text scale in percent, 70 to 200 (default: 100). Also follows the iOS system text size.
- **Bible folder path** - vault-relative path to your Bible chapter files (default: `30_Knowledge/Theology/Bible/CSB`). See [Bible vault format](#bible-vault-format) below for the expected folder structure.
- **Offline Bible** - downloads the Berean Standard Bible once, for references your Bible folder can't supply. Shows whether it's on this device, with a button to remove it.

A note can set its own countdown with `preach-minutes: 35` in its frontmatter. It takes a whole number of minutes from 1 to 1440 (a number or a quoted number), and anything else falls back to **Target duration**. While the timer is idle a change applies straight away; once started (running or paused), it applies on the next reset.

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

- The Berean Standard Bible (BSB) is produced in cooperation with Bible Hub, Discovery Bible, unfoldingWord, Bible Aquifer, OpenBible.com, and the Berean Bible Translation Committee, and has been dedicated to the public domain. See [berean.bible](https://berean.bible/terms.htm).
- Reference-parsing approach ported from [obsidian-bible-linker](https://github.com/kuchejak/obsidian-bible-linker) by Jakub Kuchejda (MIT).
- Mobile-compatible plugin patterns informed by [obsidian-bible-reference](https://github.com/tim-hub/obsidian-bible-reference) by tim-hub (MIT).
- Numbered canon-order vault support contributed by [@cansas](https://github.com/cansas) ([#2](https://github.com/overmoro/preach-md/pull/2)).

---

## Known limitations

For the best experience, open Preach MD in a non-stacked tab. When tabs are stacked, the back-pill in the editor view and the auto-fading bottom buttons may sit in awkward positions, and the full preach surface gets squeezed into a panel.

---

## Privacy and network use

Preach MD makes one kind of network request, and only when you ask for it.

- **Offline Bible download (optional).** If you tap **Download** under Settings, Scripture, Offline Bible, the plugin downloads the Berean Standard Bible (a public domain translation, about 4.3 MB) once from `bereanbible.com`, the translation's publisher. It's needed so references can expand when your vault has no Bible files of its own. It's checked to be complete and to contain only plain text before it's saved, it's stored in the plugin's own folder (not among your notes), and it's deleted if you remove it or uninstall the plugin. Nothing about you or your vault is sent.
- Nothing else uses the network. Sermon content stays in your vault, and there's no analytics or telemetry.
- The plugin uses the browser **Wake Lock API** to keep your iPad's screen from sleeping during preach mode. That's a local device API, not a network call.

Code reviewers: the only network call is `requestUrl` in `downloadBible` in `src/scripture.ts`, run from the settings button. The `nav.wakeLock.request("screen")` call in `src/preach-view.ts` is the Wake Lock API, not a network request.


---

## License

MIT
