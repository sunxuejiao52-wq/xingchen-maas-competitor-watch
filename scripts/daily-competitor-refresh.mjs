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

const SOURCE_INTELLIGENCE_HINTS = {
  "volc-ark-docs": {
    title: "火山方舟：接口和多模态任务能力更新信号",
    summary: "更新重点集中在平台 API 和任务能力：对话/Responses、模型响应管理、文件处理、视频/图像/3D、批量任务、模型调优、效果评测、用量和安全审计等。",
    takeaway: "火山方舟在把模型调用做成完整 MaaS 平台能力，不只是提供一个模型接口；星辰 MaaS 可重点对比多模态任务、批量/调优/评测和用量管理体验。"
  },
  "baidu-qianfan-model": {
    title: "百度千帆：模型上新、升级和退役节奏信号",
    summary: "更新重点集中在模型生命周期管理：模型上新、版本升级、旧模型下线/退役，以及 GLM、Kimi、MiniMax、DeepSeek、Qwen 等第三方模型可用性。",
    takeaway: "百度千帆在强化“模型可选 + 版本治理”的平台心智；星辰 MaaS 可关注模型上下线提醒、替代模型建议和兼容迁移说明。"
  },
  "baidu-qianfan-platform": {
    title: "百度千帆：智能体、工作流和搜索工具更新信号",
    summary: "更新重点集中在应用搭建能力：工作流 Agent、多智能体协同、工具广场、知识库、RAG、AI 搜索、问题改写和行业模板。",
    takeaway: "百度正在把搜索、知识库和智能体流程组合成可用产品；星辰 MaaS 可重点对标企业知识接入、引用依据和工具编排能力。"
  },
  "baidu-qianfan-coding": {
    title: "百度千帆：开发者套餐和 API 使用权益信号",
    summary: "更新重点集中在 Coding Plan、Token Plan、API Key、额度、续费、套餐迁移和开发者入口。",
    takeaway: "百度在用套餐和额度降低开发者试用门槛；星辰 MaaS 可关注免费额度、套餐迁移提示和 API 接入路径是否足够清晰。"
  },
  "aliyun-bailian-models": {
    title: "阿里百炼：模型市场和多模态模型供给信号",
    summary: "更新重点集中在模型目录：Qwen/通义、DeepSeek、Kimi、GLM、MiniMax 等文本模型，以及图像、视频、3D、语音、向量和重排序模型。",
    takeaway: "阿里百炼在做“模型超市”和多模态能力聚合；星辰 MaaS 可重点对比模型分类、筛选、试用、价格和调用文档的一体化体验。"
  },
  "aliyun-bailian-mcp": {
    title: "阿里百炼：MCP 工具接入和智能体生态信号",
    summary: "更新重点集中在 MCP、工具调用、插件接入、联网搜索、网页抓取、地图和工作流能力。",
    takeaway: "阿里百炼在把模型能力延伸到工具生态；星辰 MaaS 可关注工具市场、权限管理、调用限流和可观测性。"
  },
  "aliyun-bailian-coding": {
    title: "阿里百炼：Coding Plan 和开发者接入信号",
    summary: "更新重点集中在 Coding Plan、API Key、Base URL、开发者套餐、计费和续费规则。",
    takeaway: "阿里百炼在强化开发者入口和迁移便利性；星辰 MaaS 可对比 API 接入、套餐说明和开发者文档转化效率。"
  },
  "siliconflow-release": {
    title: "硅基流动：模型上下线、价格和平台治理信号",
    summary: "更新重点集中在模型发布/下线、价格调整、限流、实名、迁移通知、DeepSeek/Qwen/GLM 等模型供给。",
    takeaway: "硅基流动的优势是高性价比和模型聚合；星辰 MaaS 可关注价格透明度、模型迁移提醒和稳定性承诺。"
  },
  "tencent-tione-docs": {
    title: "腾讯云 TI：训推平台和工程化能力信号",
    summary: "更新重点集中在数据接入、训练、推理、部署、模型管理、效果评测和资源管理。",
    takeaway: "腾讯云 TI 更偏工程平台和企业生产流程；星辰 MaaS 可重点对比部署、评测、资源管理和企业工作台能力。"
  },
  "huawei-modelarts-docs": {
    title: "华为 ModelArts：企业训练部署和行业模型信号",
    summary: "更新重点集中在 ModelArts/AgentArts、昇腾算力、训练部署、行业模型、企业落地和私有化能力。",
    takeaway: "华为 MaaS 更强调企业级落地、算力和行业方案；星辰 MaaS 可关注私有化、行业模板和国产算力适配能力。"
  },
  "zhipu-bigmodel-console": {
    title: "智谱 BigModel：GLM 模型广场和智能体能力信号",
    summary: "更新重点集中在 GLM 模型、长文本、代码、智能体和模型广场可用性。",
    takeaway: "智谱的核心心智仍是 GLM 系列模型和长任务能力；星辰 MaaS 可关注 GLM 外部平台上架、代码能力和 Agent 场景。"
  },
  "wechat-volc-ark": {
    title: "火山方舟：公众号宣传和产品发布信号",
    summary: "传播重点可能围绕豆包模型家族、火山方舟升级、客户案例、产品发布和优惠活动。",
    takeaway: "公众号侧更能反映火山方舟近期主推卖点；星辰 MaaS 可对比其宣传话术、客户案例和活动节奏。"
  },
  "wechat-baidu-qianfan": {
    title: "百度千帆：公众号宣传和应用案例信号",
    summary: "传播重点可能围绕文心/千帆平台、智能体应用、企业案例、套餐权益和生态合作。",
    takeaway: "公众号侧能看到百度把平台能力如何包装成场景方案；星辰 MaaS 可对比行业案例和产品化表达。"
  },
  "wechat-aliyun-bailian": {
    title: "阿里百炼：公众号宣传和通义生态信号",
    summary: "传播重点可能围绕通义千问、阿里百炼、模型/智能体/工作流、开发者活动和生态工具。",
    takeaway: "阿里在持续强化通义生态和开发者心智；星辰 MaaS 可关注活动入口、模型体验和工具生态传播。"
  },
  "wechat-siliconflow": {
    title: "硅基流动：公众号宣传和成本优势信号",
    summary: "传播重点可能围绕开源模型聚合、API 成本、DeepSeek/Qwen/GLM 供给、价格和开发者使用技巧。",
    takeaway: "硅基流动的传播核心是便宜、快和模型选择多；星辰 MaaS 可关注价格对比、调用稳定性和模型聚合体验。"
  },
  "wechat-zhipu-ai": {
    title: "智谱 AI：公众号宣传和 GLM 能力信号",
    summary: "传播重点可能围绕 GLM 模型、BigModel 平台、代码、长文本、智能体和开放 API。",
    takeaway: "智谱的宣传会放大 GLM 模型能力和开发者入口；星辰 MaaS 可关注其模型能力包装和生态合作。"
  }
};

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
  payload.note = `自动刷新已运行：${runDateTime}（北京时间），本次总结 ${targetDate} 的竞品动态。日期明确动态 ${report.exactMatches.length} 条，自动展示平台/高相关新闻线索 ${publishedCandidates.length} 条。`;
  payload.monitorRuns = [
    buildRunSummary(report),
    ...asArray(payload.monitorRuns).filter((item) => item?.targetDate !== targetDate)
  ].slice(0, 20);
  sortPayload(payload);
  payload.snapshotDate = getLatestKnownDate(payload, targetDate);

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
  const insight = buildIntelligenceSummary({
    sourceId: source.id,
    name: source.name,
    type: source.type,
    competitor: source.competitor,
    keyword: sourceResult.keyword,
    snippet: sourceResult.snippet,
    categories: source.categories
  });
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
    title: insight.title,
    summary: insight.summary,
    takeaway: insight.takeaway,
    evidence: buildEvidenceSnippet(sourceResult.snippet, sourceResult.keyword),
    categories: source.categories,
    priority: source.type === "official" ? source.priority : "medium",
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
  const insight = buildIntelligenceSummary(candidate);
  const isOfficial = candidate.type === "official";
  const isWechat = candidate.type === "wechat";
  const kind = isOfficial ? "平台更新监测" : isWechat ? "公众号监测" : "高相关新闻线索";
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
    title: insight.title,
    summary: insight.summary,
    takeaway: insight.takeaway,
    evidence: buildEvidenceSnippet(candidate.snippet, candidate.keyword),
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

function buildIntelligenceSummary(input) {
  const hint = SOURCE_INTELLIGENCE_HINTS[input.sourceId];
  if (hint) return hint;

  const capabilities = detectCapabilityLabels(input);
  const capabilityText = capabilities.length ? capabilities.join("、") : "模型/平台能力";
  const typeLabel = input.type === "media" ? "新闻" : input.type === "wechat" ? "公众号" : "平台";
  return {
    title: `${input.name}：${capabilities[0] || "竞品"}更新信号`,
    summary: `${typeLabel}信息显示，这条动态主要关联 ${capabilityText}。关键词为“${input.keyword || "未提取"}”，系统已按竞品、功能方向和来源相关性归入当天监测。`,
    takeaway: input.type === "media"
      ? "这类新闻用于判断竞品近期宣传、融资、生态合作或市场关注点；星辰 MaaS 可重点看它是否会影响模型供给、价格或企业客户心智。"
      : "这类平台信息用于判断竞品正在强化哪些可用能力；星辰 MaaS 可对照是否已经在官网、控制台和文档里把同类能力讲清楚。"
  };
}

function detectCapabilityLabels(input) {
  const text = [
    input.name,
    input.keyword,
    input.snippet,
    ...(input.categories || [])
  ].join(" ").toLowerCase();
  const rules = [
    ["模型供给", ["model", "模型", "大模型", "glm", "qwen", "通义", "deepseek", "kimi", "minimax", "豆包", "文心"]],
    ["智能体/工作流", ["agent", "智能体", "工作流", "多智能体", "插件", "工具调用"]],
    ["工具/MCP", ["mcp", "工具", "插件", "联网搜索", "网页抓取", "地图", "api"]],
    ["图像视频语音", ["multimodal", "多模态", "图像", "视频", "语音", "3d", "视觉"]],
    ["开发者套餐", ["coding plan", "token plan", "开发者", "api key", "base url", "额度", "套餐"]],
    ["价格/优惠", ["价格", "优惠", "计费", "免费", "降价", "续费"]],
    ["训练部署", ["训练", "部署", "推理", "训推", "模型管理", "评测", "资源管理"]],
    ["企业治理", ["安全", "审计", "权限", "实名", "限流", "迁移"]],
    ["搜索/知识库", ["搜索", "知识库", "rag", "热搜", "问题改写"]],
    ["生态/客户案例", ["合作", "生态", "融资", "客户案例", "发布"]]
  ];
  const labels = [];
  for (const [label, terms] of rules) {
    if (terms.some((term) => text.includes(term.toLowerCase()))) labels.push(label);
  }
  return labels.slice(0, 4);
}

function buildEvidenceSnippet(snippet, keyword) {
  if (!snippet) return "";
  const compact = snippet.replace(/\s+/g, " ").replace(/\.\.\./g, "…").trim();
  const prefix = keyword ? `命中“${keyword}”：` : "";
  return `${prefix}${compact.slice(0, 180)}${compact.length > 180 ? "…" : ""}`;
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

function getLatestKnownDate(payload, fallbackDate) {
  const dates = [
    fallbackDate,
    payload?.snapshotDate,
    ...asArray(payload?.events).map((item) => item?.date),
    ...asArray(payload?.news).map((item) => item?.date)
  ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")));
  return dates.length ? dates.sort().at(-1) : fallbackDate;
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
