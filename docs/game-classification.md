# 广场分类与难度参考

核对日期：2026-10-29。评分是查询到的公开页面快照，不实时请求外部服务。分类是依据公开玩法与项目收录的原版规则整理的中文标签，不声称是出版商的官方分类。

难度采用 BoardGameGeek 社区 Weight（规则与决策复杂度）作为参考，不等于通关难度或胜率。BGG 的含义见 [Weight](https://boardgamegeek.com/wiki/page/weight)。站内将分数四舍五入到五档：1 入门、2 轻策、3 中策、4 重策、5 硬核；边界分别是 1.5、2.5、3.5、4.5。这是站内显示规则，不是 BGG 规定的分档阈值。

| 游戏 | 分类标签 | 复杂度 / 5 | 公开来源 |
| --- | --- | --- | --- |
| 果丛 | 空间拼放、图案构建 | 1.31 | [BGG 原条目](https://boardgamegeek.com/boardgame/329873)；数值通过 [Board Game of the Year](https://boardgameoftheyear.org/game/329873?summary=alltime) 转引，BGG 原页未返回复杂度字段 |
| 铁盔 | 地牢探险、风险抉择、资源管理 | 2.05 | [BGG](https://boardgamegeek.com/boardgame/273264/iron-helm) |
| 口袋骑士 | 地图探索、角色成长、资源规划 | 4.00 | [BGG](https://boardgamegeek.com/boardgame/444915/pocket-paladin)；该条目整体社区评价较少，仅供参考，未获取复杂度投票人数 |
| 为了北境森林 | 单人吃墩、手牌管理 | 1.85 | [BGG](https://boardgamegeek.com/boardgame/334590) |
| 52王国 | 地牢探险、手牌管理 | 1.92 | [BGG](https://boardgamegeek.com/boardgame/432250/52-realms-adventures)；玩法另核对 [Postmark Games](https://www.postmarkgames.com/52-realms-adventures) |
| 迷你游侠 | 地牢探险、骰子战斗、资源管理 | 2.02 | [BGG 2020 正式版](https://boardgamegeek.com/boardgame/311715/mini-rogue)，与项目所收录的基础版及扩展相符；不是 2016 九卡 PnP 版 |
| 绝顶聪明 | 掷骰书写、骰子选择、连锁计分 | 1.85 | [BGG](https://boardgamegeek.com/boardgame/244522/thats-pretty-clever) |
| 双倍聪明 | 同上 | 2.27 | [BGG](https://boardgamegeek.com/boardgame/269210/twice-as-clever) |
| 三倍聪明 | 同上 | 2.36 | [BGG](https://boardgamegeek.com/boardgame/316546/clever-cubed/files) |
| 四倍聪明 | 同上 | 2.37 | [BGG](https://boardgamegeek.com/boardgame/366162) |

聪明系列卡片显示四代基础版的 1.85–2.37 区间，详情内分别链接各版本。挑战计分纸不单独编造复杂度。

自制游戏显示「自制游戏 / 难度待评」。基于内置游戏的草稿或已发布改版保留原作参考，界面注明扩展、自定义修改可能改变体验。没有将这些分类和社区评分写入用户存档。

实现数据位于 `src/game-catalog.js`。新增游戏或更新评分时，应同时更新核对日期、对应来源与此表。
