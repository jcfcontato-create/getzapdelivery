-- Vincula o usuário do dono à Adega, para ele acessar o painel.
-- 1) No Supabase, vá em Authentication > Users > Add user > Create new user, informe e-mail e senha
--    e marque "Auto Confirm User".
-- 2) Troque o e-mail abaixo pelo mesmo e-mail cadastrado e execute.
insert into membros (loja_id, user_id)
select l.id, u.id
from lojas l, auth.users u
where l.slug = 'adega-sos' and lower(u.email) = lower('TROQUE-PELO-EMAIL-DO-DONO@exemplo.com')
on conflict do nothing;

-- Conferência: deve aparecer 1 linha.
select m.loja_id, u.email from membros m join auth.users u on u.id = m.user_id;
