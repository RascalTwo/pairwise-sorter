// Media, shared by every element that shows items: images, video and audio markup, chips,
// preloading, and a lightbox for looking closer without casting a vote.

import type { Item } from "../item.ts";
import { isAudio, isVideo } from "../parse.ts";
import { css, esc } from "./base.ts";

export const mediaStyle = css(`
  img, video { max-width: 100%; border-radius: 6px; object-fit: contain; }
  img { cursor: zoom-in; }
  audio { width: 100%; }
  .lightbox { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
              background: rgba(0,0,0,.88); padding: 64px; }
  .lightbox[hidden] { display: none; }
  .lightbox img { width: 100%; height: 100%; object-fit: contain; cursor: default; }
  .lightbox .close { position: absolute; top: 18px; right: 22px; }
  .lightbox .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 46px; height: 72px; font-size: 22px; }
  .lightbox .prev { left: 14px; }
  .lightbox .next { right: 14px; }
  .lightbox .count { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); color: var(--pw-muted); font-size: 13px; }
`);

/** One media URL as markup. Unknown extensions render as images: image CDNs often omit them. */
export const mediaHTML = (m: string): string =>
  isVideo(m) ? `<video src="${esc(m)}" controls loop muted playsinline preload="metadata"></video>`
  : isAudio(m) ? `<audio src="${esc(m)}" controls preload="metadata"></audio>`
  : `<img src="${esc(m)}" alt="">`;

/** An item's images — what a lightbox can step through. */
export const imagesOf = (it: Item): string[] => it.media.filter((m) => !isVideo(m) && !isAudio(m));

/** A tag chip; a tiered tag carries its tier number. */
export const tagChip = (t: string, priority: readonly string[]): string => {
  const tier = priority.indexOf(t);
  return tier >= 0
    ? `<span class="tag on" title="Tier ${tier + 1}"><b>${tier + 1}</b>#${esc(t)}</span>`
    : `<span class="tag">#${esc(t)}</span>`;
};

const preloaded = new Set<string>();
/** Warm the images of items about to be shown. Never video or audio: far more bytes than the glance saves. */
export function preload(items: readonly Item[], idxs: readonly number[]): void {
  for (const i of idxs) for (const m of imagesOf(items[i]!)) {
    if (preloaded.has(m)) continue;
    preloaded.add(m);
    new Image().src = m;
  }
}

/** A full-screen gallery inside a shadow root. While open it owns ←, → and Escape. */
export class Lightbox {
  static readonly html = `<div part="lightbox" class="lightbox" hidden role="dialog" aria-modal="true" aria-label="Enlarged image">
    <button class="close" aria-label="Close enlarged image">✕</button>
    <button class="nav prev" data-step="-1" aria-label="Previous image">‹</button>
    <img alt="">
    <button class="nav next" data-step="1" aria-label="Next image">›</button>
    <span class="count"></span></div>`;
  readonly el: HTMLElement;
  #pool: string[] = [];
  #at = 0;

  constructor(root: ParentNode) {
    this.el = root.querySelector("[part=lightbox]")!;
    this.el.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el || t.matches(".close")) this.close();
      else if (t.dataset.step) this.step(Number(t.dataset.step));
    };
  }

  get isOpen(): boolean { return !this.el.hidden; }

  show(src: string, pool: string[]): void {
    this.#pool = pool.length ? pool : [src];
    this.#at = Math.max(0, this.#pool.indexOf(src));
    this.el.hidden = false;
    this.#draw();
    this.el.querySelector<HTMLElement>(".close")!.focus();
  }

  close(): void {
    this.el.hidden = true;
    this.el.querySelector("img")!.removeAttribute("src");
  }

  step(d: number): void {
    if (this.#pool.length < 2) return;
    this.#at = (this.#at + d + this.#pool.length) % this.#pool.length;
    this.#draw();
  }

  /** Handle a key while open. */
  key(e: KeyboardEvent): void {
    const act = ({ Escape: () => this.close(), ArrowLeft: () => this.step(-1), ArrowRight: () => this.step(1) } as Record<string, () => void>)[e.key];
    if (act) { e.preventDefault(); act(); }
  }

  #draw(): void {
    const many = this.#pool.length > 1;
    this.el.querySelector("img")!.src = this.#pool[this.#at]!;
    this.el.querySelector(".count")!.textContent = many ? `${this.#at + 1} / ${this.#pool.length}` : "";
    for (const b of this.el.querySelectorAll<HTMLElement>("[data-step]")) b.hidden = !many;
  }
}
