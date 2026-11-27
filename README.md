# babyknitter

自己用的编织小网站：逐圈显示图解、点一下记一圈、示意图上高亮织到哪了。

- 分段填写 / 粘贴图解文字（中英文都行，英文缩写会翻成中文）/ 只计数
- 加减针生成器：比如「34针起，每3圈加2针，加到42针」
- 点屏幕、空格、Enter、方向键、蓝牙翻页踏板都能记一圈
- 进度存在浏览器里，可以导出备份

纯静态网页，用 GitHub Pages 打开就能用。

## 云同步和 AI 识别

用和 itinera 同一个 Supabase 项目（11zuidiaole-pockettools）和同一个账号。

1. 在 Supabase 后台 → SQL Editor，把 `supabase.sql` 整段贴进去运行一次（建表 + 截图存储桶）
2. 网站首页底部点「登录」
3. AI 识别直接用 itinera 已经部署的 Edge Function `itinera-ai`，不用另外部署
