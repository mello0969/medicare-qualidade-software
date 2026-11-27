# Segurança, nuvem e acesso para avaliação

## Topologia e segredos

Vercel hospeda frontend/função Node; Supabase PostgreSQL guarda o schema privado `fhdod`. O navegador não conecta diretamente ao SQL. `.env.example` documenta as variáveis; `DATABASE_URL` real e certificado ficam somente no servidor. Não publicar `.env`, tokens, cookies ou senhas em Git, PDF, Classroom ou Swagger.

| Controle     | Implementação e limites                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Autenticação | Scrypt e salt; token aleatório de 32 bytes com hash SHA-256 no banco; cookie HttpOnly, SameSite=Lax e Secure em HTTPS |
| Autorização  | Perfil e setor verificados na API; manager significa Super Admin; contato apenas para manager/ombudsman               |
| CSRF/origem  | Escritas autenticadas exigem token e origem exata; login/submissão pública exigem origem                              |
| Injeção      | Consultas parametrizadas e identificadores constantes; validação de domínio/tamanho                                   |
| Transporte   | HTTPS da hospedagem; TLS remoto com rejectUnauthorized=true e CA quando necessária                                    |
| Banco        | RLS e revogação de PUBLIC/anon/authenticated; role runtime com grants específicos; sem acesso a schema_version        |
| Privacidade  | Contato separado; projeção por perfil; TV/Excel sem contatos                                                          |
| Abuso        | Limites por IP, corpo JSON de 32 KiB e timeout de requisição                                                          |
| Logs         | Erros públicos genéricos, sem payload ou conexão                                                                      |

Não foram implementados allowlist de IP, MFA, criptografia adicional de campos pela aplicação, backup automático, recuperação de senha por e-mail ou expurgo. Criptografia em repouso é responsabilidade da plataforma e não foi auditada pela dupla. Não se afirma conformidade integral com LGPD. Retenção de contatos até 90 dias após fechamento e revisão de respostas em 12 meses são propostas operacionais, sujeitas à instituição; não são exclusão automática ou prazos legais universais.

## Acesso da banca

1. Um Super Admin autorizado cria uma conta de avaliação com privilégio mínimo. Visualizador é para TV; Gestão permite análise sem contato. Não conceder Super Admin por conveniência.
2. Transmitir a senha temporária diretamente ao avaliador por canal privado combinado. A troca é obrigatória no primeiro acesso. A senha não integra esta documentação pública.
3. Para avaliação SQL, preferir banco isolado com dados fictícios e acesso temporário, coordenado com o responsável. Credencial administrativa nunca vai para o frontend.
4. Revisar/revogar acessos após a banca com o responsável técnico. A interface atual não oferece desativação geral nem recuperação de conta por e-mail.

Não foi criada uma nova conta da banca nesta revisão sem destinatário definido. O `.env.example` e o procedimento permitem configurar um ambiente local de avaliação sem acesso à produção.

## Operação e recuperação

Migração e grants são aplicados explicitamente pelo proprietário; runtime usa `fhdod_api` restrita. O procedimento de backup/restauração está em `entrega/operacao.md`. Não migrar produção para testar. Planos gratuitos podem pausar por inatividade: verificar perguntas/TV além do health e reativar o mesmo recurso se necessário. Backups privados anteriores não integram a entrega pública.

Referências primárias: https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/platform/backups ; https://nodejs.org/api/crypto.html . Características não auditadas não são tratadas como garantia da dupla.

## Verificação operacional de 26/11/2026

O projeto existente foi retomado de pausa gratuita para ACTIVE_HEALTHY. Foram conferidos HTTP 200 no site, Swagger, OpenAPI, perguntas e TV. A revisão de schema encontrou e acrescentou apenas as três colunas opcionais exigidas pelo painel atual; os grants novos de auditoria se limitam a data/tipo. Uma pesquisa fictícia foi submetida via HTTP 201, lida por seu próprio ID e removida, confirmando persistência e limpeza. O advisor de segurança não apontou lints naquele instante. Isso não substitui uma auditoria independente ou um teste de carga.
