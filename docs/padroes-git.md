# Contribuição, versionamento e metodologia

## Histórico e política atual

O histórico inicial foi produzido em `main`, com commits autorizados em momentos distintos. A atualização mais recente integra o PR #1 da branch `feature/melhorias-painel`, de autoria registrada de Arthur, por merge `87e7766`. Não se afirma que houve PR/Kanban contínuo desde o início ou revisão formal de cada commit. O quadro público foi criado em **26/11/2026** para acompanhar a conclusão.

Para novas tarefas, a proposta é trunk-based com branches curtas `codex/nome-da-tarefa`, mudança focada, revisão pelo colega e integração após validação. Esta política não declara que PRs inexistentes já foram revisados.

1. Conferir `git status` e preservar alterações alheias antes de atualizar a base.
2. Definir cartão com resultado e critério de aceite; criar branch curta.
3. Executar os testes, build e formatação pertinentes.
4. Obter autorização explícita do usuário antes de commit/push.
5. Abrir PR explicando problema, mudança, evidência e limites. O outro integrante deve revisar antes de integrar.

Os títulos de commit são curtos em português, sem prefixos `feat:`, `fix:`, `docs:` ou `chore:`. Exemplo: **Documentar API e banco**. Usar a identidade real configurada; não alternar autores para simular participação equilibrada.

## Evidências registradas

| Commit  | Autor registrado | Alteração                          |
| ------- | ---------------- | ---------------------------------- |
| 3fb5d2a | arthur1reis      | Banco, perfis e escalas            |
| 4d20751 | mello0969        | Arquivos da API na publicação      |
| acc223c | arthur1reis      | Limpeza da data em nova pesquisa   |
| 90f4afd | mello0969        | Acesso restrito ao banco           |
| aead2ac | arthur1reis      | Entrega de experiência do paciente |

O Codex apoiou implementação e revisão. A dupla deve defender o código e confirmar suas contribuições com evidências; contagem de commits não comprova autoria intelectual equilibrada. Não houve entrevista ou aceite institucional inventado. As novas documentações e verificações desta revisão permanecem locais até autorização de commit. A base atual foi atualizada por fast-forward, preservando o merge do Arthur.

## Organização

Versionar código, testes, lockfile, `.env.example` sem segredos, documentação e configuração Playwright. Ignorar `.env` real, bancos, tokens, relatórios temporários, `node_modules`, `.agents/skills`, `skills-lock.json`, `DESIGN.md` e `PRODUCT.md`. O `error.log` preexistente não integra a entrega.

## Kanban

https://trello.com/b/2VKO9CVI/fhdod-projeto-integrado-murilo-e-arthur

Fluxo: **A fazer → Em andamento → Em revisão → Concluído**. Um cartão concluído precisa de arquivo, teste ou link verificável. Limite de trabalho em progresso recomendado: duas tarefas por integrante. Os cartões que descrevem trabalho anterior referenciam commits e esclarecem sua data de registro; não são prova de uso do quadro em outubro. Os movimentos atuais ficam no histórico real do Trello. Apresentação, aceite e envio permanecem pendentes até serem realizados pelos integrantes.
