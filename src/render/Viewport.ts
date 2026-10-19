// Godot's `stretch/mode = canvas_items, aspect = expand` with a 720x1280 base: the logical canvas keeps the
// base size's scale and grows along whichever axis has room, so there is never any letterboxing.
//
//   scale  CSS pixels per logical unit  = min(winW / 720, winH / 1280)
//   w, h   logical canvas size          = window / scale
//   rs     texture pixels per logical unit = scale * devicePixelRatio (what offscreen canvases render at)

export const BASE_W = 720;
export const BASE_H = 1280;
const MAX_DPR = 3;

type Listener = () => void;

export class Viewport {
  static cssW = BASE_W;
  static cssH = BASE_H;
  static dpr = 1;
  static scale = 1;
  static w = BASE_W;
  static h = BASE_H;
  static rs = 1;

  private static listeners = new Set<Listener>();

  /** Re-read the window; returns true when anything that affects rendering changed. */
  static update(cssW = window.innerWidth, cssH = window.innerHeight, dpr = window.devicePixelRatio || 1): boolean {
    // A hidden or collapsed window reports 0: keep the last good size.
    if (!(cssW > 0 && cssH > 0)) return false;
    const d = Math.min(Math.max(dpr, 1), MAX_DPR);
    const scale = Math.min(cssW / BASE_W, cssH / BASE_H);
    const changed = cssW !== Viewport.cssW || cssH !== Viewport.cssH || d !== Viewport.dpr;
    Viewport.cssW = cssW;
    Viewport.cssH = cssH;
    Viewport.dpr = d;
    Viewport.scale = scale;
    Viewport.w = cssW / scale;
    Viewport.h = cssH / scale;
    Viewport.rs = scale * d;
    if (changed) for (const l of Viewport.listeners) l();
    return changed;
  }

  static onChange(l: Listener): () => void {
    Viewport.listeners.add(l);
    return () => Viewport.listeners.delete(l);
  }

  /** Short side / long side helpers the layout code asks for. */
  static get short(): number {
    return Math.min(Viewport.w, Viewport.h);
  }
}
