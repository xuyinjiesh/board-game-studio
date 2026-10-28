"""Extract the supplied expansions, preserving each card's mirrored duplex back.

The checked-in classification was verified against the printed card backs.
Run with the bundled Python (pypdfium2 + Pillow); no PDF is modified.
"""
from pathlib import Path
import sys
import json
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: provide the source PDF or directory as the first argument.')
source = Path(sys.argv[1])
doc=pdfium.PdfDocument(next(source.glob('*450ppi*.pdf')))
out=root/'public/assets/iron-helm/dlc';out.mkdir(parents=True,exist_ok=True)
scale=2.6
def cell(image,n):
    row,col=divmod(n-1,3);x=12.756+col*195.59;y=29.76+row*266.30
    return image.crop(tuple(round(v*scale) for v in (x,y,x+178.583,y+249.449)))

packs=[('ap1','绝望巢穴',25,5),('ap2','焦黑深窟',29,6),('ap3','加尔诺克的迷宫',33,7),('ap4','水晶洞窟',37,8),('ap5','余烬王座',41,9),('ap6','玛莉西亚的藏身处',47,1),('ap7','佐加尔之塔',51,2),('loot-lore','战利品与传说',55,3),('beasts','野兽与重担',59,4),('realms','领域与遗迹',63,5),('fanny','腰包扩展',67,6),('henchmen','孤独巨魔酒馆',71,6),('dungeon2','哀嚎深渊',75,8),('iron-chest','铁窖',79,9),('anemic','贫血之地',85,6)]
groups='''25: tracker,tracker,tracker,reference,reference,map,boss,hero,enemy
27: enemy,enemy,enemy,enemy,loot,loot,loot,loot,plot
29: plot,plot,skill,trapping,trapping,reference,map,boss,hero
31: enemy,enemy,enemy,enemy,enemy,loot,loot,loot,loot
33: plot,plot,plot,skill,trapping,trapping,reference,map,boss
35: hero,enemy,enemy,enemy,enemy,enemy,loot,loot,loot
37: plot,plot,plot,skill,trapping,trapping,trapping,reference,map
39: boss,hero,enemy,enemy,enemy,enemy,enemy,loot,loot
41: loot,loot,plot,plot,plot,skill,trapping,trapping,reference
43: map,boss,hero,enemy,enemy,enemy,enemy,enemy,loot
45: loot,loot,loot,plot,plot,plot,skill,trapping,trapping
47: reference,map,boss,hero,enemy,enemy,enemy,enemy,enemy
49: loot,loot,loot,loot,plot,plot,plot,skill,trapping
51: trapping,reference,map,boss,enemy,enemy,enemy,enemy,enemy
53: enemy,loot,loot,loot,loot,loot,plot,plot,plot
55: plot,plot,reference,reference,hero,hero,hero,loot,loot
57: loot,potion,potion,plot,plot,plot,skill,skill,skill
59: trapping,trapping,trapping,reference,reference,calamity,calamity,calamity,calamity
61: calamity,calamity,calamity,calamity,enemy,enemy,enemy,enemy,enemy
63: enemy,plot,plot,plot,reference,reference,artifact,artifact,artifact
65: artifact,artifact,artifact,artifact,artifact,environment,environment,environment,environment
67: environment,environment,environment,environment,environment,reference,artifact,hero,hero
69: enemy,enemy,enemy,enemy,enemy,loot,loot,loot,loot
71: plot,plot,trapping,trapping,trapping,reference,reference,hero,henchman
73: henchman,henchman,henchman,henchman,henchman,henchman,henchman,henchman,trapping
75: trapping,trapping,trapping,trapping,trapping,trapping,trapping,reference,dungeon
77: dungeon,dungeon,dungeon,dungeon,dungeon,dungeon,dungeon,dungeon,dungeon
79: dungeon,dungeon,dungeon,dungeon,dungeon,dungeon,dungeon,dungeon,reference
81: reference,hero,hero,hero,hero,hero,hero,hero,hero
83: tracker,tracker,tracker,tracker,tracker,tracker,constellation,constellation,constellation
85: constellation,constellation,constellation,hero,hero,reference,calamity,calamity,calamity
87: boss,boss,boss,boss,boss,boss,boss,boss,hero
89: hero,hero,hero,hero,enemy,enemy,enemy,enemy,enemy
91: enemy,enemy,enemy,enemy,enemy,enemy,enemy,enemy,enemy
93: environment,environment,environment,environment,henchman,henchman,henchman,potion,potion
95: potion,potion,plot,plot,plot,plot,plot,plot,plot
97: plot,plot,plot,plot,plot,plot,plot,plot,plot
99: plot,plot,plot,plot,plot,plot,skill,skill,skill
101: skill,skill,skill,skill,trapping,trapping,trapping,trapping,trapping'''
classification={int(line.split(':')[0]):line.split(': ')[1].split(',') for line in groups.splitlines()}
labels=dict(hero='角色',boss='首领',enemy='敌人',loot='战利品',potion='药剂',plot='剧情',skill='技能',trapping='初始装备',dungeon='地城',map='冒险地图',reference='说明',calamity='灾厄',artifact='神器',environment='环境',henchman='随从',tracker='轨道',constellation='星宿')
assets=[];counts={};heroes=[]
for p in range(25,102,2):
    front=doc[p-1].render(scale=scale).to_pil().convert('RGB')
    back=doc[p].render(scale=scale).to_pil().convert('RGB')
    for c in range(1,10):
        candidates=[pack for pack in packs if (p,c)>=(pack[2],pack[3])]
        if not candidates:continue
        pack,name,_,_=candidates[-1];group=classification[p][c-1]
        key=(pack,group);counts[key]=counts.get(key,0)+1
        code=f'p{p}c{c}';filename=f'{pack}-{code}';r,col=divmod(c-1,3)
        a=dict(id='ih-dlc-'+filename,type='card',name=f'{name} · {labels[group]} {counts[key]:02}',group=group,groupLabel=labels[group],code=code,expansion=pack,width=160,height=224,front=f'/assets/iron-helm/dlc/{filename}.webp',back=f'/assets/iron-helm/dlc/{filename}-back.webp',sourcePage=p,sourceCell=c)
        im=cell(front,c);im.save(out/f'{filename}.webp',quality=91)
        cell(back,r*3+3-col).save(out/f'{filename}-back.webp',quality=91)
        assets.append(a)
        if group=='hero':heroes.append((a,im.copy()))

events=pdfium.PdfDocument(next(source.glob('*随机事件*.pdf')))
for i in range(6):
    filename=f'random-events-{i+1}'
    for n,side in [(i*2,'front'),(i*2+1,'back')]:
        im=events[n].render(scale=2).to_pil().convert('RGB');im=im.crop((6,6,im.width-6,im.height-6));im.save(out/f'{filename}-{side}.webp',quality=91)
    assets.append(dict(id='ih-dlc-'+filename,type='card',name=f'随机事件 · {i+1}',group='event',groupLabel='随机事件',code=str(i+1),expansion='random-events',width=176,height=252,front=f'/assets/iron-helm/dlc/{filename}-front.webp',back=f'/assets/iron-helm/dlc/{filename}-back.webp',sourcePage=i*2+1,sourceCell=1,sourceFile='events'))

manifest=root/'src/games/iron-helm-dlc-assets.js'
manifest.write_text('// Generated by scripts/extract-iron-helm-dlc.py.\nexport const ironHelmDlcAssets = '+json.dumps(assets,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
temp=root/'tmp/iron-helm/dlc'
for start in range(0,len(heroes),6):
    subset=heroes[start:start+6];sheet=Image.new('RGB',(330*3,490*2),'white')
    for j,(a,im) in enumerate(subset):
        im.thumbnail((315,440));x=(j%3)*330;y=(j//3)*490;sheet.paste(im,(x,y+25));ImageDraw.Draw(sheet).text((x,y),a['id'],fill='black')
    sheet.save(temp/f'heroes-{start//6}.jpg')
print(f'Extracted {len(assets)} expansion assets; {len(heroes)} characters.')
