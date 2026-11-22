import { type Item } from "./item.ts";
export declare const isVideo: (url: string) => boolean;
export declare const isAudio: (url: string) => boolean;
/** A URL whose extension says it is an image, video or audio file. */
export declare const isMedia: (url: string) => boolean;
/** One JSON value as an item, accepting common field aliases. Anything else is null. */
export declare function fromJSON(o: unknown): Item | null;
/**
 * One line of text as an item. Pipe fields are matched by CONTENT, not order: a media URL is
 * always media, the first other URL is the link, every later URL is media too, a field of
 * nothing but #-tokens is the tags, the first text is the title and the rest the description.
 */
export declare function parseLine(line: string): Item;
/** Text or JSON as items. A pasted whole export yields its `items`. */
export declare function parseItems(raw: string): Item[];
/** Items back into the line syntax, so output can be pasted back in as input. */
export declare const toText: (list: readonly Item[]) => string;
