// Items: the one model — {title, url, media[], desc, tags[]} — and the ways to type it.
// Plain text is just the case where only `title` is set, so nothing downstream ever
// branches on "what kind of list is this".

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
export const SEP = "\u0001";
/** Separates title from url inside a default id. */
export const SEP_ID = "\u0000";

/**
 * A tag is an identifier, so it cannot contain whitespace: the text form writes tags as
 * `#a #b`, and "open world" would round-trip back as description text. Hyphenating at
 * construction covers every entry path at once.
 */
export const tagOf = (t: unknown): string => String(t).trim().replace(/^#/, "").replace(/\s+/g, "-");

/** Build an item, normalising media to a string list and tags to unique tag ids. */
export const item = (
  title: unknown, url: unknown = "", media: unknown = [], desc: unknown = "", tags: unknown = [], key: unknown = "",
): Item => ({
  title: String(title ?? ""),
  url: String(url ?? ""),
  media: [media].flat().filter(Boolean).map(String),
  desc: String(desc ?? ""),
  tags: [...new Set([tags].flat().filter(Boolean).map(tagOf).filter(Boolean))],
  ...(key ? { key: String(key) } : {}),
});

/**
 * Identity, never position. `key` when the host has a stable one; otherwise the historical
 * title + url, so reordering, editing a description or adding items keeps every answer.
 */
export const idOf = (it: Partial<Item> | null | undefined): string =>
  it?.key ? String(it.key) : (it?.title ?? "") + SEP_ID + (it?.url ?? "");

/** The `{title, url}` a default id was built from. */
export const idParts = (id: string): { title: string; url: string } => {
  const [title = "", url = ""] = id.split(SEP_ID);
  return { title, url };
};
