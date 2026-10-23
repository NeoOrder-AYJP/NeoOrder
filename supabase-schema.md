# NeoOrder — Schema do Banco de Dados (Supabase/PostgreSQL)

Projeto Supabase: `nurnxrtxdcasrjcwxvky`
Última atualização: **23/10/2026** (v2.9)
Migração de referência: `supabase/migrations/20261017_neoorder_hardening.sql` + `20261020_neoorder_multisession_qr_staff_logout.sql` + `20261022_neoorder_pin_encerramento_mesa.sql` (superseded) + `20261023_neoorder_pin_only_hmac_correcao.sql` (vigente, pendente autorização — não aplicar 20261022 isolada)

> Este documento descreve o estado **real** do banco após a migração de endurecimento.
> O front-end **não acessa tabelas**: toda operação passa por funções RPC
> `SECURITY DEFINER` em `public`, autenticadas por token de sessão.

---

## 1. Modelo de acesso

| Camada | Regra |
|--------|-------|
| Tabelas `public` | RLS **habilitada** em todas as 11 tabelas, **sem nenhuma policy** → `anon` e `authenticated` não leem nem escrevem diretamente. |
| Privilégios | `REVOKE ALL` de tabelas/sequences para `PUBLIC`, `anon` e `authenticated`. |
| Funções | 33 RPCs de negócio têm `EXECUTE` para `anon, authenticated` (24 base + 5 QR staff + 4 PIN: `definir_pin_funcionario`, `remover_pin_funcionario`, `status_pin_funcionarios`, `encerrar_sessao_mesa_autorizada` PIN-only 2 params + stub 3-params `42883`). Helpers privados: `_hash_token`, `_normalizar_login`, `_validar_pin`, `_pin_pepper`, `_pin_hmac`. Tabela `pin_pepper` (RLS sem policies, `REVOKE ALL`) guarda segredo backend. |
| Sessão | O login devolve token opaco 64 hex, só `SHA-256` no banco, 12h, **múltiplas sessões por usuário** (multi-dispositivo, `UPDATE ativa=false` removido). `encerrar_sessao` bloqueia mesa `42501`. Sessões de mesa exigem **PIN individual 6 dígitos, sem login** (v2.9 PIN-only): `encerrar_sessao_mesa_autorizada(p_session_token_mesa, p_pin)` identifica staff por `HMAC-SHA256(pepper)+bcrypt` (`pin_pepper` secreto backend), verifica colisão, bloqueio `5/15min` por mesa `pg_advisory_xact_lock(hashtext(mesa_id))`, encerra só sessão selecionada. |
| Senhas / PIN | `pgcrypto` `senha_hash` `crypt(gen_salt bf 11)` (login) e `pin_hash = crypt(hmac(PIN, pepper, sha256), gen_salt bf 11)` (KDF bcrypt custo 11 + HMAC-SHA256 com segredo `pin_pepper` só backend, não SHA-256 simples; justificado: pepper impede offline brute-force se dump vazar; custo 11 ~200ms; residual 1M/5/15min ≈5,7 anos). `_validar_pin` `^[0-9]{6}$`, colisão `23505`, auditoria sem segredos. |

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
| `pin_hash` | text | sim | — | Hash bcrypt do PIN individual de 6 dígitos (v2.8); `NULL` = sem PIN configurado; nunca plaintext |
| `pin_ativo` | boolean | não | `false` | `true` = PIN configurado e habilitado para autorizar encerramento |
| `pin_atualizado_em` | timestamptz | sim | — | Quando o PIN foi definido/alterado |
| `pin_expira_em` | timestamptz | sim | — | Opcional: expiração do PIN para rotação; `NULL` = sem expiração |
| `criado_em` | timestamptz | não | `now()` | |
| `senha_hash` | text | sim | — | bcrypt (login) |
| `senha_atualizada_em` | timestamptz | sim | — | |
| `atualizado_em` | timestamptz | não | `now()` | |

**Constraints:** `usuarios_tipo_check`, `usuarios_perfil_check`.
**Índice único:** `usuarios_login_lower_key` em `lower(login)`.

### 2.1.1 `pin_pepper` (segredo backend, não exposto)
| Coluna | Tipo | Nulo | Observação |
|--------|------|------|------------|
| `id` | uuid | não | PK |
| `secret` | text | não | `encode(gen_random_bytes(32), hex)` — HMAC pepper, RLS sem policies, só `_pin_pepper()` SECURITY DEFINER lê |
| `created_at` | timestamptz | não | — |

RLS habilitada, `REVOKE ALL FROM anon, authenticated`, acesso só via `_pin_pepper()`/`_pin_hmac()`.

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

### 3.6 QR Code das mesas (atualizado v2.6 — múltiplas sessões)

Migração `20261020_neoorder_multisession_qr_staff_logout.sql` redefine o comportamento para compatibilidade com múltiplos dispositivos:

- **Gerar** (`gerar_qr_code_mesa`, só gerente via `_exigir_gerente`): cria `MESA-` + 64 hex (`gen_random_bytes(32)`), grava apenas o hash, marca `qr_code_ativo`. **Não encerra mais as sessões ativas** (P1: multi-sessão). Gerar de novo apenas revoga o token anterior. Mesa inexistente → `P0002`; mesa inativa → `P0001`.
- **Entrar** (`iniciar_sessao_mesa`, público): exige QR ativo e mesa ativa; abre sessão de 12 h **sem encerrar outras sessões da mesma mesa**. Qualquer falha → `28000`, sem distinguir o motivo (preservado para não revelar mesas existentes).
- **Status** (`status_qr_mesas`) e **desativar** (`desativar_qr_mesa`): só gerente. Desativar apenas revoga o token; não encerra sessões automaticamente (sessões expiram em 12 h ou via logout autorizado).
- O QR é **estático** até ser gerado de novo ou desativado. Inativar/excluir a mesa e importação com `replace` revogam tokens conforme regra do negócio.
- Sessões de mesa não executam RPCs de equipe: `_exigir_gerente` responde `28000` para token que não é de funcionário e `42501` para funcionário sem perfil gerente.

### 3.7 QR Codes de equipe — gerente e atendente (novo v2.6)

QR individual por funcionário, gerado apenas por gerente, com token `FUNC-` + 64 hex (256 bits), hash SHA-256 e revogação manual:

| Função | Quem pode chamar | Comportamento |
|--------|----------------|---------------|
| `gerar_qr_code_funcionario(p_session_token, p_funcionario_id)` | gerente | Valida _exigir_gerente, verifica funcionario ativo, gera token, grava hash, marca qr_code_ativo. Não encerra sessões existentes. Inativo → P0001, não encontrado → P0002. |
| `iniciar_sessao_funcionario_qr(p_qr_token, p_duracao_horas=12)` | público (anon) | Exige prefixo FUNC-, verifica hash ativo e funcionario ativo, cria sessão em sessoes_funcionario 12 h (multi-sessão). Qualquer falha → 28000. Retorna usuario com perfil efetivo (gerente/atendente) e tipo_sessao funcionario. |
| `status_qr_funcionarios(p_session_token)` | gerente | Retorna {funcionarios:[{funcionario_id, funcionario_nome, login, perfil, ativo, qr_code_ativo, sessao_aberta}], gerado_em}. |
| `desativar_qr_funcionario(p_session_token, p_funcionario_id)` | gerente | Revoga token (qr_code_ativo=false, hash NULL). Não encerra sessões. |

**Segurança e isolamento:**
- QR de mesa (MESA-) nunca concede perfil de staff: iniciar_sessao_funcionario_qr rejeita MESA-* (28000), iniciar_sessao_mesa rejeita FUNC-*.
- QR de staff respeita perfil do funcionario dono do token: um QR de atendente cria sessão atendente, não gerente. O backend valida tipo=funcionario e perfil, o frontend redireciona para atendimento.html (atendente) ou faturamento.html (gerente).
- Tokens expostos apenas no momento da geração (memória do modal, QR desenhado localmente via qrcode-generator.js). Não são logados nem ficam em URL após redirect (history.replaceState).
- Validade da sessão 12 h; QR sem expiração por tempo, apenas revogação manual ou inativação da conta.

### 3.8 Encerramento de sessão de mesa com autorização (novo v2.6)

| Função | Parâmetros | Retorno |
|--------|-----------|---------|
| `encerrar_sessao_mesa_autorizada(p_session_token_mesa, p_pin)` | text, text | {sucesso, mensagem, mesa_id, autorizado_por, autorizado_login, autorizado_perfil, encerrado_em} — PIN-only, sem login |
| `encerrar_sessao_mesa_autorizada(p_session_token_mesa, p_staff_login, p_pin)` | text, text, text | `42883` stub — DEPRECATED, substituída por 2-params PIN-only |
| `definir_pin_funcionario(p_session_token, p_target_usuario_id, p_pin)` | text, uuid, text | {funcionario_id, funcionario_nome, pin_ativo, pin_atualizado_em, definido_por} — gerente only, verifica colisão `23505` |
| `remover_pin_funcionario(p_session_token, p_target_usuario_id)` | text, uuid | {funcionario_id, pin_ativo:false} — gerente only |
| `status_pin_funcionarios(p_session_token)` | text | {funcionarios:[{funcionario_id, funcionario_nome, login, perfil, ativo, pin_ativo, pin_atualizado_em, pin_expira_em}], gerado_em} |

**Regras (v2.9 — PIN-only, HMAC+KDF, sem login):**
- **Formato:** `p_pin` `^[0-9]{6}$` via `_validar_pin` → `22023` se inválido. Nunca plaintext/logs.
- **Armazenamento:** `pin_hash = crypt(hmac(PIN, pepper, sha256), gen_salt bf 11)` — `pin_pepper.secret` (32 bytes hex, `REVOKE ALL`, só `_pin_pepper()` lê), HMAC-SHA256 com segredo backend + bcrypt custo 11. Justificativa: SHA-256 simples = tabela arco-íris 1M em ms; HMAC+pepper exige segredo (se dump vazar sem pepper, 1M → 5/15min × bcrypt 200ms ≈5,7 anos por mesa). Residual: se pepper vazar, ainda bcrypt custo 11.
- **Autorização:** varre `usuarios tipo=funcionario ativo pin_ativo` com `crypt(hmac(PIN), pin_hash)=pin_hash`, ignora `pin_expira_em<now`. 0 match → genérico `28000` “PIN incorreto ou não autorizado” (não revela se PIN existe, duplicado, conta), >1 match → `28000` “PIN ambíguo” (definição impede colisão `23505` via varredura `crypt(hmac(new), hash)=hash` antes de `UPDATE`).
- **Bloqueio:** `pin:mesa:<mesa_id>` em `login_tentativas` (não `login`), `pg_advisory_xact_lock(hashtext(mesa_id))` serializa 5 paralelas, `count sucesso=false >15min` ≥5 → `42901`. Persistente: `INSERT+RETURN {sucesso:false}` ( `RAISE` faria rollback — corrigido, mesmo que `autenticar_usuario`), sucesso `DELETE falsas + INSERT true`.
- **Isolamento:** `session_token_hash = _hash_token(p_session_token_mesa)` só encerra `sessoes_mesa` da mesa selecionada (preserva outras mesas/dispositivos). Idempotente `mensagem` se já encerrada.
- **Endurecimento:** `encerrar_sessao` → `42501` “Use encerrar_sessao_mesa_autorizada(p_session_token_mesa, p_pin)”.
- **Compatibilidade:** `20261022` 3-params agora stub `42883`; frontend `encerrarSessaoMesaAutorizada(mesaToken, pin)` com `p_pin` (2 params) + `js/auth.js` modal PIN-only sem login, `cardapio.html` PIN-only, gestão `contas.html` exclusiva gerente, auditoria `mesa_id, autorizado_por/login/perfil, encerrado_em` sem PIN/token.

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
