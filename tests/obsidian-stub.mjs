// Minimal stand-in for the `obsidian` module, which only exists inside the app.
// The scripture module imports these for type positions and instanceof checks;
// none of the pure functions under test call into them.
export class App {}
export class Component {}
export class TFile {}
export const MarkdownRenderer = {};
