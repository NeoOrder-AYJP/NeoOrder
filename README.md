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

## Testes

Teste de fumaça de interface (jsdom + Supabase simulado, sem rede):

```bash
npm install
npm test
```

O teste executa as 8 telas reais com os scripts do projeto e respostas
fictícias no mesmo contrato das RPCs, verificando renderização, carrinho,
kanban, filtros, o botão de chamado e os contratos de acessibilidade
(menu de gestão, barra inferior da mesa, modais com foco/Esc, tabelas roláveis).

O mesmo comando também roda `tests/qr.test.js` (jsdom, 34 cenários): login por
QR Code — sucesso, QR inválido/desativado, mesa indisponível, falha de rede e de
servidor, cliques repetidos, token removido da URL e ausente dos logs, sessão de
mesa sem acesso de equipe, login por senha preservado — e a gestão do QR em
`contas.html` por perfil.

### Teste de responsividade (navegador real)

`tests/responsive.mjs` abre as páginas em Chromium headless (via
`puppeteer-core`), sempre com o **Supabase simulado** (fixtures em
`tests/fixtures/`) e com as fontes servidas de `node_modules` — não acessa a
rede nem o banco. Cobre 320, 360, 390, 768, 1024 e 1440 px nos temas claro e
escuro (124 combinações), mais uma passada de cada página a 320 px **sem a
fonte de ícones** (simula rede lenta). Em cada combinação ele **primeiro confirma que os
dados carregaram** (sem redirecionamento de login e sem erro JS) e só então
verifica o layout:

- sem rolagem horizontal da página e sem conteúdo cortado;
- cabeçalho: menu hambúrguer na gestão abaixo de 1024 px (abre, fecha com Esc,
  devolve o foco) e navegação atual a partir de 1024 px; barra inferior da mesa
  (Cardápio, Carrinho, Pedidos, Chamar) só até 767 px, sem duplicar ações e sem
  cobrir conteúdo;
- tabelas de Contas, Estoque e Faturamento com rolagem dentro do contêiner e
  coluna de ações visível;
- alvos de toque ≥ 44 px, foco visível ao navegar com Tab;
- modais: dentro da tela, foco entra e fica preso, Esc fecha e o foco volta ao
  botão que abriu.

Contraste só reprova nos componentes novos (barra inferior e painel do menu);
no restante é listado como **aviso** (paleta mantida — ver `backlog.md`, v2.5).

O navegador **não** é baixado pelo projeto: informe um Chrome/Chromium já
instalado pela variável `CHROME_PATH`.

```bash
npm install
CHROME_PATH="$(command -v chromium || command -v google-chrome)" npm run test:responsive
```

| Variável | Uso |
|----------|-----|
| `CHROME_PATH` | **Obrigatória.** Executável do Chrome/Chromium (ex.: `/usr/bin/chromium`, `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). |
| `CHROME_ARGS` | Argumentos extras separados por espaço. Em contêineres/CI rodando como root: `CHROME_ARGS="--no-sandbox"`. |
| `RESPONSIVE_OUT` | Pasta do relatório `results.json` e das capturas (padrão: `<tmp>/neoorder-responsive`, fora do repositório). |
| `RESPONSIVE_ONLY` | Roda só alguns cenários, ex.: `RESPONSIVE_ONLY=cardapio,contas`. |
| `RESPONSIVE_SHOTS` | `0` desativa as capturas de tela. |

O comando termina com código 1 se houver qualquer falha (ou se os dados de
teste não carregarem) e imprime a lista de falhas e avisos. Binários do
navegador, caches e relatórios não devem ser versionados.

### Teste do QR Code em navegador

`tests/qr-browser.mjs` usa o mesmo Chromium (`CHROME_PATH`, `CHROME_ARGS`) e
percorre a cadeia completa: o gerente gera o QR em `contas.html`, a imagem
exibida é **decodificada** (`jsqr`, dependência de desenvolvimento) e o link
lido é aberto num "celular" em 320, 360, 390, 768, 1024 e 1440 px até o
cardápio da mesa correta. Também cobre estados de erro com toque e teclado,
sessão única por mesa, renovar/desativar, impressão e bloqueio do atendente.

```bash
CHROME_PATH="$(command -v chromium || command -v google-chrome)" npm run test:qr-browser
```

O Supabase é substituído por um simulador em Node que reproduz as regras das
funções reais (`iniciar_sessao_mesa`, `gerar_qr_code_mesa`, `status_qr_mesas`,
`desativar_qr_mesa`). Não acessa a rede nem o banco e **não** substitui um teste
contra o Supabase real nem a leitura do QR impresso com uma câmera. `QR_SHOTS=<pasta>`
salva capturas para inspeção visual.

## Testes manuais sugeridos

1. `index.html` → cards e carrossel com as 8 imagens locais (sem imagens repetidas).
2. Login `Mesa 01` → adicionar pratos → **Enviar Pedido para a Cozinha**.
3. Login `atendente` → o pedido aparece em *Recebidos* → *Em Preparo* → *Pronto* → *Entregar*.
4. Em `estoque.html`, zerar um insumo da ficha → o prato fica **Indisponível** no cardápio.
5. `faturamento.html` → pedidos entregues entram na receita; cancelados não.
6. `faturamento.html` → exportar backup JSON e reimportar em modo *merge*.
