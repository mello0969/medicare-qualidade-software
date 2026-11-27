# Personas e decisões de Design

Material de projeto já preparado para Design; personagens fictícios, sem entrevistas reais. Reutilizado nesta entrega integrada, sem duplicar a criação das personas.

## 2. Personas de projeto

### Maria Helena Duarte, 66 anos - paciente

**Contexto:** personagem fictícia que vai a consultas e exames e, em algumas ocasiões, recebe ajuda da filha com o celular. Responde depois do atendimento, por poucos minutos, sentada ou esperando transporte.

**Objetivos:** registrar como foi tratada, elogiar uma equipe acolhedora e conseguir explicar um problema sem preencher um cadastro extenso.

**Dores:** letras pequenas, formulários longos, dúvidas sobre quais setores avaliar e receio de ter o telefone exposto.

**Familiaridade com tecnologia:** básica. Usa mensagens e câmera, reconhece botões e prefere instruções diretas a menus complexos.

**Canal preferido:** tablet disponibilizado no setor; celular próprio quando consegue abrir o QR Code com facilidade.

**Frase que representa sua visão:** “Quero dizer como fui atendida sem precisar preencher tudo de novo.”

**Consequências no projeto:** uma avaliação por etapa, rostos acompanhados de números e rótulos, opção de pular, sem conta para responder, informação de anonimato e contato opcional. O foco em celular permite acessar pelo QR; o mesmo fluxo funciona no tablet.

### Luciana Fernandes, 42 anos - coordenação da gestão

**Contexto:** personagem fictícia que acompanha a experiência do paciente e precisa identificar diferenças entre setores e plantões. Trabalha em conjunto com a Ouvidoria, que realiza o retorno individual.

**Objetivos:** consultar resultados atualizados, filtrar o contexto de atendimento, reconhecer boas experiências e priorizar melhorias com base em evidências.

**Dores:** planilhas digitadas manualmente, formulários sem contexto, confusão entre uma avaliação negativa e culpa individual, e divulgação de relatos pessoais em telas abertas.

**Familiaridade com tecnologia:** intermediária. Usa planilhas e sistemas administrativos; precisa de indicadores explicados e filtros previsíveis.

**Canal preferido:** computador para análise e exportação; tablet para consulta rápida.

**Frase que representa sua visão:** “Preciso entender onde melhorar, sem tirar conclusões injustas sobre uma pessoa.”

**Consequências no projeto:** painel com filtros de setor, plantão, equipe e período; exportação do recorte; separação entre dados analíticos e contato; equipe associada à versão da escala no momento do envio; TV Wall com dados agregados. No perfil Gestão, Luciana consulta dados estruturados e escalas, sem telefone ou comentários livres.

## 3. Decisões da dupla e justificativas

| Decisão                                                         | Implementação real                                                                                                                                                                  | Justificativa e relação com as personas                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Avaliação geral por NPS de 0 a 10, no fim                       | É a única pergunta avaliativa obrigatória. As avaliações por rostos vêm antes; a etapa final de comentário é opcional.                                                              | Mantém um indicador geral comparável e permite que Maria reflita sobre os setores antes de recomendar. A progressão mostra claramente a obrigação; zero é uma resposta válida.                                                                         |
| Avaliações específicas antes das gerais                         | Aparecem perguntas dos setores selecionados e, depois, as gerais. Um QR de setor já inicia com esse setor selecionado.                                                              | Reduz perguntas sem relação com o atendimento e ajuda Maria a reconhecer o contexto. Luciana recebe evidência mais pertinente ao setor.                                                                                                                |
| Contato sugerido depois de rosto 1 ou 2                         | Na última etapa, qualquer avaliação de atendimento 1 ou 2 abre o convite; nota 3, 4 ou 5 não abre. NPS baixo, sozinho, não dispara o convite.                                       | Facilita entender experiências ruins sem transformar a participação em reclamação obrigatória. O participante pode continuar anônimo. Nome, telefone e relato só são exigidos se ele optar pelo contato; e-mail é opcional e há autorização explícita. |
| Convite a todos os atendidos                                    | QR e link por setor; a interface convida a enviar elogio, reclamação ou sugestão.                                                                                                   | Acolher também experiências positivas enfrenta a concentração de respostas insatisfeitas. O convite deve ser oferecido de forma neutra, sem escolher apenas quem elogia e sem prometer prêmio. O efeito na adesão ainda não foi medido.                |
| Associar a equipe por contexto, sem culpa individual automática | A correspondência usa setor + data do atendimento + manhã/tarde/noite. A pesquisa guarda o rótulo e a versão da escala usada no envio; edições futuras não reescrevem a associação. | Ajuda Luciana a investigar o contexto. A equipe associada é uma pista de análise, não prova de responsabilidade de um profissional. Sem data, turno ou escala compatível, não se inventa equipe.                                                       |
| TV Wall sem detalhes individuais                                | Somente indicadores dos últimos 30 dias. Exibição exige ao menos cinco pesquisas elegíveis por grupo/indicador; sem nomes, telefones, comentários, plantões ou equipes.             | Permite comunicar tendências em tela aberta e reduz exposição de grupos muito pequenos. A regra de cinco não equivale a garantia legal de anonimato.                                                                                                   |
| Priorizar celular, mantendo uso em tablet                       | Formulário responsivo, botões por toque, rótulos textuais e poucas decisões em cada etapa.                                                                                          | Acesso por QR no próprio celular evita uma fila para responder; o tablet atende Maria e quem precisa de ajuda. A combinação é mais inclusiva que depender exclusivamente de um totem.                                                                  |

### Política proposta de retenção

Propomos revisar e eliminar os dados de contato até 90 dias após concluir a manifestação e revisar respostas individualizadas em até 12 meses. Esses são prazos de produto propostos pela dupla, não prazos legais universais. Exceções de conservação, base legal e canal de atendimento aos titulares dependem de validação do responsável institucional. A aplicação atual não automatiza expurgo nem solicitações de exclusão; a proposta deve orientar uma rotina operacional antes de usar dados reais.

Super Admin e Ouvidoria acessam o telefone autorizado. Os demais perfis ficam nos limites descritos no manual, e a TV e o Excel não exibem contatos. Evitamos solicitar dados clínicos e orientamos não colocar identificação ou informações de saúde no comentário. A anonimização de agregados precisa ser avaliada; uma amostra mínima, sozinha, não garante anonimato.

Referência de apoio: [LGPD, texto atualizado da Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html). O desenho considera finalidade, necessidade, transparência, segurança e avaliação do término/conservação do tratamento. Consentimento e acesso restrito não demonstram, isoladamente, conformidade integral.

### Limites de dados e operação

A pesquisa registra o contexto selecionado, as respostas, a data de envio e, quando fornecidos, data/turno do atendimento. O contato fica separado e é visível apenas a Super Admin e Ouvidoria. A versão atual não envia mensagens ao hospital, não integra prontuário, não dispara convites automáticos e não implementa expurgo por prazo. Uma implantação real exige definir finalidade, retenção, atendimento aos titulares, rotina de exclusão, responsáveis e política institucional. Não declarar conformidade integral com a LGPD apenas pela existência de consentimento e controle de acesso.
