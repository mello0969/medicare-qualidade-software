# MediCare — projeto integrado de satisfação hospitalar

**Escopo atualizado em 2 de outubro de 2026:** o arquivo `TRABALHO INTEGRADO.txt` enviado pelo estudante descreve um sistema de pesquisas de satisfação hospitalar. O produto deverá priorizar celular e tablets por setor, formulários curtos em etapas, NPS, avaliações por rostos de 1 a 5, perguntas editáveis por administradores e painel com filtros e exportação para Excel. Convites após o atendimento e solicitação opcional de retorno também fazem parte das necessidades levantadas; as integrações ainda serão definidas.

**Primeira versão funcional:** aplicação em React, TypeScript e Vite, com pesquisa por etapas, painel de indicadores e exportação Excel. Nove skills existentes instaladas localmente, com fontes e hashes em [skills-lock.json](skills-lock.json).

## Executar o site

Requer Node.js 22.12 ou superior. Desenvolvimento validado com Node.js 24 no Windows.

```bash
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`. Para compilar: `npm run build`. Para visualizar o build: `npm run preview`.

## O que funciona nesta parte

- Painel com NPS, satisfação, médias por setor, volume diário e comentários.
- Filtros combinados de setor, plantão, profissional e datas.
- Pesquisa de uma pergunta por etapa, avaliações de 1 a 5, NPS de 0 a 10 e comentário opcional.
- Links próprios para recepção, triagem, enfermagem, atendimento médico, fisioterapia e Raio X, como `/#/pesquisa/triagem`.
- Edição das perguntas, preservando texto e versão de respostas anteriores.
- Exportação `.xlsx` com resumo, respostas e avaliações, respeitando os filtros.
- Página que relaciona os requisitos às características de qualidade do material acadêmico.
- Interface adaptável, controles por teclado e respeito a movimento reduzido.

**Limites desta versão:** o painel inicia com dados sintéticos, identificados como exemplo. Selecione **Respostas deste navegador** para consultar o que foi preenchido localmente. Dados de exemplo nunca são gravados junto às respostas coletadas. Não há servidor, autenticação, sincronização entre dispositivos ou envio de mensagens. Use dados fictícios; qualquer pessoa que use o mesmo navegador pode acessar os registros. Não é uma aplicação pronta para uso hospitalar.

As respostas ficam no `localStorage`; limpar os dados do site as remove. Uma falha de armazenamento gera aviso e não apaga dados existentes. Não é solicitado nome, documento ou informação clínica. Plantão e código fictício do profissional podem ser informados opcionalmente para experimentar os filtros.

## Verificações

```bash
npm test
npm run test:e2e
npm run format:check
npm run build
```

Os testes de navegador usam o Google Chrome instalado. Os testes unitários conferem limites e denominadores do NPS, satisfação, filtros, validação dos registros e leitura da planilha gerada. Os testes de fluxo verificam preenchimento, persistência, edição, exportação, estados vazios, armazenamento inválido e acessibilidade automática em desktop e celular. A verificação automática não substitui testes com pacientes, leitores de tela ou dispositivos hospitalares.

O ExcelJS é carregado somente quando a exportação é solicitada. Seu pacote gera um aviso de tamanho no build; não faz parte do carregamento inicial. A dependência transitiva `uuid` está fixada em versão corrigida e compatível com o uso de `v4` pelo ExcelJS.

## Próximas partes do sistema

1. Banco compartilhado e autenticação, com permissões de administração por setor.
2. Integração com atendimentos, convites posteriores e solicitação de retorno.
3. Validação com usuários, testes em dispositivos reais e escolha da hospedagem.

Essas partes dependem de definições e integrações ainda não fornecidas. Não há envio automático de convites nem publicação do site nesta entrega.

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
