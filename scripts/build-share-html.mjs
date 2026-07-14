import { readFileSync, writeFileSync } from "node:fs";

const sourceHtmlPath = "outputs/xingchen-maas-competitor-watch.html";
const sourceDataPath = "outputs/xingchen-maas-competitor-data.js";
const outputPath = "outputs/xingchen-maas-competitor-watch-share.html";

const html = readFileSync(sourceHtmlPath, "utf8");
const dataJs = readFileSync(sourceDataPath, "utf8").trim();
const dataMatch = dataJs.match(/^window\.__XINGCHEN_COMPETITOR_DATA__\s*=\s*([\s\S]*?);\s*$/);

if (!dataMatch) {
  throw new Error("Could not parse competitor data file.");
}

const embeddedData = dataMatch[1];

const refreshFunction = `function refreshLatestData(options = {}) {
      const silent = Boolean(options.silent);
      if (!silent) setRefreshButtonState("同步中", true);

      return new Promise((resolve) => {
        const payload = JSON.parse(JSON.stringify(EMBEDDED_DATA));
        const result = mergeLatestData(payload);
        state.dataStatus = \`单文件数据 \${payload.updatedAt || latestDataDate}\`;
        renderAll();
        if (!silent) {
          setRefreshButtonState("自动同步");
          state.dataStatus = \`\${state.dataStatus}｜已同步内置数据\`;
          renderDateControls();
        }
        resolve(result);
      });
    }`;

let output = html
  .replace(
    '    const EXTERNAL_DATA_FILE = "xingchen-maas-competitor-data.js";',
    `    const EXTERNAL_DATA_FILE = "";
    const EMBEDDED_DATA = ${embeddedData};`
  )
  .replace(
    /    function refreshLatestData\(options = \{\}\) \{[\s\S]*?\n    \}\n\n    function getAllEvents\(\) \{/,
    `    ${refreshFunction}\n\n    function getAllEvents() {`
  )
  .replace(
    "<title>星辰 MaaS 竞品模型与功能对比</title>",
    "<title>星辰 MaaS 竞品模型与功能对比｜单文件分享版</title>"
  )
  .replace(
    "以星辰 MaaS 为基准，观察竞品模型供给、功能更新、宣传动作与近期方向；页面打开时会自动同步最新数据",
    "单文件分享版｜以星辰 MaaS 为基准，观察竞品模型供给、功能更新、宣传动作与近期方向"
  );

writeFileSync(outputPath, output);
console.log(outputPath);
