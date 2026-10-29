# GitHub Pages 部署

站点地址：https://xuyinjiesh.github.io/board-game-studio/

仓库 Settings → Pages → Build and deployment 的 Source 选择 **GitHub Actions**。
推送到 `main` 后，`.github/workflows/pages.yml` 自动运行测试、构建并发布 `dist/`；也可以在 Actions → Deploy to GitHub Pages → Run workflow 手动发布。

构建使用 Pages 返回的站点路径，支持仓库子目录及自定义域名。无需安装依赖或提交 `dist/`，也无需单独的 `gh-pages` 分支。

本地验证项目站点的构建：

```powershell
$env:BASE_PATH = '/board-game-studio/'
npm run build
Remove-Item Env:BASE_PATH
```

普通静态站点构建仍使用 `npm run build`，默认路径为 `/`。图片、规则和音效在显示时解析到站点目录；存档保留通用的 `/assets/` 路径，因此本地与线上备份可以互相导入。站点数据保存在访问者自己的浏览器中，线上地址和本地地址各自保存草稿，部署不会上传本机存档。

GitHub Free 的私有仓库无法启用 Pages。需要使用支持私有仓库 Pages 的套餐，或将仓库公开。Pages 网站的访问范围与仓库可见性不同；发布的素材会随静态站点提供下载。
