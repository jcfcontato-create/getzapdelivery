-- Opção da própria loja: ao clicar em "Iniciar preparo" ou "Saiu para entrega", abrir a conversa
-- com o cliente no WhatsApp da loja (wa.me) com a mensagem pronta. Começa desligada.
alter table lojas add column if not exists aviso_whatsapp_status boolean not null default false;
