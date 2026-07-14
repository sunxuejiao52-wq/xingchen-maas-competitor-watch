# Xingchen MaaS Competitor Watch

星辰 MaaS 竞品动态监测看板，用于跟踪 MaaS 竞品的模型更新、功能变化、宣传动作、公众号和新闻线索。

## 在线发布建议

推荐使用 GitHub + Netlify：

- GitHub Actions 每天北京时间 01:00 自动运行数据刷新脚本。
- Netlify 连接本仓库后，读取 `netlify.toml`，发布 `outputs/netlify-upload`。
- 页面打开时会自动读取最新的 `xingchen-maas-competitor-data.js`，时间筛选会跟随最新数据日期更新。

## 本地命令

```bash
npm run refresh:daily:dry -- --target-date 2026-07-14
npm run prepare:netlify
```

## 关键文件

- `index.html`：主页面
- `xingchen-maas-competitor-data.js`：网页读取的数据文件
- `scripts/daily-competitor-refresh.mjs`：每日采集与数据更新脚本
- `config/competitor-monitor-sources.json`：竞品监测来源和关键词
- `.github/workflows/daily-competitor-refresh.yml`：GitHub Actions 定时任务
- `netlify.toml`：Netlify 发布配置
