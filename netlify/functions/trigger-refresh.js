import { handleRefreshRequest } from "../../functions/_trigger-refresh-core.js";

export async function handler(event) {
  return handleRefreshRequest({
    method: event.httpMethod,
    body: event.body,
    env: process.env,
    provider: "Netlify"
  });
}
