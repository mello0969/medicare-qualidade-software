# FHDOD — projeto acadêmico de satisfação hospitalar

**Escopo atualizado em 2 de outubro de 2026:** o arquivo `TRABALHO INTEGRADO.txt` enviado pelo estudante descreve um sistema de pesquisas de satisfação hospitalar. O produto deverá priorizar celular e tablets por setor, formulários curtos em etapas, NPS, avaliações por rostos de 1 a 5, perguntas editáveis por administradores e painel com filtros e exportação para Excel. Convites após o atendimento e solicitação opcional de retorno também fazem parte das necessidades levantadas; as integrações ainda serão definidas.

**Versão 0.3:** identidade da Fundação Hospitalar Dr. Oswaldo Diesel, em Três Coroas/RS, com a [logo original publicada pelo hospital](https://www.fhdod.com.br/images/logo.png). As novas anotações do estudante orientam login inicial, dois perfis, NPS obrigatório, perguntas específicas antes das gerais e ouvidoria com contato opcional. Fontes institucionais consultadas em 03/10/2026: [site oficial](https://www.fhdod.com.br/), [contato](https://www.fhdod.com.br/contato) e [serviço de fisioterapia](https://www.fhdod.com.br/noticias/hospital-inaugura-novo-servico-de-fisioterapia-com-apoio-da-camara-de-vereadores/137). O protótipo não tem integração com o hospital.

React, TypeScript e Vite no frontend; API Node.js e SQLite. Nove skills existentes instaladas localmente, com fontes e hashes em [skills-lock.json](skills-lock.json).

## Executar o site

Requer Node.js 24 ou superior. Desenvolvimento validado com Node.js 24 no Windows. O módulo SQLite dessa versão do Node pode emitir um aviso de recurso experimental.

```bash
npm ci
npm run admin:local
npm run dev
```

Abra `http://127.0.0.1:5173`. A primeira tela contém o login da equipe e um acesso separado à pesquisa sem conta. O comando `dev` inicia o site e a API local, na porta 3001. `admin:local` cria o primeiro administrador com senha aleatória e grava o acesso em `.local/administrador.txt`; se já houver administrador, não altera a conta. Esse arquivo e o banco não entram no Git. Use essas credenciais para entrar.

Para compilar: `npm run build`. Para visualizar o build, configure `APP_ORIGIN=http://127.0.0.1:4173` no arquivo `.env`, inicie `npm run start:api` e, em outro terminal, `npm run preview`. A origem configurada deve corresponder exatamente ao endereço usado no navegador. Volte para a origem da porta 5173 ao usar desenvolvimento.

Os comandos leem `.env` quando presente; há um exemplo sem segredos em [.env.example](.env.example). Para uma primeira conta personalizada, defina `MEDICARE_ADMIN_NAME`, `MEDICARE_ADMIN_EMAIL` e `MEDICARE_ADMIN_PASSWORD` no ambiente e execute `npm run admin:create`. A senha deve ter de 12 a 128 caracteres. Não publique credenciais.

## O que funciona nesta parte

- Painel com NPS, satisfação, médias por setor, volume diário e comentários.
- Filtros combinados de setor, plantão, profissional e datas.
- Pesquisa de uma pergunta por etapa: avaliações específicas primeiro, gerais depois, NPS obrigatório de 0 a 10 e comentário opcional. As avaliações podem ser puladas por um botão discreto, legível e acessível.
- Links próprios para recepção, triagem, enfermagem, atendimento médico, fisioterapia e Raio X, como `/#/pesquisa/triagem`.
- Criação e edição das perguntas, preservando texto e versão de respostas anteriores; perguntas gerais são administradas pelo perfil com acesso total.
- Respostas compartilhadas no SQLite, disponíveis a outros dispositivos que acessem o mesmo servidor.
- Login, saída e criação de contas pela gestão, com sessão que expira em oito horas.
- Administradores consultam todos os setores, comentários gerais e pedidos de contato. Gestores de setor consultam avaliações apenas do setor autorizado e administram suas perguntas; comentários gerais e contatos não são fornecidos a esse perfil.
- Contas criadas pela interface recebem senha temporária, com troca obrigatória antes de acessar o painel. A nova senha é protegida com scrypt e não pode ser consultada pelo administrador. A troca revoga sessões anteriores. Contas existentes da versão anterior são preservadas.
- Nota 1 ou 2 abre a opção de pedir contato da ouvidoria ao final da pesquisa. Nome, telefone, e-mail opcional, reclamação e autorização explícita são registrados somente se a pessoa optar pelo contato. Nota 3 ou superior não abre essa opção; o NPS não é usado para acionar a caixa.
- Confirmação antes de enviar, mensagens editáveis, e-mail de referência da ouvidoria e histórico do texto de autorização.
- Ouvidoria com situações Novo, Em análise e Concluído. Os dados pessoais ficam em uma tabela separada, fora do painel analítico e da exportação Excel.
- Atualização automática do painel conectado e aviso de edição concorrente das perguntas.
- Exportação `.xlsx` com resumo, respostas e avaliações, respeitando os filtros.
- Página que relaciona os requisitos às características de qualidade do material acadêmico.
- Interface adaptável, controles por teclado e respeito a movimento reduzido.

**Modos de dados:** o link **Explorar o painel de exemplo** abre `/#/demonstracao`, com dados sintéticos. Após entrar, o painel conectado consulta **Respostas no servidor**. **Respostas deste navegador** mantém os registros locais da primeira versão. Os conjuntos são separados. Atualizações do esquema preservam respostas, perguntas editadas, contas e sessões anteriores; as novas perguntas gerais são adicionadas sem substituir as existentes.

As pesquisas dos links por setor usam o servidor e não exigem login do paciente. Para experimentar a versão local, use `/#/pesquisa/triagem?modo=local` e `/#/perguntas?modo=local`; limpar os dados do site remove apenas esses registros locais. Uma falha de conexão não é apresentada como envio concluído; a pessoa pode tentar novamente, com proteção contra duplicação de um mesmo envio.

O banco fica em `data/medicare.sqlite` por padrão e persiste ao reiniciar a API. Guarde cópias de segurança com a API parada, incluindo os arquivos auxiliares caso existam. Os testes usam bancos isolados. A API valida os dados recebidos, guarda as versões históricas e registra alterações administrativas. Senhas são protegidas com scrypt, sessões usam cookies HttpOnly e ações administrativas exigem proteção CSRF.

**Limites desta versão:** use dados fictícios, inclusive nos campos da ouvidoria. A avaliação pode ser anônima; nome e meios de contato são solicitados apenas no pedido opcional autorizado. Não são solicitados documentos ou informações clínicas. Não há integração hospitalar, envio de convites ou encaminhamento real à ouvidoria da FHDOD. Não é uma aplicação pronta para uso hospitalar. Compartilhar com celulares exige uma hospedagem ou configuração de rede posterior, com HTTPS e cópias de segurança. GitHub Pages sozinho não executa esta API.

## Verificações

```bash
npm test
npm run test:e2e
npm run format:check
npm run build
```

Os testes de navegador usam o Google Chrome instalado, com site e API isolados nas portas 5174 e 3002. Os testes unitários conferem NPS, satisfação, filtros, validação e leitura da planilha. Os testes HTTP verificam persistência após reinício, sessão, permissões, CSRF, histórico, idempotência e limites de acesso. Os testes de navegador cobrem os fluxos locais e conectados, falhas de rede, edição, exportação e acessibilidade automática em desktop e celular. A verificação automática não substitui testes com pacientes, leitores de tela ou dispositivos hospitalares.

O ExcelJS é carregado somente quando a exportação é solicitada. Seu pacote gera um aviso de tamanho no build; não faz parte do carregamento inicial. A dependência transitiva `uuid` está fixada em versão corrigida e compatível com o uso de `v4` pelo ExcelJS.

## Próximas partes do sistema

1. Integração com atendimentos, convites posteriores e encaminhamento real dos pedidos autorizados.
2. Validação com usuários, testes em dispositivos reais e escolha da hospedagem.

As integrações e a hospedagem dependem de definições ainda não fornecidas. Não há envio automático de convites nem publicação do site nesta entrega. Cada novo commit aguarda autorização do estudante.

## Material acadêmico já produzido

Resolução por etapas do exercício acadêmico **Análise de Qualidade e Diagnóstico do Sistema MediCare**, com base no modelo ISO/IEC 25010:2011 indicado pelo conteúdo da atividade.

Segundo o entendimento informado pelo estudante, este mesmo trabalho contará para quatro matérias, sem outro conteúdo previsto no momento.

**Situação atual:** partes 1 e 2 preparadas e revisadas — análise do enunciado, planejamento, fundamentos de teste e matriz de qualidade dos três casos. A síntese, os complementos aprovados e a folha final serão desenvolvidos nos próximos lotes.

## Arquivos disponíveis

- [Exigências e limites da atividade](docs/01-analise-da-atividade.md)
- [Plano de entregas e commits](docs/02-plano-de-entregas.md)
- [Notas conceituais e referências](docs/03-notas-e-referencias.md)
- [Respostas da Etapa 1 — fundamentos](respostas/01-fundamentos.md)
- [Respostas da Etapa 2 — matriz de qualidade](respostas/02-matriz-qualidade.md)

## Entrega acadêmica

O enunciado solicita uma folha de respostas/matriz por grupo e uma reflexão individual no verso. Este repositório organiza a preparação; a versão final deverá ser condensada no formato solicitado pelo professor.

Os dados dos casos são informações do exercício. Não representam testes executados em um sistema hospitalar real.

## Próximas entregas acadêmicas

1. Síntese sobre produto e processo, preparação para discussão e apoio à reflexão individual.
2. Plano de testes com critérios mensuráveis e diagrama causal — complementos já aprovados pelo estudante.
3. Revisão e organização da folha final de entrega.

O cronograma é uma proposta de organização para cerca de quatro semanas; a data oficial ainda precisa ser informada. Os próximos lotes serão feitos conforme a continuidade da conversa.

O planejamento anterior de uma página de apresentação opcional foi ampliado pelo pedido de desenvolvimento do sistema. A hospedagem ainda será definida; GitHub Pages não foi configurado.

## GitHub

[Repositório do trabalho](https://github.com/mello0969/medicare-qualidade-software). O conteúdo será versionado por partes, com um commit para cada entrega revisada. O planejamento das próximas partes está em [Plano de entregas e commits](docs/02-plano-de-entregas.md).

## Fonte da atividade

[Exercício prático no Notion](https://cooing-trouble-f7d.notion.site/Exerc-cio-Pr-tico-An-lise-de-Qualidade-e-Diagn-stico-do-Sistema-MediCare-3e81679f3ac580438057e0f7db72d05f).

Consulta realizada em 1º de outubro de 2026. Os links das aulas e das fontes de conferência estão nas notas e referências.
