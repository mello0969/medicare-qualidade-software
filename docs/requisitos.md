# Especificação de requisitos e rastreabilidade

Murilo Mello e Arthur Kaiser · Informática, turma 63-1 · CIMOL · 26/11/2026.

## Objetivo, fontes e limites

Substituir a coleta em papel do cenário acadêmico por pesquisa móvel e análise compartilhada. Os três relatos para cada quinhentos atendimentos são dados do enunciado, não medição da FHDOD. Fontes: DOCX da atividade de Design, anotações fornecidas por Murilo e enunciado integrado/complementos indicados no README. Não foram feitas entrevistas novas nem aceite institucional. Especificação estruturada inspirada na separação RF/RNF e nas dimensões da ISO/IEC 25010; não certifica conformidade integral com norma.

Escopo: pesquisa, painel, Ouvidoria, escala, TV, usuários, Excel, QR e documentação. Fora de escopo implementado: prontuário, convite automático, envio real de mensagens, recuperação de senha por e-mail, expurgo automático e homologação hospitalar.

## Atores e autorização

Paciente sem conta; Super Admin (`manager`); Admin de Setor (`sector-admin`); Gestão (`management`); Ouvidoria (`ombudsman`); Visualizador (`viewer`). O frontend orienta e a API restringe. Apenas Super Admin/Ouvidoria consultam telefone e relato de contato. Gestão/Admin de Setor não leem comentários livres. Visualizador tem TV pública, sem listagem analítica privada. Senha temporária precisa ser trocada antes de acessar áreas protegidas.

## Matriz RF: fonte → requisito → implementação → critério e evidência

| ID / origem                | Requisito                                        | Implementação                          | Aceitação / teste                                                                                              |
| -------------------------- | ------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| RF01 / Design              | URL e QR próprios de cada setor                  | src/SurveyLinks.tsx, Survey.tsx        | Seis PNGs decodificam domínio e setor correto; tests/publication.spec.ts                                       |
| RF02 / Design              | Apenas recomendação geral obrigatória            | Survey.tsx; app.mjs POST responses     | Sem NPS bloqueia; zero é válido; opcionais não viram zero; tests/flows.spec.ts e app.test.mjs                  |
| RF03 / briefing            | Perguntas por jornada/contexto                   | domain.ts questionsForSectors          | Específicas dos setores na ordem da jornada, gerais ao fim; domain.test.ts                                     |
| RF04 / briefing confirmado | Rosto 1 ou 2 oferece contato consentido opcional | Survey.tsx, experience.mjs             | Sem opt-in segue anônimo; opt-in exige nome/telefone/relato/consentimento; experience.test.mjs                 |
| RF05 / Design              | Cruzar setor/data/turno com escala               | schedules.mjs, postgres.mjs            | Snapshot de equipe não muda após edição; conflito retorna 409; schedules.test.mjs                              |
| RF06 / DOCX posterior      | Cinco perfis                                     | app.mjs, store.mjs, postgres.mjs       | Sem sessão retorna 401; sem perfil permitido, 403; roles.test.mjs e connected.spec.ts                          |
| RF07 / Design              | Dashboard por período/setor/turno/equipe         | Dashboard.tsx, analytics.ts, domain.ts | Recorte altera indicadores, NPS e satisfação; unitários e fluxo conectado                                      |
| RF08 / Design              | TV pública sem dado individual                   | wall.ts, TVWall.tsx                    | Amostra abaixo de cinco fica oculta; só agregados; atualização a cada 15 s; wall.test.ts e publication.spec.ts |
| RF09 / Design              | Exportar Excel                                   | export.ts                              | Arquivo abre com recorte, sem contatos; tests/flows.spec.ts                                                    |
| RF10 / briefing            | Administração de perguntas/textos/contas         | app.mjs, Users.tsx                     | Versionamento, conflito e limites por setor; roles/experience/app.test.mjs                                     |
| RF11 / integrado           | Persistência real compartilhada                  | repository.mjs, postgres.mjs           | Reinício e transações preservam registros; postgres.test.mjs                                                   |
| RF12 / Sites               | API documentada interativamente                  | server/openapi.mjs e src/swagger.js    | Todas as 22 operações documentadas, cookie e CSRF descritos; docs.test.mjs e api-docs.spec.ts                  |

## Requisitos não funcionais mensuráveis

| ID    | Dimensão / requisito     | Critério verificável                                                                                                                                                     |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RNF01 | Interação/acessibilidade | Rotas críticas auditadas em desktop e celular com Axe, teclado/nomes acessíveis e redução de movimento; auditoria automatizada não substitui avaliação humana            |
| RNF02 | Segurança                | Hash scrypt + salt, cookie HttpOnly/SameSite, Secure em HTTPS, CSRF e origem de escrita verificados, consultas parametrizadas; testes de negação                         |
| RNF03 | Confiabilidade           | Mesmo UUID/payload é idempotente; UUID reutilizado com conteúdo diferente retorna 409; falha de rede mantém formulário                                                   |
| RNF04 | Integridade              | FK/CHECK/UNIQUE, transações, versões e auditorias; tentativa inválida faz rollback                                                                                       |
| RNF05 | Manutenibilidade         | Separação UI/rotas/repositório/adaptadores; build TypeScript, formatação e testes reproduzíveis                                                                          |
| RNF06 | Privacidade              | TV/Excel sem contatos; projeções de perfil; comentário orientado a não conter dados clínicos; retenção proposta, não automatizada                                        |
| RNF07 | Eficiência               | Pool Postgres com máximo de três conexões por instância, timeout de conexão de 5 s, corpo JSON de 32 KiB; limites de tentativa. Não foi executado benchmark de carga/SLA |
| RNF08 | Portabilidade            | Node >=24; lockfile; SQLite isolado no desenvolvimento; Postgres na nuvem; docs estáticas com assets locais                                                              |

## Decisões e aceite

NPS no fim, rostos opcionais, celular com suporte a tablet, contato após rosto 1 ou 2, escala contextual sem culpa automática e TV agregada foram confirmados pelo estudante. A revisão do briefing é rastreada pelas mensagens e commits; cliente/professor deve validar no aceite. O PDF de Design preserva personas e justificativas. Apresentação e avaliação não são declaradas concluídas pelo agente.

## Complementos da versão integrada do Arthur

O merge `87e7766` acrescenta filtros de formulário/origem e tipo de manifestação, comparação de períodos, tendência, distribuição do NPS e detalhamento por setor. Os filtros são aplicados explicitamente; a base do servidor se atualiza a cada 15 segundos enquanto a página está visível. Há duas exportações: respostas e indicadores. Ambas excluem contatos e texto livre.

RF13: o Super Admin consulta os últimos cem eventos de auditoria por data/tipo, sem receber contatos ou hashes (`server/audit.mjs`, `GET /api/admin/audit`). RF14: campos opcionais `feedback`, `origin` e `questionnaire` preservam registros históricos quando ausentes. São validados no domínio e persistidos em colunas opcionais. Essas mudanças já existiam no GitHub; foram incorporadas antes de consolidar esta entrega, sem duplicar sua implementação.
