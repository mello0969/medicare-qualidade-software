# Persistência e consultas críticas

O backend é funcional/modular: não utiliza classes DAO ou ORM. `createRepository` seleciona um objeto de operações comum; SQLite usa `DatabaseSync` e Postgres usa `pg.Pool`. Esse mapeamento descreve a implementação real, sem inventar classes.

| Operação / módulo                           | Entrada e saída                       | I/O                                                                        |
| ------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| repository.createRepository                 | Caminho/URL → repositório             | Seleção de adaptador                                                       |
| postgres.createPostgresRepository           | Conexão → operações                   | Pool TLS, três conexões, verificação de migração                           |
| store.openDatabase                          | Caminho → SQLite                      | FKs, estrutura local e seeds                                               |
| authenticate / readSession / changePassword | Credencial/token → usuário público    | Join users/sessions, hash, revogação e rotação                             |
| saveSurvey                                  | Pesquisa validada → ID/data/duplicado | Transação entre pesquisa, setores, respostas, contato e snapshot de equipe |
| listSurveys                                 | Perfil → projeção autorizada          | Escopo de setor; comentários removidos quando não permitidos               |
| updateQuestions / createQuestion            | Perguntas/versões/ator → versão       | Concorrência otimista e auditoria                                          |
| updateSettings                              | Configuração/versão → nova versão     | Histórico imutável de textos/consentimento                                 |
| listContacts / updateContactStatus          | Perfil/status → contato               | Consulta separada e auditoria de transições                                |
| listSchedules / updateSchedule              | Mês/contexto/versão → escala          | Escopo de setor e atualização versionada                                   |
| consumeRate                                 | Chave/limite/janela → permissão       | Map local ou contador atômico no Postgres                                  |

## Consultas representativas

Trechos equivalentes às operações de `server/postgres.mjs`, sem alegação de EXPLAIN executado em produção.

```sql
SELECT q.id,q.sector_id,v.text,q.current_version
FROM fhdod.questions q JOIN fhdod.question_versions v
 ON v.question_id=q.id AND v.version=q.current_version
ORDER BY q.position;

-- $1: hash do token; $2: instante atual em milissegundos.
SELECT u.*,s.csrf_token FROM fhdod.sessions s
JOIN fhdod.users u ON u.id=s.user_id
WHERE s.token_hash=$1 AND s.expires_at>$2;

-- $1: mês seguido de %; $2: setor autorizado.
SELECT sector_id,attendance_date,shift,team,version
FROM fhdod.shift_schedules
WHERE attendance_date LIKE $1 AND sector_id=$2
ORDER BY attendance_date,sector_id,shift;

SELECT id,payload_hash,created_at FROM fhdod.surveys WHERE id=$1;
```

## Índices e custo

PKs apoiam identificação e joins. `users_email` apoia login; índices de expiração apoiam limpeza operacional. `surveys_created_at`, `sector_surveys`, `contacts_status`, `contacts_created_at` e `schedules_month` correspondem aos recortes principais.

A listagem analítica atual lê o conjunto autorizado e agrega no JavaScript. Índices não eliminam esse custo: grandes volumes exigem paginação/agregação SQL e medição com `EXPLAIN (ANALYZE, BUFFERS)` em massa fictícia isolada. Não há resultados de latência de produção ou índices criados com base em benchmark alegado.

BEGIN/COMMIT/ROLLBACK mantêm atomicidade. Locks e comparação de versões impedem sobrescrita concorrente; a migração utiliza advisory lock. Testes de Postgres/PGlite verificam consistência local, não medem a rede do Supabase.

## Auditoria e metadados do painel integrado

`server/audit.mjs` unifica eventos de contas, perguntas, escalas e situação de contato. `repository.listAudit` e o adaptador PostgreSQL fornecem no máximo cem entradas, apenas com data e tipo. O HTTP exige Super Admin. Não há leitura de senha, telefone ou conteúdo da manifestação nessa operação.

`saveSurvey` passa a inserir `feedback`, `origin` e `questionnaire` como parâmetros opcionais. `listSurveys` projeta esses atributos; `src/analytics.ts` calcula recortes, comparação e tendência no frontend. Este comportamento não é uma nova agregação SQL nem muda o limite de escala da listagem completa.
