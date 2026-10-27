"""Extract the supplied, local Grove PnP. Render pages with Poppler first."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
out = root / 'public/assets'
for page, numbers in [(2,[1,3,5,7,9,11,13,15,17]), (4,[6,4,2,12,10,8,18,16,14])]:
    front = Image.open(root / f'tmp/pdfs/hi-{page}.png')
    back = Image.open(root / f'tmp/pdfs/hi-{page+1}.png')
    sx, sy = front.width/595.28, front.height/841.89
    for index, number in enumerate(numbers):
        row, col = divmod(index,3)
        for side, im, c in [('front',front,col),('back',back,2-col)]:
            box = tuple(round(v) for v in ((27.5+c*180)*sx,(43+row*252)*sy,(27.5+(c+1)*180)*sx,(43+(row+1)*252)*sy))
            im.crop(box).save(out/f'card-{number:02d}-{side}.webp',quality=94)
Image.open(root/'tmp/pdfs/page-1.png').save(out/'rules.webp',quality=95)
print('Extracted 18 fronts, 18 mirrored duplex backs and rule sheet.')
