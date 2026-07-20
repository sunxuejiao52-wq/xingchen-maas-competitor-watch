import { handleRefreshRequest } from "../_trigger-refresh-core.js";

export async function onRequest(context) {
  const result = await handleRefreshRequest({
    method: context.request.method,
    body: await context.request.text(),
    env: context.env || {},
    provider: "Cloudflare Pages"
  });

  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers
  });
}
