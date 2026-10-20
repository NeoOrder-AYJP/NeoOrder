# NeoOrder — Schema do Banco de Dados (Supabase/PostgreSQL)

Projeto Supabase: `nurnxrtxdcasrjcwxvky`
Última atualização: **18/10/2026** (v2.3)
Migração de referência: `supabase/migrations/20261017_neoorder_hardening.sql`

> Este documento descreve o estado **real** do banco após a migração de endurecimento.
> O front-end **não acessa tabelas**: toda operação passa por funções RPC
> `SECURITY DEFINER` em `public`, autenticadas por token de sessão.

---

## 1. Modelo de acesso

| Camada | Regra |
|--------|-------|
| Tabelas `public` | RLS **habilitada** em todas as 11 tabelas, **sem nenhuma policy** → `anon` e `authenticated` não leem nem escrevem diretamente. |
| Privilégios | `REVOKE ALL` de tabelas/sequences para `PUBLIC`, `anon` e `authenticated`. |
| Funções | Apenas as 24 RPCs de negócio têm `EXECUTE` para `anon, authenticated`. Helpers internos (`_hash_token`, `_normalizar_login`, `validar_sessao_mesa`, `funcionario_da_sessao`) são privados. |
| Sessão | O login devolve um token opaco de 64 caracteres; o banco guarda apenas o SHA-256. Validade de 12 h, uma sessão ativa por usuário. |
| Senhas | `pgcrypto`/bcrypt (`gen_salt('bf', 11)`) em `usuarios.senha_hash`. Nunca saem do banco. |

Chaves do cliente (`js/supabase.js`): apenas a URL e a **publishable key** (`sb_publishable_…`), que não concede acesso a tabelas.

---

## 2. Tabelas

### 2.1 `usuarios`
Contas de acesso: mesas (`tipo = 'mesa'`) e funcionários (`tipo = 'funcionario'`).

| Coluna | Tipo | Nulo | Default | Observação |
|--------|------|------|---------|------------|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `tipo` | varchar(20) | não | — | `mesa` \| `funcionario` |
| `nome` | varchar(100) | não | — | Exibido na interface |
| `login` | varchar(50) | sim | — | Único (índice em `lower(login)`) |
| `perfil` | varchar(20) | sim | — | `atendente` \| `gerente`; `NULL` para mesas |
| `ativo` | boolean | não | `true` | Contas inativas não autenticam |
| `qr_code_ativo` | boolean | não | `false` | `true` enquanto a mesa tem QR Code emitido e não revogado (seção 3.6) |
| `qr_token_hash` | text | sim | — | Hash do token do QR Code (`_hash_token`); o token em si não é armazenado. `NULL` após desativar |
| `criado_em` | timestamptz | não | `now()` | |
| `senha_hash` | text | sim | — | bcrypt |
| `senha_atualizada_em` | timestamptz | sim | — | |
| `atualizado_em` | timestamptz | não | `now()` | |

**Constraints:** `usuarios_tipo_check`, `usuarios_perfil_check`.
**Índice único:** `usuarios_login_lower_key` em `lower(login)`.

### 2.2 `sessoes_mesa` / `sessoes_funcionario`
Token de sessão com hash, expiração e flag `ativa`. Estrutura idêntica:

| Coluna | Tipo | Nulo | Default |
|--------|------|------|---------|
| `id` | uuid | não | `gen_random_uuid()` |
| `mesa_id` / `funcionario_id` | uuid | não | — |
| `session_token_hash` | text | não | — (UNIQUE) |
| `criado_em` | timestamptz | não | `now()` |
| `ultimo_acesso_em` | timestamptz | não | `now()` |
| `expira_em` | timestamptz | não | — |
| `ativa` | boolean | não | `true` |

FK `ON DELETE CASCADE` para `usuarios(id)`.

### 2.3 `login_tentativas`
Auditoria de tentativas de login, usada pelo bloqueio de força bruta.

| Coluna | Tipo | Nulo | Default |
|--------|------|------|---------|
| `id` | bigserial | não | sequence |
| `login` | text | não | — (normalizado em minúsculas) |
| `sucesso` | boolean | não | — |
| `criado_em` | timestamptz | não | `now()` |

Índice `(lower(login), criado_em DESC)`.

### 2.4 `estoque`
| Coluna | Tipo | Nulo | Default | Observação |
|--------|------|------|---------|------------|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `nome` | varchar(100) | não | — | UNIQUE |
| `quantidade` | numeric | não | `0` | CHECK `>= 0` |
| `unidade` | varchar(20) | não | — | `kg`, `g`, `un`, `l`, `ml` |
| `criado_em` | timestamptz | não | `now()` | |
| `atualizado_em` | timestamptz | não | `now()` | |

### 2.5 `pratos`
| Coluna | Tipo | Nulo | Default |
|--------|------|------|---------|
| `id` | uuid | não | `gen_random_uuid()` |
| `nome` | varchar(100) | não | — |
| `descricao` | text | sim | — |
| `preco` | numeric | não | — (CHECK `>= 0`) |
| `imagem` | text | sim | — (caminho local ou URL https) |
| `destaque` | boolean | não | `false` |
| `ativo` | boolean | não | `true` |
| `criado_em` | timestamptz | não | `now()` |

> Não existe índice único em `nome`; seeds e importações usam `WHERE NOT EXISTS`/`ON CONFLICT (id)`.

### 2.6 `prato_ingredientes` (ficha técnica)
| Coluna | Tipo | Nulo | Observação |
|--------|------|------|------------|
| `prato_id` | uuid | não | PK composta, FK `pratos` |
| `ingrediente_id` | uuid | não | PK composta, FK `estoque` |
| `quantidade` | numeric | não | Porção consumida por unidade vendida (CHECK `> 0`) |

### 2.7 `pedidos`
| Coluna | Tipo | Nulo | Default |
|--------|------|------|---------|
| `id` | uuid | não | `gen_random_uuid()` |
| `mesa_id` | uuid | não | — (FK `usuarios`) |
| `valor_total` | numeric | não | — (CHECK `>= 0`) |
| `status` | varchar(20) | não | `'Pendente'` |
| `criado_em` | timestamptz | não | `now()` |
| `atualizado_em` | timestamptz | não | `now()` |
| `entregue_em` | timestamptz | sim | — |

**Status canônico (CHECK `pedidos_status_check`):**
`Pendente` → `Em Preparo` → `Pronto` → `Entregue`, mais `Cancelado`.

### 2.8 `pedido_itens`
| Coluna | Tipo | Nulo | Observação |
|--------|------|------|------------|
| `id` | uuid | não | `gen_random_uuid()` |
| `pedido_id` | uuid | não | FK `pedidos` |
| `prato_id` | uuid | não | FK `pratos` |
| `quantidade` | integer | não | CHECK `> 0` |
| `preco_unitario` | numeric | não | Preço congelado no momento da venda |

### 2.9 `chamados`
| Coluna | Tipo | Nulo | Default |
|--------|------|------|---------|
| `id` | uuid | não | `gen_random_uuid()` |
| `mesa_id` | uuid | não | — (FK `usuarios`) |
| `justificativa` | text | não | — |
| `status` | varchar(20) | não | `'Pendente'` |
| `criado_em` | timestamptz | não | `now()` |
| `atendido_em` | timestamptz | sim | — |

**Status (CHECK):** `Pendente`, `Atendido`, `Cancelado`.

### 2.10 `clientes`
Tabela de fidelidade mantida para evolução futura; **não é usada** pelo fluxo atual (não há login de cliente no `spec.md`).

| Coluna | Tipo | Nulo | Default |
|--------|------|------|---------|
| `id` | uuid | não | `gen_random_uuid()` |
| `nome` | varchar(100) | não | — |
| `telefone` | varchar(20) | sim | — (UNIQUE) |
| `total_visitas` | integer | não | `1` |
| `pontos` | integer | não | `0` |
| `criado_em` | timestamptz | não | `now()` |
| `ultimo_acesso_em` | timestamptz | não | `now()` |

---

## 3. API RPC (contrato usado pelo front-end)

Todas as funções abaixo estão em `public`, são `SECURITY DEFINER` com `search_path` fixo e exigem `EXECUTE` de `anon`/`authenticated`.

### 3.1 Públicas / autenticação

| Função | Parâmetros | Retorno |
|--------|-----------|---------|
| `pratos_cardapio()` | — | `jsonb` (array): `id, nome, descricao, preco, imagem, destaque, disponivel, porcoes` |
| `sistema_precisa_bootstrap()` | — | `boolean` |
| `criar_gerente_inicial(p_login, p_senha, p_nome)` | text, text, text | `{id, mensagem}` |
| `autenticar_usuario(p_login, p_senha)` | text, text | `{sucesso, usuario{id,nome,login,tipo,perfil}, tipo_sessao, session_token, expira_em}` ou `{sucesso:false, codigo, mensagem}` |
| `encerrar_sessao(p_session_token)` | text | `{mensagem}` |
| `iniciar_sessao_mesa(p_qr_token, p_duracao_horas = 12)` | text, int | `{sucesso, usuario{…tipo:'mesa'}, tipo_sessao:'mesa', session_token, expira_em, via:'qr_code'}`; token desconhecido/curto → `28000` (seção 3.6) |

### 3.2 Mesa

| Função | Parâmetros | Retorno |
|--------|-----------|---------|
| `criar_pedido_mesa(p_session_token, p_itens)` | text, jsonb `[{prato_id, quantidade}]` | `{pedido_id, valor_total, itens, status}` |
| `meus_pedidos_mesa(p_session_token)` | text | array `{id,status,valor_total,criado_em,entregue_em,itens[]}` |
| `criar_chamado_mesa(p_session_token, p_justificativa)` | text, text | `{chamado_id, status}` |

### 3.3 Atendimento (atendente ou gerente)

| Função | Parâmetros | Retorno |
|--------|-----------|---------|
| `painel_atendimento(p_session_token)` | text | `{chamados[], pedidos[], gerado_em}` |
| `atualizar_status_pedido(p_session_token, p_pedido_id, p_novo_status)` | text, uuid, varchar | `{pedido_id, status, alterado, por}` |
| `resolver_chamado(p_session_token, p_chamado_id)` | text, uuid | `{chamado_id, status}` |

### 3.4 Gerência

| Função | Parâmetros |
|--------|-----------|
| `listar_estoque(p_session_token)` | text |
| `salvar_ingrediente(p_session_token, p_id, p_nome, p_unidade, p_quantidade)` | text, uuid\|null, text, text, numeric |
| `excluir_ingrediente(p_session_token, p_id)` | text, uuid |
| `listar_pratos_admin(p_session_token)` | text |
| `salvar_prato(p_session_token, p_id, p_dados, p_receita)` | text, uuid\|null, jsonb `{nome,descricao,preco,imagem,destaque,ativo}`, jsonb `[{ingrediente_id,quantidade}]` |
| `excluir_prato(p_session_token, p_id)` | text, uuid |
| `listar_contas(p_session_token)` | text |
| `salvar_conta(p_session_token, p_id, p_tipo, p_nome, p_login, p_senha, p_perfil, p_ativo)` | text, uuid\|null, text, text, text, text\|null, text\|null, boolean |
| `definir_status_conta(p_session_token, p_id, p_ativo)` | text, uuid, boolean |
| `excluir_conta(p_session_token, p_id)` | text, uuid |
| `relatorio_faturamento(p_session_token, p_data_inicio, p_data_fim)` | text, timestamptz, timestamptz |
| `backup_exportar(p_session_token)` | text |
| `backup_importar(p_session_token, p_payload, p_modo)` | text, jsonb, text (`merge`\|`replace`) |
| `gerar_qr_code_mesa(p_session_token, p_mesa_id)` | text, uuid → `{mesa_id, mesa_nome, qr_token, url_relativa, gerado_por, gerado_em}` |
| `status_qr_mesas(p_session_token)` | text → `{mesas:[{mesa_id, mesa_nome, ativo, qr_code_ativo, sessao_aberta}], gerado_em}` |
| `desativar_qr_mesa(p_session_token, p_mesa_id)` | text, uuid → `{mesa_id, qr_code_ativo:false}` |

### 3.5 Regras implementadas no banco

- **RN-01/RN-02:** `pratos_cardapio()` só devolve pratos `ativo = true` e calcula `disponivel`/`porcoes` a partir da ficha técnica e do estoque, sem expor quantidades.
- **RN-03:** `criar_pedido_mesa()` roda em transação única: valida prato e estoque com `FOR UPDATE`, debita os insumos, grava preço lido da tabela e calcula o total. Falha = rollback completo (nunca há pedido parcial).
- **RN-04:** `atualizar_status_pedido(..., 'Cancelado')` devolve os insumos ao estoque; pedidos `Entregue`/`Cancelado` são imutáveis.
- **RN-05/RN-06:** apenas `perfil = 'gerente'` executam RPCs de gestão; atendentes operam só pedidos e chamados.
- **RN-08/RN-09:** faturamento considera exclusivamente pedidos `Entregue` com `entregue_em` no período; ticket médio = receita ÷ pedidos entregues.

### 3.6 QR Code das mesas (verificado no banco em 20/10/2026)

As quatro funções acima existem no banco real (definições lidas com `pg_get_functiondef`), mas **não constam** da migração de referência do repositório — ver `backlog.md` §8.3 (divergência banco × repositório). Regras atuais, sem alteração:

- **Gerar** (`gerar_qr_code_mesa`, só gerente via `_exigir_gerente`): cria `MESA-` + 64 hex (`gen_random_bytes(32)`), grava apenas o hash, marca `qr_code_ativo` e **encerra as sessões da mesa**. Gerar de novo revoga o QR anterior. Mesa inexistente → `P0002`; mesa inativa → `P0001`.
- **Entrar** (`iniciar_sessao_mesa`, público): exige QR ativo e mesa ativa; abre sessão de 12 h e **encerra as outras sessões da mesa** (uma sessão por mesa). Qualquer falha → `28000`, sem distinguir o motivo.
- **Status** (`status_qr_mesas`) e **desativar** (`desativar_qr_mesa`, que também encerra as sessões): só gerente.
- O QR é **estático** até ser gerado de novo ou desativado; fechar/pagar a conta **não** revoga o QR nem a sessão. Inativar/excluir a mesa, importar backup e `encerrar_sessao` encerram as sessões.
- Sessões de mesa não executam RPCs de equipe: `_exigir_gerente` responde `28000` para token que não é de funcionário e `42501` para funcionário sem perfil gerente.

---

## 4. Tratamento de erros

| SQLSTATE | Significado | Origem |
|----------|-------------|--------|
| `28000` | Sessão/token inválido ou expirado | `*_da_sessao`, `validar_sessao_mesa` |
| `42501` | Permissão negada (perfil insuficiente) | `_exigir_gerente`, `_exigir_funcionario` |
| `22023` | Dados inválidos | validações de entrada |
| `P0001` | Regra de negócio (estoque insuficiente, transição inválida) | `criar_pedido_mesa`, `atualizar_status_pedido` |
| `P0002` | Registro não encontrado | updates/deletes |
| `23505` | Unicidade (login/insumo duplicado) | índices únicos |
| `23503` | Integridade referencial | FKs |
| `23514` | CHECK violado | constraints |
| `42901` | Excesso de tentativas de login (5 em 15 min) | `autenticar_usuario` |

`js/supabase.js` traduz esses códigos em mensagens de interface.

---

## 5. Dados de demonstração (`seed_dados_demo`)

Função **não exposta** ao cliente (executar pelo SQL Editor do Supabase, como `postgres`).

- 27 insumos em `estoque`;
- 8 pratos + ficha técnica completa;
- logins: `gerente/gerente123`, `atendente/atendente123`, `Mesa 01`…`Mesa 06`/`mesa123`;
- desativa pratos `Prato Teste%` remanescentes.

> A migração é idempotente: pode ser reaplicada em produção sem duplicar registros
> (exceto `seed_dados_demo`, que é idempotente por `ON CONFLICT`/`NOT EXISTS`).
