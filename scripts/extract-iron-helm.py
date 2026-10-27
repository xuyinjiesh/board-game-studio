"""Extract ONLY the base set from the user's mixed-expansion Chinese PnP.

Usage: bundled-python scripts/extract-iron-helm.py <source-directory>
Requires pypdfium2 and Pillow. Page numbers and cells are one-based.
The crop uses the PDF's 63 x 88 mm trim marks, excluding print bleed.
"""
from pathlib import Path
import json
import sys
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: provide the source PDF or directory as the first argument.')
source = Path(sys.argv[1])
pdf = next(source.glob('*450ppi*.pdf'))
doc = pdfium.PdfDocument(pdf)
out = root / 'public/assets/iron-helm'
out.mkdir(parents=True, exist_ok=True)
scale = 3
pages = {}
def crop(page, cell):
    if page not in pages:
        pages[page] = doc[page-1].render(scale=scale).to_pil().convert('RGB')
    row, col = divmod(cell-1, 3)
    x, y = 12.756 + col*195.59, 29.76 + row*266.30
    return pages[page].crop(tuple(round(v*scale) for v in (x,y,x+178.583,y+249.449)))

manifest = []
labels = {'hero':'角色','boss':'首领','dungeon':'地城','enemy':'敌人','loot':'战利品','potion':'药剂','plot':'剧情','skill':'技能','trapping':'初始装备','track':'轨道','blessing':'祝福'}
def add(group, code, name, page, cell, back_page=None, back_cell=None, **extra):
    filename = f'{group}-{code}'
    crop(page,cell).save(out/f'{filename}.webp',quality=91)
    back = f'{group}-back.webp'
    if back_page:
        crop(back_page,back_cell or cell).save(out/back,quality=91)
    manifest.append(dict(id=f'ih-{filename}',type='card',name=name,group=group,groupLabel=labels[group],code=code,
        width=160,height=224,front=f'/assets/iron-helm/{filename}.webp',back=f'/assets/iron-helm/{back}',
        sourcePage=page,sourceCell=cell,**extra))

for i,name in enumerate(['法蓬','索塔布','佐拉','莫利坎']):
    add('hero',str(i+1),name,1,[5,6,7,8][i],2,5)
for i,name in enumerate(['邪眼','娜迦','巫妖']):
    add('boss',str(i+1),name,1,[2,3,4][i],2,1)

locations = [(1,9)]+[(3,c) for c in range(1,10)]+[(5,c) for c in range(1,7)]
names = ['伏击']*3+['宝藏','迷宫','蘑菇小径','箭矢陷阱']+['遭遇战']*5+['营地','商人','祭坛','空地']
for i,((p,c),name) in enumerate(zip(locations,names)):
    add('dungeon',str(i+1),name,p,c,4,1)

locations = [(5,c) for c in [7,8,9]]+[(7,c) for c in range(1,10)]+[(9,c) for c in range(1,7)]
names = ['哥布林']*2+['僵尸']*2+['劫掠矮人']*2+['翼蛇']*2+['狼']*2+['骷髅弓箭手']*2+['兽人战士','骷髅战士','鱼人','巨型史莱姆','幽灵','洞穴巨魔']
for i,((p,c),name) in enumerate(zip(locations,names)):
    add('enemy',str(i+1),name,p,c,8,1)

locations = [(9,c) for c in [7,8,9]]+[(11,c) for c in range(1,10)]+[(13,c) for c in range(1,7)]
names = ['口粮','口粮','铁盔','盾牌','匕首','治疗药水','链甲','血祭长剑','宝箱怪','精灵短弓','野外指南','探险家地图','战锤','食谱','长剑','魔法戒指','油灯','寒冰斧']
for i,((p,c),name) in enumerate(zip(locations,names)):
    add('loot',str(i+1),name,p,c,12,1)

for i,name in enumerate(['治疗药水','治疗药水','解毒剂','解毒剂','冰霜碎片','冰霜碎片','爆炎弹','爆炎弹','圣水','圣水']):
    p,c = (13,9) if i==0 else (15,i)
    add('potion',str(i+1),name,p,c,16,1)

for i,name in enumerate(['老妇人','猪人','圣坛','密道','旅人','隐秘酒馆','狼','囚犯','尸体']):
    add('plot',str(i+1),name,17,i+1,18,1,eyes=[2,1,3,1,2,2,2,3,1][i])

for i,name in enumerate(['议价','炼金术','草药学','神选者','隐匿','箭术精通','闪避','暗影突袭','狂暴','双持武器','盾技精通','格挡']):
    add('skill',str(i+1),name,19 if i<9 else 21,i+1 if i<9 else i-8,20,1)

names = ['斧头','口粮','火把','皮甲','匕首','门楔','头环','小圆盾','木杖','短弓','盾牌','长袍','钉头锤','铁盔']
for i,name in enumerate(names):
    add('trapping',str(i+1),name,21 if i<6 else 23,i+4 if i<6 else i-5,24,1)
add('track','morality','道德轨道',13,7,14,3)
add('track','level','地下城层数',13,8,14,2)
# Tracks are genuinely double-sided, unlike the category card backs.
for a in manifest[-2:]:
    back_name = a['id'][3:]+'-back.webp'
    crop(14,3 if a['code']=='morality' else 2).save(out/back_name,quality=91)
    a['back'] = '/assets/iron-helm/'+back_name

# The supplied edition replaces loose blessing tokens with this D12 reference.
# Preserve its 12 outcomes as individually shuffleable, face-down square tiles.
ref=crop(23,9).rotate(270,expand=True)
ref.save(out/'blessing-reference.webp',quality=94)
# Regions measured on the supplied reference (normalized to its 498 x 356 preview).
# Rotating 270 means the icons are upright; use the inverse of the 90-degree preview.
preview=crop(23,9).rotate(90,expand=True).resize((498,356))
positions=[(337,124),(280,124),(223,124),(168,124),(110,124),(54,124),(337,58),(280,58),(223,58),(168,58),(110,58),(54,58)]
back=preview.crop((395,181,491,291)).rotate(180).resize((180,180))
back.save(out/'blessing-back.webp',quality=94)
for i,(x,y) in enumerate(positions):
    tile=preview.crop((x-26,y-26,x+26,y+26)).rotate(180).resize((180,180))
    tile.save(out/f'blessing-{i+1}.webp',quality=94)
    manifest.append(dict(id=f'ih-blessing-{i+1}',type='card',name=f'祝福 {i+1}',group='blessing',groupLabel='祝福',code=str(i+1),width=58,height=58,
        front=f'/assets/iron-helm/blessing-{i+1}.webp',back='/assets/iron-helm/blessing-back.webp',sourcePage=23,sourceCell=9))

crop(1,1).save(out/'cover.webp',quality=92)
(root/'src/games/iron-helm-assets.js').write_text('// Generated by scripts/extract-iron-helm.py; base set only.\nexport const ironHelmAssets = '+json.dumps(manifest,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
print(f'Extracted {len(manifest)} assets to {out}')
