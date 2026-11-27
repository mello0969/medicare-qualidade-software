# Plano e relatório de testes

Murilo Mello e Arthur Kaiser · Informática 63-1 · CIMOL · execução de 26/11/2026.

## Estratégia e ambiente

Os critérios vêm de `requisitos.md`. A revisão utiliza a base `87e7766` (PR #1 do Arthur), preserva suas melhorias e adiciona validação de contrato e duas jornadas do Swagger. Testes de domínio usam Vitest; API usa Node test runner com SQLite temporário e PostgreSQL em memória via PGlite; navegador usa Playwright com Chrome, três workers e projetos desktop/celular. Node 24.14.1. O relatório não confunde essa execução com a revisão anterior de 122 cenários.

Testes locais não utilizam DATABASE_URL real: fixtures impõem caminhos temporários e não herdam URL de produção. As contas de QA são fictícias e criadas apenas no banco de teste. Nenhum contato real foi lido ou usado em capturas. Fontes e comandos estão no repositório; instalação via npm ci.

## Resultado atual

| Verificação                 | Comando                                      | Resultado                                     |
| --------------------------- | -------------------------------------------- | --------------------------------------------- |
| Domínio/planilhas           | npm run test:unit (parte de npm test)        | 15 aprovados                                  |
| API/persistência/contrato   | npm run test:api / npm run test:coverage:api | 54 aprovados                                  |
| Navegador                   | npm run test:e2e                             | 73 aprovados; desktop e celular               |
| Total de cenários distintos | Soma das três suítes                         | 142 aprovados; não somar reexecuções          |
| Build                       | npm run build                                | TypeScript e Vite aprovados                   |
| Formatação de código        | npm run format:check                         | Aprovada                                      |
| OpenAPI                     | SwaggerParser e teste de paridade            | OpenAPI 3.1 válido, 22 operações documentadas |

O build avisa sobre chunks acima de 500 kB, incluindo ExcelJS. É um aviso de tamanho, não erro. Não foi removido nem transformado em garantia de performance.

## Cobertura medida: backend

Comando: `npm run test:coverage:api`. Node/V8 mede arquivos `server/*.mjs` carregados pela suíte, excluindo `server/*.test.mjs`. Os percentuais não representam cobertura do frontend, de arquivos não carregados ou de todas as linhas do repositório. Não houve benchmark de carga ou SLA.

| Escopo/módulo           |  Linhas |   Ramos | Funções |
| ----------------------- | ------: | ------: | ------: |
| Total carregado         |  96,30% |  91,87% |  97,98% |
| app.mjs                 |  99,02% |  92,31% |  92,00% |
| postgres.mjs            |  98,00% |  86,05% |  98,11% |
| repository.mjs          |  91,67% |  86,84% |  96,30% |
| store.mjs               | 100,00% |  96,64% | 100,00% |
| schedules.mjs           | 100,00% |  98,15% | 100,00% |
| experience.mjs          | 100,00% | 100,00% | 100,00% |
| audit.mjs / openapi.mjs | 100,00% | 100,00% | 100,00% |
| bootstrap-local.mjs     |  73,68% |  64,29% | 100,00% |
| bootstrap-postgres.mjs  |  32,76% |  50,00% | 100,00% |
| migrate-postgres.mjs    |  72,34% |  80,00% | 100,00% |

Entradas operacionais como `server/index.mjs` e `create-admin.mjs` não aparecem nesse conjunto carregado. As linhas não cobertas, em especial ramos CLI/erro operacional, estão no log anexo. Percentual alto não prova ausência de falhas.

## Casos de aceitação e rastreabilidade

| Caso              | Critério observável                                                                  | Evidência                                                |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| T01 NPS/opcionais | Sem NPS não concluir; zero válido; pergunta pulada não vira nota                     | domain.test.ts, flows.spec.ts, app.test.mjs              |
| T02 Perfis        | Sem sessão401; perfil indevido403; setor isolado; senha temporária bloqueia dados    | roles.test.mjs, password.test.mjs, connected.spec.ts     |
| T03 Contato       | Rosto1/2 oferece opt-in; exige autorização/dados; Excel/TV sem contato               | experience.test.mjs, flows.spec.ts, publication.spec.ts  |
| T04 Escalas       | Contexto exato, snapshot preservado; versão antiga409                                | schedules.test.mjs, schedules.spec.ts, postgres.test.mjs |
| T05 Persistência  | Reenvio idempotente; mudança de conteúdo com mesmoUUID409; atomicidade               | app.test.mjs, postgres.test.mjs                          |
| T06 Painel        | Filtros aplicados, comparação, tendência, denominadores e exportações corretos       | analytics.test.ts, dashboard.spec.ts, domain.test.ts     |
| T07 TV/QR         | SeisQRs corretos; base mínima cinco; somente agregado; falha de atualização indicada | wall.test.ts, publication.spec.ts                        |
| T08 Swagger       | Contrato corresponde a rotas; GETquestions real; cookie/CSRF permite logout próprio  | docs.test.mjs, openapi.spec.ts, api-docs.spec.ts         |
| T09 Interação     | Desktop/celular, 320px, fonte ampliada, teclado, Axe e movimento reduzido            | accessibility.spec.ts, connected-accessibility.spec.ts   |
| T10 Auditoria     | Apenas Super Admin; últimos cem eventos, somente data/tipo                           | app.test.mjs, schedules.test.mjs, dashboard.spec.ts      |

## Erros corrigidos e revisão sem duplicação

Na primeira tentativa local, o checkout estava atrás do GitHub. Antes de publicar, fizemos fetch e fast-forward para preservar o PR #1. Uma implementação paralela de Swagger que estava sendo preparada foi descartada em favor da existente do Arthur. O contrato atual foi validado; os testes novos reutilizam sua interface. Não se tratou uma documentação duplicada como entrega adicional.

Os testes novos inicialmente usaram um seletor da tabela que incluía o cabeçalho Code; ele foi corrigido para a resposta real, preservando a asserção de HTTP200. A verificação de logout comprova cookie e CSRF com HTTP204 e negação posterior401. Esses ajustes são do teste/documentação, não falhas atribuídas a pacientes reais.

Em uma revisão anterior, um tablet reutilizava a data ao iniciar outra pesquisa. A correção limpa o campo e os testes desktop/celular confirmam o reinício. Relação: erro humano de esquecer a limpeza → defeito no reset do estado → falha observável de reutilizar a data anterior.

## Nuvem atual

Supabase retomado para ACTIVE_HEALTHY. Após inspecionar schema e advisor de segurança, foram adicionadas apenas as três colunas opcionais já previstas no código novo e grants de leitura de data/tipo de auditoria. Site, Swagger, OpenAPI, perguntas e TV responderam HTTP200. POST público de uma pesquisa fictícia com NPS0 e metadados retornou201; leitura por ID confirmou persistência. O registro próprio foi removido e a contagem remanescente ficou zero. Nenhuma credencial foi alterada, nenhum registro real foi removido e não houve criação de recurso pago. Veja `evidencias/verificacao-nuvem.json`.

Essa prova de gravação é limitada ao envio testado; não refaz todos os perfis privados em produção. Os cenários completos de perfis/dashboard/TV foram exercitados no ambiente temporário. A apresentação deve conferir a disponibilidade novamente, pois o plano gratuito pode pausar.

## Arquivos de evidência

- evidencias/testes-domino-e-api.txt: execução de Vitest e Node.
- evidencias/testes-navegador.txt: 73 cenários e duração.
- evidencias/cobertura-backend.txt: percentuais e linhas não cobertas.
- evidencias/build.txt e formatacao.txt: checks técnicos.
- evidencias/swagger-desktop.png e swagger-mobile.png: GET real em base fictícia local.
- evidencias/verificacao-nuvem.json: restabelecimento e prova pública limitada.

Não foram realizadas entrevistas, aceite institucional, avaliação de acessibilidade com usuários reais, testes de carga ou medição de taxa de adesão. Esses pontos permanecem limites explicitados, sem resultados inventados.
