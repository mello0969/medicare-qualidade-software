# FHDOD — Gestão da Experiência do Paciente

Projeto acadêmico de pesquisa de satisfação para o Hospital Dr. Oswaldo Diesel. Use somente informações fictícias. Pacientes respondem sem conta. A equipe entra com seu perfil para acompanhar resultados, administrar escalas e tratar pedidos autorizados de contato.

## Executar localmente

Com Node.js 24 ou superior e npm, execute na pasta do projeto:

```sh
npm ci
npm run admin:local
npm run dev
```

Abra [o acesso à gestão](http://127.0.0.1:5173/) ou [o painel de demonstração](http://127.0.0.1:5173/#/demonstracao). Na primeira execução, `admin:local` salva o acesso de desenvolvimento em `.local/administrador.txt`. O SQLite fica em `data/`. Ambas as pastas são locais. Para usar SQLite, deixe `DATABASE_URL` ausente. O frontend Vite encaminha `/api` ao Node na porta 3001. A [pesquisa completa](http://127.0.0.1:5173/#/pesquisa) funciona no mesmo endereço.

## Ler e apresentar o painel

1. Entre no painel. O período inicial inclui hoje e os 29 dias anteriores, pela data de envio. Altere os filtros e use **Aplicar filtros**. **Atualizar agora** relê a fonte mantendo o recorte aplicado. A base do servidor também atualiza a cada 15 segundos enquanto a página está visível.
2. Leia o tamanho da amostra no card de NPS. Quatro promotores, um passivo e um detrator produzem NPS **50** pela conta `100 × (4 − 1) / 6`. Um traço indica que o denominador é zero. Notas históricas ausentes ficam fora do NPS. A cobertura usa todas as respostas do recorte como denominador e exige turno informado e equipe atribuída pela escala.
3. **Comparar com o período anterior** aplica os mesmos filtros aos dias imediatamente anteriores, com a mesma duração. Cada card exibe a base de comparação. A distribuição usa notas válidas de 0 a 10. Na tendência, dias sem nota ficam sem ponto. A tabela mostra os dias com envios e o número de notas válidas.
4. Abra um setor para ver as médias das perguntas por versão e as contagens por turno e equipe. O NPS se refere à recomendação do hospital nas respostas que incluem aquele setor. Uma pesquisa multissetorial conta uma vez no total e uma vez em cada setor visitado. Por isso, somar as linhas pode superar o total de pesquisas.
5. **Pesquisa** identifica o formulário pelo qual a pessoa entrou. **Origem** distingue o QR identificado do acesso sem marcador. Um link de QR encaminhado conserva seu marcador. Registros históricos ficam sem classificação quando esse dado falta. O paciente pode classificar uma manifestação como reclamação, sugestão ou elogio. O texto livre e o pedido de contato autorizado têm finalidades separadas.
6. **Exportar respostas** gera linhas de respostas e avaliações do recorte autorizado. **Exportar indicadores** gera resumo, comparação quando selecionada, distribuição, tendência e setores. As planilhas excluem os contatos e o texto livre dos pacientes.

O Admin de Setor recebe apenas a projeção autorizada pela API. Gestão não recebe comentários livres. Visualizador e Ouvidoria entram no painel agregado. A TV Wall mantém base mínima de cinco pesquisas elegíveis por indicador ou grupo. A consulta de auditoria, exclusiva do Super Admin, mostra data e tipo dos últimos 100 eventos de contas, perguntas, escalas e ouvidoria.

Em **Relatórios** ficam os indicadores anteriores de satisfação, avaliações por setor e volume diário. **Setores e equipes** consulta equipes do mês. **Escalas** permite consultar ou editar a alocação conforme o perfil. Os links complementares dão acesso à ouvidoria, edição de perguntas, mensagens e material de qualidade.

## API e persistência

A [interface Swagger UI](http://127.0.0.1:5173/api/docs) carrega o [contrato OpenAPI 3.1](http://127.0.0.1:5173/api/openapi.json) da própria aplicação. Para experimentar rotas privadas em desenvolvimento, entre com um usuário fictício no mesmo navegador e origem. A interface usa o cookie de sessão e obtém o CSRF da sessão para as escritas. **Execute** envia uma solicitação real à base selecionada.

O backend fica em `server/app.mjs`. A mesma interface de repositório atende SQLite local e PostgreSQL. As novas colunas opcionais preservam respostas históricas e sua idempotência. Em uma futura atualização autorizada do PostgreSQL, o responsável deve aplicar a migração de esquema e os privilégios por coluna de `server/postgres-access.sql` antes de ativar a nova versão. Os testes exercitam PostgreSQL isolado com PGlite.

## Validação

```sh
npm run build
npm test
npm run format:check
npm run test:e2e
```

O Playwright usa Chrome por padrão e inicia os servidores de teste nas portas 3002 e 5174 com SQLite temporário. No PowerShell, para usar Edge instalado, defina `$env:MEDICARE_BROWSER_CHANNEL = 'msedge'` antes do comando. Os testes cobrem desktop e celular. As capturas com dados fictícios mostram a [visão inicial](entrega/imagens/painel-visao-inicial.png), o [painel completo em desktop](entrega/imagens/painel-indicadores-desktop.png), o [detalhamento da Triagem](entrega/imagens/painel-detalhe-setor.png) e a [versão para celular](entrega/imagens/painel-indicadores-mobile.png).

Na validação de 26/11/2026 passaram 15 testes de domínio e planilhas, 52 de API e persistência e 69 de navegador. A suíte de navegador rodou no Edge com dois processos de teste. Os cenários cobrem também o aviso de armazenamento corrompido, o retorno de uma falha de carregamento e a leitura do QR baixado. A comparação visual confirmou os oito filtros em duas linhas no desktop, seis indicadores em duas linhas de três e gráficos lado a lado. Em telas estreitas, os mesmos elementos se empilham e a navegação passa a ser expansível.

## Arquivos para acompanhar o código

| Área                             | Arquivos principais                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Navegação e permissões           | `src/App.tsx`, `server/app.mjs`                                                                         |
| Coleta, validação e persistência | `src/Survey.tsx`, `src/SurveyLinks.tsx`, `src/validation.ts`, `server/store.mjs`, `server/postgres.mjs` |
| Filtros, bases e fórmulas        | `src/domain.ts`, `src/analytics.ts`, `src/DashboardFilters.tsx`                                         |
| Painel, relatórios e gráficos    | `src/Dashboard.tsx`, `src/DashboardResults.tsx`, `src/dashboard.css`                                    |
| Planilhas, auditoria e contrato  | `src/export.ts`, `server/audit.mjs`, `server/openapi.mjs`                                               |

O [manual de operação](entrega/operacao.md) reúne detalhes da pesquisa, perfis e ambiente publicado.

## Entrega integrada das quatro disciplinas

Murilo Mello e Arthur Kaiser · Informática, turma 63-1 · CIMOL.

- [Site](https://fhdod-experiencia-paciente.vercel.app/)
- [Swagger online](https://fhdod-experiencia-paciente.vercel.app/api/docs) e [OpenAPI JSON](https://fhdod-experiencia-paciente.vercel.app/api/openapi.json)
- [Kanban público](https://trello.com/b/2VKO9CVI/fhdod-projeto-integrado-murilo-e-arthur)
- [Mockups](https://www.figma.com/design/c9cfayZtbsHNuJ0vvm874X) e [fluxo](https://www.figma.com/board/ESLs3X7Yu6SID1KcxojZPg)
- [Índice e checklist integrado](docs/entrega-integrada.md)

| Documento                                                          | Conteúdo                                           |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| [Requisitos](docs/requisitos.md)                                   | RF/RNF, atores, critérios e rastreabilidade        |
| [Arquitetura](docs/arquitetura-backend.md)                         | Camadas, segurança, decisões e limites de escala   |
| [Git e Kanban](docs/padroes-git.md)                                | Branches, commits, PRs, evidências e metodologia   |
| [Plano e relatório de testes](docs/plano-e-relatorio-de-testes.md) | Execução atual, cobertura, falhas e limites        |
| [Modelo de dados](docs/modelo-de-dados-e-requisitos.md)            | Conceitual/lógico, SQL/NoSQL, entidades e relações |
| [Dicionário](docs/dicionario-de-dados.md)                          | Atributos, tipos e restrições físicas              |
| [Padrões do banco](docs/padroes-banco-de-dados.md)                 | Nomes, chaves, índices e datas                     |
| [Persistência e consultas](docs/mapeamento-classes-e-consultas.md) | Adaptadores, transações e queries                  |
| [Segurança e nuvem](docs/seguranca-e-nuvem.md)                     | Supabase, conexão e acesso privado para avaliação  |
| [Plano de negócios](docs/plano-de-negocios.md)                     | Monetização, custos, projeções e expansão          |
| [Projeção financeira CSV](docs/projecao-financeira.csv)            | Cálculo reproduzível com premissas hipotéticas     |
| [Guia visual](docs/guia-visual.md)                                 | Identidade, personas e interação                   |

As novas evidências estão em `docs/evidencias/`. O Kanban foi criado em 26/11 para a conclusão; não simula uso desde outubro. O PR #1 do Arthur e os commits anteriores são evidências reais e foram preservados. Projeções comerciais são hipóteses acadêmicas, não vendas ou orçamentos confirmados. O Codex apoiou implementação e revisão.

### Configuração, acesso e cobertura

`.env.example` descreve a configuração; não contém a conexão real. `HOST`/`PORT` controlam a API; `APP_ORIGIN` precisa ser a origem exata; `MEDICARE_API_URL` é o proxy local; `MEDICARE_DB_PATH` aponta ao SQLite; `DATABASE_URL` é segredo somente do servidor. `MEDICARE_SECURE_COOKIES=true` em HTTPS; `MEDICARE_DB_CA_PEM`/`FILE` informam a CA quando necessária. Nunca criar `VITE_DATABASE_URL` ou publicar `.env`.

`npm run test:coverage:api` mede as linhas, ramos e funções dos módulos de backend carregados pela suíte Node, excluindo arquivos de teste. Não representa cobertura do frontend ou de todas as linhas do repositório. O relatório registra escopo e valores. Playwright usa banco temporário, não o Supabase real.

O site, Swagger e persistência foram reconferidos em 26/11 após retomar o plano gratuito e aplicar as colunas opcionais pendentes do painel. Não há backup automático, convites reais, integração de prontuário, expurgo ou recuperação de senha por e-mail implementados. Retenção é proposta a validar. Credenciais da banca devem ser transmitidas separadamente por canal privado, nunca anexadas à entrega pública.

Fontes: [enunciado integrado](https://cooing-trouble-f7d.notion.site/Desenvolvimento-de-Solu-o-Web-Corporativa-3e21679f3ac5806697c1e0bcb47debb7), [Sites](https://cooing-trouble-f7d.notion.site/Enunciado-Complementar-Disciplina-de-Cria-o-de-Sites-3e91679f3ac58090809bc88f90c7cef6) e [Banco](https://cooing-trouble-f7d.notion.site/Enunciado-Complementar-Disciplina-de-Banco-de-Dados-3ec1679f3ac580c0a8aff16123beee48). As exigências foram conferidas com as instruções fornecidas pelo estudante; datas atuais devem ser verificadas na atividade correspondente.
