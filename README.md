# Chat Interno Local

Um sistema de chat interno simples e local para unidades públicas, focado em simplicidade para ~15 funcionários.

## Pré-requisitos

- Node.js 18+
- Navegador Chrome ou Edge

## Instalação

1. Clone ou baixe o projeto.
2. Instale as dependências: `npm install`
3. Copie `.env.example` para `.env` e configure as variáveis (opcional, valores padrão funcionam).

## Como Rodar

- Desenvolvimento: `npm run dev`
- Produção: `npm start`

O servidor roda em `http://localhost:3000` (ou IP do servidor na rede local).

## Acesso na Rede Local

Para acessar de outros computadores na mesma rede:
- Descubra o IP do servidor (ex: `ipconfig` no Windows).
- Acesse `http://IP_DO_SERVIDOR:3000` nos navegadores dos outros PCs.


## Funcionalidades

- Login com usuário/senha.
- Chat direto (DM) entre usuários.
- Envio de arquivos (PDF, DOC, etc., até 20MB).
- Notificações no navegador quando aba não em foco.
- Painel admin para gerenciar usuários.

## Segurança

- Senhas hasheadas com bcrypt.
- Sessões seguras.
- Validação de inputs.
- Upload restrito a tipos seguros.

## Estrutura

- `/server`: Backend Node.js/Express/Socket.IO/SQLite.
- `/public`: CSS/JS frontend.
- `/views`: Templates EJS.
- `/uploads`: Arquivos enviados.

## Notas

- Sem dependências externas (100% local).
- Open-source e gratuito.
- Para mais usuários, considere otimizar o DB.
