# Etapa 1 — Fundamentos de teste aplicados ao MediCare

**Status:** respostas desenvolvidas para revisão e posterior condensação na folha final.

**Escopo:** itens R01, R02 e R03 do levantamento da atividade. Esta análise usa as situações narradas no [enunciado](https://cooing-trouble-f7d.notion.site/Exerc-cio-Pr-tico-An-lise-de-Qualidade-e-Diagn-stico-do-Sistema-MediCare-3e81679f3ac580438057e0f7db72d05f); não relata execução de testes próprios.

## 1. Situação A: erro, defeito e falha

| Conceito | Identificação no caso | Justificativa |
| --- | --- | --- |
| Erro | O desenvolvedor compreendeu incorretamente a unidade indicada na especificação. | Trata-se do engano humano que deu origem à implementação inadequada. |
| Defeito | A regra de cálculo no código foi implementada usando mililitros onde a especificação exigia miligramas. | A interpretação equivocada ficou incorporada ao artefato de software. O defeito existe no código mesmo antes de sua manifestação em execução. |
| Falha | Durante a simulação, o sistema apresentou a confirmação de uma dose dez vezes superior à segura, conforme o cenário. | O comportamento observado divergiu do resultado esperado quando o software foi executado. |

O encadeamento distingue três níveis: a interpretação humana, a regra implementada e a saída observada. Corrigir apenas a mensagem exibida não demonstra que o cálculo foi corrigido; seria necessário revisar a regra e verificar seu comportamento com casos de teste adequados.

**Precisão da análise:** miligrama e mililitro representam grandezas diferentes. O fator de dez é um dado fornecido pelo exercício, e não uma conversão universal entre essas unidades. A situação descreve uma simulação e não permite afirmar que houve administração do medicamento ou dano a uma pessoa.

## 2. Situação C: verificação e validação

### Verificação

Pergunta orientadora apresentada na aula: **“Estamos construindo o produto corretamente?”**

**Sim, quanto à conformidade com as regras especificadas no documento mencionado.** O enunciado afirma que o módulo atende estritamente a essas regras. Nesse recorte, a implementação está de acordo com sua referência de especificação.

Essa conclusão é limitada ao que o cenário informa: não comprova que todos os atributos de qualidade foram especificados, que todas as revisões foram realizadas ou que o sistema inteiro foi certificado.

### Validação

Pergunta orientadora apresentada na aula: **“Estamos construindo o produto certo?”**

**Não, quanto à adequação ao fluxo de trabalho relatado pelos médicos.** A sequência de 12 cliques causa lentidão e rejeição, evidenciando que a solução não atende satisfatoriamente às necessidades de uso. Cumprir o documento de seis meses atrás não assegura que esse documento tenha representado suficientemente essas necessidades.

O problema não é a quantidade de cliques considerada isoladamente: são o esforço desnecessário e seu efeito sobre a atividade profissional descritos no caso. A validação precisa considerar tarefas representativas e a participação dos usuários.

## 3. Situação B: princípios de teste

O caso permite relacionar três princípios, com destaque para os dois indicados na dica do exercício:

| Princípio | Aplicação ao caso B |
| --- | --- |
| Testes exaustivos são inviáveis em sistemas não triviais | Uma bateria extensa no cadastro não cobre todas as entradas, condições, integrações e funções do MediCare. É necessário selecionar testes conforme riscos e prioridades. |
| Falácia da ausência de defeitos | A aprovação dos testes de cadastro não assegura que o produto atenda às necessidades do hospital. A busca de histórico inadequada ao atendimento de emergência demonstra essa limitação. |
| Testes evidenciam defeitos, mas não provam sua ausência | Relatórios sem bugs conhecidos naquela funcionalidade não sustentam a afirmação de qualidade integralmente garantida. Permanecem condições e comportamentos que podem não ter sido examinados. |

**Resposta central:** a equipe generalizou o resultado de uma parte do sistema e confundiu a aprovação de testes parciais com a qualidade global. Deveria avaliar também o desempenho dos fluxos críticos em condições representativas de uso.

A demora relatada não permite determinar, por si só, sua causa técnica. Faltam evidências para atribuí-la a banco de dados, rede, infraestrutura ou implementação. Essa investigação seria uma atividade posterior ao diagnóstico conceitual pedido.

## Fundamentação

As distinções entre verificação e validação, o encadeamento erro–defeito–falha e os princípios de teste foram conferidos no [ISTQB CTFL v4.0.1](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf), seções 1.1, 1.2.3 e 1.3. As perguntas orientadoras seguem a formulação da [Aula 1](https://cooing-trouble-f7d.notion.site/Fundamentos-de-Teste-de-Software-e-Engenharia-de-Qualidade-Uma-Estrutura-de-Refer-ncia-3e21679f3ac5808f98f6f2215de15439).
