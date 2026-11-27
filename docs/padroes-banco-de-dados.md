# Padrões do banco

PostgreSQL usa o schema privado `fhdod`; SQLite local não utiliza schema. Tabelas e colunas seguem inglês e `snake_case`; entidades são plurais. Sufixos `_versions` e `_audit` indicam versões e auditoria. O HTTP/TypeScript usa `camelCase`, mapeado por aliases no adaptador.

| Padrão                  | Exemplo                                             | Motivo                                         |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Chave simples           | surveys.id                                          | Identificação estável com UUID validado na API |
| Chave composta          | answers(survey_id, question_id)                     | Uma resposta por pergunta/pesquisa             |
| FK versionada           | answers(question_id, question_version)              | Preservar sentido histórico da resposta        |
| Escala composta         | shift_schedules(sector_id, attendance_date, shift)  | Uma equipe por contexto vigente                |
| Unicidade por expressão | users_email em lower(email)                         | Evitar conta duplicada por diferença de caixa  |
| Índices de consulta     | surveys_created_at, sector_surveys, schedules_month | Apoiar período, setor e mês                    |
| Constraints explícitas  | surveys_shift_check                                 | Restringir domínio de valores                  |

Nomes de constraints implícitas são gerados pelo Postgres; nomes explícitos são preservados. Não renomear objetos existentes apenas por estética. Novas FKs precisam definir conscientemente a política de exclusão. Pesquisa → respostas/setores/contato usa CASCADE; usuário → sessão usa CASCADE. Auditorias preservam vínculos. A interface não oferece exclusão geral de contas ou dados.

Nulo representa ausência; strings vazias existem em campos opcionais/legados. Tamanhos e algumas regras semânticas são limitados pela API, pois o DDL utiliza TEXT. Não concatenar parâmetros em SQL: usar `$1…` no Postgres e `?` no SQLite. Identificadores de tabela/schema são constantes, não entrada do usuário.

Datas de atendimento usam AAAA-MM-DD; timestamps usam ISO UTC. A validação de data futura considera America/Sao_Paulo. Nomes/telefones não são chaves primárias nem conteúdo de logs. A lista física de índices e constraints está no dicionário e nos scripts versionados.
