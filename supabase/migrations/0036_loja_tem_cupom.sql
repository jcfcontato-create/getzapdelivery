-- O cardápio só mostra o campo "Cupom de desconto" se a loja tiver algum cupom ativo,
-- dentro da validade e não esgotado. Devolve só verdadeiro/falso (os códigos continuam secretos).
create or replace function loja_tem_cupom(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cupons c join lojas l on l.id = c.loja_id
    where l.slug = p_slug and c.ativo
      and (c.valido_de is null or current_date >= c.valido_de)
      and (c.valido_ate is null or current_date <= c.valido_ate)
      and (c.limite_uso_total is null or (select count(*) from cupom_usos u where u.cupom_id = c.id) < c.limite_uso_total)
  )
$$;
grant execute on function loja_tem_cupom(text) to anon, authenticated;
notify pgrst, 'reload schema';
