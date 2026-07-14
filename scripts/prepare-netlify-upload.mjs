import { copyFileSync, mkdirSync } from "node:fs";

await import("./build-share-html.mjs");

mkdirSync("outputs/netlify-upload", { recursive: true });
copyFileSync("outputs/xingchen-maas-competitor-watch.html", "outputs/netlify-upload/index.html");
copyFileSync("outputs/xingchen-maas-competitor-data.js", "outputs/netlify-upload/xingchen-maas-competitor-data.js");
copyFileSync("outputs/xingchen-maas-competitor-watch-share.html", "outputs/星辰MaaS竞品动态监测-单文件分享版.html");

console.log("outputs/netlify-upload");
