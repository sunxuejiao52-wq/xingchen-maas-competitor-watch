import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DATA_PATHS = [
  "outputs/xingchen-maas-competitor-data.js",
  "xingchen-maas-competitor-data.js",
  "site/xingchen-maas-competitor-data.js"
];
const PRIMARY_DATA_PATH = DATA_PATHS[0];
const SOURCE_CONFIG_PATH = "config/competitor-monitor-sources.json";
const DAILY_REPORT_DIR = "outputs/daily-briefings";
const DATA_GLOBAL = "window.__XINGCHEN_COMPETITOR_DATA__";
const TIMEZONE = "Asia/Shanghai";
const MAX_CANDIDATES = 30;
const MAX_MEDIA_CANDIDATES = 5;
const MEDIA_RELEVANCE_THRESHOLD = 7;
const REQUEST_TIMEOUT_MS = 15000;

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run") || process.env.DRY_RUN === "1";
const noFetch = args.has("no-fetch") || process.env.NO_FETCH === "1";
const targetDate = getTargetDate(args);
const runDate = formatShanghaiDate(new Date());
const runDateTime = formatShanghaiDateTime(new Date());

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const payload = readPayload(PRIMARY_DATA_PATH);
  removeAutoCandidateNewsForDate(payload, targetDate);
  const config = JSON.parse(readFileSync(SOURCE_CONFIG_PATH, "utf8"));
  const sources = normalizeSources(config.sources || []);
  const report = {
    targetDate,
    runDate,
    runDateTime,
    timezone: TIMEZONE,
    dryRun,
    noFetch,
    sourcesChecked: sources.length,
    exactMatches: [],
    candidates: [],
    errors: []
  };

  for (const source of sources) {
    const sourceResult = noFetch
      ? buildSkippedSourceResult(source)
      : await inspectSource(source);

    if (sourceResult.error) {
      report.errors.push(sourceResult.error);
      continue;
    }

    if (sourceResult.exactMatch) {
      const newsItem = buildNewsItem(source, sourceResult, targetDate);
      report.exactMatches.push({
        sourceId: source.id,
        dataSourceId: getDataSourceId(source),
        competitor: source.competitor,
        title: newsItem.title,
        url: source.url,
        keyword: sourceResult.keyword,
        snippet: sourceResult.snippet
      });
      addOrUpdateNews(payload, newsItem);
      removeNewsById(payload, buildCandidateNewsId(source.id, targetDate));
      addOrUpdateSource(payload, source);
      markCompetitorSeen(payload, source.competitor, targetDate);
      continue;
    }

    if (sourceResult.keyword && report.candidates.length < MAX_CANDIDATES) {
      const candidate = {
        sourceId: source.id,
        dataSourceId: getDataSourceId(source),
        competitor: source.competitor,
        name: source.name,
        url: source.url,
        type: source.type,
        categories: source.categories,
        sourcePriority: source.priority,
        keyword: sourceResult.keyword,
        relevanceScore: scoreCandidate(source, sourceResult),
        reason: "命中了关键词，但页面没有明确目标日期，系统按来源类型和内容相关性自动判断是否展示。",
        snippet: sourceResult.snippet
      };
      report.candidates.push(candidate);
      addOrUpdateSource(payload, source);
    }
  }

  const publishedCandidates = publishCandidateNews(payload, report);
  report.publishedCandidates = publishedCandidates.length;
  payload.updatedAt = runDateTime;
  payload.snapshotDate = targetDate;
  payload.note = `自动刷新已运行：${runDateTime}（北京时间），本次总结 ${targetDate} 的竞品动态。日期明确动态 ${report.exactMatches.length} 条，自动展示平台/高相关新闻线索 ${publishedCandidates.length} 条。`;
  payload.monitorRuns = [
    buildRunSummary(report),
    ...asArray(payload.monitorRuns).filter((item) => item?.targetDate !== targetDate)
  ].slice(0, 20);
  sortPayload(payload);

  if (dryRun) {
    console.log(`[dry-run] checked ${sources.length} sources for ${targetDate}`);
    console.log(`[dry-run] exact matches: ${report.exactMatches.length}, published candidates: ${publishedCandidates.length}, collected candidates: ${report.candidates.length}, errors: ${report.errors.length}`);
    return;
  }

  writePayloadMirrors(payload);
  writeDailyReports(report);
  console.log(`Daily refresh complete for ${targetDate}`);
  console.log(`Exact matches: ${report.exactMatches.length}`);
  console.log(`Published candidates: ${publishedCandidates.length}`);
  console.log(`Collected candidates: ${report.candidates.length}`);
  console.log(`Errors: ${report.errors.length}`);
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [rawKey, rawValue] = arg.slice(2).split("=");
    if (rawValue !== undefined) {
      parsed.set(rawKey, rawValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed.set(rawKey, next);
      index += 1;
    } else {
      parsed.set(rawKey, true);
    }
  }
  return parsed;
}

function getTargetDate(parsedArgs) {
  const explicit = parsedArgs.get("target-date") || process.env.TARGET_DATE;
  if (explicit) {
    assertDate(explicit, "target date");
    return explicit;
  }
  return offsetDate(formatShanghaiDate(new Date()), -1);
}

function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}. Expected YYYY-MM-DD.`);
  }
}

function formatShanghaiDate(date) {
  const parts = getShanghaiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatShanghaiDateTime(date) {
  const parts = getShanghaiParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function getShanghaiParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function offsetDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readPayload(path) {
  const content = readFileSync(path, "utf8");
  const match = content.match(/^window\.__XINGCHEN_COMPETITOR_DATA__\s*=\s*([\s\S]*?);\s*$/);
  if (!match) throw new Error(`Could not parse data payload from ${path}`);
  return Function(`"use strict"; return (${match[1]});`)();
}

function writePayloadMirrors(payload) {
  const serialized = `${DATA_GLOBAL} = ${JSON.stringify(payload, null, 2)};\n`;
  for (const path of DATA_PATHS) {
    if (path !== PRIMARY_DATA_PATH && !existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serialized);
  }
}

function normalizeSources(sources) {
  return sources
    .filter((source) => source && source.id && source.url && source.competitor)
    .map((source) => ({
      ...source,
      type: source.type || "official",
      priority: source.priority || "medium",
      categories: Array.isArray(source.categories) ? source.categories : ["model"],
      keywords: Array.isArray(source.keywords) ? source.keywords : []
    }));
}

async function inspectSource(source) {
  try {
    const fetched = await fetchSource(source);
    const text = fetched.text;
    const keyword = findKeyword(text, source.keywords);
    const exactMatch = Boolean(keyword && findDatePattern(text, targetDate));
    return {
      source,
      title: fetched.title,
      keyword,
      exactMatch,
      snippet: keyword ? buildSnippet(text, keyword) : ""
    };
  } catch (error) {
    return {
      source,
      error: {
        sourceId: source.id,
        competitor: source.competitor,
        name: source.name,
        url: source.url,
        message: error.message
      }
    };
  }
}

function buildSkippedSourceResult(source) {
  return {
    source,
    keyword: "",
    exactMatch: false,
    snippet: ""
  };
}

async function fetchSource(source) {
  if (typeof fetch !== "function") {
    throw new Error("Current Node.js runtime does not provide fetch. Use Node.js 20 or newer.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 competitor-monitor/1.0; +https://github.com/",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.6"
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const raw = await response.text();
    return {
      title: extractTitle(raw) || source.name,
      text: htmlToText(raw).slice(0, 90000)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1]).replace(/\s+/g, " ").trim() : "";
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (token, entity) => {
    if (entity[0] === "#") {
      const numeric = entity[1]?.toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : token;
    }
    return named[entity] || token;
  });
}

function findKeyword(text, keywords) {
  const lowerText = text.toLowerCase();
  return keywords.find((keyword) => lowerText.includes(String(keyword).toLowerCase())) || "";
}

function findDatePattern(text, dateString) {
  return datePatterns(dateString).some((pattern) => text.includes(pattern));
}

function datePatterns(dateString) {
  const [year, month, day] = dateString.split("-");
  const monthNumber = String(Number(month));
  const dayNumber = String(Number(day));
  return [
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
    `${year}.${month}.${day}`,
    `${year}年${month}月${day}日`,
    `${year}年${monthNumber}月${dayNumber}日`,
    `${month}月${day}日`,
    `${monthNumber}月${dayNumber}日`,
    `${month}.${dayNumber}`,
    `${monthNumber}.${dayNumber}`
  ];
}

function buildSnippet(text, keyword) {
  const index = text.toLowerCase().indexOf(String(keyword).toLowerCase());
  if (index < 0) return text.slice(0, 220);
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + String(keyword).length + 170);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

function buildNewsItem(source, sourceResult, dateString) {
  const sourceId = getDataSourceId(source);
  const hash = createHash("sha1")
    .update(`${source.id}|${dateString}|${sourceResult.keyword}|${sourceResult.snippet}`)
    .digest("hex")
    .slice(0, 8);
  const kind = source.type === "wechat" ? "公众号监测" : source.type === "media" ? "新闻监测" : "自动监测";
  return {
    id: `auto-${source.id}-${dateString}-${hash}`,
    competitor: source.competitor,
    date: dateString,
    kind,
    title: `${source.name} 出现 ${dateString} 相关更新线索`,
    summary: simplifySnippet(sourceResult.snippet, sourceResult.keyword),
    takeaway: "简单说，这是自动抓取到的疑似新动态，需要人工点开来源确认是否属于竞品功能、宣传、价格或生态动作。",
    categories: source.categories,
    priority: source.type === "official" ? source.priority : "pending",
    source: sourceId
  };
}

function publishCandidateNews(payload, report) {
  const candidates = asArray(report.candidates);
  const platformCandidates = candidates.filter((item) => item.type !== "media");
  const mediaCandidates = candidates
    .filter((item) => item.type === "media")
    .filter((item) => item.relevanceScore >= MEDIA_RELEVANCE_THRESHOLD)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, MAX_MEDIA_CANDIDATES);
  const selected = platformCandidates.concat(mediaCandidates);
  selected.forEach((candidate) => addOrUpdateNews(payload, buildCandidateNewsItem(candidate, report.targetDate)));
  return selected;
}

function buildCandidateNewsItem(candidate, dateString) {
  const isOfficial = candidate.type === "official";
  const isWechat = candidate.type === "wechat";
  const kind = isOfficial ? "平台更新监测" : isWechat ? "公众号监测" : "高相关新闻线索";
  const titleSuffix = isOfficial ? "公开更新内容" : isWechat ? "公众号内容信号" : "高相关新闻信号";
  const priority = isOfficial
    ? candidate.sourcePriority || "medium"
    : isWechat
      ? "medium"
      : candidate.relevanceScore >= 10 ? "medium" : "low";
  return {
    id: buildCandidateNewsId(candidate.sourceId, dateString),
    competitor: candidate.competitor,
    date: dateString,
    kind,
    title: `${candidate.name} ${titleSuffix}`,
    summary: simplifySnippet(candidate.snippet, candidate.keyword),
    takeaway: isOfficial
      ? "简单说，这是该平台公开文档或公告页中的相关更新内容，系统已纳入当天平台动态观察。"
      : isWechat
        ? "简单说，这是公众号检索中与竞品高度相关的内容信号，适合用来观察宣传重点和市场动作。"
        : "简单说，这是从新闻检索结果里筛出的高相关信号，低相关搜索结果已自动过滤。",
    categories: candidate.categories || ["model"],
    priority,
    source: candidate.dataSourceId,
    keyword: candidate.keyword,
    relevanceScore: candidate.relevanceScore,
    autoCandidate: true
  };
}

function buildCandidateNewsId(sourceId, dateString) {
  return `candidate-${sourceId}-${dateString}`;
}

function scoreCandidate(source, sourceResult) {
  if (source.type === "official") return 12;
  if (source.type === "wechat") return 10;

  const text = [
    source.name,
    source.vendor,
    sourceResult.keyword,
    sourceResult.snippet
  ].join(" ").toLowerCase();
  const competitorTerms = {
    volc: ["火山方舟", "火山引擎", "豆包", "bytedance"],
    baidu: ["百度千帆", "文心", "百度智能云", "baidu"],
    aliyun: ["阿里百炼", "通义", "qwen", "aliyun", "alibaba"],
    silicon: ["硅基流动", "siliconflow"],
    tencent: ["腾讯云", "ti-one", "混元", "hunyuan", "tencent"],
    huawei: ["华为云", "modelarts", "昇腾", "huawei"],
    zhipu: ["智谱", "glm", "bigmodel", "z.ai"]
  };
  const actionTerms = ["发布", "上线", "更新", "升级", "合作", "生态", "融资", "降价", "优惠", "套餐", "模型", "大模型", "智能体", "工具", "视频", "图像"];
  let score = source.priority === "high" ? 2 : source.priority === "medium" ? 1 : 0;
  for (const term of competitorTerms[source.competitor] || []) {
    if (text.includes(term.toLowerCase())) score += 2;
  }
  for (const term of actionTerms) {
    if (text.includes(term.toLowerCase())) score += 1;
  }
  if (text.includes("百度搜索") || text.includes("百度一下")) score -= 3;
  if (String(sourceResult.snippet || "").length < 80) score -= 1;
  return Math.max(0, score);
}

function simplifySnippet(snippet, keyword) {
  if (!snippet) return "自动监测发现该来源在目标日期附近有更新线索。";
  const compact = snippet.replace(/\s+/g, " ").replace(/\.\.\./g, "…").trim();
  const keywordPart = keyword ? `页面里出现了“${keyword}”相关内容。` : "页面里出现了相关内容。";
  return `${keywordPart} 原文片段：${compact.slice(0, 180)}${compact.length > 180 ? "…" : ""}`;
}

function addOrUpdateNews(payload, newsItem) {
  payload.news = asArray(payload.news);
  const index = payload.news.findIndex((item) => item.id === newsItem.id);
  if (index >= 0) payload.news[index] = { ...payload.news[index], ...newsItem };
  else payload.news.push(newsItem);
}

function removeNewsById(payload, id) {
  payload.news = asArray(payload.news).filter((item) => item?.id !== id);
}

function removeAutoCandidateNewsForDate(payload, dateString) {
  payload.news = asArray(payload.news).filter((item) => {
    if (item?.date !== dateString) return true;
    if (item?.autoCandidate) return false;
    if (item?.reviewStatus === "pending") return false;
    if (String(item?.id || "").startsWith("review-")) return false;
    if (String(item?.id || "").startsWith("candidate-")) return false;
    return true;
  });
}

function addOrUpdateSource(payload, source) {
  const sourceId = getDataSourceId(source);
  payload.sources = payload.sources && typeof payload.sources === "object" ? payload.sources : {};
  payload.sources[sourceId] = {
    ...(payload.sources[sourceId] || {}),
    title: source.name,
    vendor: source.vendor || source.name,
    url: source.url,
    type: source.type,
    note: source.note || `${source.name} 的自动监测来源，用于追踪竞品功能、模型、宣传和新闻动态。`
  };
}

function markCompetitorSeen(payload, competitorId, dateString) {
  payload.competitors = asArray(payload.competitors);
  const index = payload.competitors.findIndex((item) => item.id === competitorId);
  const update = {
    id: competitorId,
    lastSeen: dateString,
    watchNext: "自动监测发现新线索，建议人工复核原文后更新功能对比、宣传动作和星辰 MaaS 对应建议。"
  };
  if (index >= 0) payload.competitors[index] = { ...payload.competitors[index], ...update };
  else payload.competitors.push(update);
}

function buildRunSummary(report) {
  return {
    targetDate: report.targetDate,
    runDateTime: report.runDateTime,
    sourcesChecked: report.sourcesChecked,
    exactMatches: report.exactMatches.length,
    publishedCandidates: report.publishedCandidates || 0,
    candidates: report.candidates.length,
    errors: report.errors.length
  };
}

function sortPayload(payload) {
  payload.news = asArray(payload.news).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  payload.events = asArray(payload.events).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  payload.competitors = asArray(payload.competitors).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function writeDailyReports(report) {
  mkdirSync(DAILY_REPORT_DIR, { recursive: true });
  const jsonPath = `${DAILY_REPORT_DIR}/${report.targetDate}.json`;
  const markdownPath = `${DAILY_REPORT_DIR}/${report.targetDate}.md`;
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, buildMarkdownReport(report));
}

function buildMarkdownReport(report) {
  const lines = [
    `# 星辰 MaaS 竞品动态每日简报：${report.targetDate}`,
    "",
    `- 运行时间：${report.runDateTime}（北京时间）`,
    `- 检查来源：${report.sourcesChecked} 个`,
    `- 日期明确动态：${report.exactMatches.length} 条`,
    `- 自动展示线索：${report.publishedCandidates || 0} 条`,
    `- 采集线索：${report.candidates.length} 条`,
    `- 抓取异常：${report.errors.length} 条`,
    "",
    "## 日期明确动态",
    ""
  ];

  if (report.exactMatches.length) {
    report.exactMatches.forEach((item) => {
      lines.push(`- ${item.competitor}｜${item.title}`);
      lines.push(`  来源：${item.url}`);
      lines.push(`  片段：${item.snippet || "无"}`);
    });
  } else {
    lines.push("- 没有发现同时命中“目标日期 + 关键词”的动态。");
  }

  lines.push("", "## 采集线索", "");
  if (report.candidates.length) {
    report.candidates.forEach((item) => {
      const displayStatus = item.type === "media" && item.relevanceScore < MEDIA_RELEVANCE_THRESHOLD
        ? "低相关新闻已过滤"
        : "进入网页展示";
      lines.push(`- ${item.competitor}｜${item.name}｜关键词：${item.keyword}｜相关性 ${item.relevanceScore}｜${displayStatus}`);
      lines.push(`  来源：${item.url}`);
      lines.push(`  原因：${item.reason}`);
      if (item.snippet) lines.push(`  片段：${item.snippet}`);
    });
  } else {
    lines.push("- 没有采集线索。");
  }

  lines.push("", "## 抓取异常", "");
  if (report.errors.length) {
    report.errors.forEach((item) => {
      lines.push(`- ${item.competitor}｜${item.name}｜${item.message}`);
      lines.push(`  来源：${item.url}`);
    });
  } else {
    lines.push("- 没有抓取异常。");
  }

  lines.push("", "## 使用说明", "");
  lines.push("- 日期明确动态和平台更新监测会进入网页的数据文件，刷新网页后即可看到。");
  lines.push("- 官方和公众号来源全量展示；新闻检索来源只保留高相关结果，低相关搜索结果页会自动过滤。");
  lines.push("- 公众号和部分控制台页面可能有反爬或登录限制，抓不到时会在“抓取异常”里记录。");

  return `${lines.join("\n")}\n`;
}

function getDataSourceId(source) {
  return source.sourceId || source.id;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
