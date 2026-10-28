"""Render the shared Chinese playmat and make reusable wooden counter assets.

Usage: python scripts/extract-iron-helm-mat.py <playmat.pdf>
Requires pypdfium2 and Pillow. The source PDF is read only.
"""
from pathlib import Path
import sys
import random
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: provide the source PDF or directory as the first argument.')
source = Path(sys.argv[1])
out = root / 'public/assets/iron-helm'
out.mkdir(parents=True, exist_ok=True)
with pdfium.PdfDocument(source) as doc:
    doc[0].render(scale=1.8).to_pil().convert('RGB').save(out / 'playmat-cn.webp', quality=92)

colors = dict(health='#a84248', energy='#874b91', gold='#b8943c', rations='#b8663b',
              poison='#63823f', morality='#9c9484', level='#97764e', turn='#586f80',
              eyes='#536d95', foe='#45433e')
for key, color in colors.items():
    tile = Image.new('RGB', (96, 96), color)
    draw = ImageDraw.Draw(tile)
    draw.rectangle((1, 1, 94, 94), outline='#251c16', width=3)
    draw.line((5, 89, 5, 5, 89, 5), fill='#ddcda4', width=3)
    draw.line((6, 90, 90, 90, 90, 6), fill='#34281d', width=5)
    rng = random.Random(key)
    for _ in range(22):
        x, y = rng.randrange(9, 85), rng.randrange(9, 85)
        draw.line((x, y, min(85, x + rng.randrange(3, 16)), y + 1), fill=color, width=1)
    tile.save(out / f'marker-{key}.webp', quality=94)
