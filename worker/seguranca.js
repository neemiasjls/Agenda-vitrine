/* Cabeçalhos, leitura de corpo e origem.
   Tudo que entra passa por aqui antes de chegar ao banco. */

export class ErroApp extends Error {
  constructor(mensagem, status = 400) { super(mensagem); this.status = status; }
}

export const CABECALHOS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
};

export const responder = (dados, status = 200, extras = {}) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: {
      ...CABECALHOS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extras,
    },
  });

/* Lê o corpo JSON com teto de tamanho aplicado ENQUANTO lê.
   Chamar request.json() direto engoliria um corpo gigante inteiro
   antes de decidir recusá-lo. */
export async function lerCorpo(request, limite = 4_000_000) {
  const origem = request.headers.get("Origin");
  if ((origem && origem !== new URL(request.url).origin) ||
      request.headers.get("Sec-Fetch-Site") === "cross-site")
    throw new ErroApp("Origem não permitida.", 403);

  const tipo = request.headers.get("Content-Type") || "";
  if (!tipo.toLowerCase().startsWith("application/json"))
    throw new ErroApp("Envie os dados em JSON.", 415);

  if (Number(request.headers.get("Content-Length")) > limite)
    throw new ErroApp("Requisição muito grande.", 413);

  const leitor = request.body?.getReader();
  if (!leitor) throw new ErroApp("Requisição vazia.");

  const partes = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) { await leitor.cancel(); throw new ErroApp("Requisição muito grande.", 413); }
      partes.push(value);
    }
  } finally { leitor.releaseLock(); }

  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { bytes.set(p, pos); pos += p.byteLength; }

  let corpo;
  try { corpo = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ErroApp("Requisição inválida."); }

  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo))
    throw new ErroApp("Requisição inválida.");
  return corpo;
}

/* Cookie de sessão. __Host- exige HTTPS + Path=/ e proíbe domínio,
   então nem um subdomínio comprometido consegue plantar um. */
export function cookie(request, nome, valor, segundos) {
  const https = new URL(request.url).protocol === "https:";
  const chave = (https ? "__Host-" : "") + "nailagenda-" + nome;
  return `${chave}=${valor}; Path=/; HttpOnly; SameSite=Lax${https ? "; Secure" : ""}; Max-Age=${segundos}`;
}

export function lerCookie(request, nome) {
  const https = new URL(request.url).protocol === "https:";
  const chave = (https ? "__Host-" : "") + "nailagenda-" + nome + "=";
  const parte = (request.headers.get("Cookie") || "")
    .split(";").map((s) => s.trim()).find((s) => s.startsWith(chave));
  return parte ? parte.slice(chave.length) : "";
}

export const b64url = {
  encode: (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: (txt) => Uint8Array.from(
    atob(txt.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};

export const hex = (bytes) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
