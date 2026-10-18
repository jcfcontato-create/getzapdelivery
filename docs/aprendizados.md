# Aprendizados

## Tabelas novas no Supabase precisam de GRANT
Neste projeto, as tabelas criadas por migração **não** recebem permissão automática para os papéis da API (`anon`, `authenticated`).
Sem o grant, o painel mostra `permission denied for table ...` mesmo com as políticas RLS corretas.
Toda migração que cria tabela deve incluir, conforme o caso:

```sql
grant select on minha_tabela to anon, authenticated;              -- se o cardápio público lê
grant insert, update, delete on minha_tabela to authenticated;    -- se o painel altera
grant all on minha_tabela to service_role;                        -- Edge Functions
```
Ocorrido em 2026-10-18 no módulo de Precificação (corrigido na migração 0034).
