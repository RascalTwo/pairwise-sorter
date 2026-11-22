import type { Sorter } from "../sorter.ts";
/**
 * The theme. Every colour is a custom property, so a host re-skins everything with one rule:
 * `pairwise-sorter { --pw-accent: hotpink }`. Custom properties inherit through shadow roots.
 */
export declare const theme: CSSStyleSheet;
/** Escape text for HTML — attribute-safe too. */
export declare const esc: (s: unknown) => string;
export declare abstract class PairwiseElement extends HTMLElement {
    #private;
    readonly root: ShadowRoot;
    constructor();
    /** The Sorter this element shows and drives. Several elements may share one. */
    get sorter(): Sorter | null;
    set sorter(s: Sorter | null);
    connectedCallback(): void;
    /** This element's own stylesheets, after the shared theme. */
    protected abstract styles(): CSSStyleSheet[];
    /** Subscribe to further sorter events; removed automatically when the sorter changes. */
    protected listen(_s: Sorter, _signal: AbortSignal): void;
    /** Draw from the current sorter state. */
    abstract render(): void;
    /** Fire a composed event a host can listen for on this element. */
    protected fire(type: string, detail?: unknown): void;
}
/** A stylesheet from CSS text. */
export declare const css: (text: string) => CSSStyleSheet;
