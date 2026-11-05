-- ============================================================
-- nailagenda — banco no Supabase
--
-- Desenho: as tabelas moram no schema privado `nailagenda`, que a API REST
-- do Supabase não expõe. O único caminho até elas são as funções
-- public.nailagenda_* abaixo. Cada uma começa por nailagenda.autorizar(), que
-- compara o hash de uma senha de servidor que só o Worker da Cloudflare
-- conhece. A chave pública (publishable) sozinha não abre nada.
--
-- Por que assim: o Worker não precisa da chave service_role do projeto,
-- que dá acesso total a tudo. Ele recebe só o poder destas funções.
-- ============================================================

create schema if not exists nailagenda;
revoke all on schema nailagenda from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Estado do ateliê: um documento jsonb com versão otimista.
-- Duas abas (ou celular e computador) gravando ao mesmo tempo não se
-- sobrescrevem em silêncio: a segunda recebe conflito.
-- ---------------------------------------------------------------
create table nailagenda.estado (
  id          smallint primary key check (id = 1),
  dados       jsonb not null default '{}'::jsonb,
  versao      bigint not null default 0 check (versao >= 0),
  atualizado  timestamptz not null default now(),
  constraint estado_objeto check (jsonb_typeof(dados) = 'object'),
  constraint estado_tamanho check (pg_column_size(dados) <= 8000000)
);
insert into nailagenda.estado (id, versao) values (1, 0);

-- ---------------------------------------------------------------
-- Acesso da profissional: e-mail + PBKDF2 (100 mil iterações, o teto
-- do Cloudflare Workers). sessao_versao sobe quando a senha muda e
-- derruba as sessões abertas nos outros aparelhos.
-- ---------------------------------------------------------------
create table nailagenda.acesso_profissional (
  email          text primary key check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(email) <= 180),
  chave          text not null check (length(chave) between 32 and 512),
  sal            text not null check (sal ~ '^[0-9a-f]{32,64}$'),
  iteracoes      integer not null check (iteracoes between 100000 and 1000000),
  sessao_versao  integer not null default 1,
  erros          integer not null default 0 check (erros >= 0),
  bloqueado_ate  timestamptz,
  atualizado     timestamptz not null default now()
);

-- Conta inicial: só o hash da senha escolhida. Troque no primeiro acesso.
insert into nailagenda.acesso_profissional (email, chave, sal, iteracoes)
values ('admin@example.com', 'g5I1hk5hzJbU5kon-ZCj85AReOA02MYgSx2I_qGX3zc',
        'f06dbe87f0006e12b698e1c39856a620', 100000);

-- ---------------------------------------------------------------
-- Acesso das clientes: telefone + senha, nada de e-mail ou CPF.
-- ---------------------------------------------------------------
create table nailagenda.acesso_cliente (
  cliente_id     text primary key check (length(cliente_id) between 1 and 64),
  telefone       text not null unique check (telefone ~ '^[0-9]{10,13}$'),
  chave          text not null check (length(chave) between 32 and 512),
  sal            text not null check (sal ~ '^[0-9a-f]{32,64}$'),
  iteracoes      integer not null check (iteracoes between 100000 and 1000000),
  erros          integer not null default 0 check (erros >= 0),
  bloqueado_ate  timestamptz,
  criado         timestamptz not null default now(),
  atualizado     timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Limite de tentativas: só o hash da chave (nenhum telefone ou e-mail).
-- ---------------------------------------------------------------
create table nailagenda.limites (
  chave   text primary key check (chave ~ '^[0-9a-f]{64}$'),
  hits    integer not null check (hits >= 1),
  expira  timestamptz not null
);
create index limites_expira on nailagenda.limites (expira);

-- Configuração interna: hash da senha do portão e chave das sessões.
create table nailagenda.config (
  nome   text primary key,
  valor  text not null
);

-- RLS ligada e sem policy: ninguém lê direto, nem por engano. As funções
-- rodam como dono das tabelas e passam; todo o resto é barrado.
alter table nailagenda.estado              enable row level security;
alter table nailagenda.acesso_profissional enable row level security;
alter table nailagenda.acesso_cliente      enable row level security;
alter table nailagenda.limites             enable row level security;
alter table nailagenda.config              enable row level security;
revoke all on all tables in schema nailagenda from public, anon, authenticated;

-- ===============================================================
-- Portão
-- ===============================================================
create function nailagenda.autorizar(p_segredo text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_segredo is null or length(p_segredo) < 32
     or encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex')
        is distinct from (select c.valor from nailagenda.config c where c.nome = 'portao_hash') then
    raise exception using errcode = '42501', message = 'nao autorizado';
  end if;
end;
$$;
revoke all on function nailagenda.autorizar(text) from public, anon, authenticated;

-- ---------------- estado ----------------
create function public.nailagenda_ler_estado(p_segredo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_dados jsonb; v_versao bigint;
begin
  perform nailagenda.autorizar(p_segredo);
  select e.dados, e.versao into v_dados, v_versao from nailagenda.estado e where e.id = 1;
  if v_versao = 0 then return null; end if;
  return jsonb_build_object('data', v_dados, 'version', v_versao);
end;
$$;

-- Grava só se a versão ainda for a que o navegador leu. Devolve a nova
-- versão, ou null quando alguém gravou antes.
create function public.nailagenda_salvar_estado(p_segredo text, p_versao bigint, p_dados jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_nova bigint;
begin
  perform nailagenda.autorizar(p_segredo);
  if jsonb_typeof(p_dados) <> 'object'
     or not (p_dados ? 'company' and p_dados ? 'clients' and p_dados ? 'services' and p_dados ? 'appts') then
    raise exception using errcode = '22023', message = 'documento incompleto';
  end if;
  update nailagenda.estado e
     set dados = p_dados, versao = e.versao + 1, atualizado = now()
   where e.id = 1 and e.versao = p_versao
  returning e.versao into v_nova;
  return v_nova;
end;
$$;

-- ---------------- sessões ----------------
create function public.nailagenda_chave_sessao(p_segredo text, p_candidata text)
returns text language plpgsql volatile security definer set search_path = '' as $$
begin
  perform nailagenda.autorizar(p_segredo);
  if p_candidata !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'chave invalida';
  end if;
  insert into nailagenda.config (nome, valor) values ('chave_sessao', p_candidata)
  on conflict (nome) do nothing;
  return (select c.valor from nailagenda.config c where c.nome = 'chave_sessao');
end;
$$;

-- ---------------- limite de tentativas ----------------
create function public.nailagenda_limitar(p_segredo text, p_chave text, p_max integer, p_janela integer)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_agora timestamptz := clock_timestamp(); v_ok boolean;
begin
  perform nailagenda.autorizar(p_segredo);
  if p_chave !~ '^[0-9a-f]{64}$' or p_max not between 1 and 10000 or p_janela not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'parametros invalidos';
  end if;
  insert into nailagenda.limites as l (chave, hits, expira)
  values (p_chave, 1, v_agora + make_interval(secs => p_janela))
  on conflict (chave) do update
    set hits   = case when l.expira <= v_agora then 1 else l.hits + 1 end,
        expira = case when l.expira <= v_agora then excluded.expira else l.expira end
    where l.expira <= v_agora or l.hits < p_max
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create function public.nailagenda_limpar_limites(p_segredo text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform nailagenda.autorizar(p_segredo);
  delete from nailagenda.limites l where l.expira < now() - interval '1 day';
end;
$$;

-- ---------------- profissional ----------------
create function public.nailagenda_buscar_profissional(p_segredo text, p_email text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform nailagenda.autorizar(p_segredo);
  return (select to_jsonb(a) from nailagenda.acesso_profissional a where a.email = p_email);
end;
$$;

create function public.nailagenda_atualizar_profissional(
  p_segredo text, p_email text, p_chave text, p_sal text, p_iteracoes integer,
  p_derrubar boolean, p_erros integer, p_bloqueado_ate timestamptz)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform nailagenda.autorizar(p_segredo);
  update nailagenda.acesso_profissional a set
    chave = coalesce(p_chave, a.chave), sal = coalesce(p_sal, a.sal),
    iteracoes = coalesce(p_iteracoes, a.iteracoes),
    sessao_versao = a.sessao_versao + case when p_derrubar then 1 else 0 end,
    erros = coalesce(p_erros, 0), bloqueado_ate = p_bloqueado_ate, atualizado = now()
  where a.email = p_email;
end;
$$;

-- ---------------- clientes ----------------
create function public.nailagenda_buscar_cliente(p_segredo text, p_telefone text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform nailagenda.autorizar(p_segredo);
  return (select to_jsonb(a) from nailagenda.acesso_cliente a where a.telefone = p_telefone);
end;
$$;

create function public.nailagenda_gravar_cliente(
  p_segredo text, p_cliente_id text, p_telefone text, p_chave text, p_sal text, p_iteracoes integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform nailagenda.autorizar(p_segredo);
  insert into nailagenda.acesso_cliente as a (cliente_id, telefone, chave, sal, iteracoes)
  values (p_cliente_id, p_telefone, p_chave, p_sal, p_iteracoes)
  on conflict (cliente_id) do update set telefone = excluded.telefone, chave = excluded.chave,
    sal = excluded.sal, iteracoes = excluded.iteracoes, erros = 0, bloqueado_ate = null, atualizado = now();
end;
$$;

create function public.nailagenda_atualizar_cliente(
  p_segredo text, p_cliente_id text, p_erros integer, p_bloqueado_ate timestamptz)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform nailagenda.autorizar(p_segredo);
  update nailagenda.acesso_cliente a set erros = coalesce(p_erros, 0), bloqueado_ate = p_bloqueado_ate, atualizado = now()
   where a.cliente_id = p_cliente_id;
end;
$$;

-- ---------------------------------------------------------------
-- Permissões: só as funções do portão, e só para quem chama pela API.
-- ---------------------------------------------------------------
revoke all on function public.nailagenda_ler_estado(text) from public, authenticated;
revoke all on function public.nailagenda_salvar_estado(text, bigint, jsonb) from public, authenticated;
revoke all on function public.nailagenda_chave_sessao(text, text) from public, authenticated;
revoke all on function public.nailagenda_limitar(text, text, integer, integer) from public, authenticated;
revoke all on function public.nailagenda_limpar_limites(text) from public, authenticated;
revoke all on function public.nailagenda_buscar_profissional(text, text) from public, authenticated;
revoke all on function public.nailagenda_atualizar_profissional(text, text, text, text, integer, boolean, integer, timestamptz) from public, authenticated;
revoke all on function public.nailagenda_buscar_cliente(text, text) from public, authenticated;
revoke all on function public.nailagenda_gravar_cliente(text, text, text, text, text, integer) from public, authenticated;
revoke all on function public.nailagenda_atualizar_cliente(text, text, integer, timestamptz) from public, authenticated;

grant execute on function public.nailagenda_ler_estado(text) to anon;
grant execute on function public.nailagenda_salvar_estado(text, bigint, jsonb) to anon;
grant execute on function public.nailagenda_chave_sessao(text, text) to anon;
grant execute on function public.nailagenda_limitar(text, text, integer, integer) to anon;
grant execute on function public.nailagenda_limpar_limites(text) to anon;
grant execute on function public.nailagenda_buscar_profissional(text, text) to anon;
grant execute on function public.nailagenda_atualizar_profissional(text, text, text, text, integer, boolean, integer, timestamptz) to anon;
grant execute on function public.nailagenda_buscar_cliente(text, text) to anon;
grant execute on function public.nailagenda_gravar_cliente(text, text, text, text, text, integer) to anon;
grant execute on function public.nailagenda_atualizar_cliente(text, text, integer, timestamptz) to anon;

notify pgrst, 'reload schema';
