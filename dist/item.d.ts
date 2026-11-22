/** A rankable thing. */
export interface Item {
    title: string;
    /** Opaque link. A corpus with no real URL can pass something like `viz://<uid>`. */
    url: string;
    /** Image, audio or video URLs, in display order. */
    media: string[];
    desc: string;
    /** Never part of identity: retagging mid-sort must not cost an answer. */
    tags: string[];
    /** Pins identity when a title is editable (see {@link idOf}). */
    key?: string;
}
/** Separates the two ids inside a pair key. */
export declare const SEP = "\u0001";
/** Separates title from url inside a default id. */
export declare const SEP_ID = "\0";
/**
 * A tag is an identifier, so it cannot contain whitespace: the text form writes tags as
 * `#a #b`, and "open world" would round-trip back as description text. Hyphenating at
 * construction covers every entry path at once.
 */
export declare const tagOf: (t: unknown) => string;
/** Build an item, normalising media to a string list and tags to unique tag ids. */
export declare const item: (title: unknown, url?: unknown, media?: unknown, desc?: unknown, tags?: unknown, key?: unknown) => Item;
/**
 * Identity, never position. `key` when the host has a stable one; otherwise the historical
 * title + url, so reordering, editing a description or adding items keeps every answer.
 */
export declare const idOf: (it: Partial<Item> | null | undefined) => string;
/** The `{title, url}` a default id was built from. */
export declare const idParts: (id: string) => {
    title: string;
    url: string;
};
