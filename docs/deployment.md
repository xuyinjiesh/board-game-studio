# GitHub Pages 部署

线上地址：https://xuyinjiesh.github.io/board-game-studio/

仓库 Settings → Pages → Build and deployment 的 Source 选择 **GitHub Actions**。
推送到 `main` 后，`.github/workflows/pages.yml` 自动执行测试、构建并发布 `dist/`；也可在 Actions 中手动运行 **Deploy to GitHub Pages**。

构建任务需要 `contents: read` 和 `pages: read`，后者用于读取 Pages 配置。部署任务需要 `pages: write` 和 `id-token: write`，部署环境为 `github-pages`。

工作流读取 Pages 的 `base_path`，自动适配 `/board-game-studio/`。本地验证同一路径：

```powershell
npm test
$env:BASE_PATH = '/board-game-studio/'
npm run build
Remove-Item Env:BASE_PATH
```

默认 `npm run build` 使用根路径 `/`。构建结果包含 `.nojekyll`，无需另设发布分支，也无需提交 `dist/`。

存档中的内置素材保留 `/assets/` 形式，显示和播放时根据站点目录解析；导入图片和 JSON 备份不绑定部署地址。线上存档保存在当前浏览器中，与本地地址的存档独立，需要通过导出、导入迁移。

若 Configure Pages 报 `Resource not accessible by integration`，检查构建任务的 `pages: read` 权限；若报站点不存在，检查 Pages 的 Source 是否为 GitHub Actions。部署日志见仓库 Actions，发布成功后可从 `github-pages` 环境打开网站。
