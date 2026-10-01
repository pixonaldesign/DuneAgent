"""Build priority-ordered star targets for the Abu Dhabi skyline.

Every prefix of the output is a well-spread, brightness-led sample of the
plate: the first targets are tower outlines, crowns and the waterline; later
ones fill windows and the reflection. The runtime takes as many as it has
stars for.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SRC = Path(
    r"C:\Users\islam\.cursor\projects\c-Users-islam-DuneAgent\assets"
    r"\c__Users_islam_AppData_Roaming_Cursor_User_workspaceStorage_0628429c45770021100141a3317296fd_images_"
    r"Dune_AI_Visuals_GPT_Image_2.5_2026-10-01_08-41-16-8fb9caf6-7a21-40dd-aec8-4f80dc3d9f56.jpg"
)
OUT = Path(r"C:\Users\islam\DuneAgent\src\scene\skylineGrains.ts")
TMP = Path(r"C:\Users\islam\DuneAgent\tmp-skyline")

W, H = 1024, 572
WATER = 336.5
TOP = 46


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    r = int(sigma * 3 + 1)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, ((0, 0), (r, r)), mode="edge")
    a = sum(k[i] * p[:, i : i + a.shape[1]] for i in range(2 * r + 1))
    p = np.pad(a, ((r, r), (0, 0)), mode="edge")
    return sum(k[i] * p[i : i + a.shape[0], :] for i in range(2 * r + 1))


def smooth(e0: float, e1: float, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def load():
    im = Image.open(SRC).convert("L")
    assert im.size == (W, H), im.size
    return np.asarray(im, dtype=np.float32) / 255


def peaks(L: np.ndarray, thresh: float):
    p = np.pad(L, 1, mode="constant")
    c = p[1:-1, 1:-1]
    ok = c >= thresh
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy:
                ok &= c >= p[1 + dy : 1 + dy + H, 1 + dx : 1 + dx + W]
    ys, xs = np.nonzero(ok)
    return xs, ys


def main(preview_k: int):
    L = load()
    # Isolated sky dots blur to almost nothing; lit buildings stay bright.
    mass = blur(L, 4.0)
    xs, ys = peaks(L, 0.11)
    v = L[ys, xs]
    # Peak brightness with a little of its neighbourhood, so a lit facade
    # outranks a lone speck of the same value.
    local = blur(L, 1.2)[ys, xs]
    b = np.clip(0.65 * v + 0.55 * local, 0, 1)

    city = (ys >= TOP) & (ys <= WATER + 1.5) & (mass[ys, xs] > 0.075)
    refl = (ys > WATER + 1.5) & (mass[ys, xs] > 0.05)
    keep = city | refl
    xs, ys, b, city = xs[keep], ys[keep], b[keep], city[keep]

    nx = xs / W
    side = smooth(0.0, 0.1, nx) * smooth(1.0, 0.9, nx)
    depth = np.where(city, 1.0, (1 - (ys - WATER) / (H - WATER)) ** 1.3)
    water_glow = np.where(np.abs(ys - WATER) < 3, 1.25, 1.0)
    b = np.clip(b * (0.35 + 0.65 * side) * np.where(city, 1.0, 0.55 + 0.45 * depth) * water_glow, 0, 1)
    w = b**1.6 * side * np.where(city, 1.0, 0.55 * depth)

    rng = np.random.default_rng(7)
    jitter = rng.random(len(w))
    # Progressive Poisson passes: each prefix is blue-noise and bright-first.
    radii = [14, 9.5, 6.5, 4.6, 3.4, 2.6]
    order: list[int] = []
    taken = np.zeros(len(w), bool)
    cell = 2.0
    gw, gh = int(W / cell) + 2, int(H / cell) + 2
    occ: dict[tuple[int, int], list[int]] = {}
    for r in radii:
        key = w * (0.6 + 0.4 * jitter)
        idx = np.argsort(-key)
        for i in idx:
            if taken[i] or w[i] <= 1e-4:
                continue
            ri = r * (1.25 - 0.55 * b[i])
            x, y = xs[i], ys[i]
            reach = int(np.ceil(ri / cell))
            cx, cy = int(x / cell), int(y / cell)
            hit = False
            for gy in range(cy - reach, cy + reach + 1):
                for gx in range(cx - reach, cx + reach + 1):
                    for j in occ.get((gx, gy), ()):
                        if (xs[j] - x) ** 2 + (ys[j] - y) ** 2 < ri * ri:
                            hit = True
                            break
                    if hit:
                        break
                if hit:
                    break
            if hit:
                continue
            taken[i] = True
            order.append(i)
            occ.setdefault((cx, cy), []).append(i)
        print(f"r={r}: total {len(order)}")

    order_a = np.array(order)
    print("city", int(city[order_a].sum()), "refl", int((~city[order_a]).sum()))

    for k in (preview_k, 5000, 9000):
        img = Image.new("RGB", (W * 2, H * 2), (0, 0, 0))
        dr = ImageDraw.Draw(img)
        for i in order_a[:k]:
            bb = float(b[i])
            rad = 0.7 + 1.9 * bb**1.6
            c = int(70 + 185 * bb**0.9)
            x, y = xs[i] * 2, ys[i] * 2
            dr.ellipse((x - rad, y - rad, x + rad, y + rad), fill=(c, c, c))
        img.save(TMP / f"new-k{k}.png")
    if "--write" in sys.argv:
        write(order_a, xs, ys, b, city)


def pack(xs, ys, b) -> str:
    raw = bytearray()
    for x, y, v in zip(xs, ys, b):
        nx = int(round(float(x) / W * 65535))
        ny = int(round(float(y) / H * 65535))
        raw += bytes([nx >> 8, nx & 255, ny >> 8, ny & 255, int(round(float(v) * 255))])
    enc = base64.b64encode(bytes(raw)).decode("ascii")
    return "[\n" + ",\n".join(f"  '{enc[i:i + 120]}'" for i in range(0, len(enc), 120)) + ",\n].join('')"


def write(order, xs, ys, b, city):
    o = order
    text = f"""// Star targets sampled from the Abu Dhabi plate (never drawn itself).
// Records are uint16 x, uint16 y, uint8 brightness, in priority order:
// any prefix is an evenly spread, brightness-led sketch of the skyline.
// Generated by tmp-skyline/build_skyline.py.

export const SKYLINE_ASPECT = {W} / {H}
export const SKYLINE_WATER = {WATER / H:.8f}

const PACK = {pack(xs[o], ys[o], b[o])}

export type SkylineGrains = {{
  n: number
  x: Float32Array
  y: Float32Array
  b: Float32Array
}}

function unpack(packed: string): SkylineGrains {{
  const raw = atob(packed)
  const n = (raw.length / 5) | 0
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const b = new Float32Array(n)
  for (let i = 0; i < n; i++) {{
    const o = i * 5
    x[i] = ((raw.charCodeAt(o) << 8) | raw.charCodeAt(o + 1)) / 65535
    y[i] = ((raw.charCodeAt(o + 2) << 8) | raw.charCodeAt(o + 3)) / 65535
    b[i] = raw.charCodeAt(o + 4) / 255
  }}
  return {{ n, x, y, b }}
}}

/** City and reflection targets, most important first. */
export const SKYLINE_GRAINS = unpack(PACK)
"""
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print("wrote", OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    nums = [a for a in sys.argv[1:] if a.isdigit()]
    main(int(nums[0]) if nums else 7000)
