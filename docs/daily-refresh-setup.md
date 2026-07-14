# 星辰 MaaS 竞品看板每日自动刷新配置

这套配置用免费的 GitHub Actions 做定时任务，不需要购买域名。打开方式可以用 GitHub Pages，链接会类似：

`https://你的GitHub用户名.github.io/仓库名/`

## 每天会做什么

- 北京时间每天 01:00 自动运行一次。
- 默认总结“昨天”的竞品动态，例如 2026-07-15 01:00 会总结 2026-07-14。
- 抓取 `config/competitor-monitor-sources.json` 里的官方文档、新闻检索页和公众号检索页。
- 同时命中“昨天日期 + 关键词”的内容会写入 `xingchen-maas-competitor-data.js`，网页点击刷新或重新打开后能看到。
- 只命中关键词、但日期不明确的内容会写入 `outputs/daily-briefings/YYYY-MM-DD.md`，作为人工复核线索。

## 第一次配置

1. 在 GitHub 新建一个公开仓库。
2. 把当前文件夹内容上传到仓库，至少要包含 `index.html`、`xingchen-maas-competitor-data.js`、`outputs/`、`scripts/`、`config/`、`.github/workflows/`、`netlify.toml`、`package.json`。
3. 进入仓库 `Settings -> Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`，保存。
6. 进入 `Settings -> Actions -> General`，确认 `Workflow permissions` 允许 `Read and write permissions`。

如果使用 GitHub Pages，配置完成后会给出一个公开访问链接。若使用 Netlify，推荐连接这个 GitHub 仓库，Netlify 会读取 `netlify.toml`，发布 `outputs/netlify-upload`。

## 手动刷新

在 GitHub 仓库里进入 `Actions -> Daily Competitor Refresh -> Run workflow`。

- 不填日期：默认总结北京时间昨天。
- 填 `target_date`：补跑指定日期，例如 `2026-07-14`。

本地也可以运行：

```bash
npm run refresh:daily -- --target-date 2026-07-14
```

只做校验、不联网、不写文件：

```bash
npm run refresh:daily:dry -- --target-date 2026-07-14
```

## 怎么增删信息源

编辑 `config/competitor-monitor-sources.json`。

- `competitor` 对应网页里的平台 ID，例如 `volc`、`baidu`、`aliyun`、`huawei`、`tencent`、`silicon`、`zhipu`。
- `type` 可用 `official`、`media`、`wechat`。
- `keywords` 决定脚本抓到什么内容才会认为值得关注。
- `categories` 决定网页里归到模型、智能体、价格、治理等哪类功能。

## 需要知道的限制

- 控制台登录态页面、公众号详情页、部分新闻站可能会限制自动抓取。
- 自动脚本不会凭空判断业务重要性，只会先抓“疑似动态”；日期不明确的线索会放到每日简报里等待人工确认。
- 如果要做到更像专业情报系统，可以后续接入搜索 API、公众号采集服务或企业内部爬虫服务。
