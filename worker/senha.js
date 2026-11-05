/* Senha das clientes.
   ------------------------------------------------------------------
   Antes: SHA-256 no navegador. SHA-256 é rápido de propósito — o
   oposto do que se quer numa senha, porque quem roubasse o banco
   testaria bilhões por segundo.
   Agora: PBKDF2-SHA256 com 100 mil iterações, feito no servidor.
   É o KDF lento que o Web Crypto oferece dentro de um Worker (bcrypt
   e Argon2 exigiriam dependência nativa, que o runtime não tem).
   A senha em texto nunca é gravada nem devolvida. */
import { b64url, hex } from "./seguranca.js";

/* 100 mil é o MÁXIMO que o Cloudflare Workers aceita no PBKDF2 — acima
   disso deriveBits lança NotSupportedError. O Node não tem esse limite, e
   por isso 210 mil passava nos testes e quebrava o login no servidor.
   Compensação: bloqueio da conta após 8 erros e limite por minuto. */
export const ITERACOES = 100000;

export async function derivar(senha, saltHex, iteracoes = ITERACOES) {
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexParaBytes(saltHex), iterations: iteracoes },
    material, 256);
  return b64url.encode(new Uint8Array(bits));
}

export const novoSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));

/* Comparação em tempo constante: um `===` vaza, pelo tempo de resposta,
   quantos caracteres do início bateram. */
export function iguais(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export async function conferir(senha, registro) {
  const calculada = await derivar(senha, registro.salt, registro.iterations);
  return iguais(calculada, registro.password_key);
}

function hexParaBytes(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

/* Regras mínimas. Não exijo símbolo nem maiúscula: regra chata faz a
   pessoa escolher "Senha1!" e anotar num papel. Tamanho é o que conta. */
export function validarSenha(senha) {
  if (typeof senha !== "string") return "Informe uma senha.";
  if (senha.length < 8) return "Use pelo menos 8 caracteres.";
  if (senha.length > 128) return "Senha longa demais.";
  if (/^\d+$/.test(senha)) return "Não use só números — misture letras.";
  const obvias = ["12345678", "senha123", "password", "marina1", "11111111"];
  if (obvias.includes(senha.toLowerCase())) return "Essa senha é muito fácil de adivinhar.";
  return null;
}

export const soDigitos = (t) => String(t || "").replace(/\D/g, "");

export function validarTelefone(telefone) {
  const d = soDigitos(telefone);
  if (d.length < 10 || d.length > 13) return null;
  return d;
}
