# Arquitetura do backend

## Estrutura e padrões reais

Navegador React → API HTTP Node → contrato de repositório → SQLite local ou PostgreSQL na nuvem. A Vercel serve o frontend estático e `api/index.mjs`; o Supabase mantém o schema privado `fhdod`. É um monólito modular, sem microserviços, filas ou Redis.

| Camada                | Arquivos                                                         | Responsabilidade                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Apresentação          | src/                                                             | Etapas, filtros e exportação; não decide autorização          |
| Transporte/aplicação  | server/app.mjs                                                   | Rotas, JSON, limites, sessão, origem, CSRF, erros e projeções |
| Regras                | validation.ts, domain.ts, wall.ts, experience.mjs, schedules.mjs | Notas, consentimento, contexto, indicadores e versões         |
| Porta de persistência | repository.mjs                                                   | Contrato comum e factory que seleciona o adaptador            |
| Adaptadores           | store.mjs, experience.mjs, schedules.mjs / postgres.mjs          | SQLite/pg parametrizados, transações e auditoria              |
| Operação              | migrate-postgres.mjs, bootstrap-*.mjs                            | Migração e administrador explícitos, fora das requisições     |

Factory seleciona a persistência; Repository reduz o acoplamento do HTTP ao SQL; transações funcionam como unidade de trabalho; snapshots e versões preservam o histórico e permitem concorrência otimista. Os padrões são implementados com módulos/funções, sem ORM ou hierarquia de classes artificiais.

## Fluxo de uma pesquisa

1. `POST /api/responses` verifica a origem e aplica limite de tentativas.
2. `readBody` exige JSON e limita o corpo a 32 KiB. `validResponse` verifica forma e notas.
3. `saveSurvey` verifica versões de perguntas, consentimento, idempotência e contexto de escala.
4. Uma transação grava pesquisa, setores, respostas e contato opt-in; erros fazem rollback.
5. A API retorna ID/data. A UI confirma; dashboard e TV consultam projeções distintas.

## Segurança e manutenção

A autenticação usa cookie aleatório, não JWT/Bearer. O banco guarda hash do token, com duração de oito horas. Senhas usam scrypt e salt aleatório. Escritas autenticadas exigem CSRF e origem exata; perfis e escopo são conferidos no servidor. Erros não expõem SQL, conexão ou conteúdo pessoal. A conexão remota usa TLS com validação de certificado. Veja `seguranca-e-nuvem.md` para limites e acesso à banca.

O contrato está em `server/openapi.mjs`. O Swagger UI oficial 5.36.0 é empacotado pelo Vite em `documentacao.html` e `src/swagger.js`, sem CDN ou validador externo. O contrato OpenAPI 3.1 é servido em `/api/openapi.json`; `/api/docs` redireciona à interface. Mudanças de rota exigem atualização do contrato e do teste de paridade. A documentação não substitui autorização do servidor.

## Expansão e limitações

O pool de três conexões por instância reduz a pressão inicial, mas múltiplas instâncias precisam de dimensionamento. A listagem analítica atual carrega o conjunto autorizado e filtra no frontend: grandes volumes exigirão paginação/agregação SQL e medição com EXPLAIN. A exportação também ocorre no navegador.

SaaS multi-hospital é evolução proposta: exige identificação de tenant e isolamento completo, não apenas novos setores. Não há benchmark de produção, fila, SLA contratado, backup automático implementado ou alta disponibilidade comprovada pela dupla. Não se afirma que a arquitetura atual já atenda escala nacional.
