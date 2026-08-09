const ASSET_EXT = /\.(js|mjs|css|map|json|wasm|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico|webmanifest|txt)$/i;

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  const contentType = response.headers.get("content-type") || "";
  if (response.status === 200 && contentType.includes("text/html") && ASSET_EXT.test(url.pathname)) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  return response;
}
