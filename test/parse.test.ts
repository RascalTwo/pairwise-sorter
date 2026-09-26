import { describe, expect, it } from "bun:test";
import { fromJSON, idOf, idParts, isAudio, isMedia, isVideo, item, parseItems, parseLine, toText } from "../src/index.ts";

describe("parseLine", () => {
  it("should read a plain line as a title", () => {
    // GIVEN a line of plain text
    // WHEN it is parsed
    // THEN it is an item with only a title
    expect(parseLine("Cold brew")).toEqual(item("Cold brew"));
  });

  it("should read a markdown link as a titled link, keeping trailing pipe fields", () => {
    // GIVEN a markdown link followed by a description field
    const line = "[Flat white](https://ex.com/fw) | smooth";
    // WHEN it is parsed
    const it = parseLine(line);
    // THEN the title and link come from the markdown
    expect(it.title).toBe("Flat white");
    expect(it.url).toBe("https://ex.com/fw");
    // THEN the rest is the description
    expect(it.desc).toBe("smooth");
  });

  it("should match pipe fields by content, not position", () => {
    // GIVEN a card whose fields are out of the usual order
    const line = "https://ex.com/x.jpg | Sony WH | https://ex.com/p | #audio #travel | Noise cancelling | https://ex.com/2 | Quiet";
    // WHEN it is parsed
    const it = parseLine(line);
    // THEN the first media-less URL is the link
    expect(it.url).toBe("https://ex.com/p");
    // THEN media-extension URLs and every later URL are media, in order
    expect(it.media).toEqual(["https://ex.com/x.jpg", "https://ex.com/2"]);
    // THEN the first text is the title and the rest joins into the description
    expect(it.title).toBe("Sony WH");
    expect(it.desc).toBe("Noise cancelling — Quiet");
    // THEN the all-# field is tags
    expect(it.tags).toEqual(["audio", "travel"]);
  });

  it("should keep a title that merely contains a # token", () => {
    // GIVEN a title with a # inside it
    // WHEN it is parsed
    // THEN it stays a title with no tags
    expect(parseLine("Half-Life #2 remastered")).toEqual(item("Half-Life #2 remastered"));
  });

  it("should title a URL-only line by its link, or by its media when it has no link", () => {
    // GIVEN lines with no text at all
    // WHEN they are parsed
    // THEN the link or first media becomes the title
    expect(parseLine("https://ex.com/p").title).toBe("https://ex.com/p");
    expect(parseLine("https://ex.com/a.png").title).toBe("https://ex.com/a.png");
    // THEN a tags-only line titles itself with its raw text
    expect(parseLine("#a #b").title).toBe("#a #b");
  });
});

describe("parseItems", () => {
  it("should read one item per non-blank line", () => {
    // GIVEN text with blank lines and padding
    // WHEN it is parsed
    // THEN each remaining line is an item
    expect(parseItems("  a \n\n b\n").map((i) => i.title)).toEqual(["a", "b"]);
  });

  it("should read a JSON array, accepting field aliases and bare strings", () => {
    // GIVEN a JSON array using alias field names
    const raw = JSON.stringify([
      "plain",
      { name: "N", link: "L", images: "i.png", description: "D", tag: "open world" },
      { label: "Lb", href: "H", img: ["1.png", "2.png"], subtitle: "S", labels: ["x"] },
      { image: "m.png", categories: ["c"] },
      { thumbnail: "t.png", category: "k" },
    ]);
    // WHEN it is parsed
    const out = parseItems(raw);
    // THEN each alias lands in its field
    expect(out[0]).toEqual(item("plain"));
    expect(out[1]).toEqual(item("N", "L", ["i.png"], "D", ["open-world"]));
    expect(out[2]).toEqual(item("Lb", "H", ["1.png", "2.png"], "S", ["x"]));
    expect(out[3]).toEqual(item("", "", ["m.png"], "", ["c"]));
    expect(out[4]).toEqual(item("", "", ["t.png"], "", ["k"]));
  });

  it("should take the items out of a whole pasted export, or a single JSON object", () => {
    // GIVEN an export object and a lone item object
    // WHEN each is parsed
    // THEN the export yields its items, and the lone object yields one item
    expect(parseItems(JSON.stringify({ items: [{ title: "a" }, { title: "b" }] })).map((i) => i.title)).toEqual(["a", "b"]);
    expect(parseItems('{"title":"solo"}').map((i) => i.title)).toEqual(["solo"]);
  });

  it("should fall back to lines when text only looks like JSON", () => {
    // GIVEN a bracketed line that is not JSON
    // WHEN it is parsed
    // THEN it is read as a line
    expect(parseItems("[not json").map((i) => i.title)).toEqual(["[not json"]);
  });
});

describe("toText", () => {
  it("should write items back in the syntax parseItems reads", () => {
    // GIVEN a full item and a plain one
    const list = [item("T", "https://ex.com/p", ["https://ex.com/a.png"], "D", ["x", "y"]), item("plain")];
    // WHEN written out and parsed again
    const text = toText(list);
    // THEN the text uses pipes and #tags
    expect(text).toBe("T | https://ex.com/p | https://ex.com/a.png | #x #y | D\nplain");
    // THEN it round-trips
    expect(parseItems(text)).toEqual(list);
  });
});

describe("item", () => {
  it("should normalise tags to unique hyphenated ids and keep an explicit key", () => {
    // GIVEN messy tags and a key
    const it = item("t", "", "", "", ["#open  world", "open world", "", "b"], "k1");
    // WHEN the item is built
    // THEN tags are unique identifiers
    expect(it.tags).toEqual(["open-world", "b"]);
    // THEN the key is identity
    expect(idOf(it)).toBe("k1");
    // THEN empty media drops out
    expect(it.media).toEqual([]);
  });

  it("should treat nullish fields as empty, and split a default id back into its parts", () => {
    // GIVEN an item built from nulls
    const it = item(null, null, null, null, null);
    // WHEN its id is taken apart
    // THEN title and url are empty strings
    expect(idParts(idOf(it))).toEqual({ title: "", url: "" });
    expect(idParts(idOf(item("t", "u")))).toEqual({ title: "t", url: "u" });
    expect(idParts("bare")).toEqual({ title: "bare", url: "" });
    // THEN a missing item has the empty id
    expect(idOf(undefined)).toBe(idOf(item("")));
  });
});

describe("fromJSON", () => {
  it("should accept a string or an object, and ignore anything else", () => {
    // GIVEN mixed values
    // WHEN each is converted
    // THEN strings and objects become items and junk becomes nothing
    expect(fromJSON("s")).toEqual(item("s"));
    expect(fromJSON({ title: "o" })).toEqual(item("o"));
    expect(fromJSON(42)).toBeNull();
    expect(fromJSON(null)).toBeNull();
  });
});

describe("media kinds", () => {
  it("should recognise image, audio and video URLs by extension, ignoring query and hash", () => {
    // GIVEN URLs of each kind
    // WHEN they are classified
    // THEN extensions decide, with query strings allowed
    expect(isMedia("https://x/a.JPG?w=2")).toBe(true);
    expect(isMedia("https://x/page")).toBe(false);
    expect(isVideo("https://x/v.webm#t=3")).toBe(true);
    expect(isVideo("https://x/a.gif")).toBe(false);
    expect(isAudio("https://x/voice.mp3")).toBe(true);
    expect(isMedia("https://x/voice.m4a")).toBe(true);
  });
});
