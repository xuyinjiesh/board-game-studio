"""Extract the supplied Chinese Mini Rogue PnP, without changing the source.

Usage: bundled-python scripts/extract-mini-rogue.py <source-directory>
Requires pypdfium2 and Pillow. PDF coordinates follow the printed trim marks.
Pack membership follows the small gold icon at the bottom right of the artwork.
"""
from pathlib import Path
import json
import shutil
import sys
import pypdfium2 as pdfium
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
out = root / 'public/assets/mini-rogue'
out.mkdir(parents=True, exist_ok=True)
doc = pdfium.PdfDocument(source / '卡片.pdf')
pages, assets = {}, []

def save(im, name):
    im.convert('RGB').save(out / f'{name}.webp', quality=93)
    return f'/assets/mini-rogue/{name}.webp'

def crop(page, cell, name):
    if page not in pages:
        pages[page] = doc[page-1].render(scale=3).to_pil().convert('RGB')
    row, col = divmod(cell-1, 3)
    x, y = 28 + col*178.58, 43.5 + row*249.45
    return save(pages[page].crop(tuple(round(v*3) for v in (x+1, y+1, x+177.58, y+248.45))), name)

labels = {'hero':'角色', 'room':'房间', 'boss':'首领', 'lore':'传说', 'reference':'参考卡'}
def add(code, name, group, page, cell, back, pack=None, **extra):
    a = dict(id='mr-'+code, type='card', name=name, group=group, groupLabel=labels[group],
             width=160, height=224, front=crop(page, cell, code), back=back,
             sourcePage=page, sourceCell=cell, **extra)
    if pack:
        a['expansion'] = pack
    assets.append(a)

hero_back = crop(2, 1, 'hero-back')
room_back = crop(12, 1, 'room-back')
boss_back = crop(4, 1, 'boss-back')
lore_back = crop(6, 1, 'lore-back')

heroes = [('priestess','祭祀',13,2,3,0,None), ('rogue','盗贼',10,5,3,0,None),
          ('mage','魔法师',11,3,4,0,None), ('paladin','圣骑士',10,0,4,1,None),
          ('cleric','牧师',9,0,2,1,'depths'), ('thief','盗贼（扩展）',10,10,1,0,'depths'),
          ('witch','女巫',10,3,3,0,'depths'), ('skeleton','骨士',10,0,2,0,'old-gods')]
for i,(key,name,hp,gold,food,armor,pack) in enumerate(heroes,1):
    add('hero-'+key,name,'hero',1,i,hero_back,pack,hero=key,hp=hp,gold=gold,food=food,armor=armor,
        xp=2 if key=='skeleton' else 0,affliction='curse' if key=='skeleton' else '',
        potion={'cleric':'healing','thief':'perception','witch':'poison'}.get(key,''))

bosses = [('og','奥格之骸',None),('knight','亡国骑士',None),('dragon','诅咒之龙',None),
          ('spider','蜘蛛女皇',None),('necromancer','死灵法师','old-gods'),('troll','巨魔','depths'),
          ('ghoul','食尸鬼',None),('heliomancer','驭阳者','depths')]
for i,(key,name,pack) in enumerate(bosses,1):
    add('boss-'+key,name,'boss',3,i,boss_back,pack,finalBoss=key=='og')

rooms = {
 11:[('猎人',None),('受诅咒的遗物','depths'),('空荡荡的避难所',None),('陷阱 · 坠落',None),
     ('宝物',None),('陷阱 · 机关','depths'),('隐士',None),('怪物 · 蠕虫',None),('怪物 · 鼠王','depths')],
 13:[('秘密通道','depths'),('实验室','old-gods'),('长廊',None),('怪物 · 持盾狗头人','old-gods'),
     ('武器',None),('壁龛','old-gods'),('乌鸦',None),('宝箱',None),('祭坛',None)],
 15:[('图书室','depths'),('商人',None),('怪物 · 骷髅',None),('怪物 · 哥布林',None),
     ('潮湿的洞穴',None),('篝火',None),('陷阱 · 毒刺',None),('恶匪','depths'),('陷阱 · 失落',None)],
 17:[('墓穴',None),('死亡蝙蝠','death-bat'),('熔炉','wolf-forge'),('陷阱 · 斧刃',None),
     ('赃物贩子','death-bat'),('狼','wolf-forge'),('喷泉','depths')]
}
for page, entries in rooms.items():
    for cell,(name,pack) in enumerate(entries,1):
        add(f'room-p{page}c{cell}',name,'room',page,cell,room_back,pack)

lore_names = [
 ['幻水墙','炼药桌','异教','是敌是友？','提示','古籍','会动的颜色','冒险者','传送门'],
 ['旧时的警告','吸月者','老鼠','小溪','深井','映像','村民','兄弟','机械'],
 ['游荡商人','古老的图书室','业余炼药师','问题','胶质怪','探索者的礼物','兄弟','未接壤坛']]
for page,names in zip([5,7,9],lore_names):
    for cell,name in enumerate(names,1):
        add(f'lore-p{page}c{cell}',name,'lore',page,cell,lore_back,'depths')

# These are duplex reference cards, not additional encounter cards. The last
# sheet deliberately prints Rewards and Ghost on both sides for either folding.
add('rewards','奖励／鬼魂','reference',17,9,crop(18,7,'ghost'))
add('stance','战斗姿态','reference',1,9,crop(2,7,'stance-back'))
add('versus','对战规则','reference',3,9,crop(4,7,'versus-back'))

sheet1=Image.open(source/'板件1.jpg')
sheet2=Image.open(source/'板件2 .jpg')
def sheet_crop(sheet, box, name, rotation=0):
    w,h=sheet.size
    box=tuple(round(v*(w/1888 if i%2==0 else h/1334)) for i,v in enumerate(box))
    return save(sheet.crop(box).rotate(rotation,expand=True),name)

for key,name,box,rotation,width,height,sheet in [
 ('dungeon','地牢／高塔',(31,27,638,1045),0,350,587,sheet1),
 ('player','角色面板',(644,28,1142,1044),90,650,319,sheet1),
 ('campaign','战役技能树',(1153,28,1643,1044),90,650,313,sheet1)]:
    front=sheet_crop(sheet,box,key,rotation)
    if key=='dungeon':
        assets.append(dict(id='mr-'+key,type='card',name=name,group='mat',groupLabel='面板',width=width,height=height,
                           front=front,back=sheet_crop(sheet2,box,'tower')))
    else:
        assets.append(dict(id='mr-'+key,type='board',name=name,group='mat',width=width,height=height,front=front))

# Original printed faces, preserving the critical stars and blank affliction
# faces. Faces remain 1..6 in the common dice engine.
for i,(col,row) in enumerate([(0,0),(0,1),(0,2),(1,0),(1,1),(1,2)],1):
    x,y=1670+col*95,401+row*96
    sheet_crop(sheet1,(x+2,y+2,x+92,y+93),f'die-character-{i}')
for i in range(1,7):
    # Dungeon faces are at the bottom of the right-hand strip (3,4 / 2,5 / 1,6).
    col,row=[(0,2),(0,1),(0,0),(1,0),(1,1),(1,2)][i-1]
    x,y=1670+col*95,973+row*96
    sheet_crop(sheet1,(x+2,y+2,x+92,y+93),f'die-dungeon-{i}')
    for kind,start in [('poison',33),('curse',319)]:
        x=start+((i-1)%3)*95;y=1103+(0 if i<=3 else 95)
        sheet_crop(sheet1,(x,y,x+93,y+93),f'die-{kind}-{i}')

shutil.copyfile(source/'规则书.PDF',out/'rules-zh.pdf')
(root/'src/games/mini-rogue-assets.js').write_text(
    '// Generated by scripts/extract-mini-rogue.py\nexport const miniRogueAssets = '+json.dumps(assets,ensure_ascii=False,indent=2)+';\n',encoding='utf8')
print(f'Prepared {len(assets)} assets, 24 dice faces and the Chinese rules.')
