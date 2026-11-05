# Agenda para nail designer

Sistema de gestão para uma **nail designer autônoma**: agenda, ficha das
clientes com histórico, retornos de manutenção, mensagens de WhatsApp,
financeiro e um portal onde a cliente agenda sozinha.

Foi feito para uma profissional real, que trabalha sozinha e usa o sistema pelo
celular entre um atendimento e outro. Nesta cópia, nomes, telefones, e-mails e
documentos são fictícios.

## O que faz

- **Agenda** com expediente por dia, almoço, folgas, bloqueios, visão de mês e
  choque de horário barrado (no painel e no servidor).
- **Ficha da cliente** com o histórico de atendimentos; cada atendimento guarda
  a cor do esmalte usada, que funciona como registro visual do trabalho.
- **Retornos de manutenção:** cada serviço tem um ciclo (ex.: alongamento 21
  dias, esmaltação em gel 15). A tela cruza a última visita com esse ciclo,
  mostra quem passou do ponto, quanto isso representa em receita e abre o
  WhatsApp com a mensagem pronta, uma cliente por vez.
- **Mensagens** com modelos e variáveis que se preenchem sozinhas
  (`#{cliente}`, `#{servico}`, `#{data_horario}`...). O envio é por link
  `wa.me`, sem API paga.
- **Financeiro:** faturamento, despesas, gráficos por período, horários de pico
  e melhores clientes.
- **Portal da cliente** (`/#cliente`): cadastro com telefone e senha,
  agendamento com regras de antecedência e prazo de cancelamento, fila de
  solicitações para a profissional confirmar e contagem para a próxima
  manutenção.
- Tema claro e escuro, navegação inferior no celular e alvos de toque grandes.

## Stack

- **Front-end:** HTML, CSS e JavaScript puros, sem framework. Os dados ficam em
  `Store.db`, com cópia no `localStorage` e sincronização com o servidor.
- **Servidor:** Cloudflare Worker (`worker/`) com login próprio: senhas com
  PBKDF2-SHA256 (100 mil iterações), sessão em cookie HttpOnly, comparação em
  tempo constante, bloqueio após erros seguidos e limite de tentativas por
  minuto.
- **Banco:** Supabase (Postgres) no modelo "portão": as tabelas ficam num schema
  privado e só são alcançadas por funções `public.nailagenda_*`, sem usar a
  chave `service_role`. Há também migrações para o D1 da Cloudflare, usadas nos
  testes.
- **Testes:** `node --test`, sem dependências (83 testes: regras da agenda,
  armazenamento, API, servidor e integração com o Supabase).

## Como rodar

Precisa de Node 22.13 ou mais novo (os testes usam `node:sqlite`).

```bash
npm install
npm run dev          # só o site, dados no navegador: http://localhost:4173
npm run dev:nuvem    # site + API + banco de teste em memória: http://localhost:4175
npm test             # testes automatizados
npm run build        # gera dist/ com os assets versionados
```

No `dev:nuvem`, o login do painel de demonstração é `admin@example.com` com a
senha `demoagenda2026` (só existe na migração de teste).

Para publicar na sua conta Cloudflare: copie `.env.example` para `.dev.vars`,
preencha os valores, troque `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` em
`wrangler.jsonc`, cadastre os segredos com `npx wrangler secret put` e rode
`npm run deploy` (os testes rodam antes; se falharem, não publica).

## Estrutura

```
index.html
assets/css/app.css          Design system: tokens, componentes, tema escuro
assets/js/store.js          Domínio, dados de exemplo e ciclo de manutenção
assets/js/schedule.js       Regras de horário (expediente, choques, antecedência)
assets/js/nuvem.js          Sincronização com o servidor
assets/js/views/            Uma tela por arquivo (cliente-area.js = portal)
worker/                     API: login, sessão, regras e acesso ao banco
supabase/migrations/        Banco Supabase (modelo portão)
migrations/                 Banco D1 (alternativa e testes)
scripts/                    Servidor local, build e troca de senha
tests/                      Testes
```

## O que o autor fez

Projeto feito por Neemias de ponta a ponta: levantamento com a
profissional (como ela trabalha, o que importa e o que fica fora), desenho das
telas pensando no uso pelo celular, regras da agenda e do ciclo de manutenção,
API com login seguro, modelagem do banco no modelo "portão", testes
automatizados e publicação na Cloudflare.
