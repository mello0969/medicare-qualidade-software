# Etapa 2 — Matriz de qualidade do MediCare

**Status:** respostas desenvolvidas para revisão e posterior condensação na folha final.

**Escopo:** item R04 do [levantamento da atividade](../docs/01-analise-da-atividade.md). As classificações interpretam as situações narradas no [enunciado MediCare](https://cooing-trouble-f7d.notion.site/Exerc-cio-Pr-tico-An-lise-de-Qualidade-e-Diagn-stico-do-Sistema-MediCare-3e81679f3ac580438057e0f7db72d05f); não constituem resultados de testes próprios.

**Modelo adotado: ISO/IEC 25010:2011.** Esta é a edição correspondente às oito características do produto e às cinco características de qualidade em uso trabalhadas na atividade. A edição e os limites das fontes estão registrados nas [notas conceituais](../docs/03-notas-e-referencias.md).

## 1. Matriz de classificação

Cada situação recebe uma classificação principal no modelo de qualidade do produto. A última coluna relaciona esse problema aos resultados do uso no contexto hospitalar.

| Situação analisada | Característica da qualidade do produto | Subcaracterística principal | Qualidade em uso afetada e justificativa |
| --- | --- | --- | --- |
| **A — Cálculo de dose:** na simulação, o sistema confirma uma dose dez vezes superior à segura após uma interpretação incorreta da unidade. | **Adequação funcional** | **Correção funcional** | **Liberdade de riscos — mitigação de riscos de saúde e segurança:** a saída incorreta pode induzir uma decisão de medicação insegura. O cenário demonstra uma falha na simulação e um risco potencial ao paciente; não relata administração do medicamento ou dano real. |
| **B — Busca de histórico:** a consulta demora 45 segundos no contexto de atendimento de emergência. | **Eficiência de desempenho** | **Comportamento temporal** | **Eficiência:** a espera consome tempo da tarefa e prejudica a obtenção oportuna da informação necessária ao atendimento. Há também possível relação com riscos de saúde e segurança caso o atraso comprometa uma decisão clínica, mas esse desfecho não foi informado. |
| **C — Prescrição com 12 cliques:** o módulo cumpre as regras documentadas, mas o fluxo provoca lentidão e rejeição pelos médicos. | **Usabilidade** | **Operabilidade** | **Eficiência e satisfação:** o esforço de interação prejudica a execução da tarefa e a rejeição expressa insatisfação com a experiência de uso. A avaliação decorre do efeito relatado no trabalho dos médicos, e não de um limite universal de cliques. |

## 2. Justificativas e limites da classificação

### Situação A — Correção do resultado e risco no uso

A função existe e produz uma saída, porém o resultado está incorreto. Por isso, **correção funcional** é a classificação mais direta do problema no produto. A análise de erro, defeito e falha explica sua origem e manifestação; a matriz identifica qual atributo de qualidade foi comprometido.

O risco à saúde pertence, neste enquadramento, à qualidade em uso. Não há evidência de acesso indevido, vazamento de dados ou adulteração por terceiros que justifique escolher **Segurança**, no modelo do produto de 2011, como característica principal. Segurança da informação e segurança do paciente não são conceitos equivalentes.

O fator de dez é fornecido pelo exercício. Miligrama e mililitro medem grandezas diferentes, portanto esse fator não deve ser apresentado como conversão geral entre as unidades.

### Situação B — Tempo do sistema e tempo da tarefa

A evidência central é o tempo de resposta da busca; isso sustenta **comportamento temporal** dentro de **eficiência de desempenho**. Na perspectiva do produto, analisa-se a resposta do sistema. Na perspectiva da qualidade em uso, analisa-se como a espera afeta os recursos empregados pelo profissional, especialmente o tempo para realizar a tarefa.

A inadequação deve ser interpretada no contexto de emergência descrito. A ISO/IEC 25010:2011 não deve ser citada como origem de um limite numérico inventado para essa consulta. O exercício também não informa volume de dados, quantidade de usuários simultâneos, infraestrutura ou causa da demora. Esses elementos exigiriam investigação e critérios de aceitação próprios.

### Situação C — Facilidade de operação e aceitação pelos usuários

O problema descrito concentra-se na operação do módulo: a sequência necessária para concluir a prescrição interfere no fluxo de trabalho. Isso fundamenta **operabilidade**, dentro de **usabilidade**. A conformidade com o documento de requisitos não elimina a inadequação identificada pelos médicos.

Os 12 cliques, isoladamente, não provam baixa qualidade. A justificativa está na combinação entre esforço, lentidão e rejeição relatados. Não foram fornecidas medições do tempo da tarefa nem uma pesquisa quantitativa de satisfação; não é possível atribuir percentuais ou notas a esses impactos.

Como relação secundária, pode-se discutir **pertinência funcional** (*functional appropriateness*, apresentada na aula como adequação funcional), ao avaliar se as funções facilitam a realização das tarefas pretendidas. Essa subcaracterística pertence à adequação funcional e não substitui a classificação principal em operabilidade, pois o indício mais direto do caso é a dificuldade de interação.

## 3. Fundamentação

O [catálogo oficial da ISO/IEC 25010:2011](https://www.iso.org/standard/35733.html) confirma a organização em modelos de qualidade do produto e qualidade em uso. A nomenclatura e a aplicação ao cenário seguem o modelo trabalhado no [material da disciplina](https://cooing-trouble-f7d.notion.site/Modelos-de-Qualidade-de-Produtos-de-Software-sob-a-mbito-da-Norma-ISO-IEC-25010-SQuaRE-3e81679f3ac5802092c6dd88c2491c5c). As justificativas são uma análise do caso, sem declaração de certificação ou de acesso ao texto integral pago da norma.
