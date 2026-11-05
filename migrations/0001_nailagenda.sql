-- ============================================================
-- nailagenda — banco na Cloudflare (D1 / SQLite)
--
-- O Worker é o único que fala com este banco (binding DB). Não existe
-- chave pública nem acesso pela internet: quem autoriza cada pedido é o
-- código do Worker.
-- ============================================================

-- ---------------------------------------------------------------
-- Estado do ateliê, uma linha por coleção.
-- O D1 limita cada linha a 2 MB. Com tudo num documento só, um ou dois
-- anos de comandas e atendimentos estourariam o limite; separado por
-- coleção, cada parte cresce sozinha.
-- A versão é única para o conjunto: duas abas (ou celular e computador)
-- gravando ao mesmo tempo não se sobrescrevem em silêncio.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estado_versao (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  versao      INTEGER NOT NULL DEFAULT 0 CHECK (versao >= 0),
  atualizado  TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO estado_versao (id, versao) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS estado_partes (
  nome  TEXT PRIMARY KEY CHECK (nome GLOB '[A-Za-z_]*' AND length(nome) BETWEEN 1 AND 40),
  dados TEXT NOT NULL CHECK (json_valid(dados))
);

-- ---------------------------------------------------------------
-- Acesso da profissional: e-mail + senha, PBKDF2 no servidor.
-- sessao_versao muda quando a senha muda: derruba as sessões abertas
-- em outros aparelhos.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acesso_profissional (
  email          TEXT PRIMARY KEY CHECK (email LIKE '%_@_%._%' AND length(email) <= 180),
  chave          TEXT NOT NULL CHECK (length(chave) BETWEEN 32 AND 512),
  sal            TEXT NOT NULL CHECK (length(sal) BETWEEN 32 AND 64),
  iteracoes      INTEGER NOT NULL CHECK (iteracoes BETWEEN 100000 AND 1000000),
  sessao_versao  INTEGER NOT NULL DEFAULT 1,
  erros          INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate  TEXT,
  atualizado     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Conta inicial. Guarda só o hash (PBKDF2-SHA256, 100 mil iterações) da
-- senha que você escolheu — o texto da senha não está em lugar nenhum.
-- Troque em Configurações › Meu perfil depois do primeiro acesso.
INSERT OR IGNORE INTO acesso_profissional (email, chave, sal, iteracoes)
VALUES ('admin@example.com', 'g5I1hk5hzJbU5kon-ZCj85AReOA02MYgSx2I_qGX3zc',
        'f06dbe87f0006e12b698e1c39856a620', 100000);

-- ---------------------------------------------------------------
-- Acesso das clientes: telefone + senha, nada de e-mail ou CPF.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acesso_cliente (
  cliente_id     TEXT PRIMARY KEY CHECK (length(cliente_id) BETWEEN 1 AND 64),
  telefone       TEXT NOT NULL UNIQUE CHECK (telefone GLOB '[0-9]*' AND length(telefone) BETWEEN 10 AND 13),
  chave          TEXT NOT NULL CHECK (length(chave) BETWEEN 32 AND 512),
  sal            TEXT NOT NULL CHECK (length(sal) BETWEEN 32 AND 64),
  iteracoes      INTEGER NOT NULL CHECK (iteracoes BETWEEN 100000 AND 1000000),
  erros          INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate  TEXT,
  criado         TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------
-- Limite de tentativas. Só o hash da chave: nenhum telefone ou e-mail
-- fica registrado aqui.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS limites (
  chave   TEXT PRIMARY KEY CHECK (length(chave) = 64),
  hits    INTEGER NOT NULL CHECK (hits >= 1),
  expira  INTEGER NOT NULL             -- milissegundos desde 1970
);
CREATE INDEX IF NOT EXISTS limites_expira ON limites (expira);

-- ---------------------------------------------------------------
-- Configuração interna do servidor. A chave que assina os cookies de
-- sessão nasce aqui, sorteada no primeiro acesso, e nunca sai do banco.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config (
  nome   TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);
