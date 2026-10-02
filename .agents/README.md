# Skills do projeto

Instalação local realizada em 2 de outubro de 2026. Somente skills existentes, obtidas diretamente dos repositórios de origem, foram instaladas em `.agents/skills/`. Nenhum `SKILL.md` foi criado ou alterado.

## Origem e revisão

| Skill | Repositório original | Caminho na origem | Revisão |
| --- | --- | --- | --- |
| design-taste-frontend-v1 | [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) | `skills/taste-skill-v1` | `ce26fc25c0e5e8cab638f883de62d9a86ee5e45b` |
| emil-design-eng | [emilkowalski/skills](https://github.com/emilkowalski/skills) | `skills/emil-design-eng` | `d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128` |
| impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `.agents/skills/impeccable` | `508d7e8955de3b3caf2d8676e85206723d41a887` |
| web-design-guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `skills/web-design-guidelines` | `063bee94c3f4df8453406c830b0a7df0f2860278` |
| playwright-cli | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) | `skills/playwright-cli` | `b85c7a736bb473bf55b584e54a09ffa698d6d871` |
| gsap-core | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | `skills/gsap-core` | `aed9cfd3277740755f6bfc1155c7aa645403b760` |
| gsap-scrolltrigger | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | `skills/gsap-scrolltrigger` | `aed9cfd3277740755f6bfc1155c7aa645403b760` |
| gsap-performance | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | `skills/gsap-performance` | `aed9cfd3277740755f6bfc1155c7aa645403b760` |

O Impeccable local é a versão 4.5.0 da fonte canônica. A instalação pessoal preexistente, fora deste repositório, foi preservada. Ao usar Impeccable neste projeto, carregar o arquivo local `skills/impeccable/SKILL.md` e seus recursos.

## Verificações realizadas

- Leitura dos oito `SKILL.md` e conferência das origens antes da instalação.
- Download por revisão fixa com o instalador de skills do Codex, direcionado a `.agents/skills/`.
- Comparação dos oito `SKILL.md` com os arquivos originais: conteúdos idênticos.
- Consulta real a `codex app-server`, método `skills/list`: oito skills habilitadas, com escopo `repo`, sem erros de leitura no projeto.
- Criação de [skills-lock.json](../skills-lock.json), esquema versão 1, com origem, revisão, caminho e hash de cada pasta. Hashes calculados e revalidados pela implementação original de [vercel-labs/skills](https://github.com/vercel-labs/skills/blob/18f96ea131dab3b0fcc9b27cf7c6f6cbb6174680/src/local-lock.ts).
- Arquivos de apoio do Impeccable e Playwright preservados. Eles não representam skills adicionais.

As skills ficarão disponíveis para uso na próxima interação. O [Codex detecta mudanças em skills locais](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills); se o seletor de uma sessão permanecer desatualizado, reiniciar o Codex atualiza a lista.

## Playwright CLI

Pacote oficial validado: `@playwright/cli@0.1.22`, executado pelo npm sem criar um projeto frontend nem instalar um comando global. O runtime fica no cache do npm; uma máquina nova fará o download na primeira execução.

```powershell
npm exec --yes --package=@playwright/cli@0.1.22 -- playwright-cli install
npm exec --yes --package=@playwright/cli@0.1.22 -- playwright-cli -s=medicare open http://localhost:5173
npm exec --yes --package=@playwright/cli@0.1.22 -- playwright-cli -s=medicare resize 390 844
npm exec --yes --package=@playwright/cli@0.1.22 -- playwright-cli -s=medicare screenshot
npm exec --yes --package=@playwright/cli@0.1.22 -- playwright-cli -s=medicare close
```

O endereço e a porta são exemplos para quando existir servidor local. Nesta instalação, foi aberta somente `about:blank`, ajustada a janela para 390 × 844 e capturada uma imagem temporária com sucesso; a sessão foi fechada. Isso verifica a ferramenta, não a responsividade de um site ainda inexistente. O Chrome instalado foi reconhecido. A pasta de resultados `.playwright-cli/` está ignorada pelo Git.

## Stack e limites desta etapa

Na inspeção inicial havia apenas material acadêmico Markdown, sem aplicação, `package.json` ou framework. As três skills GSAP independentes de framework preparam o suporte a animações solicitado. `gsap-react` ficou pendente porque React ainda não está presente. O pacote de runtime `gsap` não foi adicionado nesta etapa.

Não foram instaladas `gsap-frameworks`, `gsap-plugins`, `gsap-timeline`, `gsap-utils`, `image-to-code`, `img2threejs`, `motion-design`, `gpt-taste`, nem qualquer outra skill fora da seleção. Não foram configurados hooks automáticos ou desenvolvidas páginas.

As instruções explícitas do projeto prevalecem sobre preferências das skills: priorizar acesso por celular/tablet, clareza para pessoas idosas, acessibilidade e animações sutis. A sugestão de React, Tailwind ou Framer Motion contida em uma skill não define a stack por si só.

## Observações das fontes

- A versão solicitada do Taste é `design-taste-frontend-v1`; não foi trocada pela v2 experimental.
- O exemplo horizontal da revisão instalada de `gsap-scrolltrigger` contém `Max.max`. Esse erro da fonte foi preservado para manter a integridade do arquivo; ao implementar, o exemplo precisa ser revisado, sem reprodução literal.
- Licenças e aviso do Impeccable foram preservados em [licenses](licenses/). O repositório de Web Design Guidelines declara MIT no README, mas não fornece arquivo `LICENSE` na revisão consultada; não foi inventado um texto de licença em nome do autor.
