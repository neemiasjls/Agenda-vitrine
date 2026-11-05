-- O Cloudflare Workers recusa PBKDF2 acima de 100 mil iterações. A conta
-- inicial foi criada com 210 mil e não conseguia entrar. Troca pelo mesmo
-- hash (mesma senha) recalculado com 100 mil.
UPDATE acesso_profissional
   SET chave = 'g5I1hk5hzJbU5kon-ZCj85AReOA02MYgSx2I_qGX3zc', sal = 'f06dbe87f0006e12b698e1c39856a620', iteracoes = 100000,
       erros = 0, bloqueado_ate = NULL, atualizado = datetime('now')
 WHERE email = 'admin@example.com' AND iteracoes > 100000;
