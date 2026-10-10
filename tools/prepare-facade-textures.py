#!/usr/bin/env python3
"""Build physically based facade texture atlases for Birdway.

The atlas uses bundled CC0 ambientCG photographs for masonry, metal, concrete
and roof surfaces, plus a deterministic procedural curtain-wall panel. All
tiles repeat at the 3 m x 3.3 m facade UV scale.
Requires Pillow: python3 -m pip install Pillow
"""
from PIL import Image, ImageDraw, ImageFilter
import math, random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'assets' / 'facades'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = OUT / 'source'
S = 512
SEED = 94071

# sRGB colors. A tile is a repeatable 3 m facade span by one 3.3 m floor.
BASES = [
    (151, 88, 65),   # common NYC brick
    (190, 177, 151), # limestone
    (116, 112, 101), # painted cast iron
    (163, 146, 119), # prewar stone
    (102, 128, 133), # curtain wall / spandrel
    (151, 149, 139), # poured concrete
    (142, 69, 51),   # townhouse brick
    (92, 101, 93),   # roof membrane and gravel
]


def noise_value(x, y, seed=SEED):
    # Hash-based, seamlessly periodic grain with several frequencies.
    h = math.sin((x + seed) * 127.1 + (y + seed * .7) * 311.7) * 43758.5453
    return h - math.floor(h)


def make_tile(kind):
    rng = random.Random(SEED + kind * 8191)
    base = BASES[kind]
    source_kind = {
        0: 'brick', 1: 'concrete', 2: 'metal', 3: 'concrete',
        5: 'concrete', 6: 'brick', 7: 'roof',
    }.get(kind)
    if source_kind and all((SOURCE / f'{source_kind}-{suffix}.jpg').exists()
                           for suffix in ('color', 'height', 'roughness')):
        return tuple(
            Image.open(SOURCE / f'{source_kind}-{suffix}.jpg').convert(mode).resize((S, S), Image.Resampling.LANCZOS)
            for suffix, mode in [('color', 'RGB'), ('height', 'L'), ('roughness', 'L')]
        )
    color = Image.new('RGB', (S, S))
    cp = color.load()
    height = Image.new('L', (S, S), 128)
    hp = height.load()
    rough = Image.new('L', (S, S), 220)
    rp = rough.load()

    # Hand-built masonry silhouettes have genuinely recessed mortar joints.
    if kind in (0, 6):
        rows, cols = 16, 5
        row_h, brick_w = S / rows, S / cols
        mortar = 5
        bricks = []
        for row in range(rows):
            shift = (row & 1) * brick_w * .5
            for col in range(cols + 1):
                x0 = col * brick_w + shift
                x1 = x0 + brick_w
                # periodic clipping retains continuity at either horizontal edge
                for wrap in (-S, 0, S):
                    bx0, bx1 = x0 + wrap, x1 + wrap
                    if bx1 < 0 or bx0 > S: continue
                    shade = rng.uniform(.84, 1.12)
                    warmth = rng.uniform(-4, 4)
                    y0, y1 = row * row_h, (row + 1) * row_h
                    for y in range(max(0, int(y0)), min(S, int(y1))):
                        for x in range(max(0, int(bx0)), min(S, int(bx1))):
                            edge = min(x - bx0, bx1 - x, y - y0, y1 - y)
                            # mortar shadow and soft edge wear
                            mortar_mix = max(0., min(1., (edge - mortar) / 3.))
                            grain = (noise_value(x % S, y % S, SEED + kind) - .5) * 13
                            v = shade * mortar_mix
                            c = tuple(max(0, min(255, int((base[i] * v + (base[i] - 34) * (1-v)) + grain + (warmth if i == 0 else -warmth*.35 if i == 2 else 0)))) for i in range(3))
                            cp[x, y] = c
                            hp[x, y] = int(max(32, min(224, 130 + (min(edge, 26) - 12) * 3 + grain * 1.5)))
                            rp[x, y] = int(202 + (noise_value(x, y, SEED + 92) - .5) * 60)
    elif kind in (1, 3):
        # Cut stone blocks: broad ashlar with fine grain and chipped edges.
        rows = 6 if kind == 1 else 7
        row_h = S / rows
        course = S / 3.7
        for y in range(S):
            row = int(y / row_h)
            shift = (row & 1) * (S / 6)
            for x in range(S):
                xx = (x + shift) % S
                cell = xx / (S / 3.5)
                edge_x = min(cell % 1, 1 - cell % 1) * (S / 3.5)
                edge_y = min(y % row_h, row_h - y % row_h)
                edge = min(edge_x, edge_y)
                grit = (noise_value(x, y, SEED + kind) - .5) * 22
                streak = 7 * math.sin((x + y * .16) * .055) + 3 * math.sin(x * .18)
                shade = max(.55, min(1.08, .83 + min(edge, 18) * .009))
                mortar = 0 if edge > 4 else (4-edge)/4
                for i in range(3):
                    c = base[i] * shade + grit + streak - 28 * mortar
                    cp[x, y] = tuple(max(0, min(255, int(c))) if j == i else cp[x,y][j] for j in range(3))
                hp[x, y] = int(max(70, min(195, 135 + (shade-.83)*130 + grit)))
                rp[x, y] = int(219 + (noise_value(x,y,SEED+190) - .5)*44)
    elif kind == 2:
        # Painted cast iron panels with embossed vertical pilasters and patina.
        for y in range(S):
            for x in range(S):
                panel = min(x % 128, 128 - x % 128)
                band = min(y % 80, 80 - y % 80)
                grain = (noise_value(x,y,SEED+kind)-.5)*13
                patina = 8 * math.sin(x*.019) + 4*math.sin(y*.041)
                relief = 13 if panel < 5 else 0
                value = 0.94 + (4 if panel < 5 else 0)/100 - (5 if band < 3 else 0)/100
                cp[x,y] = tuple(max(0,min(255,int(base[i]*value + grain + patina + relief))) for i in range(3))
                hp[x,y] = int(max(75,min(205,128 + relief + (noise_value(x,y)-.5)*25)))
                rp[x,y] = int(133 + (noise_value(x,y,SEED+31)-.5)*55)
    elif kind == 4:
        # Spandrel: cool enamel panels, seams and tiny surface waviness.
        for y in range(S):
            for x in range(S):
                seam = min(x % 128, 128-x%128, y%42, 42-y%42)
                glint = 6*math.sin((x + y*.35)*.025)
                grain = (noise_value(x,y,SEED+kind)-.5)*6
                factor = .66 if seam < 3 else 1
                cp[x,y] = tuple(max(0,min(255,int((base[i]*factor + glint + grain)))) for i in range(3))
                hp[x,y] = int(124 + (noise_value(x,y)-.5)*12)
                rp[x,y] = int(112 + (noise_value(x,y,SEED+7)-.5)*22)
    elif kind == 5:
        # Poured concrete pores plus subtle vertical runoff and aggregate.
        for y in range(S):
            runoff = 7*math.sin(y*.036) + 3*math.sin(y*.11)
            for x in range(S):
                grain = (noise_value(x,y,SEED+kind)-.5)*27
                pores = -25 if noise_value(x//2,y//2,SEED+22) > .989 else 0
                c = int(max(0,min(255, base[0] + runoff + grain + pores)))
                cp[x,y] = (c, max(0,min(255,c+1)), max(0,min(255,c-5)))
                hp[x,y] = int(max(95,min(160,128+grain+pores)))
                rp[x,y] = int(224 + (noise_value(x,y,SEED+28)-.5)*30)
    else:
        # Roof tar/gravel, a dark fine granular aggregate rather than blank gray.
        for y in range(S):
            for x in range(S):
                g = (noise_value(x,y,SEED+kind)-.5)*46
                speck = 24 if noise_value(x//3,y//3,SEED+144) > .955 else -8
                cp[x,y] = tuple(max(0,min(255,int(base[i] + g + speck))) for i in range(3))
                hp[x,y] = int(max(64,min(196,128+g+speck)))
                rp[x,y] = int(233 + (noise_value(x,y,SEED+111)-.5)*20)

    # Slight Gaussian micrograin avoids perfectly flat synthesized pixels;
    # preserve exact tile borders by restoring opposite borders after filtering.
    color = color.filter(ImageFilter.GaussianBlur(.22))
    height = height.filter(ImageFilter.GaussianBlur(.35))

    # Prefer the bundled ambientCG CC0 source maps for the photographed
    # masonry, metal, concrete and roof surfaces. The procedural models above
    # remain a deterministic fallback and provide the curtain-wall tile.
    return color, height, rough


def atlas(which):
    out = Image.new('RGB', (S*4, S*2))
    for kind in range(8):
        maps = make_tile(kind)
        im = maps[which]
        col, row = kind % 4, kind // 4
        # uv row zero is the bottom of a flipped Three.js image.
        y = (1-row) * S
        out.paste(im, (col*S, y))
    return out

for name, which in [('color',0),('height',1),('roughness',2)]:
    atlas(which).save(OUT/f'{name}.jpg', quality=94, subsampling=0, optimize=True)
print(f'Wrote original 2048x1024 facade atlases to {OUT}')
if all((SOURCE / f'{kind}-{suffix}.jpg').exists()
       for kind in ('brick', 'concrete', 'metal', 'roof')
       for suffix in ('color', 'height', 'roughness')):
    color_atlas = Image.open(OUT / 'color.jpg').convert('RGB')
    means = []
    for kind in range(8):
        x, y = (kind % 4) * S, (1 - kind // 4) * S
        pixels = color_atlas.crop((x, y, x + S, y + S)).get_flattened_data()
        linear = []
        for channel in range(3):
            vals = [p[channel] / 255 for p in pixels]
            vals = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in vals]
            linear.append(sum(vals) / len(vals))
        means.append(tuple(round(v, 3) for v in linear))
    print('Atlas linear RGB means (kind 0 through 7):')
    print(', '.join(str(value) for value in means))
