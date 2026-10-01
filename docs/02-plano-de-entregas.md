# Plano de entregas e commits

## Organização proposta

Planejamento relativo para aproximadamente quatro semanas, ajustável quando a data oficial for informada. Cada lote corresponde a uma entrega que pode ser lida e revisada separadamente.

| Lote | Período sugerido | Conteúdo | Condição para concluir |
| --- | --- | --- | --- |
| 1 — Enunciado e fundamentos | Semana 1 | Levantamento dos pedidos, referências, plano e respostas da Etapa 1 | Erro/defeito/falha e verificação/validação distintos; princípios aplicados ao cenário |
| 2 — Matriz de qualidade | Semana 2 | Classificação dos casos A, B e C, com justificativas | Mesma edição normativa em todas as linhas; impactos sustentados pelo caso |
| 3 — Síntese | Semana 3 | Produto versus processo, roteiro curto de discussão e texto-base para reflexão individual | Argumentação coerente e reflexão adaptada pelo estudante |
| Extra — Complementos aprovados | Semana 3 | Plano de testes com critérios mensuráveis e diagrama causal | Casos ligados ao diagnóstico; critérios propostos identificados e justificados |
| 4 — Entrega final | Semana 4 | Consolidação da folha, referências e revisão de clareza e formato | R01–R07 conferidos e informações do grupo preenchidas |

Essas semanas organizam o trabalho; não são tarefas automáticas agendadas. É possível antecipar qualquer lote quando o estudante pedir continuidade.

## Histórico Git planejado

Mensagens sugeridas, a usar somente quando os arquivos correspondentes existirem e tiverem sido revisados:

1. `docs: adicionar planejamento e fundamentos do estudo MediCare`
2. `docs: adicionar matriz de qualidade ISO 25010:2011`
3. `docs: incluir sintese e reflexao sobre qualidade de software`
4. `docs: adicionar plano de testes e diagrama` — escopo aprovado; desenvolvimento previsto em lote posterior.
5. `feat: criar pagina de apresentacao do estudo` — somente se aprovada.
6. `docs: consolidar entrega final e revisar referencias`

O lote 1 reúne organização, referências e fundamentos em um commit inicial; a matriz terá um commit próprio. O histórico registrará cada entrega com sua data real.

## Conexão com o repositório

Repositório: [mello0969/medicare-qualidade-software](https://github.com/mello0969/medicare-qualidade-software).

Fluxo de publicação por entrega:

1. Conferir o estado local e remoto para preservar alterações existentes.
2. Revisar o conteúdo, as referências e os links dos documentos.
3. Criar um commit correspondente à parte concluída.
4. Enviar à branch `main` e verificar sua sincronização com o GitHub.
5. Informar o identificador do commit e o conteúdo entregue.

O endereço foi fornecido pelo estudante, que autorizou a publicação em commits por etapa. Na verificação inicial, o remoto estava vazio.

## Melhorias e decisões do estudante

| Proposta | Decisão | Benefício e limite de escopo |
| --- | --- | --- |
| Plano de testes dos três casos | Aprovado | Relaciona diagnóstico a avaliação concreta; critérios numéricos serão propostas justificadas, não exigências inventadas da ISO |
| Diagrama causal do caso A | Aprovado | Facilita explicar erro, defeito e falha; apoio visual complementar |
| Página visual para GitHub Pages | Decidir após as respostas | Permite navegar pelo estudo; criação e publicação dependem de escolha posterior |

Os extras aprovados serão produzidos em lote posterior, respeitando o pedido de desenvolver o trabalho em partes. Questionários com participantes e protótipo de software não foram incluídos no planejamento básico, pois ampliariam bastante uma atividade cujo entregável é uma folha.

Em 1º de outubro de 2026, o estudante esclareceu que entende que o mesmo trabalho valerá para quatro matérias, sem outro conteúdo a enviar por enquanto. O planejamento permanece centrado no exercício MediCare.
