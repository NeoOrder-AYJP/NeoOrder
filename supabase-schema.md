## Table `usuarios`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `tipo` | `varchar` |  |
| `nome` | `varchar` |  |
| `login` | `varchar` |  Nullable Unique |
| `perfil` | `varchar` |  Nullable |
| `ativo` | `bool` |  |
| `qr_code_ativo` | `bool` |  |
| `qr_token_hash` | `text` |  Nullable |
| `criado_em` | `timestamptz` |  |

## Table `sessoes_mesa`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `mesa_id` | `uuid` |  |
| `session_token_hash` | `text` |  Unique |
| `criado_em` | `timestamptz` |  |
| `ultimo_acesso_em` | `timestamptz` |  |
| `expira_em` | `timestamptz` |  |
| `ativa` | `bool` |  |

## Table `estoque`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `nome` | `varchar` |  Unique |
| `quantidade` | `numeric` |  |
| `unidade` | `varchar` |  |
| `criado_em` | `timestamptz` |  |
| `atualizado_em` | `timestamptz` |  |

## Table `pratos`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `nome` | `varchar` |  |
| `descricao` | `text` |  Nullable |
| `preco` | `numeric` |  |
| `imagem` | `text` |  Nullable |
| `destaque` | `bool` |  |
| `ativo` | `bool` |  |
| `criado_em` | `timestamptz` |  |

## Table `prato_ingredientes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `prato_id` | `uuid` | Primary |
| `ingrediente_id` | `uuid` | Primary |
| `quantidade` | `numeric` |  |

## Table `clientes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `nome` | `varchar` |  |
| `telefone` | `varchar` |  Nullable |
| `pontos` | `int4` | Default `0` |
| `visitas` | `int4` | Default `0` |
| `criado_em` | `timestamptz` | Default `now()` |

## Table `pedidos`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary Default `gen_random_uuid()` |
| `mesa_id` | `uuid` |  |
| `valor_total` | `numeric` |  |
| `status` | `varchar` |  |
| `criado_em` | `timestamptz` | Default `now()` |
| `atualizado_em` | `timestamptz` |  |
| `entregue_em` | `timestamptz` |  Nullable |

## Table `pedido_itens`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary Default `gen_random_uuid()` |
| `pedido_id` | `uuid` |  |
| `prato_id` | `uuid` |  |
| `quantidade` | `int4` |  |
| `preco_unitario` | `numeric` |  |

## Table `chamados`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `mesa_id` | `uuid` |  |
| `justificativa` | `text` |  |
| `status` | `varchar` |  |
| `criado_em` | `timestamptz` |  |
| `atendido_em` | `timestamptz` |  Nullable |

## Permissions & RLS Policies

```sql
-- Concessão explícita de permissões para roles do Supabase
GRANT INSERT, SELECT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
```

### `pratos`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Gerente gerencia pratos` | ALL | public | PERMISSIVE | `eh_gerente()` | — |
| `Leitura publica de pratos ativos` | SELECT | public | PERMISSIVE | `((ativo = true) OR eh_funcionario())` | — |
| `Acesso total anon e authenticated` | ALL | anon, authenticated | PERMISSIVE | `true` | `true` |

### `usuarios`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Funcionarios visualizam dados de usuarios` | SELECT | public | PERMISSIVE | `eh_funcionario()` | — |
| `Gerente possui controle total de usuarios` | ALL | public | PERMISSIVE | `eh_gerente()` | — |

### `estoque`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Apenas Gerente acessa estoque` | ALL | public | PERMISSIVE | `eh_gerente()` | — |

### `prato_ingredientes`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Apenas Gerente acessa ingredientes do prato` | ALL | public | PERMISSIVE | `eh_gerente()` | — |
| `Acesso total anon e authenticated` | ALL | anon, authenticated | PERMISSIVE | `true` | `true` |

### `pedidos`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Funcionarios gerenciam pedidos` | ALL | public | PERMISSIVE | `eh_funcionario()` | — |
| `Acesso total anon e authenticated` | ALL | anon, authenticated | PERMISSIVE | `true` | `true` |

### `pedido_itens`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Funcionarios gerenciam itens de pedidos` | ALL | public | PERMISSIVE | `eh_funcionario()` | — |
| `Acesso total anon e authenticated` | ALL | anon, authenticated | PERMISSIVE | `true` | `true` |

### `chamados`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Funcionarios gerenciam chamados` | ALL | public | PERMISSIVE | `eh_funcionario()` | — |

