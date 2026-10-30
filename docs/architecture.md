# 架构与扩展

[返回文档目录](README.md)

## 实现与扩展

第一版选择浏览器原生 DOM + CSS 3D + Web Animations + Web Audio。精确的二维叠牌、图片编辑面板、快捷键和无依赖本地部署是当前重点，因此尚未引入 Godot。模型与渲染分开，未来可以把骰子表现替换为 WebGL/物理引擎，或接入 Godot 的场景渲染。

- `src/model.js`：通用物件、坐标/命中、牌堆、setup 与导入校验；不导入任何具体游戏。
- `src/main.js`：轻量首页入口、存档恢复与文件导入；进入游玩或编辑时才加载工作台。
- `src/modal-controls.js`：首页与工作台共用的弹窗关闭和背景点击处理，无需加载工作台。
- `src/app.js`：通用交互、选择、历史、导入导出、项目资料和 DOM 渲染。
- `src/example-catalog.js`：生成的游戏简介与封面目录，首页无需加载游戏模块或创建完整牌局。
- `src/games/grove.js`：果丛的资产、默认开局、骰面、标记、规则、果树吸附和计分；通过游戏模块接口接入。
- `src/game-registry.js`：按需加载当前游戏模块，并缓存已加载的游戏实现。
- `src/project-session.js`：项目复制、旧存档迁移、开局与展示快照；恢复存档时先用 `prepareSession()` 加载相应游戏。
- `src/projects.js`：供素材生成脚本与同步模型测试使用的完整游戏入口；浏览器页面不导入此文件。
- `src/board-images.js` / `src/board-previews.js`：按视野尺寸与屏幕像素密度选择版图资源；高清图解码完成后替换普通版本。
- `src/opening-editor.js`：物件级开局选项、发牌位置和牌序调整界面。
- `src/project-store.js`：草稿与展示存入 `tablecraft.projects`，游玩存档存入独立的 `tablecraft.play-sessions` 数据库，通过 `playOriginKey` 按作品保存进度。打开已有数据库时沿用其版本，避免旧标签页阻塞升级；兼容读取旧版 `playSessions` 存档。
- `src/plaza.js` / `src/plaza.css`：作品广场、本地草稿、搜索与已有草稿复用。
- `src/style.css`：工坊界面、桌布、纸牌双面与抬升、单面骰子和响应式布局。
- `src/audio.js`：本地 CC0 实录音效，按卡牌、骰子、木质标记、纸板和版图区分；预加载与缓存、随机变体、并发限制及即时静音。
- `scripts/`：本地服务、静态打包、PDF 图片裁切脚本。
- `tests/`：核心行为回归检查。

物件使用稳定 ID，牌堆保存有序资产 ID。`src/hands.js` 管理独立手牌区：session 的 `handZone` 定义名称、参考容量、允许的资产组与花色顺序，卡牌的 `handId` / `handOrder` 管理归属与顺序。手牌仍保留同一物件 ID 和正背面，坐标仅用于返回编辑桌面；游玩时以屏幕坐标渲染，排除桌面框选、磁吸与视野计算。`src/hand.css` 提供叠牌、弧度、悬停抬起与收拢动画。初始发牌位置可声明 `handId`，通用发牌为每张卡赋予连续的 `handOrder`。《为了北境森林》已接入此手牌区；《果丛》的“待打出的牌”仍为普通桌面摆放。

## 添加新的内置示例

在 `src/games/` 新增游戏模块，在 `src/game-registry.js` 配置动态加载入口，并加入 `src/projects.js` 的 `examples` 列表。模块可提供 `create()` 工厂、标题与介绍、骰子/标记模板、规则数据，以及可选的 `onDrop()` / `score()`。游戏工厂返回通用 session，将全部图片资产与 `initialSetup` 写入项目。没有注册模块的自建项目使用通用行为；导入文件中的文本不会作为代码执行。

修改内置游戏的标题、简介、首批卡牌、版图或 `coverAssetIds` 后，运行 `python scripts/generate-previews.py`（需要 Pillow）更新 `src/example-catalog.js`、`src/board-previews.js` 和 `public/assets/previews/`。生成文件随代码提交，静态构建无需安装 Python。目录一致性、资源体积与模块依赖由测试检查。

模块也可提供 `afterOpening(session, setup, random)`，在 `startOpening()` 完成通用洗牌、发牌后补充游戏专用布置。《为了北境森林》用它打散完整局的八位领主：先从每个花色独立抽取一位盟友与两位领主，再将领主随机分配到领地。设置为固定牌序的角色来源牌堆保留编辑时的领主分配。
