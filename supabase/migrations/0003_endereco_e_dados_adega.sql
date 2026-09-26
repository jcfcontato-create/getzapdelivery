-- Dados reais da Adega S.O.S: cria a coluna de endereço e atualiza WhatsApp e endereço.
-- WhatsApp: só dígitos, com 55 + DDD + número.
alter table lojas add column if not exists endereco text;

update lojas
set whatsapp = '5511940104824',
    endereco = 'Rua Major Murzilho, 93, Centro, Bom Jesus dos Perdões - SP'
where slug = 'adega-sos';

notify pgrst, 'reload schema';
