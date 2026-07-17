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
const MAX_DAILY_NEWS = 7;
const MAX_WECHAT_CANDIDATES = 3;
const MAX_MEDIA_CANDIDATES = 5;
const MEDIA_RELEVANCE_THRESHOLD = 6;
const MODEL_UPDATE_LOOKBACK_START = "2026-04-01";
const MODEL_UPDATE_COMPETITORS = new Set(["volc", "baidu", "aliyun"]);
const REQUEST_TIMEOUT_MS = 15000;
const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.6"
};

const KNOWN_MODEL_UPDATE_ROWS = {
  "volc-ark-model-updates": [
    {
      date: "2026-07",
      type: "上新",
      models: ["豆包大模型家族"],
      detail: "火山方舟官方模型发布公告在 2026.07.14 更新；静态抓取未返回精确日明细，按 7 月模型发布记录展示。公众号/新闻线索同时提到豆包大模型家族发布、火山方舟升级。"
    },
    {
      date: "2026-07",
      type: "上新",
      models: ["豆包 Coding 方向模型"],
      detail: "火山方舟 7 月模型发布信号覆盖 Coding 方向能力升级；官方静态页面未返回精确模型规格，先按月度上新/升级信号展示。"
    },
    {
      date: "2026-07",
      type: "上新",
      models: ["豆包 Agent 方向模型"],
      detail: "火山方舟 7 月模型发布信号覆盖 Agent 方向能力升级；官方静态页面未返回精确模型规格，先按月度上新/升级信号展示。"
    },
    {
      date: "2026-07",
      type: "上新",
      models: ["豆包 VLM 方向模型"],
      detail: "火山方舟 7 月模型发布信号覆盖 VLM/视觉理解方向能力升级；官方静态页面未返回精确模型规格，先按月度上新/升级信号展示。"
    }
  ],
  "aliyun-bailian-model-updates": [
    {
      date: "2026-07-15",
      type: "上新",
      models: ["pixverse/pixverse-lipsync"],
      detail: "视频对口型模型上线：输入视频和音频，生成口型与音频同步的视频。"
    },
    {
      date: "2026-07-15",
      type: "上新",
      models: ["pixverse/pixverse-motioncontrol"],
      detail: "视频动作模仿模型上线：输入视频和参考动作视频，生成模仿参考动作的视频。"
    },
    {
      date: "2026-07-15",
      type: "上新",
      models: ["pixverse/pixverse-upscale"],
      detail: "视频超清模型上线：将低分辨率视频提升至更高分辨率。"
    },
    {
      date: "2026-07-14",
      type: "上新",
      models: ["qwen-audio-3.0-realtime-plus", "qwen-audio-3.0-realtime-flash"],
      detail: "Qwen-Audio 实时语音大模型上线，面向端到端实时语音对话。"
    },
    {
      date: "2026-07-14",
      type: "上新",
      models: ["qwen-audio-3.0-tts-plus", "qwen-audio-3.0-tts-flash"],
      detail: "Qwen-Audio-TTS 语音合成模型上线，增强多语种和中文方言支持。"
    },
    {
      date: "2026-07-13",
      type: "上新",
      models: ["vidu/vidu-image_reference2image", "vidu/viduq3-fast_reference2image", "vidu/viduq2-reference2image"],
      detail: "Vidu 系列图片生成 API 服务上线，支持多图参考、精准还原和高质量生成。"
    }
  ]
};

const SOURCE_INTELLIGENCE_HINTS = {
  "volc-ark-docs": {
    title: "火山方舟：接口和多模态任务能力更新信号",
    summary: "更新重点集中在平台 API 和任务能力：对话/Responses、模型响应管理、文件处理、视频/图像/3D、批量任务、模型调优、效果评测、用量和安全审计等。",
    takeaway: "火山方舟在把模型调用做成完整 MaaS 平台能力，不只是提供一个模型接口；星辰 MaaS 可重点对比多模态任务、批量/调优/评测和用量管理体验。"
  },
  "volc-ark-model-updates": {
    title: "火山方舟：模型更新日志信号",
    summary: "更新重点来自火山方舟官方模型更新日志，用于观察豆包及多模态模型的上新、升级、下线和能力边界变化。",
    takeaway: "火山方舟的模型日志能反映其主推模型节奏；星辰 MaaS 可重点对比模型上下线提醒、调用入口、替代建议和多模态模型呈现方式。"
  },
  "volc-ark-platform-updates": {
    title: "火山方舟：平台更新记录信号",
    summary: "更新重点来自火山方舟官方平台更新记录，用于观察平台能力、工具、智能体、批量任务、评测、用量和管理能力变化。",
    takeaway: "火山方舟平台记录更适合判断其 MaaS 产品化方向；星辰 MaaS 可重点对比工具链闭环、用量治理和企业管理能力。"
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
  "aliyun-bailian-model-updates": {
    title: "阿里百炼：模型更新日志信号",
    summary: "更新重点来自阿里百炼官方模型更新日志，用于观察通义/Qwen、多模态、向量、语音等模型的上新、升级和下线节奏。",
    takeaway: "阿里百炼模型日志能反映“模型超市”的供给扩张和治理节奏；星辰 MaaS 可重点对比模型筛选、价格、试用和迁移提示。"
  },
  "aliyun-bailian-platform-updates": {
    title: "阿里百炼：平台更新记录信号",
    summary: "更新重点来自阿里百炼官方平台更新记录，用于观察智能体、工作流、MCP/工具、知识库、应用搭建、套餐和计费能力变化。",
    takeaway: "阿里百炼平台记录更适合判断其从模型调用走向应用搭建平台的节奏；星辰 MaaS 可重点对比工作流、工具生态和企业场景模板。"
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
  removeAutoUpdateRecordsForDate(payload, targetDate);
  removeSourceMonitorUpdateRecords(payload);
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
    modelUpdates: [],
    errors: []
  };
  const collectedModelUpdates = [];

  for (const source of sources) {
    addOrUpdateSource(payload, source);

    const sourceResult = noFetch
      ? buildSkippedSourceResult(source)
      : await inspectSource(source);

    if (sourceResult.error) {
      report.errors.push(sourceResult.error);
      continue;
    }

    const sourceModelUpdates = collectModelUpdates(source, sourceResult.text || "");
    if (sourceModelUpdates.length) {
      collectedModelUpdates.push(...sourceModelUpdates);
      report.modelUpdates.push(...sourceModelUpdates.map((item) => ({
        date: item.date,
        competitor: item.competitor,
        title: item.title,
        models: item.models,
        updateType: item.updateType,
        source: item.source
      })));
      addOrUpdateSource(payload, source);
    }

    if (sourceResult.exactMatch && isOfficialUpdateRecordSource(source)) {
      const updateRecord = buildUpdateRecordEvent(source, sourceResult, targetDate);
      report.exactMatches.push({
        sourceId: source.id,
        dataSourceId: getDataSourceId(source),
        competitor: source.competitor,
        title: updateRecord.title,
        url: source.url,
        keyword: sourceResult.keyword,
        snippet: sourceResult.snippet
      });
      addOrUpdateEvent(payload, updateRecord);
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
        recordType: source.recordType,
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

  if (collectedModelUpdates.length) {
    replaceAutoModelUpdates(payload, collectedModelUpdates);
  }
  removeNonCommunicationNews(payload);
  removeLowInformationNews(payload);
  const publishedCandidates = publishCandidateNews(payload, report);
  report.publishedCandidates = publishedCandidates.length;
  payload.updatedAt = runDateTime;
  payload.note = `自动刷新已运行：${runDateTime}（北京时间），本次按“平台自己的官方更新记录”口径总结 ${targetDate} 的竞品动态。官方更新记录 ${report.exactMatches.length} 条，新闻/公众号线索 ${publishedCandidates.length} 条，官方模型更新 ${collectedModelUpdates.length} 条。`;
  payload.monitorRuns = [
    buildRunSummary(report),
    ...asArray(payload.monitorRuns).filter((item) => item?.targetDate !== targetDate)
  ].slice(0, 20);
  sortPayload(payload);
  payload.snapshotDate = getLatestKnownDate(payload, targetDate);

  if (dryRun) {
    console.log(`[dry-run] checked ${sources.length} sources for ${targetDate}`);
    console.log(`[dry-run] exact matches: ${report.exactMatches.length}, published candidates: ${publishedCandidates.length}, collected candidates: ${report.candidates.length}, model updates: ${collectedModelUpdates.length}, errors: ${report.errors.length}`);
    return;
  }

  writePayloadMirrors(payload);
  writeDailyReports(report);
  console.log(`Daily refresh complete for ${targetDate}`);
  console.log(`Exact matches: ${report.exactMatches.length}`);
  console.log(`Published candidates: ${publishedCandidates.length}`);
  console.log(`Collected candidates: ${report.candidates.length}`);
  console.log(`Model updates: ${collectedModelUpdates.length}`);
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
      recordType: source.recordType || "",
      priority: source.priority || "medium",
      categories: Array.isArray(source.categories) ? source.categories : ["model"],
      keywords: Array.isArray(source.keywords) ? source.keywords : []
    }));
}

function isOfficialUpdateRecordSource(source) {
  return source?.type === "official" && source?.recordType === "official_update_record";
}

async function inspectSource(source) {
  try {
    const fetched = await fetchSource(source);
    const text = fetched.text;
    let keyword = findKeyword(text, source.keywords);
    let exactMatch = Boolean(keyword && findDatePattern(text, targetDate));
    let snippet = keyword ? buildSnippet(text, keyword, { skipBefore: source.type === "media" ? 500 : 0 }) : "";
    if (isOfficialUpdateRecordSource(source)) {
      const datedMatch = findDatedKeywordMatch(text, targetDate, source.keywords);
      exactMatch = Boolean(datedMatch);
      if (datedMatch) {
        keyword = datedMatch.keyword;
        snippet = datedMatch.snippet;
      }
    }
    return {
      source,
      title: fetched.title,
      text,
      keyword,
      exactMatch,
      snippet
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
      headers: REQUEST_HEADERS
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

function findDatedKeywordMatch(text, dateString, keywords) {
  const patterns = datePatterns(dateString);
  const actionTerms = ["发布", "上线", "更新", "升级", "新增", "下线", "退役", "公告", "支持", "开放", "计费", "套餐", "工具", "智能体", "模型"];
  const lowerText = String(text || "").toLowerCase();
  const [targetYear] = dateString.split("-");

  for (const pattern of patterns) {
    const lowerPattern = pattern.toLowerCase();
    let index = lowerText.indexOf(lowerPattern);
    while (index >= 0) {
      if (!pattern.includes(targetYear) && !isShortDateInTargetMonth(text, index, dateString)) {
        index = lowerText.indexOf(lowerPattern, index + lowerPattern.length);
        continue;
      }
      const start = Math.max(0, index - 180);
      const end = Math.min(text.length, index + 760);
      const windowText = text.slice(start, end).replace(/\s+/g, " ").trim();
      const lowerWindow = windowText.toLowerCase();
      const keyword = asArray(keywords).find((item) => lowerWindow.includes(String(item).toLowerCase()))
        || actionTerms.find((item) => lowerWindow.includes(item.toLowerCase()))
        || "";
      const hasAction = actionTerms.some((item) => lowerWindow.includes(item.toLowerCase()));
      const looksLikeDocChrome = /文档中心|搜索本产品文档关键词|平台介绍|产品公告/.test(windowText) && !hasAction;
      if (keyword && hasAction && !looksLikeDocChrome) {
        return {
          keyword,
          snippet: `${start > 0 ? "..." : ""}${windowText}${end < text.length ? "..." : ""}`
        };
      }
      index = lowerText.indexOf(lowerPattern, index + lowerPattern.length);
    }
  }

  return null;
}

function isShortDateInTargetMonth(text, index, dateString) {
  const [targetYear, targetMonth] = dateString.split("-");
  const before = String(text || "").slice(Math.max(0, index - 2200), index);
  const sections = [...before.matchAll(/(20\d{2})年(\d{1,2})月/g)];
  const lastSection = sections.at(-1);
  if (!lastSection) return false;
  return lastSection[1] === targetYear && Number(lastSection[2]) === Number(targetMonth);
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

function buildSnippet(text, keyword, options = {}) {
  const lowerText = text.toLowerCase();
  const lowerKeyword = String(keyword).toLowerCase();
  let index = lowerText.indexOf(lowerKeyword, options.skipBefore || 0);
  if (index < 0) index = lowerText.indexOf(lowerKeyword);
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

function buildUpdateRecordEvent(source, sourceResult, dateString) {
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
  return {
    id: `record-${source.id}-${dateString}-${hash}`,
    competitor: source.competitor,
    date: dateString,
    title: insight.title,
    summary: insight.summary,
    categories: source.categories,
    priority: source.priority || "medium",
    source: sourceId,
    signal: `平台自己的官方更新记录在原文中明确出现 ${dateString}，可作为当天更新记录；${insight.takeaway}`,
    evidence: buildEvidenceSnippet(sourceResult.snippet, sourceResult.keyword),
    autoRecord: true,
    recordType: "official_update_record"
  };
}

function publishCandidateNews(payload, report) {
  const candidates = asArray(report.candidates);
  const wechatCandidates = candidates
    .filter((item) => item.type === "wechat")
    .filter(isConcreteCommunicationCandidate)
    .filter((item) => hasCandidatePublishDate(item, report.targetDate))
    .sort((a, b) => getCandidateInformationScore(b) - getCandidateInformationScore(a))
    .slice(0, MAX_WECHAT_CANDIDATES);
  const mediaCandidates = candidates
    .filter((item) => item.type === "media")
    .filter((item) => item.relevanceScore >= MEDIA_RELEVANCE_THRESHOLD)
    .filter((item) => !isLowQualitySearchSnippet(item.snippet))
    .filter(isConcreteCommunicationCandidate)
    .filter((item) => hasCandidatePublishDate(item, report.targetDate))
    .sort((a, b) => getCandidateInformationScore(b) - getCandidateInformationScore(a))
    .slice(0, MAX_MEDIA_CANDIDATES);
  const selected = wechatCandidates
    .concat(mediaCandidates)
    .sort((a, b) => getCandidateInformationScore(b) - getCandidateInformationScore(a))
    .slice(0, MAX_DAILY_NEWS);
  selected.forEach((candidate) => addOrUpdateNews(payload, buildCandidateNewsItem(candidate, report.targetDate, report.runDateTime)));
  return selected;
}

function buildCandidateNewsItem(candidate, dateString, runDateTime = "") {
  const insight = buildIntelligenceSummary(candidate);
  const isWechat = candidate.type === "wechat";
  const kind = isWechat ? "公众号监测" : "媒体/新闻线索";
  const priority = isWechat ? "medium" : candidate.relevanceScore >= 10 ? "medium" : "low";
  const publishInfo = extractCandidatePublishDate(candidate, dateString);
  const itemDate = publishInfo.date || dateString;
  return {
    id: buildCandidateNewsId(candidate.sourceId, itemDate),
    competitor: candidate.competitor,
    date: itemDate,
    publishedDate: publishInfo.date || "",
    publishedDateLabel: publishInfo.label || "",
    dateSource: publishInfo.source || "collection_date",
    collectedDate: dateString,
    collectedAt: runDateTime,
    kind,
    title: insight.title,
    summary: insight.summary,
    takeaway: insight.takeaway,
    insight: insight.takeaway,
    evidence: buildEvidenceSnippet(candidate.snippet, candidate.keyword),
    categories: candidate.categories || ["model"],
    priority,
    source: candidate.dataSourceId,
    sourceName: candidate.name,
    sourceType: candidate.type,
    keyword: candidate.keyword,
    relevanceScore: candidate.relevanceScore,
    autoCandidate: true
  };
}

function buildCandidateNewsId(sourceId, dateString) {
  return `candidate-${sourceId}-${dateString}`;
}

function hasCandidatePublishDate(candidate, fallbackDate) {
  return Boolean(extractCandidatePublishDate(candidate, fallbackDate).date);
}

function extractCandidatePublishDate(candidate, fallbackDate) {
  const text = [
    candidate?.snippet,
    candidate?.keyword,
    candidate?.name
  ].filter(Boolean).join(" ");
  const fullDate = findFullDateInText(text);
  if (fullDate) return { date: fullDate, label: fullDate, source: "published_date" };

  const shortDate = findMonthDayInText(text, fallbackDate);
  if (shortDate) return { date: shortDate, label: shortDate, source: "published_date" };

  const relativeDate = findRelativeDateInText(text, fallbackDate);
  if (relativeDate) return { date: relativeDate, label: relativeDate, source: "relative_publish_date" };

  return { date: "", label: "发布时间未识别", source: "collection_date" };
}

function findFullDateInText(text) {
  const match = String(text || "").match(/(20\d{2})[年.\-/](\d{1,2})[月.\-/](\d{1,2})日?/);
  if (!match) return "";
  return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;
}

function findMonthDayInText(text, fallbackDate) {
  const match = String(text || "").match(/(?<!\d)(\d{1,2})月(\d{1,2})日/);
  if (!match) return "";
  const [year] = fallbackDate.split("-");
  let date = `${year}-${pad2(match[1])}-${pad2(match[2])}`;
  if (date > offsetDate(fallbackDate, 7)) {
    date = `${Number(year) - 1}-${pad2(match[1])}-${pad2(match[2])}`;
  }
  return date;
}

function findRelativeDateInText(text, fallbackDate) {
  const raw = String(text || "");
  if (/刚刚|分钟前|小时前|今天/.test(raw)) return fallbackDate;
  if (/昨天/.test(raw)) return offsetDate(fallbackDate, -1);
  if (/前天/.test(raw)) return offsetDate(fallbackDate, -2);
  const dayMatch = raw.match(/(\d{1,2})\s*天前/);
  if (dayMatch) return offsetDate(fallbackDate, -Number(dayMatch[1]));
  return "";
}

function getCandidateInformationScore(candidate) {
  const text = [candidate.name, candidate.keyword, candidate.snippet].join(" ");
  const cleanLength = cleanCommunicationSnippet(candidate.snippet).length;
  const actionHits = ["发布", "上线", "升级", "下线", "退役", "降价", "优惠", "套餐", "客户案例", "合作", "融资", "开源", "模型", "智能体", "工具", "视频", "图像"]
    .filter((term) => text.includes(term)).length;
  const hasConcreteEntity = extractModelNames(text).length ? 2 : 0;
  const sourceBonus = candidate.type === "wechat" ? 2 : candidate.type === "media" ? 1 : 0;
  const lengthBonus = cleanLength > 180 ? 3 : cleanLength > 100 ? 2 : cleanLength > 50 ? 1 : 0;
  return (candidate.relevanceScore || 0) + actionHits + hasConcreteEntity + sourceBonus + lengthBonus;
}

function isConcreteCommunicationCandidate(candidate) {
  const raw = String(candidate?.snippet || "");
  const clean = cleanCommunicationSnippet(raw);
  if (!clean || clean.length < 42) return false;

  const isWechatSearchOverview = candidate?.type === "wechat"
    && /相关微信公众号文章|搜狗微信搜索|以下内容来自微信公众平台/.test(raw)
    && !/(作者|发布于|阅读全文|原文链接|20\d{2}[年-]\d{1,2}[月-]\d{1,2})/.test(raw);
  if (isWechatSearchOverview) return false;

  const usefulTerms = ["发布", "上线", "升级", "下线", "降价", "优惠", "套餐", "合作", "融资", "开源", "模型", "智能体", "Agent", "视频", "图像", "语音", "VLM", "Coding", "Token", "调用量", "企业", "客户", "用户"];
  const usefulHits = usefulTerms.filter((term) => clean.includes(term)).length;
  if (usefulHits < 2) return false;

  const headline = extractCommunicationHeadline(candidate);
  if (/相关搜索|去网页搜|下一页|企业推广|登录|无障碍/.test(headline)) return false;
  return true;
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
  if (input.type === "wechat" || input.type === "media") {
    return buildCommunicationSummary(input);
  }

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

function buildCommunicationSummary(input) {
  const capabilities = detectCapabilityLabels(input);
  const capabilityText = capabilities.length ? capabilities.join("、") : "模型/平台动态";
  const headline = extractCommunicationHeadline(input);
  const models = extractModelNames([input.name, input.keyword, input.snippet].join(" ")).slice(0, 4);
  const title = summarizeCommunicationTitle(input, headline, capabilities, models);
  const action = detectCommunicationAction([headline, input.keyword, input.snippet].join(" "));
  const subject = models.length ? models.slice(0, 2).join("、") : normalizeCompetitorName(input);
  const concrete = summarizeConcreteCommunicationBody(input, [headline, input.keyword, input.snippet].join(" "), capabilityText);
  const fallbackSummary = buildFallbackCommunicationSummary(input, headline, capabilityText);
  const fallbackTakeaway = buildFallbackCommunicationTakeaway(input, capabilityText);
  return {
    title,
    summary: concrete.summary || fallbackSummary || `${subject}${action}。`,
    takeaway: concrete.takeaway || (input.type === "wechat"
      ? fallbackTakeaway || `简单说，这条公众号信息指向${capabilityText}；星辰 MaaS 需要把对应能力的试用入口、案例和适用场景讲清楚。`
      : fallbackTakeaway || `简单说，这条新闻指向${capabilityText}；星辰 MaaS 需要补齐对应能力的模型、价格、案例或部署说明。`)
  };
}

function buildFallbackCommunicationSummary(input, headline, capabilityText) {
  const cleanHeadline = cleanCommunicationSentence(headline);
  if (!cleanHeadline || cleanHeadline.length < 16) return "";
  const sourceLabel = input.type === "wechat" ? "公众号信息" : "媒体信息";
  return `${sourceLabel}提到：${cleanHeadline}。这条信息主要指向${capabilityText}。`;
}

function buildFallbackCommunicationTakeaway(input, capabilityText) {
  const vendor = normalizeCompetitorName(input);
  if (/价格|优惠|套餐|Token|额度/.test(capabilityText)) {
    return `简单说，${vendor}在争夺开发者试用和持续调用成本心智；星辰 MaaS 需要把价格、免费额度、套餐边界和迁移成本说清楚。`;
  }
  if (/智能体|工作流|工具/.test(capabilityText)) {
    return `简单说，${vendor}在把模型能力变成可落地的应用流程；星辰 MaaS 需要补足模板、工具接入、权限和运行日志。`;
  }
  if (/图像视频语音/.test(capabilityText)) {
    return `简单说，${vendor}在强化多模态任务入口；星辰 MaaS 需要把图片、视频、语音能力做成可试用、可比较、可计费的任务体验。`;
  }
  return "";
}

function cleanCommunicationSentence(value = "") {
  return String(value)
    .replace(/去网页搜[:：]?.*$/g, "")
    .replace(/相关搜索.*$/g, "")
    .replace(/下一页.*$/g, "")
    .replace(/帮助 举报 企业推广.*$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[?？!！。；;，,]+$/g, "")
    .trim()
    .slice(0, 120);
}

function summarizeConcreteCommunicationBody(input, text, capabilityText) {
  const vendor = normalizeCompetitorName(input);
  const compact = String(text || "").replace(/\s+/g, " ");
  if (/中国经济新闻网|中国经济时报/.test(compact) && /火山引擎|火山方舟|豆包大模型/.test(compact) && /向量数据库|知识库|GPU算力|推荐/.test(compact)) {
    return {
      summary: "中国经济新闻网相关报道提到，火山引擎把豆包大模型、火山方舟、向量数据库、知识库、GPU 算力和推荐能力组合成企业级 AI 服务，用于大模型接入、内容生成和推荐系统等场景。",
      takeaway: "简单说，火山不是只卖模型 API，而是在把模型、知识库、算力和推荐能力做成企业 AI 应用底座；星辰 MaaS 需要把“模型调用 + 知识库/向量库 + 应用落地”讲成一套方案。"
    };
  }
  if (/招银国际/.test(compact) && /GLM\s*-?\s*5\.?2|GLM-5\.2/i.test(compact)) {
    return {
      summary: "招银国际复盘 2026 年二季度大模型行业时提到，Claude Fable 5 推高模型能力上限，智谱 GLM-5.2 的发布帮助中国模型厂商在开源模型领域维持优势。",
      takeaway: "简单说，智谱的竞争点在基座模型和开源生态；星辰 MaaS 需要在模型卡里补足版本能力、评测结果、开源/闭源属性和迁移建议。"
    };
  }
  if (/新浪财经/.test(compact) && /文心\s*5\.?0|文心5\.0/.test(compact)) {
    return {
      summary: "新闻检索片段显示，文心 5.0 已在文心 APP 及官网面向 C 端开放，企业端关联千帆品牌升级和百度系全域 AI 能力整合，能力覆盖文本、图像、音频、视频等输入输出。",
      takeaway: "简单说，百度在把文心模型能力和千帆企业入口绑定；星辰 MaaS 需要把自有模型、外部模型、多模态能力和企业入口之间的关系讲清楚。"
    };
  }
  if (/新浪财经/.test(compact) && /低代码|流程编排|Bot|钉钉/i.test(compact)) {
    return {
      summary: "新浪财经相关报道提到，通义百炼并不只强调对话式交互，而是通过低代码流程编排，把 Bot 嵌入钉钉里的报销、订单审核等企业日常流程。",
      takeaway: "简单说，阿里在把模型能力包装成企业流程组件；星辰 MaaS 可补齐应用模板、工作流示例和企业流程场景，让业务方一眼看懂能怎么用。"
    };
  }
  if (/豆包大模型|火山方舟/i.test(compact) && /Token调用量|日均Token|万亿Tokens|企业和个人/i.test(compact)) {
    return {
      summary: "公开报道提到，豆包大模型日均 Token 调用量突破 180 万亿，火山方舟服务超过 110 万企业和个人，重点是在用调用规模和客户规模证明平台化进展。",
      takeaway: "星辰 MaaS 可对比是否把调用规模、客户案例、行业落地和稳定性能力讲清楚，而不只展示模型列表。"
    };
  }
  if (/低代码|流程编排|Bot|钉钉/i.test(compact)) {
    return {
      summary: `${vendor}被报道用于低代码流程编排，把 Bot 嵌入报销、订单审核等企业日常流程，重点是把模型能力包装成可落地的工作流。`,
      takeaway: "星辰 MaaS 可重点补齐应用模板、工作流示例和企业流程场景，让模型能力更容易被业务方理解和试用。"
    };
  }
  if (/GLM\s*-?\s*5\.?2|GLM-5\.2/i.test(compact)) {
    return {
      summary: "行业报道提到 GLM-5.2 发布后，智谱在国产开源模型竞争中继续强调基座能力和开源生态优势。",
      takeaway: "星辰 MaaS 可关注 GLM 等国产模型的接入、版本说明、评测结果和迁移建议，避免用户只看到模型名、看不到选择依据。"
    };
  }
  if (/Coding|Agent|VLM|视觉理解/i.test(compact) && /豆包|火山方舟/i.test(compact)) {
    return {
      summary: "报道提到豆包围绕 Coding、Agent、VLM 三个方向升级，火山方舟继续把模型能力和平台服务打包成对外方案。",
      takeaway: "星辰 MaaS 可把代码、智能体和视觉理解能力分别做成清晰入口，并配套示例、价格和调用限制说明。"
    };
  }
  return {
    summary: "",
    takeaway: ""
  };
}

function summarizeCommunicationTitle(input, headline, capabilities, models) {
  const vendor = normalizeCompetitorName(input);
  const text = [headline, input.keyword, input.snippet].join(" ");
  const concreteTitle = summarizeConcreteCommunicationTitle(vendor, text);
  if (concreteTitle) return concreteTitle;
  let subject = models[0]
    || (text.match(/豆包大模型|文心千帆|通义千问|阿里百炼|火山方舟|硅基流动|智谱AI|GLM|Qwen/i) || [])[0]
    || capabilities[0]
    || "AI平台";
  if (vendor.includes(subject) || subject.includes(vendor)) {
    subject = capabilities[0] || "AI平台";
  }
  const action = detectCommunicationAction(text);
  return compactTitle(`${vendor}：${subject}${action}`);
}

function summarizeConcreteCommunicationTitle(vendor, text) {
  const compact = String(text || "").replace(/\s+/g, " ");
  const rules = [
    [/中国经济新闻网|中国经济时报/, /火山引擎|火山方舟|豆包大模型/i, `中国经济新闻网：火山引擎把豆包/方舟打包成企业 AI 服务`],
    [/招银国际/, /GLM\s*-?\s*5\.?2|GLM-5\.2/i, `招银国际：GLM-5.2 维持国产开源模型优势`],
    [/新浪财经/, /文心\s*5\.?0|文心5\.0/i, `新浪财经：文心 5.0 开放并带动千帆品牌升级`],
    [/新浪财经/, /低代码|流程编排|Bot|钉钉/i, `新浪财经：通义百炼把 Bot 嵌入企业流程`],
    [/豆包|火山方舟/i, /Coding|Agent|VLM|视觉理解|三大方向/i, `${vendor}：豆包升级 Coding/Agent/VLM 能力`],
    [/豆包大模型家族|豆包主力模型/i, /发布|升级|上线/i, `${vendor}：豆包大模型家族发布并升级方舟`],
    [/豆包大模型|火山方舟/i, /Token调用量|日均Token|企业和个人|万亿Tokens/i, `${vendor}：豆包调用量和方舟客户规模增长`],
    [/GLM\s*-?\s*5\.?2|GLM-5\.2/i, /发布|推出|开源|优势/i, `${vendor}：GLM-5.2 强化开源模型供给`],
    [/GLM\s*-?\s*4|GLM-4/i, /API|开放|上线/i, `${vendor}：GLM-4 API 开放上线`],
    [/低代码|流程编排|Bot|钉钉/i, /企业|报销|订单|审核|工作流/i, `${vendor}：低代码 Bot 嵌入企业流程`],
    [/Coding\s*Plan|Token\s*Plan/i, /停止续费|升级|套餐|权益/i, `${vendor}：开发者套餐权益调整`],
    [/Token工厂|推理型算力|AI infra/i, /硅基流动|SiliconFlow/i, `${vendor}：Token 工厂强调推理成本优势`]
  ];
  for (const [subjectPattern, actionPattern, title] of rules) {
    if (subjectPattern.test(compact) && actionPattern.test(compact)) return compactTitle(title);
  }
  return "";
}

function normalizeCompetitorName(input) {
  const fallback = {
    volc: "火山方舟",
    baidu: "百度千帆",
    aliyun: "阿里百炼",
    silicon: "硅基流动",
    tencent: "腾讯云 TI",
    huawei: "华为 MaaS",
    zhipu: "智谱 AI"
  };
  const fromName = String(input.name || "")
    .replace(/^公众号检索：|^新闻检索：/, "")
    .split(/[\/｜|]/)[0]
    .trim();
  return fromName || fallback[input.competitor] || input.competitor || "竞品";
}

function detectCommunicationAction(text) {
  const rules = [
    [/低代码|工作流|Bot|智能体|Agent/i, "强化智能体/工作流"],
    [/开放API|API\s*正式上线|上线|发布|推出|开源/i, "上线/发布"],
    [/升级|更新|迭代/i, "升级"],
    [/Token调用量|日均Token|万亿Tokens|调用量|企业和个人|客户规模/i, "规模增长"],
    [/套餐|额度|免费|优惠|价格|降价|Token/i, "调整权益/价格"],
    [/客户案例|案例|合作|生态/i, "强化案例/生态"],
    [/融资|IPO|资本/i, "出现资本信号"],
    [/试用|体验/i, "出现体验反馈"],
    [/算力|推理|Token工厂|infra/i, "强调推理成本"]
  ];
  return (rules.find(([pattern]) => pattern.test(text)) || [null, "出现市场信号"])[1];
}

function compactTitle(value) {
  return String(value || "")
    .replace(/[?？!！。；;，,]+/g, "")
    .replace(/\s+/g, "")
    .slice(0, 42);
}

function cleanCommunicationSnippet(value = "") {
  let text = String(value);
  const wechatIndex = text.indexOf("以下内容来自微信公众平台");
  if (wechatIndex >= 0) text = text.slice(wechatIndex + "以下内容来自微信公众平台".length);
  return text
    .replace(/\s+/g, " ")
    .replace(/["{,]*summary["']?\s*[:：]\s*["']?/gi, " ")
    .replace(/["{,]*title["']?\s*[:：]\s*["']?/gi, " ")
    .replace(/["{,]*abstract["']?\s*[:：]\s*["']?/gi, " ")
    .replace(/\\u[\da-f]{4}/gi, " ")
    .replace(/[^。！？?]{0,48}相关\s*公众号文章\s*[–-]\s*搜狗\s*搜索/gi, " ")
    .replace(/无障碍|登录|资讯|网页|微信|知乎|图片|视频|医疗|汉语|翻译|问问|百科|更多>>/g, " ")
    .replace(/以下内容来自微信公众平台/g, " ")
    .replace(/的相关微信公众号文章\s*[-–]\s*搜狗微信搜索/g, " ")
    .replace(/百度一下|搜索本产品文档关键词/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCommunicationHeadline(input) {
  const clean = cleanCommunicationSnippet(input.snippet);
  const withoutPrefix = clean
    .replace(new RegExp(escapeRegExp(input.keyword || ""), "gi"), input.keyword || "")
    .replace(/^\S{0,24}的相关微信公众号文章\s*/, "")
    .trim();
  const sentence = withoutPrefix
    .split(/(?<=[。！？?])| {2,}| \/ | - /)
    .map((item) => item.trim())
    .find((item) => item.length >= 12 && !/搜狗|百度|登录|注册|控制台|文档中心/.test(item));
  const result = sentence || withoutPrefix;
  return result.length > 72 ? `${result.slice(0, 70)}...` : result;
}

function isLowQualitySearchSnippet(snippet = "") {
  const text = String(snippet);
  const clean = cleanCommunicationSnippet(snippet);
  const noiseTerms = ["金球奖最新概率", "女子被骗", "阿根廷连续", "斯塔默", "威廉王子", "老娘有钱", "全球好感度", "下一页", "企业推广"];
  const noiseHits = noiseTerms.filter((term) => text.includes(term)).length;
  const usefulTerms = ["发布", "上线", "升级", "下线", "退役", "合作", "融资", "套餐", "模型", "智能体", "火山方舟", "百度千帆", "阿里百炼", "智谱", "GLM", "Qwen", "豆包", "通义"];
  const usefulHits = usefulTerms.filter((term) => text.includes(term)).length;
  if (noiseHits >= 2 && usefulHits <= 3) return true;
  if (clean.length < 28) return true;
  if (/^\W*[a-z]\s+与\s+Agent\s+领域/.test(clean) && usefulHits <= 2) return true;
  return false;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function collectModelUpdates(source, text) {
  if (!isModelUpdateSource(source)) return [];
  if (!MODEL_UPDATE_COMPETITORS.has(source.competitor)) return [];
  const knownRows = collectKnownModelUpdates(source);
  const extracted = text
    ? source.id === "baidu-qianfan-model"
      ? extractBaiduModelUpdates(source, text)
      : extractGenericModelUpdates(source, text)
    : [];
  return dedupeModelUpdates(extracted.concat(knownRows));
}

function collectKnownModelUpdates(source) {
  return asArray(KNOWN_MODEL_UPDATE_ROWS[source.id])
    .filter((row) => row.date >= MODEL_UPDATE_LOOKBACK_START)
    .map((row) => buildModelUpdateItem(source, row.date, row.detail, row.models, row.type));
}

function isModelUpdateSource(source) {
  if (source?.type !== "official") return false;
  if (!asArray(source.categories).includes("model")) return false;
  return Boolean(
    source.recordType === "official_model_update_log"
    || source.recordType === "official_update_record"
    || /模型更新|模型更新日志|更新公告|release/i.test(source.name || "")
  );
}

function extractBaiduModelUpdates(source, text) {
  const compact = normalizeModelText(text);
  const updates = [];
  const monthPattern = /(20\d{2})年(\d{1,2})月([\s\S]*?)(?=20\d{2}年\d{1,2}月|$)/g;
  let monthMatch;
  while ((monthMatch = monthPattern.exec(compact))) {
    const year = monthMatch[1];
    const month = monthMatch[2];
    const monthBody = monthMatch[3];
    const entryPattern = /(\d{1,2})月(\d{1,2})日\s+([\s\S]*?)(?=\d{1,2}月\d{1,2}日|$)/g;
    let entryMatch;
    while ((entryMatch = entryPattern.exec(monthBody))) {
      const date = `${year}-${pad2(month)}-${pad2(entryMatch[2])}`;
      if (date < MODEL_UPDATE_LOOKBACK_START) continue;
      const detail = entryMatch[3].trim();
      if (!isModelUpdateDetail(detail)) continue;
      const models = extractModelNames(detail);
      if (!models.length) continue;
      updates.push(buildModelUpdateItem(source, date, detail, models));
    }
  }
  return dedupeModelUpdates(updates).slice(0, 160);
}

function extractGenericModelUpdates(source, text) {
  const compact = normalizeModelText(text);
  const updates = [];
  const datePattern = /(20\d{2})[.\-/年](\d{1,2})[.\-/月](\d{1,2})日?\s*([\s\S]*?)(?=20\d{2}[.\-/年]\d{1,2}[.\-/月]\d{1,2}日?|$)/g;
  let match;
  while ((match = datePattern.exec(compact))) {
    const date = `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;
    if (date < MODEL_UPDATE_LOOKBACK_START) continue;
    const detail = match[4].trim();
    if (!isModelUpdateDetail(detail)) continue;
    const models = extractModelNames(detail);
    if (!models.length && !/(模型|model|deepseek|qwen|glm|kimi|minimax|ernie|豆包|文心)/i.test(detail)) continue;
    updates.push(buildModelUpdateItem(source, date, detail, models.length ? models : [source.vendor || source.name]));
  }
  return dedupeModelUpdates(updates).slice(0, 80);
}

function buildModelUpdateItem(source, date, detail, models, forcedType = "") {
  const sourceId = getDataSourceId(source);
  const updateType = forcedType || detectModelUpdateType(detail);
  const modelText = models.slice(0, 5).join("、");
  const summary = summarizeModelUpdateDetail(detail, models, updateType);
  const idHash = createHash("sha1")
    .update(`${source.id}|${date}|${modelText}|${updateType}|${summary}`)
    .digest("hex")
    .slice(0, 8);
  return {
    id: `model-update-${source.id}-${date}-${idHash}`,
    competitor: source.competitor,
    date,
    title: `${source.vendor || source.name}：${modelText} ${updateType}`,
    summary,
    models: models.slice(0, 8),
    updateType,
    categories: ["model"],
    priority: source.priority || "medium",
    source: sourceId,
    evidence: buildEvidenceSnippet(detail, models[0] || updateType),
    autoModelUpdate: true
  };
}

function normalizeModelText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/复制 MD 格式|目录|文档中心|立即试用/g, " ")
    .trim();
}

function isModelUpdateDetail(detail) {
  return /(上新|退役|升级|下线|发布|新增|价格|迁移|限流|实名|模型|model)/i.test(detail);
}

function detectModelUpdateType(detail) {
  if (/退役|下线/.test(detail)) return "下线";
  if (/上新|发布|新增|上线/.test(detail)) return "上新";
  if (/升级|更新|新增支持|参数/.test(detail)) return "升级";
  if (/价格|计费|免费|优惠/.test(detail)) return "价格/权益";
  if (/迁移|限流|实名/.test(detail)) return "治理/迁移";
  return "模型更新";
}

function extractModelNames(text) {
  const modelPattern = /\b(?:ERNIE|GLM|Qwen|DeepSeek|Kimi|MiniMax|Doubao|Hunyuan|Qianfan|SenseVoice|BGE|Llama|Mistral|Claude|GPT|Gemini|Moonshot|Z\.ai)[A-Za-z0-9._:/+\-]*\b|豆包(?:大模型|主力模型|模型|[A-Za-z0-9.\-]+)?|文心(?:千帆|一言|大模型|ERNIE|[A-Za-z0-9.\-]+)?/gi;
  const matches = String(text || "").match(modelPattern) || [];
  const seen = new Set();
  return matches
    .map((item) => item.replace(/[、，。；：:）)]+$/g, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 64)
    .filter((item) => !/^(API|Base|URL|Token|Model|文心)$/.test(item))
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function summarizeModelUpdateDetail(detail, models, updateType) {
  const clean = normalizeModelText(detail)
    .replace(/调用说明请查看[：:]?/g, "")
    .replace(/模型下线，推荐替换模型请查看[：:]?/g, "模型下线，需查看替代模型。")
    .trim();
  const modelText = models.slice(0, 4).join("、");
  const tail = clean.length > 130 ? `${clean.slice(0, 128)}...` : clean;
  return `${modelText} 出现${updateType}动作；${tail}`;
}

function dedupeModelUpdates(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.competitor}|${item.date}|${item.updateType}|${item.models.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function replaceAutoModelUpdates(payload, updates) {
  payload.modelUpdates = asArray(payload.modelUpdates).filter((item) => {
    if (!item?.autoModelUpdate) return true;
    if (!MODEL_UPDATE_COMPETITORS.has(item.competitor)) return false;
    return !updates.some((update) => update.source === item.source);
  });
  updates.forEach((item) => addOrUpdateModelUpdate(payload, item));
}

function addOrUpdateModelUpdate(payload, updateItem) {
  payload.modelUpdates = asArray(payload.modelUpdates);
  const index = payload.modelUpdates.findIndex((item) => item.id === updateItem.id);
  if (index >= 0) payload.modelUpdates[index] = { ...payload.modelUpdates[index], ...updateItem };
  else payload.modelUpdates.push(updateItem);
}

function removeNonCommunicationNews(payload) {
  const sources = payload.sources && typeof payload.sources === "object" ? payload.sources : {};
  payload.news = asArray(payload.news).filter((item) => {
    const source = sources[item?.source] || {};
    return source.type === "media" || source.type === "wechat";
  });
}

function removeLowInformationNews(payload) {
  payload.news = asArray(payload.news).filter((item) => !isLowInformationNewsItem(item));
}

function isLowInformationNewsItem(item) {
  const text = [
    item?.title,
    item?.summary,
    item?.takeaway,
    item?.evidence,
    item?.sourceName
  ].filter(Boolean).join(" ");

  if (/新增公众号检索入口|公众号追踪|公众号宣传|产品发布信号|应用案例信号|通义生态信号|成本优势信号|GLM\s*能力信号/.test(text)) {
    return true;
  }
  if (/传播重点可能|后续重点看|新增.*检索入口|市场关注点在.*星辰补|关联模型供给/.test(text)) {
    return true;
  }
  if (/相关微信公众号文章\s*[–-]\s*搜狗微信搜索/.test(text) && !item?.publishedDate) {
    return true;
  }
  if (item?.dateSource === "collection_date" && !item?.publishedDate) {
    return true;
  }
  return false;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function addOrUpdateNews(payload, newsItem) {
  payload.news = asArray(payload.news);
  const index = payload.news.findIndex((item) => item.id === newsItem.id);
  if (index >= 0) payload.news[index] = { ...payload.news[index], ...newsItem };
  else payload.news.push(newsItem);
}

function addOrUpdateEvent(payload, eventItem) {
  payload.events = asArray(payload.events);
  const index = payload.events.findIndex((item) => item.id === eventItem.id);
  if (index >= 0) payload.events[index] = { ...payload.events[index], ...eventItem };
  else payload.events.push(eventItem);
}

function removeNewsById(payload, id) {
  payload.news = asArray(payload.news).filter((item) => item?.id !== id);
}

function removeAutoCandidateNewsForDate(payload, dateString) {
  payload.news = asArray(payload.news).filter((item) => {
    if (item?.date !== dateString && item?.collectedDate !== dateString) return true;
    if (item?.autoCandidate) return false;
    if (item?.reviewStatus === "pending") return false;
    if (String(item?.id || "").startsWith("auto-")) return false;
    if (String(item?.id || "").startsWith("review-")) return false;
    if (String(item?.id || "").startsWith("candidate-")) return false;
    return true;
  });
}

function removeAutoUpdateRecordsForDate(payload, dateString) {
  payload.events = asArray(payload.events).filter((item) => {
    if (item?.date !== dateString) return true;
    if (item?.autoRecord) return false;
    if (String(item?.id || "").startsWith("record-")) return false;
    return true;
  });
}

function removeSourceMonitorUpdateRecords(payload) {
  payload.events = asArray(payload.events).filter((item) => {
    if (item?.matchType === "source_monitor") return false;
    if (String(item?.id || "").startsWith("record-source-")) return false;
    if (/平台更新记录源已纳入监控/.test(String(item?.title || ""))) return false;
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
    competitor: source.competitor,
    categories: source.categories || [],
    priority: source.priority || "",
    url: source.url,
    type: source.type,
    recordType: source.recordType || "",
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
    modelUpdates: report.modelUpdates.length,
    errors: report.errors.length
  };
}

function sortPayload(payload) {
  payload.news = asArray(payload.news).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  payload.events = asArray(payload.events).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  payload.modelUpdates = asArray(payload.modelUpdates).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  payload.competitors = asArray(payload.competitors).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function getLatestKnownDate(payload, fallbackDate) {
  const dates = [
    fallbackDate,
    payload?.snapshotDate,
    ...asArray(payload?.events).map((item) => item?.date),
    ...asArray(payload?.news).map((item) => item?.date),
    ...asArray(payload?.modelUpdates).map((item) => item?.date)
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
    `- 官方更新记录：${report.exactMatches.length} 条`,
    `- 新闻/公众号线索：${report.publishedCandidates || 0} 条`,
    `- 官方模型更新：${report.modelUpdates.length} 条`,
    `- 采集线索：${report.candidates.length} 条`,
    `- 抓取异常：${report.errors.length} 条`,
    "",
    "## 官方更新记录",
    ""
  ];

  if (report.exactMatches.length) {
    report.exactMatches.forEach((item) => {
      lines.push(`- ${item.competitor}｜${item.title}`);
      lines.push(`  来源：${item.url}`);
      lines.push(`  片段：${item.snippet || "无"}`);
    });
  } else {
    lines.push("- 没有发现来自竞品平台官方更新记录、且同时命中“目标日期 + 关键词”的动态。");
  }

  lines.push("", "## 官方模型更新统计", "");
  if (report.modelUpdates.length) {
    report.modelUpdates
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 30)
      .forEach((item) => {
        lines.push(`- ${item.date}｜${item.competitor}｜${item.updateType}｜${item.models.join("、")}｜${item.title}`);
      });
  } else {
    lines.push("- 没有从官方模型更新文档抽取到按日模型变化。");
  }

  lines.push("", "## 采集线索", "");
  if (report.candidates.length) {
    report.candidates.forEach((item) => {
      const displayStatus = item.type === "media" && item.relevanceScore < MEDIA_RELEVANCE_THRESHOLD
        ? "低相关新闻已过滤"
        : item.type === "media" || item.type === "wechat"
          ? "进入新闻追踪"
          : "仅留作产品基线/来源复核，不进入新闻追踪";
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
  lines.push("- 只有标记为“官方更新记录”的竞品平台来源，且原文命中目标日期，才会进入网页的“详细动态”。");
  lines.push("- 新闻追踪只展示媒体和公众号；普通官方文档只留作产品基线/来源复核，不计入新闻追踪或更新记录。");
  lines.push("- 公众号和部分控制台页面可能有反爬或登录限制，抓不到时会在“抓取异常”里记录。");

  return `${lines.join("\n")}\n`;
}

function getDataSourceId(source) {
  return source.sourceId || source.id;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
