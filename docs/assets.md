# 素材来源与授权

[返回文档目录](README.md)

## 素材

游戏 © 2021 Mark Tuck，中文汉化标注为楚洋。`public/assets/` 包含原 PDF 的本地副本、裁切正背面和规则预览；背面按 PDF 的“双面长边”列镜像关系匹配。松鼠和独轮车是本项目绘制的简化符号。

原游戏美术及规则的权利属于其作者，不随项目代码转移。

操作音效使用 Kenney 的 [Casino Audio](https://kenney.nl/assets/casino-audio) 与 [Impact Sounds](https://kenney.nl/assets/impact-sounds)，均为 **CC0 1.0**，可免费商用，无强制署名要求。当前使用 32 段录音约 285 KB，随项目本地提供；落牌使用 70–80 ms 的单次纸牌落点，拿骰使用更清楚的 80 ms 单次触碰。完整来源、片段处理、材质映射和原始授权见 [`public/assets/audio/README.md`](../public/assets/audio/README.md)。保留原有「操作音效」开关，关闭会立即停止播放。单颗与多颗投骰各播放一次对应录音，避免按骰数叠加。

## 公共组件

新增图像来自 Kenney Boardgame Pack v2，采用 CC0，可免费商用、修改与再分发。来源与原始授权见[公共素材说明](../public/assets/shared/README.md)。固定牌位为工坊组件。

各游戏的素材提取与规则来源另见[游戏文档](README.md#游戏文档)。

## 图片加载

作品广场使用 `public/assets/previews/` 下的独立 WebP 缩略图，宽度最多 256 像素；首批封面优先加载，其余延迟加载。游戏桌面与导出存档仍使用原始高清素材。卡牌先加载当前可见的一面，首次翻面时再加载另一面；已加载的图片继续复用浏览器缓存。

缩略图和轻量游戏目录可用 `python scripts/generate-previews.py` 重新生成（需要 Pillow）。

体积超过 250 KiB、长边超过 1600 像素的内置版图同时生成最长边 1600 像素的普通版本，放在 `public/assets/previews/boards/`。桌面根据版图实际显示尺寸、缩放和屏幕像素密度选择版本；放大后加载高清原图，解码成功再替换，避免显示空白。预览文件读取失败会回退原图。素材面板使用普通版本，查看大图仍使用原图。

普通版图只用于显示，项目资料、草稿、导入导出及规则坐标均保留原始素材路径与尺寸。自定义图片直接使用原文件。
