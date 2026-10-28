// Printed character traits and starting equipment from the supplied expansions.
// Populated with source asset IDs rather than numeric base-game item codes.
const a=(pack,page,cell)=>`ih-dlc-${pack}-p${page}c${cell}`;
const h=(pack,page,cell,name,health,energy,capacity,rations,gold,items,skill,proficiency,startWeight,note='')=>({id:`${pack}-p${page}c${cell}`,assetId:a(pack,page,cell),expansion:pack,name,health,energy,capacity,rations,gold,items,skill,proficiency,startWeight,note});
export const DLC_HEROES=[
  h('ap1',25,8,'奥兹洛',17,10,12,1,2,[a('ap1',29,4)],a('ap1',29,3),'力量',3),
  h('ap2',29,9,'卡拉',13,11,9,1,4,[a('ap2',33,5)],a('ap2',33,4),'心智',1),
  h('ap3',35,1,'阿兹拉尔',12,12,8,2,4,[a('ap3',37,6)],a('ap3',37,4),'敏捷',1),
  h('ap4',39,2,'布拉兹维茨',13,11,10,1,2,[a('ap4',41,7),a('ap4',41,8)],a('ap4',41,6),'心智',3),
  h('ap5',43,3,'格里姆利',14,10,9,2,4,[a('ap5',45,9),a('ap5',45,8)],a('ap5',45,7),'敏捷',3),
  h('ap6',47,4,'艾尔朵拉',9,14,8,1,3,[a('ap6',49,9),'3'],a('ap6',49,8),'心智',2),
  h('loot-lore',55,5,'阿兹拉',13,12,10,1,4,[a('loot-lore',59,1)],a('loot-lore',57,7),'敏捷',3),
  h('loot-lore',55,6,'斯克拉尔',15,10,11,2,3,[a('loot-lore',59,2),'13'],a('loot-lore',57,8),'力量',3),
  h('loot-lore',55,7,'基尔恩－奥尔玛',11,13,10,2,2,[a('loot-lore',59,3)],a('loot-lore',57,9),'心智',1),
  {...h('fanny',67,8,'格林瓦尔德',15,11,10,1,2,['14'],'11','力量',2),extraSkills:['ih-skill-1']},
  h('fanny',67,9,'野蛮人纳诺克',18,12,6,1,3,[a('fanny',71,4)],'12','力量',1),
  h('henchmen',71,8,'乞丐米兹拉克',9,10,8,0,1,[],null,'力量',0),
  h('iron-chest',85,4,'乌尔恩－罗尔克',15,11,10,1,3,['13'],'4','力量',2),
  h('iron-chest',85,5,'格鲁布罗特',13,11,7,1,3,[a('ap6',49,9),'12'],'2','敏捷',2,'跨包初始装备随角色提供。'),
  h('anemic',87,9,'吉恩·斯拉什',10,8,8,0,0,[a('anemic',101,5),a('anemic',101,6)],a('anemic',101,4),'力量',5),
  h('anemic',89,1,'野兽',14,14,0,1,0,['1'],null,'力量',2,'特殊负重：只携带两把单手或一把双手武器；其技能按角色牌结算。'),
  h('anemic',89,2,'梅',10,10,9,1,4,[a('anemic',101,8)],null,'心智',3,'角色上的「战略」技能按牌面结算。'),
  h('anemic',89,3,'武士',12,12,10,1,1,[a('anemic',101,9)],a('anemic',101,2),'心智',2),
  h('anemic',89,4,'索恩',7,10,11,1,2,[a('ap6',49,9),'12'],a('anemic',99,7),'敏捷',2,'跨包初始装备随角色提供。')
];
