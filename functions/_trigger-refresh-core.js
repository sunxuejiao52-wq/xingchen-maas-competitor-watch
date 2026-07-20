const DEFAULT_OWNER = "sunxuejiao52-wq";
const DEFAULT_REPO = "xingchen-maas-competitor-watch";
const DEFAULT_WORKFLOW = "daily-competitor-refresh.yml";
const DEFAULT_BRANCH = "main";

export async function handleRefreshRequest({ method, body, env, provider = "Cloudflare" }) {
  if (method === "OPTIONS") {
    return json(204, {});
  }

  if (method !== "POST") {
    return json(405, { ok: false, message: "Only POST requests can trigger data refresh." });
  }

  const token = env.GITHUB_ACTIONS_TOKEN || env.GITHUB_TOKEN;
  if (!token) {
    return json(503, {
      ok: false,
      message: `${provider} 未配置 GITHUB_ACTIONS_TOKEN，无法触发后台采集。`
    });
  }

  const requestBody = parseJson(body);
  const targetDate = requestBody.target_date || getChinaTodayDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return json(400, { ok: false, message: "target_date 必须是 YYYY-MM-DD 格式。" });
  }

  const owner = env.GITHUB_OWNER || DEFAULT_OWNER;
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const workflow = env.GITHUB_WORKFLOW || DEFAULT_WORKFLOW;
  const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "xingchen-maas-competitor-watch"
    },
    body: JSON.stringify({
      ref: branch,
      inputs: { target_date: targetDate }
    })
  });

  if (response.status !== 204) {
    const detail = await response.text();
    return json(response.status, {
      ok: false,
      message: `GitHub Actions 触发失败：${response.status}`,
      detail: detail.slice(0, 600)
    });
  }

  return json(202, {
    ok: true,
    message: "数据刷新任务已提交，后台将从配置来源采集最新动态。",
    targetDate
  });
}

function parseJson(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getChinaTodayDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "content-type": "application/json; charset=utf-8"
    },
    body: statusCode === 204 ? "" : JSON.stringify(payload)
  };
}
