/* Entrada do Worker.
   /api/*  → rotas da API (banco, sessão, autorização)
   resto   → arquivos estáticos do dist/, com os cabeçalhos de segurança */
import { CABECALHOS, responder } from "./seguranca.js";
import { rotearApi, limparLimites } from "./api.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Cloudflare já encerra TLS, mas se algo chegar em claro, redireciona.
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1")
      return Response.redirect("https://" + url.host + url.pathname + url.search, 308);

    if (url.pathname.startsWith("/api/")) {
      try { return await rotearApi(request, env); }
      catch (e) {
        console.error("worker:", e && e.message);
        return responder({ erro: "Serviço indisponível no momento." }, 503);
      }
    }

    const resposta = await env.ASSETS.fetch(request);
    // Os cabeçalhos vêm do _headers para o CDN, mas repetimos aqui para
    // que nenhuma resposta gerada pelo Worker escape sem eles.
    const saida = new Response(resposta.body, resposta);
    for (const [k, v] of Object.entries(CABECALHOS)) saida.headers.set(k, v);
    return saida;
  },

  /* Faxina diária dos contadores de tentativa vencidos. */
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(limparLimites(env));
  },
};
