# Contributing

Thanks for taking an interest. Issues and pull requests are both welcome.

## Getting set up

```bash
git clone https://github.com/overmoro/preach-md.git
cd preach-md
npm install
```

To work against a real vault, clone into `<vault>/.obsidian/plugins/preach-md` and run `npm run dev`, which rebuilds on save. Reload Obsidian to pick up a rebuild. On iPad, the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin is the easiest way to sideload a build.

## Before you open a pull request

```bash
npm run build   # tsc --noEmit, then the production bundle
npm test        # node --test, no extra dependency
```

Both run in CI on every push and pull request, along with a check that the committed `main.js` matches a fresh build.

### `main.js` is committed on purpose

Obsidian loads `main.js`, not the TypeScript source, so the bundle is checked in. **Run `npm run build` and commit the result with your change.** A pull request whose `main.js` does not match its source will fail CI, because the shipped artifact is the thing users actually run.

## What tests are for here

`tests/scripture.test.mjs` deliberately restates the expected canon by hand rather than deriving it from `src/scripture.ts`. That is the point: a test that computed its expectations from the table under test would happily agree with any typo the table contained.

If you touch the book table, expect the suite to tell you exactly which book disagreed and how. If you add a book-related feature, add assertions that state the expected result independently rather than reading it back from the code.

## Style

- Match the surrounding code. Tabs, double quotes, semicolons.
- British spelling in comments and user-facing text.
- Comments should explain why something is the way it is, especially where the obvious approach was tried and rejected. Several of the odder-looking constructs in `src/scripture.ts` are guards against silent failures, and they say so.
- No em dashes.

## Reporting a bug

The failure mode worth flagging most clearly is a **silent** one: a scripture reference that does not expand, an outline that misses a section, a format tap that appears to do nothing. Those usually mean a lookup missed rather than an error being thrown, so please include:

- The exact reference or note text that misbehaved.
- Your Bible folder layout, since both a plain (`Matthew/Matt 3.md`) and a numbered canon-order (`40 - Matthew/Matt-03.md`) convention are supported.
- Obsidian version and platform (the plugin is built for iPad first).

## Licence

By contributing you agree that your contributions are licensed under the MIT Licence, the same as the rest of the project.
