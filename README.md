# NeoOrder

Sistema de gerenciamento de pedidos de restaurante (HTML/CSS/JS + Supabase).
Front-end estático, sem build, servido por qualquer servidor HTTP.

- Especificação (congelada): `spec.md`
- Diretrizes de design: `agents.md`
- Backlog e histórico de alterações: `backlog.md`
- Schema do banco e contrato das RPCs: `supabase-schema.md`

## Estrutura

```
index.html          Landing page (cardápio público)
login.html          Login de mesa, atendente e gerente
cardapio.html       Pedidos da mesa (carrinho + histórico + chamado)
atendimento.html    Painel de chamados e fluxo dos pedidos
estoque.html        Insumos, pratos e ficha técnica (gerente)
contas.html         Contas de mesas e funcionários (gerente)
faturamento.html    Indicadores e backup JSON (gerente)

js/supabase.js      Cliente RPC, sessão, toasts e tema
js/auth.js          Login, bootstrap do primeiro gerente e guarda de sessão
js/app.js           Landing page
js/cardapio.js      Carrinho, pedido e chamados da mesa
js/atendimento.js   Chamados + kanban de pedidos + alerta sonoro
js/estoque.js       CRUD de insumos e pratos com ficha técnica
js/contas.js        CRUD de contas
js/faturamento.js   Relatório do período e backup

assets/pratos/      Imagens locais dos pratos + fallback sem-imagem.svg
supabase/migrations/20261017_neoorder_hardening.sql
styles.css          Design system (tema claro/escuro)
```

## Como executar

1. Sirva a raiz do projeto por HTTP (o `supabase-js` é carregado por CDN):

   ```bash
   python3 -m http.server 8080
   # ou: npx serve .
   ```

2. Abra `http://localhost:8080/index.html`.

> Abrir os arquivos via `file://` também funciona no navegador, mas um servidor
> local evita restrições de CORS em alguns navegadores.

## Banco de dados

Projeto Supabase: `nurnxrtxdcasrjcwxvky`.
A migração `supabase/migrations/20261017_neoorder_hardening.sql` é **idempotente** e
já foi aplicada. Ela:

- cria as tabelas de sessão e auditoria de login;
- normaliza os status dos pedidos;
- cria 24 RPCs `SECURITY DEFINER` (toda a API do sistema);
- habilita RLS em todas as tabelas e **remove todas as policies**, revogando o
  acesso direto de `anon`/`authenticated`;
- concede `EXECUTE` somente às RPCs de negócio.

Para reaplicar em outro projeto, execute o arquivo no SQL Editor do Supabase.

### Primeiro acesso

Se o banco não tiver nenhum gerente ativo, `login.html` exibe automaticamente o
formulário **Criar Gerente Inicial** (RPC `criar_gerente_inicial`). Depois disso,
as demais contas são criadas em `contas.html`.

### Dados de demonstração

O script já contém `seed_dados_demo()`, que **não** é exposto ao cliente.
Para carregar a demonstração, rode no SQL Editor:

```sql
SELECT public.seed_dados_demo();
```

Contas criadas pelo seed:

| Perfil | Login | Senha |
|--------|-------|-------|
| Gerente | `gerente` | `gerente123` |
| Atendente | `atendente` | `atendente123` |
| Mesas | `Mesa 01` … `Mesa 06` | `mesa123` |

> Troque essas senhas antes de qualquer uso real (Contas → editar → nova senha).

## Segurança

- Senhas em bcrypt (`pgcrypto`), nunca trafegam nem são lidas pelo front-end.
- Sessão por token opaco (SHA-256 no banco, 12 h de validade, uma por usuário).
- Bloqueio de força bruta: 5 falhas em 15 minutos bloqueiam o login por 15 minutos.
- Nenhuma tabela é acessível pela publishable key; todo acesso passa por RPC.
- O primeiro gerente só pode ser criado enquanto não existir gerente ativo.

## Testes manuais sugeridos

1. `index.html` → cards e carrossel com as 8 imagens locais (sem imagens repetidas).
2. Login `Mesa 01` → adicionar pratos → **Enviar Pedido para a Cozinha**.
3. Login `atendente` → o pedido aparece em *Recebidos* → *Em Preparo* → *Pronto* → *Entregar*.
4. Em `estoque.html`, zerar um insumo da ficha → o prato fica **Indisponível** no cardápio.
5. `faturamento.html` → pedidos entregues entram na receita; cancelados não.
6. `faturamento.html` → exportar backup JSON e reimportar em modo *merge*.
