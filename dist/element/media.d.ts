import type { Item } from "../item.ts";
export declare const mediaStyle: CSSStyleSheet;
/** One media URL as markup. Unknown extensions render as images: image CDNs often omit them. */
export declare const mediaHTML: (m: string) => string;
/** An item's images — what a lightbox can step through. */
export declare const imagesOf: (it: Item) => string[];
/** A tag chip; a tiered tag carries its tier number. */
export declare const tagChip: (t: string, priority: readonly string[]) => string;
/** Warm the images of items about to be shown. Never video or audio: far more bytes than the glance saves. */
export declare function preload(items: readonly Item[], idxs: readonly number[]): void;
/**
 * A full-screen gallery inside a shadow root. It takes focus when it opens, so its own ←, →
 * and Escape handling needs no page-wide listener; elements that do listen page-wide check
 * {@link Lightbox.isOpen} so those keys never vote.
 */
export declare class Lightbox {
    #private;
    static readonly html = "<div part=\"lightbox\" class=\"lightbox\" hidden tabindex=\"-1\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Enlarged image\">\n    <button class=\"close\" aria-label=\"Close enlarged image\">\u2715</button>\n    <button class=\"nav prev\" data-step=\"-1\" aria-label=\"Previous image\">\u2039</button>\n    <img alt=\"\">\n    <button class=\"nav next\" data-step=\"1\" aria-label=\"Next image\">\u203A</button>\n    <span class=\"count\"></span></div>";
    readonly el: HTMLElement;
    constructor(root: ParentNode);
    get isOpen(): boolean;
    show(src: string, pool: string[]): void;
    close(): void;
    step(d: number): void;
    key(e: KeyboardEvent): void;
}
