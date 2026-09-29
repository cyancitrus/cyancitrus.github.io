# 时雨のblog

一个白色为主、支持深浅色模式的 OI 题解与生活博客。网页上可写 Markdown、KaTeX 数学公式、C++ 代码块、表格、提示块；文章可自由分类与置顶。

## 部署到 GitHub Pages

1. 登录 GitHub，打开 [新建仓库](https://github.com/new)。仓库设为 **Public**，名字可用 `<你的用户名>.github.io`（个人站点）或 `blog`（项目站点）。建议不勾选自动添加 README、`.gitignore` 和许可证，点击 **Create repository**。本项目的部署工作流使用 `main` 分支。
2. 在 Windows 上右键 ZIP 文件，选择 **全部解压**。进入解压出的目录；你应该能看到 `package.json`、`index.html`、`src`、`public`、`.github` 等文件和文件夹。
3. 在新仓库页面点击 **Add file → Upload files**，将解压目录里面的**所有内容**拖到上传区，再点击 **Commit changes**。拖拽的是目录里的内容，不能上传 ZIP 本身，也不要把外层目录整体套进去。尤其确认仓库根目录中有 `.github/workflows/pages.yml`、`public/content/posts.json` 和 `package.json`。
4. 在仓库里打开 **Settings → Pages → Build and deployment**，把 **Source** 设置为 **GitHub Actions**。本包已经附有工作流，不用另选模板，也不用设置 branch 的 `/root` 或 `/docs`。
5. 打开 **Actions**，选择 **Deploy blog to GitHub Pages**。如果第一次上传时 Pages 尚未配置，点击 **Run workflow → main → Run workflow** 再运行一次。等待工作流显示绿色勾号，回到 **Settings → Pages** 查看地址。

个人站点地址通常是 `https://<用户名>.github.io/`；名为 `blog` 的项目站点通常是 `https://<用户名>.github.io/blog/`。请以 Pages 页面显示的地址为准。打开后若看到 404，先确认 Actions 已成功、仓库根目录没有多套一层文件夹，并稍后刷新。

以后每次在网页编辑器里发布文章或修改首页文字，内容会提交到这个仓库的 `main` 分支，并触发一次部署。网站更新通常需要等待 Actions 完成，再刷新页面。

## 在网页上写文章

站点顶部点击笔形图标或管理图标。首次操作需要一个 GitHub **精细权限令牌**：

1. 从 [GitHub 令牌设置](https://github.com/settings/personal-access-tokens/new) 新建 token，Repository access 选择该博客仓库。
2. Repository permissions 中将 **Contents** 设为 **Read and write**，Metadata 保持默认读取权限。
3. 将令牌粘贴到博客连接页。令牌仅放在当前页面的内存中，刷新或关闭页面后需要重新输入；请勿将它写入仓库文件或发给他人。

编辑时会自动保存本机草稿，也可点「保存本机草稿」。草稿保存在当前浏览器的本机存储，换设备、清理浏览器数据或使用无痕窗口后不会自动同步。发布的文章保存在 `public/content/posts.json`，首页文字保存在 `public/content/site.json`。首次打开博客时没有预设分类；写文章时输入新分类即可创建。

原站与 GitHub Pages 使用不同的文章存储。这个部署包从空文章列表开始；若要迁移原站已有的「集训」文章，请在原站的文章页点击「编辑」→「下载 .md」，然后在 GitHub Pages 站点点击笔形图标导入 .md，补上原有标题、分类和置顶选项再发布。迁移完成前，原站文章仍保留在原站。

## 本地运行

需要 Node.js 22。运行 `npm ci`、`npm run dev`；本地预览无需令牌，但网页发布功能只有在 GitHub Pages 自动构建时才会绑定实际仓库。`npm run build` 可检查构建。

## Markdown

支持 GFM 表格、任务列表、KaTeX 行内 `$...$` 与块级 `$$...$$` 公式、代码高亮，以及洛谷风格的 info/success/warning/error/custom 折叠提示框、题记和文字对齐。编辑器提供自动换行、源码行号、实时预览、可拖动的双栏、全屏以及 `.md` 导入与下载。代码块可添加 `line-numbers` 或 `lines=2-4`。
