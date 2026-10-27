# 桌游操作音效

作者：Kenney（https://kenney.nl/）。从作者官网免费下载；`casino/`、`impact/` 保留原始录音，`edited/` 为下表注明的短片段。

| 目录 | 素材包 | 用途 | 授权 |
| --- | --- | --- | --- |
| `casino/` | [Casino Audio 1.1](https://kenney.nl/assets/casino-audio) | 纸牌滑动、翻动、摆放、展开与洗牌；单骰/多骰投掷；硬质筹码 | CC0 1.0 |
| `impact/` | [Impact Sounds 1.0](https://kenney.nl/assets/impact-sounds) | 木质标记轻击、版图软质落桌声 | CC0 1.0 |
| `edited/` | Casino Audio 1.1 的裁切片段 | 单张落牌、单颗骰子拿起的短触碰 | CC0 1.0 |

原包目录及 `edited/` 保留素材包原始 `License.txt`。CC0 允许免费用于个人、教育和商业项目，无需强制署名。授权原文：https://creativecommons.org/publicdomain/zero/1.0/ 。游戏卡面与规则的版权另行适用。

素材包含 30 段原始 Ogg Vorbis 与 7 段短 PCM WAV；当前使用 32 段，预加载约 285 KB。由本地服务和静态构建一起提供，无外部音频请求。`src/audio.js` 配置用途和播放音量；运行时缓存解码结果、轮换变体并微调音量/音高，不重复触发整段骰声。关闭音效会停止正在播放及等待加载的声音。

短片段以 48 kHz、单声道、16 位 PCM 保存，加入 1 ms 渐入、12 ms 渐出并统一峰值。落牌只取主落点，排除之前的摩擦与二次触碰；拿骰改用单颗骰子的一次短触碰，取代原来较长的多骰抓取录音。裁切位置以原录音起点计：

| 文件 | 原始录音 | 裁切区间（秒） | 时长 | 目标峰值 |
| --- | --- | --- | --- | --- |
| `edited/card-lift-1.wav` | `casino/card-slide-1.ogg` | 0.151–0.211 | 60 ms | 0.62 |
| `edited/card-lift-2.wav` | `casino/card-slide-2.ogg` | 0.063–0.123 | 60 ms | 0.62 |
| `edited/card-lift-3.wav` | `casino/card-slide-3.ogg` | 0.079–0.139 | 60 ms | 0.62 |
| `edited/card-set-down-1.wav` | `casino/card-place-2.ogg` | 0.183–0.253 | 70 ms | 0.78 |
| `edited/card-set-down-2.wav` | `casino/card-place-3.ogg` | 0.445–0.525 | 80 ms | 0.78 |
| `edited/die-lift-1.wav` | `casino/die-throw-1.ogg` | 0.154–0.234 | 80 ms | 0.88 |
| `edited/die-lift-2.wav` | `casino/die-throw-2.ogg` | 0.073–0.153 | 80 ms | 0.88 |

卡牌拿起片段的主要起音位于开头 10 ms 内。缓存就绪后，在开始拖动的输入事件内直接播放；首次加载若超过 35 ms，则跳过过时的拿起反馈。松手和取消拖动均使对应拿起请求失效，并用 4 ms 渐出结束正在播放的拿起声，防止极速微移时拿起声滞后于落牌。连续快速拖放不共用普通提示音的 45 ms 节流。

默认材质：卡牌/牌堆和纸板标记使用纸声；骰子使用硬质轻击和真实投掷声；果丛松鼠、独轮车和通用圆片按木质标记处理；其他标记使用筹码声；版图使用柔和闷响。自定义图片标记暂按纸板处理。
