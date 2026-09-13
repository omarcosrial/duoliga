import { getStore } from "@netlify/blobs";

const STORE_NAME = "duoliga-media";

function authorized(req) {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return true;
  return req.headers.get("x-app-code") === expected;
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-App-Code", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-App-Code", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("id") || "";
    if (!/^[a-f0-9-]{30,50}$/i.test(id)) return new Response("Not found", { status: 404 });
    const item = await store.get(id, { type: "json", consistency: "strong" });
    if (!item?.base64 || !item?.mime) return new Response("Not found", { status: 404 });
    const bytes = Buffer.from(item.base64, "base64");
    return new Response(bytes, { status: 200, headers: { "Content-Type": item.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  }

  if (req.method === "POST") {
    if (!authorized(req)) return json({ error: "Código de acesso incorreto." }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Arquivo inválido." }, 400); }
    const match = String(body.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return json({ error: "Use uma imagem JPG, PNG ou WebP." }, 400);
    const mime = match[1];
    const base64 = match[2];
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > 1_500_000) return json({ error: "Imagem muito grande após compressão." }, 413);
    const id = crypto.randomUUID();
    await store.setJSON(id, { mime, base64, kind: String(body.kind || "image").slice(0, 20), createdAt: new Date().toISOString() });
    return json({ url: `/api/media?id=${id}` });
  }

  return json({ error: "Método não permitido." }, 405);
};
