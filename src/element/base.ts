// What every element shares: a `.sorter` property it re-renders from, one theme, and
// HTML escaping. Elements are driven by a Sorter from the core; they never own one.

import type { Sorter } from "../sorter.ts";

/**
 * The theme. Every colour is a custom property, so a host re-skins everything with one rule:
 * `pairwise-sorter { --pw-accent: hotpink }`. Custom properties inherit through shadow roots.
 */
export const theme = new CSSStyleSheet();
theme.replaceSync(`
  :host {
    --pw-bg: #0f1420; --pw-panel: #171e2e; --pw-text: #e6eaf2; --pw-muted: #8a95a8;
    --pw-border: #2a3448; --pw-accent: #6aa8ff; --pw-warn: #e0b04a; --pw-danger: #e06a6a;
    --pw-radius: 8px;
    display: block; color: var(--pw-text); font: inherit;
  }
  :host([hidden]) { display: none; }
  [hidden] { display: none !important; }
  button { background: var(--pw-panel); color: var(--pw-text); border: 1px solid var(--pw-border);
           border-radius: var(--pw-radius); padding: 6px 12px; font: inherit; font-size: 14px; cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--pw-accent); }
  button:disabled { opacity: .4; cursor: default; }
  button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--pw-accent); outline-offset: 2px; }
  input, select, textarea { background: var(--pw-panel); color: var(--pw-text); border: 1px solid var(--pw-border);
           border-radius: var(--pw-radius); padding: 6px 9px; font: inherit; font-size: 14px; }
  a { color: var(--pw-accent); }
  .muted { color: var(--pw-muted); font-size: 13px; }
  .tag { display: inline-flex; gap: 4px; padding: 1px 8px; border: 1px solid var(--pw-border); border-radius: 999px;
         font-size: 12px; color: var(--pw-muted); background: var(--pw-panel); white-space: nowrap; }
  .tag.on { border-color: var(--pw-accent); color: var(--pw-accent); }
  .banner { background: var(--pw-panel); border: 1px solid var(--pw-warn); border-left-width: 3px;
            border-radius: var(--pw-radius); padding: 10px 14px; font-size: 13px; margin: 8px 0; }
  .banner.info { border-color: var(--pw-accent); }
  .banner button { padding: 3px 10px; font-size: 12px; margin-left: 10px; }
`);

/** Escape text for HTML — attribute-safe too. */
export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export abstract class PairwiseElement extends HTMLElement {
  readonly root = this.attachShadow({ mode: "open" });
  #sorter: Sorter | null = null;
  #listening: AbortController | null = null;

  constructor() {
    super();
    this.root.adoptedStyleSheets = [theme, ...this.styles()];
  }

  /** The Sorter this element shows and drives. Several elements may share one. */
  get sorter(): Sorter | null { return this.#sorter; }
  set sorter(s: Sorter | null) {
    this.#listening?.abort();
    this.#sorter = s;
    if (s) {
      this.#listening = new AbortController();
      const signal = this.#listening.signal;
      for (const type of ["question", "change", "done"]) s.addEventListener(type, () => this.render(), { signal });
      this.listen(s, signal);
    }
    this.render();
  }

  connectedCallback(): void { this.render(); }

  /** This element's own stylesheets, after the shared theme. */
  protected abstract styles(): CSSStyleSheet[];
  /** Subscribe to further sorter events; removed automatically when the sorter changes. */
  protected listen(_s: Sorter, _signal: AbortSignal): void {}
  /** Draw from the current sorter state. */
  abstract render(): void;

  /** Fire a composed event a host can listen for on this element. */
  protected fire(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

/** A stylesheet from CSS text. */
export const css = (text: string): CSSStyleSheet => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
};
