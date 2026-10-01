"""Build star targets for the compact Abu Dhabi skyline.

Buildings come from the labelled vector guide (tmp-skyline/compact/parts,
rendered by compact/render.cjs). Landmarks sit in the middle at a fraction
of the outline skyline's height; generic buildings taper off toward both
edges. Each building is traced along its own silhouette, minus whatever a
nearer building hides, so overlapping towers stay legible. Every dot keeps
the index of its building so the runtime can raise buildings one by one.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from build_skyline import H, TMP, W, WATER

PARTS = TMP / "compact" / "parts"
OUT = Path(r"C:\Users\islam\DuneAgent\src\scene\skylineCompact.ts")
# Plate px per SVG unit; the tallest landmark ends up ~95 plate px tall,
# about a third of the outline skyline.
S = 0.19
# Supersampling of the building masks while tracing.
K = 4
GROUND = 530
# Dot radius in plate px is R0 + R1 * b**RK; smaller than the outline's so
# small buildings keep their shape.
R0, R1, RK = 0.3, 0.95, 1.8
GAP_MIN, GAP_JITTER = 0.4, 0.7
BASE = 255
# Interior detail: tone edges in the drawing stronger than this, kept at
# least DETAIL_INSET plate px inside the silhouette, packed sparser and
# with smaller dots than the outline. Detail dots set DETAIL_BIT on their
# building index.
DETAIL_EDGE = 0.07
DETAIL_INSET = 1.0
DETAIL_GAP = 1.1
DETAIL_SIZE = 0.55
DETAIL_BIT = 128

# (part, centre x in plate px, layer 0 back … 2 front, scale, mirrored)
CORE = [
    ("adnoc-headquarters", 451, 0, 1.0, False),
    ("wtc-residential", 566, 0, 1.0, False),
    ("wtc-offices", 583, 0, 1.0, False),
    ("rounded-top-tower", 374, 0, 1.0, False),
    ("slender-tower", 655, 0, 1.0, False),
    ("angular-tower-left", 670, 0, 1.0, False),
    ("angular-tower-right", 686, 0, 1.0, False),
    ("al-bahar-left", 418, 1, 1.0, False),
    ("al-bahar-right", 434, 1, 1.0, False),
    ("slanted-glass", 330, 1, 1.0, False),
    ("gate-tower-1", 607, 1, 1.0, False),
    ("gate-tower-2", 622, 1, 1.0, False),
    ("gate-tower-3", 638, 1, 1.0, False),
    ("sheikh-zayed-grand-mosque", 512, 2, 1.32, False),
    ("aldar-headquarters", 394, 2, 1.0, False),
    ("capital-gate", 351, 2, 1.0, False),
    ("sheikh-zayed-bridge", 659, 2, 1.0, False),
]
# Line-art parts traced along their stroke centre instead of both stroke edges.
THIN = {"sheikh-zayed-bridge": 3}
FILLERS = [
    "background-01", "background-02", "background-03", "background-04",
    "background-05", "background-06", "gate-tower-1", "gate-tower-2",
    "gate-tower-3", "angular-tower-left", "angular-tower-right",
    "slender-tower", "slanted-glass", "rounded-top-tower", "small-minaret",
]


def radius(b: float) -> float:
    return R0 + R1 * b**RK


def load_part(name: str) -> tuple[np.ndarray, np.ndarray]:
    """Alpha of a part, and where its drawing changes tone inside the silhouette (strokes, panels, windows)."""
    rgba = np.asarray(Image.open(PARTS / f"{name}.png")).astype(np.float32) / 255
    a = rgba[..., 3]
    ys, xs = np.nonzero(a > 0.03)
    crop = (slice(ys.min(), GROUND + 1), slice(xs.min(), xs.max() + 1))
    a = a[crop]
    rgb = rgba[..., :3][crop]
    lum = 1 - a * (1 - rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32))
    g = np.zeros_like(lum)
    g[:, 1:] = np.maximum(g[:, 1:], np.abs(lum[:, 1:] - lum[:, :-1]))
    g[1:, :] = np.maximum(g[1:, :], np.abs(lum[1:, :] - lum[:-1, :]))
    return a, (g > DETAIL_EDGE) & (a > 0.5)


def edge_fill(rng: np.random.Generator, parts: dict[str, np.ndarray]):
    """Generic buildings walking outward from the landmarks, shrinking toward the edges."""
    out = []
    for side, start, stop in ((-1, 320, 128), (1, 720, 900)):
        x = start
        span = abs(stop - start)
        while (x - stop) * side < 0:
            d = abs(x - start) / span
            name = FILLERS[int(rng.integers(len(FILLERS)))]
            if name == "small-minaret" and rng.random() < 0.6:
                continue
            p = parts[name][0]
            # Taller fillers shrink harder so the profile slopes down to the line.
            hgt = p.shape[0] * S
            scale = (0.95 - 0.62 * d) * rng.uniform(0.78, 1.08) * min(1.0, 46 / hgt) ** 0.6
            w = p.shape[1] * S * scale
            cx = x + side * w / 2
            out.append((name, float(cx), int(rng.integers(0, 2)), float(scale), bool(rng.random() < 0.5)))
            x += side * w * rng.uniform(0.45, 0.95) + side * rng.uniform(-0.5, 2.5)
    return out


def masks(placements, parts):
    built = []
    for name, cx, layer, scale, mirror in placements:
        p, tone = parts[name]
        f = S * scale * K
        w, h = max(2, round(p.shape[1] * f)), max(2, round(p.shape[0] * f))
        img = Image.fromarray((p * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)
        det = Image.fromarray((tone * 255).astype(np.uint8)).resize((w, h), Image.BOX)
        if mirror:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
            det = det.transpose(Image.FLIP_LEFT_RIGHT)
        m = np.asarray(img) > 90
        inner = m
        for _ in range(round(DETAIL_INSET * K)):
            inner = erode(inner)
        detail = (np.asarray(det) > 30) & inner
        x0 = round(cx * K - w / 2)
        y0 = round(WATER * K) - h
        built.append((m, x0, y0, layer, THIN.get(name, 0), detail))
    return built


def erode(m: np.ndarray) -> np.ndarray:
    p = np.pad(m, 1)
    return m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]


def boundary(m: np.ndarray, thin: int = 0) -> np.ndarray:
    for _ in range(thin):
        m = erode(m)
    return m & ~erode(m)


def trace(built):
    """Visible silhouette pixels of every building, front to back, in plate px."""
    order = sorted(range(len(built)), key=lambda i: (built[i][3], i))
    top = min(b[2] for b in built) - 2
    cover = np.zeros((round(WATER * K) - top + 2, W * K + 8), dtype=bool)
    pts = []
    for i in reversed(order):
        m, x0, y0, layer, thin, detail = built[i]
        h, w = m.shape
        region = cover[y0 - top : y0 - top + h, x0 : x0 + w]
        for kind, px in ((0, boundary(m, thin)), (1, detail & ~boundary(m, thin))):
            ys, xs = np.nonzero(px & ~region)
            py = (y0 + ys + 0.5) / K
            keep = py < WATER - 0.6
            n = int(keep.sum())
            pts.append(((xs[keep] + x0 + 0.5) / K, py[keep], np.full(n, i), np.full(n, layer), np.full(n, kind)))
        region |= m
    return [np.concatenate([p[k] for p in pts]) for k in range(5)]


class Packer:
    """Variable-radius Poisson acceptance: dots never closer than their radii plus a jittered gap."""

    def __init__(self, rng):
        self.rng = rng
        self.cell = 2 * radius(1) + GAP_MIN + GAP_JITTER
        self.grid: dict[tuple[int, int], list[int]] = {}
        self.x: list[float] = []
        self.y: list[float] = []
        self.b: list[float] = []
        self.id: list[int] = []

    def offer(self, x, y, bid, size=1.0, extra=0.0):
        b = float(self.rng.random()) * size
        r = radius(b)
        gap = GAP_MIN + GAP_JITTER * float(self.rng.random()) + extra
        cx, cy = int(x // self.cell), int(y // self.cell)
        for gx in (cx - 1, cx, cx + 1):
            for gy in (cy - 1, cy, cy + 1):
                for j in self.grid.get((gx, gy), ()):
                    if (self.x[j] - x) ** 2 + (self.y[j] - y) ** 2 < (r + radius(self.b[j]) + gap) ** 2:
                        return
        self.grid.setdefault((cx, cy), []).append(len(self.x))
        self.x.append(x)
        self.y.append(y)
        self.b.append(b)
        self.id.append(bid)


def van_der_corput(n: int) -> np.ndarray:
    v = np.zeros(n)
    for i in range(n):
        f, k, r = 0.5, i, 0.0
        while k:
            r += f * (k & 1)
            k >>= 1
            f *= 0.5
        v[i] = r
    return v


def pack(xs, ys, b, ids) -> str:
    raw = bytearray()
    for x, y, v, i in zip(xs, ys, b, ids):
        nx = int(round(float(x) / W * 65535))
        ny = int(round(float(y) / H * 65535))
        raw += bytes([nx >> 8, nx & 255, ny >> 8, ny & 255, int(round(float(v) * 255)), int(i)])
    enc = base64.b64encode(bytes(raw)).decode("ascii")
    return "[\n" + ",\n".join(f"  '{enc[i:i + 120]}'" for i in range(0, len(enc), 120)) + ",\n].join('')"


def main():
    rng = np.random.default_rng(23)
    names = {p[0] for p in CORE} | set(FILLERS)
    parts = {n: load_part(n) for n in names}
    placements = CORE + edge_fill(rng, parts)
    built = masks(placements, parts)
    xs, ys, ids, layers, kinds = trace(built)

    packer = Packer(rng)
    for layer in (2, 1, 0):
        sel = np.nonzero((layers == layer) & (kinds == 0))[0]
        for k in rng.permutation(sel):
            packer.offer(float(xs[k]), float(ys[k]), int(ids[k]))
    n_outline = len(packer.x)
    for layer in (2, 1, 0):
        sel = np.nonzero((layers == layer) & (kinds == 1))[0]
        for k in rng.permutation(sel):
            packer.offer(float(xs[k]), float(ys[k]), int(ids[k]) | DETAIL_BIT, DETAIL_SIZE, DETAIL_GAP)
    n_build = len(packer.x)
    print("outline dots", n_outline, "detail dots", n_build - n_outline)
    left = min(b[1] for b in built) / K
    right = max(b[1] + b[0].shape[1] for b in built) / K
    for x in np.arange(left, right, 0.25):
        packer.offer(float(x), WATER, BASE)

    px, py, pb, pid = map(np.array, (packer.x, packer.y, packer.b, packer.id))
    n = len(px)
    order = np.argsort(van_der_corput(n), kind="stable")
    print("buildings", len(placements), "dots", n, "on buildings", n_build, "span", round(left, 1), round(right, 1))

    centre = W / 2
    reach = max(abs(cx - centre) for _, cx, *_ in placements)
    cxs = [cx / W for _, cx, *_ in placements]
    delay = [min(1.0, abs(cx - centre) / reach) for _, cx, *_ in placements]
    depth = [p[2] for p in placements]

    scale = 3
    y_top = int(min(py)) - 6
    span = int(WATER) - y_top
    img = Image.new("RGB", (W * scale, (2 * span + 4) * scale), (8, 10, 18))
    dr = ImageDraw.Draw(img)
    for i in order:
        bb = float(pb[i])
        rad = scale * radius(bb)
        bid = int(pid[i])
        lay = 2 if bid == BASE else depth[bid & ~DETAIL_BIT]
        c = (110 + 145 * bb) * (0.7 + 0.15 * lay) * (0.75 if bid != BASE and bid & DETAIL_BIT else 1)
        x, y = px[i] * scale, (py[i] - y_top) * scale
        dr.ellipse((x - rad, y - rad, x + rad, y + rad), fill=(int(c), int(c), min(255, int(c) + 8)))
        # Preview of the runtime reflection: mirrored, squashed and fading with depth.
        d = (WATER - py[i]) * 0.85
        fade = max(0.0, 1 - d / 70) * 0.45
        if bid != BASE and fade > 0.03:
            ry = (WATER + d - y_top) * scale
            rc = int(c * fade)
            dr.ellipse((x - rad, ry - rad, x + rad, ry + rad), fill=(rc, rc, min(255, rc + 8)))
    img.save(TMP / "compact-preview.png")

    if "--write" in sys.argv:
        o = order
        fmt = lambda vals: ", ".join(f"{v:.4f}" if isinstance(v, float) else str(v) for v in vals)
        text = f"""// Star targets for the compact Abu Dhabi skyline: small, overlapping
// landmarks in the middle, generic towers tapering toward the edges. Each
// building is traced along its own silhouette minus what nearer ones hide,
// plus sparser interior detail from the drawing's panels and strokes.
// Same plate frame as skylineGrains.ts. Records are uint16 x, uint16 y, a
// uint8 random size and the uint8 building index ({BASE} = waterline,
// +{DETAIL_BIT} = interior detail), ordered so any prefix spans the whole skyline.
// Generated by tmp-skyline/build_compact.py.

import type {{ SkylineGrains }} from './skylineGrains'

/** Plate x where the skyline meets the waterline on the left and right. */
export const COMPACT_LEFT = {left / W:.6f}
export const COMPACT_RIGHT = {right / W:.6f}
export const COMPACT_BASE = {BASE}
export const COMPACT_DETAIL_BIT = {DETAIL_BIT}
/** Height of the tallest building above the waterline, as a share of the plate height. */
export const COMPACT_TOP = {(WATER - float(py.min())) / H:.6f}

/** Dot radius in plate px for a size in 0–1; dots are spaced edge to edge by this. */
export function compactRadius(b: number) {{
  return {R0} + {R1} * b ** {RK}
}}

/** Clear space between neighbouring dots, plate px, before and after jitter. */
export const COMPACT_GAP_MIN = {GAP_MIN}
export const COMPACT_GAP_JITTER = {GAP_JITTER}

/** Per building: plate x of its centre, rise delay (0 middle … 1 edge) and depth layer (0 back … 2 front). */
export const COMPACT_BUILDING_X = new Float32Array([{fmt(cxs)}])
export const COMPACT_BUILDING_DELAY = new Float32Array([{fmt(delay)}])
export const COMPACT_BUILDING_DEPTH = new Uint8Array([{fmt(depth)}])

const PACK = {pack(px[o], py[o], pb[o], pid[o])}

export type CompactGrains = SkylineGrains & {{ building: Uint8Array }}

function unpack(packed: string): CompactGrains {{
  const raw = atob(packed)
  const n = (raw.length / 6) | 0
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const b = new Float32Array(n)
  const building = new Uint8Array(n)
  for (let i = 0; i < n; i++) {{
    const o = i * 6
    x[i] = ((raw.charCodeAt(o) << 8) | raw.charCodeAt(o + 1)) / 65535
    y[i] = ((raw.charCodeAt(o + 2) << 8) | raw.charCodeAt(o + 3)) / 65535
    b[i] = raw.charCodeAt(o + 4) / 255
    building[i] = raw.charCodeAt(o + 5)
  }}
  return {{ n, x, y, b, building }}
}}

export const COMPACT_GRAINS = unpack(PACK)
"""
        OUT.write_text(text, encoding="utf-8", newline="\n")
        print("wrote", OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
