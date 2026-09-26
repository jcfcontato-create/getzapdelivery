-- Permite que a equipe da loja exclua pedidos definitivamente (botão "Excluir" na aba
-- Pedidos). Antes só existia permissão de leitura e atualização de status. Ao excluir,
-- os itens do pedido e os adicionais escolhidos somem junto (on delete cascade já
-- configurado desde o início), e o pedido deixa de aparecer em qualquer lugar,
-- inclusive na aba Relatórios.
create policy "pedidos: equipe exclui" on pedidos for delete using (eh_membro(loja_id));
grant delete on pedidos to authenticated;

notify pgrst, 'reload schema';
