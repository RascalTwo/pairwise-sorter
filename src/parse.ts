// Several ways to type an item — plain lines, markdown links, pipe-separated fields,
// #tags, or JSON — all landing on the one model in item.ts.

import { item, type Item } from "./item.ts";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)([?#]|$)/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)([?#]|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)([?#]|$)/i;

export const isVideo = (url: string): boolean => VIDEO_EXT.test(url);
export const isAudio = (url: string): boolean => AUDIO_EXT.test(url);
/** A URL whose extension says it is an image, video or audio file. */
export const isMedia = (url: string): boolean => IMAGE_EXT.test(url) || isVideo(url) || isAudio(url);

type Loose = Record<string, unknown>;
// NOT `label` — that is a title alias, and a title is not a tag.
const tagsOf = (o: Loose) => o.tags ?? o.tag ?? o.labels ?? o.categories ?? o.category ?? [];

/** One JSON value as an item, accepting common field aliases. Anything else is null. */
export function fromJSON(o: unknown): Item | null {
  if (typeof o === "string") return item(o);
  if (!o || typeof o !== "object") return null;
  const r = o as Loose;
  return item(
    r.title ?? r.name ?? r.label ?? "",
    r.url ?? r.link ?? r.href ?? "",
    r.media ?? r.images ?? r.img ?? r.image ?? r.thumbnail ?? [],
    r.desc ?? r.description ?? r.subtitle ?? "",
    tagsOf(r),
    r.key ?? "",
  );
}

const TAG_FIELD = /^#\S/;

/**
 * One line of text as an item. Pipe fields are matched by CONTENT, not order: a media URL is
 * always media, the first other URL is the link, every later URL is media too, a field of
 * nothing but #-tokens is the tags, the first text is the title and the rest the description.
 */
export function parseLine(line: string): Item {
  // [Title](url) rest… → normalise into pipe fields, then fall through.
  const md = line.match(/^\[(.+?)\]\((\S+?)\)\s*\|?\s*(.*)$/);
  const src = md ? [md[1], md[2], md[3]].filter(Boolean).join(" | ") : line;

  let url = "";
  const media: string[] = [], text: string[] = [], tags: string[] = [];
  for (const f of src.split("|").map((s) => s.trim()).filter(Boolean)) {
    // EVERY token must start with # — keeps "Half-Life #2 remastered" a title.
    if (TAG_FIELD.test(f) && f.split(/\s+/).every((t) => t.startsWith("#"))) tags.push(...f.split(/\s+/));
    else if (!/^https?:\/\//i.test(f)) text.push(f);
    else if (isMedia(f)) media.push(f);
    else if (!url) url = f;
    else media.push(f);
  }
  return item(text[0] || url || media[0] || src, url, media, text.slice(1).join(" — "), tags);
}

/** Text or JSON as items. A pasted whole export yields its `items`. */
export function parseItems(raw: string): Item[] {
  const t = raw.trim();
  if (t.startsWith("[") || t.startsWith("{")) {
    try {
      let parsed = JSON.parse(t);
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.items)) parsed = parsed.items;
      return (Array.isArray(parsed) ? parsed : [parsed]).map(fromJSON).filter((x): x is Item => !!x);
    } catch { /* not JSON after all — read it as lines */ }
  }
  return t.split("\n").map((l) => l.trim()).filter(Boolean).map(parseLine);
}

/** Items back into the line syntax, so output can be pasted back in as input. */
export const toText = (list: readonly Item[]): string =>
  list.map((i) => [i.title, i.url, ...i.media, i.tags.map((t) => "#" + t).join(" "), i.desc].filter(Boolean).join(" | ")).join("\n");
