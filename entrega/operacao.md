# Operação e recuperação — FHDOD

Esta instalação serve à apresentação acadêmica. Os passos abaixo não foram aplicados novamente na nuvem e não alteram credenciais existentes.

## Conferir antes da apresentação

Em 5/11/2026, o projeto existente no Supabase foi reativado após pausa por inatividade no plano gratuito. O banco voltou a `ACTIVE_HEALTHY`; o site, `/api/questions` e `/api/wall` responderam HTTP 200, com JSON válido nas APIs. A recuperação não alterou dados ou credenciais.

Antes da aula, abra o sistema, confira a pesquisa e a TV e consulte as perguntas no servidor. Se o banco estiver pausado, reative o mesmo projeto no painel do Supabase e aguarde a inicialização; não recrie o banco nem troque a conexão. Verifique novamente a leitura das APIs. Ter o HTML ou `/api/health` disponível não basta para comprovar o funcionamento do banco. A verificação funcional completa com dados fictícios é uma etapa separada.

## Preparar outro banco ou recuperar uma instalação

1. Use uma conexão administrativa temporária, com permissão de criar roles e alterar o schema. A `DATABASE_URL` da aplicação usa `fhdod_api` e não deve receber privilégios de migração.
2. Aplique `server/postgres-schema.sql` e `server/schedules-schema.sql` ou execute `npm run db:migrate` com essa conexão administrativa para incluir os seeds. Execute depois `server/postgres-access.sql` como proprietário do schema. Esse arquivo é manual, transacional e idempotente; não integra a inicialização da API.
3. A role `fhdod_api`, quando nova, nasce sem login e sem senha. Em uma sessão administrativa segura de `psql`, use `\password fhdod_api`, informe uma senha forte gerada no gerenciador de senhas e confirme. Esse comando evita a senha em texto aberto no histórico e nos logs. Somente depois execute `ALTER ROLE fhdod_api LOGIN;`. Não cole senha em um comando SQL, no chat, em captura de tela, em URL de terminal ou em arquivo versionado. O SQL de acesso preserva LOGIN/senha quando a role já existe.
4. Configure a URL do pooler apenas no segredo `DATABASE_URL` do servidor, com o usuário exigido pelo provedor. Configure o certificado oficial em `MEDICARE_DB_CA_PEM`, `APP_ORIGIN` com a origem HTTPS pública exata e `MEDICARE_SECURE_COOKIES=true`. Não use credenciais administrativas na Vercel. Não exponha o schema `fhdod` na Data API.
5. Para o primeiro administrador, use `npm run admin:cloud` com `MEDICARE_ADMIN_NAME`, `MEDICARE_ADMIN_EMAIL` e `MEDICARE_ADMIN_PASSWORD` fornecidos por armazenamento de segredos local temporário. O script não altera um administrador já existente e exige troca da senha no primeiro acesso. O administrador deve digitar sua senha pessoal; não publicar a senha temporária.
6. Verifique perguntas/configurações e um fluxo fictício completo na origem canônica. `/api/health` sozinho não comprova conexão com o banco. Verifique também os cinco perfis, negação de acesso anônimo e persistência após reiniciar a API. Remova somente os dados fictícios criados nessa verificação.

Os grants novos se restringem às operações utilizadas por cada tabela. `schema_version` não recebe acesso runtime. Não há grant de ownership, criação de schema, administração de roles ou acesso automático a tabelas futuras. Políticas existentes são preservadas e precisam de revisão do operador se forem diferentes das esperadas.

## Backup e restauração

O repositório não configura backup automático nem restauração em um clique. A exportação Excel contém resultados analíticos e não substitui um backup completo de contas, perguntas, versões, contatos e auditoria. No plano gratuito, a orientação atual da Supabase é realizar exportações periódicas e manter uma cópia fora do provedor; não presumir backup diário/PITR contratado. [Fonte: backups da Supabase](https://supabase.com/docs/guides/platform/backups).

Antes de dados reais, o responsável deve definir frequência, retenção, destino criptografado e acesso às cópias; produzir um dump completo do schema `fhdod` com ferramenta oficial usando conexão administrativa protegida e testar a restauração em banco separado. Dumps contêm dados pessoais e hashes de senha, portanto ficam fora do Git e das pastas públicas. A cópia deve incluir a definição e os dados, além de inventário separado de variáveis/roles sem valores secretos. A role e a senha de conexão devem ser reprovisionadas com o procedimento acima; backup de banco não substitui a guarda segura de segredos. [Fonte: comportamento das roles e dos backups](https://supabase.com/docs/guides/platform/backups).

Só substituir a origem de produção após conferir contagens, perguntas, auditoria, vínculos e acessos no banco restaurado. Suspender gravações durante a cópia final e troca evita perder respostas enviadas entre essas etapas. Restaurar uma versão anterior pode perder os registros recebidos depois da cópia; registrar esse intervalo e manter a instalação anterior até a verificação terminar.

## Recuperação de conta

Não há envio de e-mail, recuperação de senha ou desativação de conta pela interface nesta versão. Não divulgar o administrador de demonstração. Se o único administrador perder o acesso, o proprietário do banco deverá conduzir uma recuperação controlada, com identidade confirmada, nova senha temporária com hash pelo mesmo mecanismo do projeto, troca obrigatória e revogação das sessões antigas. Não substituir hashes por senhas em texto nem recriar o banco para recuperar a conta. Esse procedimento depende do responsável técnico e não está automatizado.

[Referência oficial do psql: comando `\password`](https://www.postgresql.org/docs/current/app-psql.html#APP-PSQL-META-COMMAND-PASSWORD).
