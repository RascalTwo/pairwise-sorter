// Media, shared by every element that shows items: images, video and audio markup, chips,
// preloading, and a lightbox for looking closer without casting a vote.
import { isAudio, isVideo } from "../parse.js";
import { css, esc } from "./base.js";
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
export const mediaHTML = (m) => isVideo(m) ? `<video src="${esc(m)}" controls loop muted playsinline preload="metadata"></video>`
    : isAudio(m) ? `<audio src="${esc(m)}" controls preload="metadata"></audio>`
        : `<img src="${esc(m)}" alt="">`;
/** An item's images — what a lightbox can step through. */
export const imagesOf = (it) => it.media.filter((m) => !isVideo(m) && !isAudio(m));
/** A tag chip; a tiered tag carries its tier number. */
export const tagChip = (t, priority) => {
    const tier = priority.indexOf(t);
    return tier >= 0
        ? `<span class="tag on" title="Tier ${tier + 1}"><b>${tier + 1}</b>#${esc(t)}</span>`
        : `<span class="tag">#${esc(t)}</span>`;
};
const preloaded = new Set();
/** Warm the images of items about to be shown. Never video or audio: far more bytes than the glance saves. */
export function preload(items, idxs) {
    for (const i of idxs)
        for (const m of imagesOf(items[i])) {
            if (preloaded.has(m))
                continue;
            preloaded.add(m);
            new Image().src = m;
        }
}
/**
 * A full-screen gallery inside a shadow root. It takes focus when it opens, so its own ←, →
 * and Escape handling needs no page-wide listener; elements that do listen page-wide check
 * {@link Lightbox.isOpen} so those keys never vote.
 */
export class Lightbox {
    static html = `<div part="lightbox" class="lightbox" hidden tabindex="-1" role="dialog" aria-modal="true" aria-label="Enlarged image">
    <button class="close" aria-label="Close enlarged image">✕</button>
    <button class="nav prev" data-step="-1" aria-label="Previous image">‹</button>
    <img alt="">
    <button class="nav next" data-step="1" aria-label="Next image">›</button>
    <span class="count"></span></div>`;
    el;
    #pool = [];
    #at = 0;
    constructor(root) {
        this.el = root.querySelector("[part=lightbox]");
        this.el.onclick = (e) => {
            const t = e.target;
            if (t === this.el || t.matches(".close"))
                this.close();
            else if (t.dataset.step)
                this.step(Number(t.dataset.step));
        };
        this.el.onkeydown = (e) => this.key(e);
    }
    get isOpen() { return !this.el.hidden; }
    show(src, pool) {
        this.#pool = pool.length ? pool : [src];
        this.#at = Math.max(0, this.#pool.indexOf(src));
        this.el.hidden = false;
        this.#draw();
        this.el.querySelector(".close").focus();
    }
    close() {
        this.el.hidden = true;
        this.el.querySelector("img").removeAttribute("src");
    }
    step(d) {
        if (this.#pool.length < 2)
            return;
        this.#at = (this.#at + d + this.#pool.length) % this.#pool.length;
        this.#draw();
    }
    key(e) {
        const act = { Escape: () => this.close(), ArrowLeft: () => this.step(-1), ArrowRight: () => this.step(1) }[e.key];
        if (act) {
            e.preventDefault();
            act();
        }
    }
    #draw() {
        const many = this.#pool.length > 1;
        this.el.querySelector("img").src = this.#pool[this.#at];
        this.el.querySelector(".count").textContent = many ? `${this.#at + 1} / ${this.#pool.length}` : "";
        for (const b of this.el.querySelectorAll("[data-step]"))
            b.hidden = !many;
    }
}
//# sourceMappingURL=media.js.map