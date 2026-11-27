# Plano de negócios — hipótese acadêmica

Murilo Mello e Arthur Kaiser · Informática 63-1 · CIMOL · 26/11/2026.

## Resumo executivo e proposta de valor

Propomos fornecer pesquisa de satisfação hospitalar e análise contextual para Ouvidoria/gestão. A solução reduz a transcrição de papel, permite participação pelo celular/tablet e organiza indicadores e pedidos consentidos de retorno. A baixa adesão de 3/500 é um dado do exercício: não medimos aumento de participação, economia real ou satisfação na FHDOD. Não há contrato, venda, entrevista comercial ou aceite hospitalar realizado pela dupla.

O beneficiário é paciente/acompanhante; o comprador hipotético é a direção administrativa ou responsável por qualidade/Ouvidoria de hospitais regionais. O decisor avalia preço, segurança, rotina de uso e suporte. O produto atual é um protótipo funcional; operação comercial depende de adequação institucional, infraestrutura e suporte.

## Modelo de negócio e mercado a validar

| Bloco          | Proposta / hipótese                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Segmentos      | Hospitais regionais e clínicas com coleta em papel; tamanho de mercado não foi medido          |
| Valor          | Pesquisa curta, QR por setor, análise por contexto e retorno opcional com acesso restrito      |
| Canais         | Demonstração agendada, piloto autorizado e indicação institucional; sem disparos a pacientes   |
| Relacionamento | Treinamento inicial, suporte delimitado e reuniões de melhoria                                 |
| Receita        | Mensalidade por instituição e taxa de implantação, sujeitas a validação de preço               |
| Atividades     | Manutenção, testes, segurança, treinamento e acompanhamento de uso                             |
| Recursos       | Aplicação, banco, hospedagem, pessoas de suporte e documentação                                |
| Parceiros      | Responsáveis de TI/qualidade e fornecedores de infraestrutura, sem parceria contratada alegada |
| Custos         | Horas de equipe, infraestrutura, suporte, aquisição e operação administrativa                  |

Alternativas do comprador: papel/planilha, formulários genéricos e módulo de experiência de sistemas hospitalares. O diferencial proposto é combinar jornada curta, escala contextual e privacidade por perfil. Não foi realizada pesquisa comparativa de preços ou marcas; a diferenciação precisa ser validada em piloto.

## Receita, custos e premissas explícitas

Todos os valores a seguir são **hipóteses de modelagem**, não orçamento do provedor, recomendação tributária, faturamento real ou promessa de retorno.

- Mensalidade: R$ 900 por instituição ativa.
- Implantação: R$ 1.500 por novo cliente, incluindo preparação e treinamento delimitados.
- Custo variável mensal: R$ 250 por instituição, provisão para infraestrutura, suporte e uso.
- Custo de onboarding: R$ 700 por novo cliente.
- Custos fixos mensais: R$ 2.500, sendo manutenção R$ 1.400, comercial/administração R$ 700 e infraestrutura/contingência R$ 400.
- Tributos: provisão meramente hipotética de 6% sobre receita total; enquadramento real depende de contador e contrato.
- Investimento inicial: R$ 12.000, equivalente a 150 horas a R$ 80. Não representa pagamento já realizado. Valores de remuneração são custos econômicos, não retirada combinada da dupla.
- Clientes ativos: zero nos dois primeiros meses, um no terceiro e crescimento de um por mês, sem churn no cenário-base. Essa aquisição é uma premissa otimista a validar.

## Margem, equilíbrio e sensibilidade

Margem de contribuição recorrente por cliente = 900 − 250 − (900 × 0,06) = **R$ 596/mês**, ou 66,22% da mensalidade. Ponto de equilíbrio operacional recorrente = teto(2.500 / 596) = **5 clientes**. Não inclui recuperação do investimento inicial. A implantação contribui com 1.500 − 700 − 90 = R$ 710 por novo cliente.

| Cenário recorrente                   | Resultado mensal após provisões |
| ------------------------------------ | ------------------------------: |
| 3 clientes                           |                      R$ -712,00 |
| 5 clientes                           |                       R$ 480,00 |
| 8 clientes                           |                     R$ 2.268,00 |
| Preço 20% menor (R$ 720), 5 clientes |                      R$ -366,00 |
| Custo variável R$ 400, 5 clientes    |                      R$ -270,00 |

Com preço 20% menor, contribuição unitária é R$ 426,80 e equilíbrio exige seis clientes. Com custo variável de R$ 400, contribuição é R$ 446 e equilíbrio também exige seis. Churn, inadimplência, incidentes e demora de contratação podem piorar o cenário. Não há orçamento de alta disponibilidade/SLA; uma demanda institucional maior precisa ser precificada novamente.

## Fluxo de caixa projetado

Resultado = recorrência + implantação − tributos hipotéticos − variáveis/onboarding − fixos. Caixa inicia em R$ -12.000. A CSV ao lado reproduz o cálculo mês a mês; valores não são dados de pacientes nem movimentações reais.

| Mês | Clientes | Novos | Recorrência | Implantação | Tributos | Variáveis/onboarding | Fixos    | Resultado | Caixa acumulado |
| --- | -------- | ----- | ----------- | ----------- | -------- | -------------------- | -------- | --------- | --------------- |
| 1   | 0        | 0     | 0,00        | 0,00        | 0,00     | 0,00                 | 2.500,00 | -2.500,00 | -14.500,00      |
| 2   | 0        | 0     | 0,00        | 0,00        | 0,00     | 0,00                 | 2.500,00 | -2.500,00 | -17.000,00      |
| 3   | 1        | 1     | 900,00      | 1.500,00    | 144,00   | 950,00               | 2.500,00 | -1.194,00 | -18.194,00      |
| 4   | 2        | 1     | 1.800,00    | 1.500,00    | 198,00   | 1.200,00             | 2.500,00 | -598,00   | -18.792,00      |
| 5   | 3        | 1     | 2.700,00    | 1.500,00    | 252,00   | 1.450,00             | 2.500,00 | -2,00     | -18.794,00      |
| 6   | 4        | 1     | 3.600,00    | 1.500,00    | 306,00   | 1.700,00             | 2.500,00 | 594,00    | -18.200,00      |
| 7   | 5        | 1     | 4.500,00    | 1.500,00    | 360,00   | 1.950,00             | 2.500,00 | 1.190,00  | -17.010,00      |
| 8   | 6        | 1     | 5.400,00    | 1.500,00    | 414,00   | 2.200,00             | 2.500,00 | 1.786,00  | -15.224,00      |
| 9   | 7        | 1     | 6.300,00    | 1.500,00    | 468,00   | 2.450,00             | 2.500,00 | 2.382,00  | -12.842,00      |
| 10  | 8        | 1     | 7.200,00    | 1.500,00    | 522,00   | 2.700,00             | 2.500,00 | 2.978,00  | -9.864,00       |
| 11  | 9        | 1     | 8.100,00    | 1.500,00    | 576,00   | 2.950,00             | 2.500,00 | 3.574,00  | -6.290,00       |
| 12  | 10       | 1     | 9.000,00    | 1.500,00    | 630,00   | 3.200,00             | 2.500,00 | 4.170,00  | -2.120,00       |
| 13  | 11       | 1     | 9.900,00    | 1.500,00    | 684,00   | 3.450,00             | 2.500,00 | 4.766,00  | 2.646,00        |

No mês 12, o caixa acumulado é R$ -2.120,00; portanto **não há payback nos primeiros 12 meses** nesta hipótese. No mês 13, mantendo a mesma aquisição, o caixa chega a R$ 2.646,00. Esse prazo é resultado do cenário, não garantia de lucro. O maior déficit projetado exige capital de giro de R$ 18.794,00, sem reserva adicional; propor mais 20% de contingência elevaria a necessidade para R$ 22.552,80.

## Implantação, indicadores e expansão

Piloto proposto: validar briefing com responsáveis, configurar setores/perguntas, treinar equipe, testar acessibilidade com participantes autorizados, divulgar convite neutro a todos os atendidos e medir quatro semanas. Indicadores: participação = pesquisas válidas/atendimentos elegíveis; conclusão = envios/inícios observados; tempo de resposta, percentual de campos opcionais e tempo de retorno da Ouvidoria. A aplicação não conhece o total de atendimentos; o denominador deve vir de integração/contagem institucional autorizada. Não inventar taxa de conversão com apenas respostas do sistema.

Critério de aceite proposto: fluxo de ponta a ponta, dados persistidos, acesso por perfil, indicador correto, exportação sem contato e aceite registrado pelo responsável. Piloto e aceite ainda dependem da instituição. Uma expansão comercial replicável pode usar instalações isoladas por instituição inicialmente. Multi-tenant exige isolamento por hospital, política de backup, monitoramento, recuperação e contratos; o código atual não implementa isolamento multi-hospital.

## Riscos e responsabilidades

Baixa adesão: convite neutro e teste com usuários, sem prêmio ou seleção de quem elogia. Privacidade: minimizar dados, separar contatos, controlar acesso e validar base legal/retenção com responsáveis. Infraestrutura gratuita: pausa, quotas e disponibilidade precisam de plano operacional. Financeiro: validar preço/custo e aquisição antes de contratação. Escala não demonstra culpa individual; resultados servem a investigação contextual. A contratação e obrigações comerciais devem ser definidas pela instituição e responsáveis legais, não inferidas deste exercício.

## Defesa comercial em dois minutos

Murilo: apresentar a dor do papel e demonstrar o fluxo curto. Arthur: explicar comprador, mensalidade hipotética, equilíbrio de cinco clientes e riscos. Ambos: reconhecer que preço, aquisição e payback são projeções, não vendas; propor piloto autorizado antes de afirmar viabilidade real.
