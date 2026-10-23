# Backlog — Registro de Alteracoes e Tarefas de Desenvolvimento

Projeto: Sistema de Gerenciamento de Pedidos de Restaurante (NeoOrder)
Data de atualização: 24/10/2026 (correção prioridade logout com senha — PIN adiado)

---

## 1. Planejamento de Tarefas do Sistema (Roadmap de Desenvolvimento)

Abaixo está a quebra organizada do desenvolvimento do projeto em tarefas sequenciais, baseada nos requisitos funcionais (`spec.md`), modelo do banco de dados (`supabase-schema.md`) e diretrizes de design (`agents.md`).

| ID Tarefa | Módulo | Descrição Resumida | Requisitos Atendidos | Prioridade | Status |
|-----------|--------|---------------------|----------------------|------------|--------|
| **TASK-01** | **Landing Page** | Estrutura base HTML/CSS/JS, integração com Supabase, Hero Carousel com slides em destaque rotativos (5s) e Cardápio Completo com badges de disponibilidade e botões de login. | RF-01, RF-02, RF-03, RF-04, RNF-01 a RNF-07 | Alta | **Concluído** |
| **TASK-02** | **Autenticação e Contas** | Telas de login para Mesa e Funcionário, gerenciamento de sessões/perfil (Mesa, Atendente, Gerente) e CRUD de contas de mesas e funcionários no painel do Gerente. | RF-05, RF-06, RF-07, RF-08, RF-09, RF-10, RF-11, RN-05, RN-10 | Alta | **Concluído** |
| **TASK-03** | **Cardápio e Estoque (Gerente)** | Tela de controle de estoque de ingredientes (CRUD), cadastramento de pratos vinculando ingredientes e quantidades por porção, e cálculo automático da disponibilidade de cada prato. | RF-21, RF-22, RF-23, RF-24, RF-25, RF-37, RF-38, RF-39, RF-40, RN-02, RN-05 | Alta | **Concluído** |
| **TASK-04** | **Pedidos e Carrinho (Mesa)** | Seleção de pratos disponíveis, controle de quantidades, carrinho de compras, finalização de pedido com débito automático no estoque e visualização do histórico de pedidos da mesa. | RF-12, RF-13, RF-14, RF-15, RF-16, RF-17, RF-18, RN-01, RN-03, RN-07 | Alta | **Concluído** |
| **TASK-05** | **Atendimento e Chamados** | Botão "Chamar Funcionário" com justificativa (Mesa), dashboard de chamados com alerta sonoro e controle de autoplay (Atendente/Gerente), e acompanhamento/atualização de status dos pedidos em tempo real (com estorno em cancelamento). | RF-19, RF-20, RF-26, RF-27, RF-28, RF-29, RF-30, RF-31, RN-04, RN-06 | Alta | **Concluído** |
| **TASK-06** | **Faturamento (Gerente)** | Dashboard financeira exclusiva para Gerentes, filtro por período (dia, semana, mês), cálculo de total faturado, quantidade de pedidos, ticket médio e pratos mais vendidos. | RF-32, RF-33, RF-34, RF-35, RF-36, RN-04, RN-08, RN-09 | Alta | **Concluído** |
| **TASK-07** | **Backup e Polimento Final** | Exportação/importação JSON, validação de RLS, responsividade, acessibilidade e remoção de referências internas à especificação que apareçam indevidamente na interface, especialmente identificadores numéricos na área de faturamento. | RF-41, RF-42, RNF-02, RNF-05, RNF-06, RNF-07 | Média | **Base concluída; varredura de referências internas pendente** |
| **TASK-08** | **Múltiplas Sessões Simultâneas** | Auditar e validar sessões independentes em dispositivos/navegadores diferentes, incluindo login, expiração, revogação e encerramento isolado. | Requisitos atuais de autenticação e sessões | **Máxima** | **Pendente de validação real** |
| **TASK-09** | **QR Codes de Gerente e Atendente** | Corrigir geração, leitura, expiração, revogação e autorização dos QR Codes de equipe, com validação real no Supabase. | Requisitos atuais de QR de equipe e permissões | **Máxima** | **Pendente de validação real** |
| **TASK-10** | **Encerramento de Mesa por Senha (staff autorizado)** | **Prioridade máxima 24/10 — corrigir autorização do logout de mesa:** validar credenciais contra `usuarios.senha_hash` (bcrypt `crypt` com `gen_salt bf 11`), confirmar no banco que funcionário existe, está ativo e tem permissão (`gerente`/`atendente`), autorização no banco via RPC `encerrar_sessao_mesa_autorizada(p_session_token_mesa,p_staff_login,p_staff_senha)` com `SECURITY DEFINER`, bloqueio 5/15min com `pg_advisory_xact_lock`, encerramento exclusivo da sessão solicitada, sem aceitar combinações arbitrárias. **PIN individual de 6 dígitos adiado por decisão 24/10 — não implementar nem ativar agora.** | Requisito vigente de autorização por senha + auditoria | **Máxima** | **Em correção — validação real pendente** |
| **TASK-11** | **Acesso Público de Demonstração por QR** | Criar acesso de demonstração somente leitura, isolado de perfis operacionais e protegido também no backend/RLS/RPCs. | Requisito de demonstração pública por QR | Alta | **Pendente** |

> **Nota sobre status (24/10/2026):** TASK-01 a TASK-07 são módulos-base; não comprovam prioridades atuais. TASK-10 PIN adiado — foco atual é validar `encerrar_sessao_mesa_autorizada` com `senha_hash` no Supabase real (migr. `20261024_neoorder_logout_senha_hardening.sql` pendente autorização, **não aplicada** em produção); testes simulados não comprovam banco real. TASK-08/09 em validação real. `encerrar_sessao` antigo vulnerável (sem `42501`) ainda ativo em produção até migração.

---

## 2. Historico de Alteracoes

| Data | Versao | Tipo | Modulo | Descricao | Autor | Status |
|------|--------|------|--------|-----------|-------|--------|
| 27/08/2026 | 1.0 | Adicionado | Especificacao | Criacao da especificacao inicial com requisitos funcionais, nao-funcionais, regras de negocio, modelo de dados e arquitetura. | Stakeholder | Concluido |
| 27/08/2026 | 1.0 | Adicionado | Design | Inclusao do requisito RNF-07: interface corporativa, limpa e minimalista. | Stakeholder | Concluido |
| 27/08/2026 | 1.0 | Adicionado | Design | Criacao da secao de Diretrizes de Design com paleta de cores e principios visuais. | Stakeholder | Concluido |
| 03/09/2026 | 1.1 | Refatoracao | Estrutura | Separacao da especificacao em dois documentos: spec.md (requisitos) e agents.md (diretrizes de design). Tema e cores removidos da spec. | Stakeholder | Concluido |
| 03/09/2026 | 1.1 | Adicionado | Design | Criacao do agents.md com diretrizes completas de UI/UX corporativo, limpo e minimalista. | Stakeholder | Concluido |
| 03/09/2026 | 1.1 | Adicionado | Gerenciamento | Criacao do backlog.md para rastreamento formal de alteracoes. | Stakeholder | Concluido |
| 29/09/2026 | 1.2 | Adicionado | Gerenciamento | Mapeamento completo do backlog em tarefas de desenvolvimento (TASK-01 a TASK-07) e conclusão da TASK-01 (Landing Page e Supabase). | Jules | Concluido |
| 29/09/2026 | 1.3 | Adicionado | Autenticação | Conclusao da TASK-02 (Autenticação e Gerenciamento de Contas). | Jules | Concluido |
| 29/09/2026 | 1.4 | Adicionado | Estoque/Cardápio | Conclusao da TASK-03 (Controle de Estoque e Cadastramento de Pratos no Cardápio para Gerente). | Jules | Concluido |
| 29/09/2026 | 1.5 | Adicionado | Pedidos/Mesa | Conclusao da TASK-04 (Seleção de Pratos, Carrinho de Compras, Débito de Estoque e Histórico da Mesa). | Jules | Concluido |
| 29/09/2026 | 1.6 | Adicionado | Atendimento | Conclusao da TASK-05 (Dashboard de Atendimento, Chamados de Mesa com Som e Gestão de Status com Estorno). | Jules | Concluido |
| 29/09/2026 | 1.7 | Adicionado | Faturamento/Backup | Conclusao da TASK-06 (Faturamento) e TASK-07 (Exportação/Importação JSON & Polimento Final). | Jules | Concluido |
| 29/09/2026 | 1.8 | Refatoracao | Carrinho/Supabase | Implementação do contador de quantidade (- 1 +) no cardápio, imagens públicas e sincronização em tempo real via Supabase Realtime. | Jules | Concluido |
| 29/09/2026 | 1.9 | Correcao | Geral/Integração | Padronização da ordem dos scripts HTML, eliminação do erro de declaração de 'db' na linha 1 em cardapio.js, estoque.js e faturamento.js, prevenção de loading infinito via safeSupabaseQuery timeout, suporte a 4 perfis de login e persistência de tema via localStorage. | Jules | Concluido |
| 29/09/2026 | 2.0 | Refatoracao | Infraestrutura/Supabase | Centralização de credenciais e cabeçalhos em js/supabase.js, substituição de IDs simples por UUIDs válidos em atendimento.js e faturamento.js (resolução de erro 400), e verificação das correções de subtópicos 1.1 a 1.5. | Jules | Concluido |
| 29/09/2026 | 2.1 | Correcao | Pedidos/Supabase | Remoção do campo 'id' na inserção de pedido_itens (resolução de erro 409 Conflict) e garantia de geração de UUID válido via crypto.randomUUID() na tabela pedidos (resolução de erro 400 Bad Request). | Jules | Concluido |
| 08/10/2026 | 2.2 | Correcao | Geral/Autenticação & HTTP | Resolução dos erros HTTP 401, 400 e 409 em estoque.js, cardapio.js, atendimento.js e faturamento.js, inclusão da função utilitária window.getSupabase(), eliminação de referências à variável 'db' e prevenção de loading infinito com tratamento de exceções no auth.js. | Jules | Concluido |
| 17/10/2026 | 2.3 | Correcao | Geral/Cardápio, Pedidos, Supabase e Responsividade | Registro das regressões de disponibilidade dos pratos, imagens repetidas, falha no envio de pedidos (400 e 409), verificação dos erros 401 e revisão da responsividade e funcionalidades pendentes. (execução detalhada na seção 5). | Stakeholder | Concluido |
| 18/10/2026 | 2.3 | Correcao | Banco/Migração | Criação e aplicação da migração idempotente `supabase/migrations/20261017_neoorder_hardening.sql` (1.800+ linhas, 15 seções): tabelas de sessão de funcionário e auditoria de login, normalização dos status, 24 RPCs e comentários de contrato. | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Correcao | Segurança/RLS | RLS habilitada nas 11 tabelas com remoção de **todas** as policies permissivas; `REVOKE ALL` de tabelas/sequences para `PUBLIC`, `anon` e `authenticated`; `EXECUTE` concedido apenas às 24 RPCs de negócio. A publishable key deixou de acessar dados diretamente. | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Correcao | Autenticação | Login real com bcrypt no banco (`autenticar_usuario`), token opaco de 64 caracteres com hash SHA-256 e validade de 12 h, bloqueio de força bruta (5 falhas/15 min), `encerrar_sessao` e bootstrap do primeiro gerente (`criar_gerente_inicial`). Removidos o backdoor de senha `123456`, as contas mock e a regra que aceitava qualquer senha. | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Correcao | Cardápio/Disponibilidade | Disponibilidade dos pratos passou a ser **calculada** pela ficha técnica × estoque (`pratos_cardapio`), eliminando o rótulo fixo "Disponível (∞)". Pratos sem ficha ficam sempre disponíveis; com estoque zerado ficam indisponíveis e sem botão de compra. | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Correcao | Imagens | Substituição das 5 URLs Unsplash (repetidas/quebradas) por 8 imagens locais em `assets/pratos/` (1200×900, 145–212 KB); criação de `sem-imagem.svg`, fallback `onerror` em todas as telas e seletor de imagens no cadastro de pratos. Pratos "Prato Teste%" retirados do catálogo. | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Correcao | Pedidos/Cozinha | Envio de pedidos migrado para a RPC transacional `criar_pedido_mesa`: valida prato ativo, estoque com `FOR UPDATE`, lê o preço do banco, debita insumos e grava itens em uma única transação. Corrigido o alerta de sucesso otimista que aparecia mesmo sem pedido gravado. | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Correcao | Atendimento | Painel reescrito sobre `painel_atendimento` com polling de 8 s (Realtime exigiria SELECT direto em tabelas), kanban Pendente → Em Preparo → Pronto → Entregue, cancelamento com confirmação e estorno no banco, e correção do alerta sonoro que nunca tocava (`atendimento.js`: o beep retornava antes de `audioAlertsAtivo` ser ligado). | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Correcao | Estoque/Contas | `estoque.js` e `contas.js` reescritos sobre RPCs (`listar_estoque`, `salvar_ingrediente`, `excluir_ingrediente`, `listar_pratos_admin`, `salvar_prato`, `excluir_prato`, `listar_contas`, `salvar_conta`, `definir_status_conta`, `excluir_conta`). Removidos o 4º perfil "Cliente" (impossível pelo CHECK `tipo IN ('mesa','funcionario')`) e o campo inexistente `usuarios.senha`. Proteções: não inativar a própria conta e não remover o último gerente ativo. | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Correcao | Faturamento/Backup | Relatório passou a considerar somente pedidos `Entregue` por `entregue_em` (antes `faturamento.js` contava `Pronto` como receita). Backup exporta 8 tabelas + metadados; importação `merge`/`replace` transacional, com mensagens de erro de integridade. A importação não restaura `usuarios` (senhas) por decisão de segurança. | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Refatoracao | Front-end/Geral | Substituição do `safeSupabaseQuery` (timeout de 2,5 s que engolia erros) por um cliente RPC único (`js/supabase.js`) com timeout de 20 s, tradução de SQLSTATE, `toasts`, spinner em botões e estados vazios. Zero chamadas `.from()` em todo o projeto. Remoção de todos os dados mock. `spec.md` permaneceu congelado. | Arena Agent | Concluido |
| 18/10/2026 | 2.3 | Documentacao | Docs | `README.md` reescrito (execução, banco, credenciais de demonstração, segurança e roteiro de testes); `supabase-schema.md` regenerado a partir do banco real (11 tabelas, 24 RPCs, códigos de erro, RLS); `backlog.md` atualizado com o diagnóstico completo dos erros 400/409/401. | Arena Agent | Concluido |
| 19/10/2026 | 2.4 | Adicionado | Atendimento/Mesas, Pagamentos, Fidelidade e Estoque | Inclusão das especificações de atendimento por QR Code, sincronização em tempo real, identificação de mesa e cliente, Pix, divisão de conta, encerramento seguro de sessões, importação de NF-e, fichas técnicas, QR Codes de equipe e programa de fidelidade. Implementação e validação pendentes. | Stakeholder | Pendente |
| 20/10/2026 | 2.5 | Correcao | Front-end/Responsividade | Responsividade de todas as telas (320–1440 px): cabeçalho sem altura fixa; gestão com menu hambúrguer abaixo de 1024 px e navegação atual acima; mesa com barra inferior (Cardápio, Carrinho, Pedidos, Chamar) até 767 px; tabelas de Contas/Estoque/Faturamento com rolagem interna e coluna de ações fixa; modais e gaveta do carrinho dentro da tela; FAB e controles do carrossel sem sobreposição. Sem novas rotas, sem mudança de banco/RLS/RPC (detalhes na seção 7). | Arena Agent | Em revisão |
| 20/10/2026 | 2.5 | Correcao | Front-end/Acessibilidade | Alvos de toque ≥ 44 px, `:focus-visible`, modais com `role="dialog"`/`aria-modal`, foco preso, Esc e retorno do foco (`NeoModal`), ícones decorativos com `aria-hidden`, indicadores do carrossel como botões, setas do teclado restritas ao carrossel, pausa da rotação no hover/foco e sem rotação com `prefers-reduced-motion`, botão "Importar Backup" acessível por teclado. | Arena Agent | Em revisão |
| 20/10/2026 | 2.5 | Adicionado | Testes | `tests/smoke.js` ampliado (menu, barra inferior, modais, tabelas, ARIA) e novo `tests/responsive.mjs` (Chromium via `CHROME_PATH`, Supabase simulado, 6 larguras × 2 temas, verificação de carga antes do layout). | Arena Agent | Em revisão |
| 20/10/2026 | 2.5 | Documentacao | Design/Contraste | Pendência registrada (seção 7.3): contrastes abaixo de 4,5:1 da paleta atual, mantida sem alteração por decisão do stakeholder. | Arena Agent | Pendente |
| 20/10/2026 | 2.6 | Correcao | Autenticação/Sessões | Múltiplas sessões simultâneas: `autenticar_usuario` e `iniciar_sessao_mesa` deixaram de invalidar sessões anteriores; cada login gera token independente em `sessoes_mesa`/`sessoes_funcionario` (12 h). `gerar_qr_code_mesa` não encerra mais sessões ativas. Logout de staff continua direto; logout de mesa exige nova RPC. Migração `20261020_neoorder_multisession_qr_staff_logout.sql` criada (pendente de aplicação em produção). | Arena Agent | Em revisão |
| 20/10/2026 | 2.6 | Adicionado | QR Staff | QR Codes individuais para gerente e atendente: `gerar_qr_code_funcionario`, `iniciar_sessao_funcionario_qr` (FUNC- + 64 hex, hash SHA-256, 12 h), `status_qr_funcionarios`, `desativar_qr_funcionario`. Validação de perfil no backend (gerente só gera), isolamento total entre QR de mesa (MESA-) e de staff (FUNC-). Gestão em `contas.html` (badges, modal unificado, QR local). Login via `login.html?qr=` com detecção de prefixo e redirecionamento por perfil. | Arena Agent | Em revisão |
| 20/10/2026 | 2.6 | Correcao | Sessão/Mesa | Registro histórico da implementação inicial de autorização de encerramento de mesa, substituída pelo requisito de PIN individual de gerente/atendente autorizado em 23/10/2026. A RPC, o modal e os testes precisam ser adequados ao PIN. | Arena Agent | Em revisão |
| 21/10/2026 | 2.7 | Auditoria | Geral/Código, Banco e Publicação | Auditoria pós-merge PR #20: código das prioridades presente em `main`, mas o Supabase ainda não tinha a migração necessária. O fluxo de encerramento de mesa descrito nessa auditoria foi supersedido em 23/10/2026 pelo requisito de PIN individual. A migração existente precisa ser revisada antes de qualquer aplicação. | Arena Agent | Em revisão |
| 23/10/2026 | 2.8 | Alteração de Requisito | Sessão/Mesa | Definição do PIN individual de 6 dígitos como método obrigatório para autorizar o encerramento da sessão de mesa por gerente ou atendente autorizado. O PIN deve ser validado no backend, armazenado somente como hash, ter limitação de tentativas, identificar o funcionário autorizador e encerrar apenas a sessão da mesa solicitada. Código e migração ainda precisam ser adequados e testados; esta alteração documental não significa que a funcionalidade esteja implementada. | Stakeholder | Pendente |
| 23/10/2026 | 2.9 | Revisão de Requisito | Sessão/Mesa | Revisão textual integral do backlog para que o encerramento da sessão de mesa seja descrito consistentemente como autorizado por PIN individual de 6 dígitos. Referências ao método anterior permanecem apenas quando necessárias para identificar trabalho legado a substituir; não representam o requisito vigente. | Stakeholder | Pendente |
| 23/10/2026 | 3.0 | Correção pós-auditoria | Roadmap/Sessão/Mesa/Supabase | Inclusão de TASK-08 a TASK-11 para rastrear multi-sessão, QR de equipe, PIN de encerramento e QR público de demonstração; esclarecimento de que o contrato legado `p_staff_login/p_staff_senha` está supersedido; inclusão de plano para revisar `supabase-schema.md` e preparar migração corretiva proposta, sem aplicação em produção; distinção explícita entre testes simulados e validação real. | Stakeholder | Pendente |
| 23/10/2026 | 3.1 | Auditoria de Segurança | Sessão/Mesa/Supabase/Migração | Inclusão dos pontos obrigatórios de revisão da migração `20261022_neoorder_pin_encerramento_mesa.sql`: compatibilidade de assinaturas PostgreSQL/PostgREST, persistência transacional das tentativas, concorrência e bloqueio, unicidade/identificação do PIN, `SECURITY DEFINER`/`search_path`, permissões efetivas, idempotência e compatibilidade com migrações anteriores. Exige evidências SQL e testes em ambiente isolado; não autoriza merge nem aplicação em produção. | Stakeholder | Pendente |
| 23/10/2026 | 3.2 | Correção e requisito de interface | PIN/Supabase/Interface/Faturamento | Registra a corretiva PIN-only HMAC+bcrypt reportada no commit `ad00246`, com migração `20261023_neoorder_pin_only_hmac_correcao.sql` ainda não aplicada em produção; diferencia testes simulados aprovados de integração real pendente; adiciona à TASK-07 a varredura e remoção de referências internas à especificação exibidas na interface, especialmente códigos/números de recursos visíveis no faturamento. Sem merge, publicação ou alterações em produção. | Arena Agent / Stakeholder | Em revisão |
| 24/10/2026 | 3.3 | Correção prioritária | Autenticação/Logout/Supabase/QR | **Prioridade máxima 24/10 — falha crítica de autorização no logout de mesa:** `encerrar_sessao` permitia encerrar sem validar staff e `js/auth.js` fazia fallback inseguro para `encerrar_sessao` quando RPC não existia (aceitava qualquer login/senha). **Correção:** RPC `encerrar_sessao_mesa_autorizada(p_session_token_mesa,p_staff_login,p_staff_senha)` com validação contra `usuarios` (`ativo`, `tipo=funcionario`, `perfil` gerente/atendente, `crypt(p_senha, senha_hash)`), bloqueio 5/15min com `pg_advisory_xact_lock(hashtext(login))` e `RETURN jsonb` para persistir `login_tentativas`, `encerrar_sessao` endurecida para mesa `42501`, grants `SECURITY DEFINER`. Frontend remove fallback inseguro (erro explícito sem encerrar). QR Code funcionário preservado (geração/validação sem PIN). Migr. `20261024_neoorder_logout_senha_hardening.sql` preparada, **adiamento do PIN** (não implementa `pin_pepper`/`pin_hash`), **não aplicada** sem autorização. | Arena Agent | Em revisão |


---

## 3. Registro do Sprint TASK-06 & TASK-07 (Faturamento, Backup e Polimento Final) — histórico

- **Objetivo**: Concluir as tarefas finais do sistema NeoOrder, implementando a dashboard financeira exclusiva para gerentes (`faturamento.html` & `js/faturamento.js`), métricas de desempenho (faturamento, pedidos, ticket médio, pratos mais vendidos), filtros por período, exportação e importação do estado completo do banco de dados em formato JSON, e padronização da navegação em todo o sistema.
- **Arquivos criados/modificados**:
  - `backlog.md` (Atualizado com a conclusão de todas as tarefas de desenvolvimento TASK-01 a TASK-07)
  - `faturamento.html` (Interface do módulo de faturamento e backup da gerência)
  - `js/faturamento.js` (Lógica de relatórios financeiros, filtros temporais e backup JSON)
  - `styles.css` (Ajustes nos estilos globais de navegacao `.nav-links` e `.nav-link`)
  - `contas.html`, `estoque.html`, `atendimento.html` (Padronização dos links do header global)
  - `cardapio.html` (Interface do cliente para navegação no cardápio, carrinho e pedidos)
  - `js/cardapio.js` (Lógica de carrinho, validação de disponibilidade, confirmação de pedido com débito de estoque e histórico com Supabase)

---

## 4. Correções e Alterações

### 1. Correções de Conexão, Infraestrutura, Banco e Interface

#### 1.1. Infraestrutura, Schema do Banco (Supabase) e GitHub Pages
- **Revisão e Sincronização do Schema (`supabase-schema.md`):**
  - Atualização completa da documentação da estrutura de banco em `supabase-schema.md` para refletir os ajustes recentes de permissões e tipos de dados.
  - Definição explícita de UUID como valor padrão (`gen_random_uuid()`) para a coluna `id` nas tabelas `pedidos` e `pedido_itens`.
  - Atualização da coluna `telefone` na tabela `clientes` para `DROP NOT NULL` (opcional).
  - Mapeamento das regras de políticas de segurança Row Level Security (RLS) e concessões (`GRANT INSERT, SELECT, UPDATE, DELETE TO anon, authenticated`) para as tabelas `pratos`, `prato_ingredientes`, `pedidos` e `pedido_itens`.
- **Correção dos Erros 401 (Unauthorized) & RLS:** 
  - Centralização das chaves públicas (`SUPABASE_URL` e `SUPABASE_ANON_KEY`) no arquivo `js/supabase.js` e inclusão obrigatória dos cabeçalhos HTTP (`apikey` e `Authorization: Bearer <ANON_KEY>`).
  - Aplicação prática e liberação das políticas de RLS para autorizar requisições das roles `anon` e `authenticated`.
- **Ordem de Importação de Scripts:** Garantia de que a CDN do Supabase e o script `js/supabase.js` sejam carregados no topo de todas as páginas HTML antes de qualquer módulo de negócio.
- **Remoção de Dependência Local:** Eliminação do uso de arquivos `.env` para execução direta e estática via GitHub Pages.

#### 1.2. Correções de Sintaxe, Tipagem e Erros HTTP (400, 409 e 401 no JS)
- **Correção dos Erros 401 (Unauthorized no POST de `pratos` e `prato_ingredientes` em `estoque.js`):**
  - **Causa:** Ausência de autenticação/cabeçalhos adequados ou restrições de permissão RLS no Supabase ao salvar novos pratos e insumos.
  - **Solução:** Garantir que as requisições em `estoque.js` utilizem a instância autenticada do Supabase (`window.supabaseClient` / `getSupabase()`) e tratar retornos da API para evitar falhas de permissão.
- **Correção do Erro 400 (Bad Request no POST / PATCH de Pedidos):**
  - **Causa:** Envio de IDs estáticos em formato string simples (ex: `"o1032"`, `"o1001"`) para a coluna `id` da tabela `pedidos`, gerando erro de conversão de tipo (`invalid input syntax for type uuid`).
  - **Solução:** Padronização absoluta de todos os identificadores de pedidos para o formato `UUID` válido, gerados via `crypto.randomUUID()` no frontend ou deixando a geração automática a cargo da coluna no Supabase (`gen_random_uuid()`).
- **Correção do Erro 409 (Conflict no POST de `pedido_itens`):**
  - **Causa:** Tentativa de inserção de IDs manuais duplicados na tabela `pedido_itens` ou violação de chave primária/única durante o envio dos itens do carrinho.
  - **Solução:** Omissão da propriedade `id` no array de objetos do `.insert()`, permitindo que o PostgreSQL/Supabase atribua automaticamente um UUID único a cada item.
- **Correção do Erro Sintático de Redeclaração (`SyntaxError: Identifier 'db' has already been declared`):**
  - **Identificação da Falha:** Erro de análise sintática apontado na linha 1 (comentário `/**`) dos scripts `js/cardapio.js`, `js/estoque.js` e `js/faturamento.js`.
  - **Solução Técnica:** Remoção de qualquer variável local ou global com o nome `db` e padronização do acesso exclusivo às APIs do banco através da função utilitária `getSupabase()` ou da propriedade global `window.supabaseClient`.
- **Correção do Loading Infinito Pós-Login:** Ajuste no fluxo de autenticação e carregamento de dados em `js/auth.js` e nas páginas restritas (`faturamento.html`, `contas.html`, `cardapio.html`, `atendimento.html`), tratando exceções da API do Supabase para evitar o congelamento da interface.
- **Revisão de Código em `js/contas.js`:** Varredura completa para correção de erros de lógica e execução no gerenciamento de contas de mesas e funcionários.

#### 1.3. Interface, Componentes (UI/UX) e Fidelidade ao Design
- **Fidelidade ao Design (`themes/`):** Padronização visual de todas as interfaces seguindo os componentes e folhas de estilo armazenados no diretório `themes/`.
- **Sistema de Temas:** Implementação da alternância entre **Tema Claro (Light)** e **Tema Escuro (Dark)**, persistida via `localStorage`.
- **Carrinho Interativo:** Manutenção do contador de quantidade (`- 1 +`) para os itens do carrinho diretamente nas cartas do cardápio.

#### 1.4. Perfis de Acesso, Autenticação e Regras de Negócio
- **Reformulação do Login (4 Perfis):** Reestruturação do painel de login (`login.html` / `js/auth.js`) para suportar quatro perfis: Gerente, Atendente/Funcionário, Mesa e Cliente.
- **Visão do Atendente:** Restauração da tela operacional em `atendimento.html` para exibição de chamados das mesas e acompanhamento de pedidos em andamento.
- **Gerenciamento de Estoque:** Interface de controle em `estoque.html` / `js/estoque.js` para consulta e edição de insumos e pratos pelo Gerente.
- **Painel Financeiro:** Painel de relatórios em `faturamento.html` / `js/faturamento.js` restrito ao Gerente.
- **Mecanismo de Fidelidade:** Integração com a tabela `clientes` e chamada à função RPC (`identificar_cliente_fidelidade`), exibindo saldo de pontos e histórico de visitas no topo de `cardapio.html`.

#### 1.5. Regras de Documentação e Versionamento
- **Preservação da Especificação:** O arquivo `spec.md` permanece congelado (sem alterações).
- **Registro Obrigatório no Histórico:** Obrigatoriedade do registro de todas as intervenções na tabela `2. Historico de Alteracoes` do `backlog.md` a cada ciclo de desenvolvimento.

#### 1.6. Sincronização de Permissões RLS e Correção dos Endpoints HTTP (400, 401 e 409)
- **Ajuste de Permissões RLS e Upsert em `prato_ingredientes` (Erro 409 & 401):** 
  - **Problema:** A tentativa de atualização de ficha técnica gerava erro de conflito de chave primária composta (`prato_id`, `ingrediente_id`) e bloqueio RLS.
  - **Solução:** Liberação de permissões de `UPDATE` e `DELETE` no PostgreSQL/Supabase e alteração da chamada no `js/estoque.js` para utilizar `.upsert()` em vez de `.insert()`.
- **Correção da Inserção de Pedidos e Itens (`POST /pedidos` e `POST /pedido_itens` - Erros 400 e 409):**
  - **Problema:** Envio de `mesa_id` ou `id` fora do padrão UUID exigido pelo PostgreSQL em `pedidos` (400 Bad Request) e envio de `id` manual duplicado em `pedido_itens` (409 Conflict).
  - **Solução:** Validação para envio exclusivo de UUIDs válidos (via `crypto.randomUUID()`) no payload do pedido e omissão do campo `id` no array de `pedido_itens`, deixando a geração automática por conta do banco de dados (`gen_random_uuid()`).
- **Acesso Público a Contas de Mesas (`usuarios`):**
  - **Problema:** Bloqueio por RLS na consulta à tabela `usuarios` no fluxo de validação do checkout de mesa por utilizadores anónimos.
  - **Solução:** Adicionada política de leitura pública (`SELECT`) na tabela `usuarios` para registos com `tipo = 'mesa'` e `ativo = true`.
- **Correção na Gestão de Utilizadores (`js/contas.js` - Erro 400 Bad Request em `POST /usuarios`):**
  - **Problema:** Tentativa de inserção da propriedade `senha` na tabela `usuarios`, campo inexistente no esquema do banco de dados.
  - **Solução:** Remoção da propriedade `senha` das operações de `.insert()` e `.update()` no `js/contas.js`.


#### 1.15. Sistema de Atendimento Inteligente e Gestão de Mesas

**Status geral: Pendente de implementação e validação.** Os itens abaixo são requisitos atuais do NeoOrder, não funcionalidades futuras. Antes de desenvolver, comparar o código, `spec.md`, `agents.md`, `supabase-schema.md`, migrações, RPCs e o banco Supabase real. Não marcar como concluído sem testes verificáveis.

##### 1.15.1. Sincronização em Tempo Real
- Implementar sincronização em tempo real entre celulares dos clientes, tablet fixo da mesa, painel de atendimento e tela da cozinha.
- Inclusões de itens, alterações de status, cancelamentos, pagamentos, chamados e mudanças de disponibilidade devem ser propagados aos dispositivos autorizados sem depender de recarregamento manual.
- Avaliar Supabase Realtime/WebSocket de forma compatível com o modelo de segurança atual. Não reabrir leitura direta de tabelas protegidas nem criar policies RLS permissivas apenas para fazer o Realtime funcionar.
- Se necessário, implementar eventos por canais privados ou RPCs seguras, com autorização por sessão, reconexão, tratamento de eventos duplicados e atualização de estado após perda de conexão.
- A interface deve indicar estados de conexão e recuperar os dados atuais do servidor ao reconectar.

##### 1.15.2. Identificação Separada de Mesa, Sessão e Cliente
- Separar a identidade física da mesa da sessão temporária de atendimento e da identidade opcional do cliente.
- Todo pedido deve registrar de forma consistente a mesa de origem, a sessão de atendimento e, quando houver, o cliente associado, independentemente de o pedido ter sido iniciado no celular ou no tablet fixo.
- Não presumir que uma mesa corresponde a uma única pessoa ou a uma única conta de cliente. Permitir que várias pessoas participem da mesma conta, preservando a origem de cada item para pagamento dividido.
- Validar no servidor que a sessão está ativa e pertence à mesa correta antes de aceitar pedidos, chamados, pagamentos ou consultas.

##### 1.15.3. Acesso por QR Code Dinâmico e Interface Responsiva
- Criar um fluxo de acesso por QR Code dinâmico da mesa, escaneável pela câmera do celular, sem exigir instalação de aplicativo.
- O QR Code deve apontar para uma sessão/token seguro, revogável e não previsível; não usar apenas o número da mesa como credencial.
- Implementar geração, exibição, renovação e invalidação dos QR Codes conforme o ciclo de vida da mesa.
- Garantir que o cardápio, carrinho, pedidos, chamados e pagamento funcionem em celulares, tablets e computadores, em diferentes larguras de tela.
- Corrigir quebras de layout, rolagem horizontal indevida, controles inacessíveis e elementos que não se ajustam a telas pequenas.

##### 1.15.4. Pagamento por Pix e Divisão da Conta
- Integrar um provedor de pagamento Pix apropriado, com criação de cobrança, QR Code Pix dinâmico e valor exato calculado no servidor.
- Exibir o estado do pagamento e confirmar a quitação somente após validação confiável do provedor, por webhook autenticado ou mecanismo oficial equivalente. Não considerar pagamento confirmado apenas porque o cliente retornou à página.
- Permitir pagar a conta inteira, dividir o valor igualmente entre participantes ou selecionar itens específicos para cada pagante.
- Impedir que itens sejam cobrados duas vezes ou atribuídos simultaneamente a pagamentos incompatíveis. Tratar idempotência, tentativas repetidas, falhas, expiração e divergências de valor.
- Registrar transações, valores, método, estado, identificadores do provedor e horários necessários para auditoria, sem armazenar dados sensíveis desnecessários.
- Não simular confirmação de Pix nem incluir chaves ou segredos do provedor no frontend. Documentar credenciais e configuração segura necessárias à implantação.

##### 1.15.5. Pagamento Tradicional e Chamada de Funcionário
- Disponibilizar ao cliente um botão para solicitar o fechamento da conta com pagamento tradicional no estabelecimento.
- Registrar o pedido de fechamento e informar a equipe responsável, evitando solicitações duplicadas ou estados contraditórios.
- Permitir que um funcionário autorizado confirme o recebimento pelo sistema ou por fluxo de QR Code de equipe validado.
- Somente após a confirmação confiável do pagamento tradicional ou a confirmação do Pix pelo provedor, concluir o fechamento da conta e iniciar a invalidação da sessão de atendimento.
- Manter trilha de auditoria de quem confirmou, quando confirmou e qual foi o método de pagamento.

##### 1.15.6. Encerramento Seguro de Sessões e Privacidade
- **Autorização do encerramento da sessão de mesa:** exigir PIN individual de 6 dígitos de gerente ou atendente ativo e autorizado. Esse PIN é separado da senha normal de login; o fluxo não pode solicitar `p_staff_login`/`p_staff_senha` nem validar a senha de login. A autorização deve ocorrer no backend, com armazenamento seguro apenas de verificador/hash apropriado, limite de tentativas, auditoria sem PIN e encerramento exclusivo da sessão solicitada.
- Após o pagamento confirmado e o encerramento da conta, invalidar imediatamente todas as sessões temporárias de clientes associadas àquela sessão de mesa, revogando tokens no servidor.
- Bloquear novas consultas e operações com tokens expirados, revogados ou pertencentes a uma sessão encerrada, mesmo se uma página antiga continuar aberta.
- Limpar do dispositivo do cliente os dados temporários da mesa, incluindo histórico, carrinho e dados de pagamento que não precisem ser mantidos localmente.
- Se o cliente tiver entrado em sua conta pessoal de fidelidade, encerrar a associação daquela conta com a sessão da mesa e limpar os dados pessoais exibidos no dispositivo compartilhado; não encerrar indevidamente a conta pessoal em outros dispositivos sem uma regra explícita.
- Garantir que o próximo cliente não consiga ver pedidos, informações pessoais, pontos, descontos ou pagamentos do cliente anterior.

##### 1.15.7. Reinicialização e Liberação da Mesa
- Após o fechamento confirmado, permitir que o tablet fixo da mesa limpe a interface e o histórico visível da sessão anterior sem encerrar a autenticação permanente do próprio dispositivo, quando aplicável.
- Encerrar a sessão temporária anterior, revogar o QR Code/token antigo e gerar um novo QR Code para o próximo atendimento.
- Garantir que celulares que ainda estejam abertos na sessão anterior percam acesso aos dados e às operações daquela mesa.
- Implementar estados explícitos para mesa livre, sessão ativa, conta aguardando pagamento e conta encerrada, com transições validadas no servidor.
- Proteger contra reinicialização acidental de mesa com pedido ou conta ainda em aberto; exigir autorização e confirmação apropriadas para operações administrativas excepcionais.

##### 1.15.8. Entrada de Estoque por XML de NF-e
- Implementar importação de arquivo XML de NF-e para extrair dados da nota, fornecedor, produtos, unidades, quantidades, valores e informações de identificação disponíveis.
- Exibir uma prévia para conferência antes de registrar a entrada no estoque e permitir mapear produtos da nota aos insumos já cadastrados.
- Validar o XML, campos obrigatórios, unidades de medida e conversões, valores e quantidades; informar claramente os itens que não puderem ser associados.
- Prevenir a importação duplicada da mesma nota usando identificadores fiscais confiáveis e registrar o histórico da operação.
- Registrar fornecedor, número/chave da nota, data, itens, quantidades e usuário responsável, conforme o modelo de dados definido.
- Executar o lançamento de forma transacional: se houver falha, não deixar a nota parcialmente aplicada ao estoque.
- Não confiar exclusivamente nos dados enviados pelo frontend; validar novamente no servidor e não tratar o XML como prova de autenticidade fiscal além do que o sistema efetivamente verificar.

##### 1.15.9. Fichas Técnicas, Baixa de Insumos e Disponibilidade Automática
- Cada prato deve possuir uma ficha técnica que relacione os ingredientes e as quantidades necessárias por porção, incluindo unidades e conversões consistentes.
- Ao aceitar um pedido, calcular e debitar os insumos no servidor dentro da mesma transação que registra o pedido, com bloqueio/concorrência apropriados para impedir estoque negativo e vendas simultâneas acima do disponível.
- Ao cancelar um pedido, aplicar estorno de estoque de forma controlada e idempotente, conforme o estado do pedido e as regras operacionais; não estornar duas vezes.
- Recalcular a disponibilidade dos pratos afetados sempre que o estoque mudar por compra, pedido, cancelamento, ajuste manual ou importação de NF-e.
- Quando qualquer ingrediente obrigatório não tiver quantidade suficiente, desabilitar automaticamente o prato em todos os dispositivos e impedir sua compra no servidor, não apenas ocultar o botão no frontend.
- Propagar alterações de estoque e disponibilidade em tempo real para o cardápio do celular, tablet e telas operacionais.
- Exibir mensagens claras sobre indisponibilidade sem expor informações internas ou quantidades sensíveis de estoque ao cliente.

##### 1.15.10. QR Codes de Equipe e Permissões Administrativas
- Criar QR Codes de equipe para funções autorizadas, como atendente e gerente, para agilizar a autenticação conforme a política de acesso. Esse recurso é separado do PIN individual de 6 dígitos exigido para autorizar o encerramento de uma sessão de mesa; não substituir um requisito pelo outro.
- Cada QR Code deve identificar um funcionário ou uma credencial de uso controlado, ter validade/revogação, ser verificável no servidor e respeitar o perfil e as permissões associados.
- O QR Code não pode ser uma chave mestra estática e irrestrita: proteger contra cópia, reutilização indevida e escalada de privilégios. Usar expiração, rotação ou confirmação adicional conforme o risco da operação.
- Permitir somente a funcionários autorizados as operações de gerente, estornos, encerramento de sessão, liberação/reset de mesa e demais ações administrativas.
- Registrar auditoria das ações críticas, incluindo identidade/perfil, ação, alvo, data e resultado.
- Não expor segredos de assinatura ou credenciais administrativas no frontend nem em QR Codes permanentes sem proteção.

##### 1.15.11. Login Opcional por CPF e Programa de Fidelidade
- Implementar login opcional do cliente por CPF, com validação e proteção dos dados pessoais. O cliente deve conseguir pedir sem criar conta, quando isso for compatível com a política definida.
- Associar a conta pessoal do cliente à sessão da mesa apenas enquanto autorizado, mantendo a identidade do cliente separada da identidade física da mesa.
- Implementar cadastro/perfil de cliente, consulta de saldo de pontos, histórico de movimentações, acúmulo por consumo elegível já pago e resgate de recompensas/descontos conforme regras explícitas.
- Definir e documentar a regra de cálculo de pontos, validade, arredondamento, itens elegíveis, cancelamentos, estornos, limites e resgates. Não inventar taxas de conversão ou benefícios sem especificação aprovada; identificar essas decisões como configuração necessária.
- Creditar pontos apenas após confirmação do pagamento e impedir créditos duplicados por reprocessamento de eventos ou pagamentos.
- Validar saldo e resgates no servidor, de forma transacional, impedindo saldo negativo, reutilização de recompensa e manipulação pelo cliente.
- Garantir que os pontos e dados de um cliente nunca sejam expostos a outro cliente ou à sessão seguinte da mesa. Registrar auditoria dos créditos, estornos e resgates.
- Tratar CPF como dado pessoal: coletar apenas o necessário, limitar acesso, não exibi-lo integralmente sem necessidade e não gravá-lo em logs públicos ou mensagens de erro.

##### 1.15.12. Compatibilidade, Segurança e Validação Geral
- Inspecionar todos os arquivos do projeto, `spec.md`, `agents.md`, `supabase-schema.md`, migrações, funções RPC, políticas RLS, configuração Supabase e fluxo atual de autenticação antes de modificar a arquitetura.
- Conferir a compatibilidade entre frontend, schema real, funções RPC, constraints, índices, permissões e migrações. Criar migrações novas e seguras quando necessárias; não presumir que tabelas, colunas ou integrações já existem.
- Preservar a regra atual de acesso ao banco via camada RPC segura; não introduzir chamadas diretas às tabelas protegidas ou permissões públicas amplas como atalho.
- Validar erros HTTP 400, 401 e 409, além de falhas de concorrência, desconexão, pagamentos repetidos, tokens antigos, pedidos simultâneos e estoque insuficiente.
- Criar ou atualizar testes unitários, de integração e de ponta a ponta para os fluxos de QR Code, pedido, cozinha, estoque, pagamento, divisão de conta, fidelidade, fechamento, reset e reabertura da mesa.
- Atualizar `supabase-schema.md`, documentação operacional e histórico deste `backlog.md` após as alterações efetivamente realizadas.
- Não declarar uma funcionalidade concluída apenas por compilar ou por passar em testes simulados. Identificar claramente o que foi testado com banco real, sandbox de pagamento, navegador e dispositivos.
- Não alterar `spec.md` silenciosamente: se os novos requisitos ainda não estiverem documentados nele, registrar a divergência e alinhar a especificação de forma explícita antes de considerar a documentação consistente.

---

---

## 5. Sprint de Correção e Endurecimento — 18/10/2026 (v2.3)

### 5.1 Objetivo

Auditar todos os arquivos do projeto, a configuração do Supabase e o schema do banco, corrigir os problemas de **disponibilidade dos pratos**, **imagens repetidas/ausentes** e **envio de pedidos à cozinha**, diagnosticar os erros **HTTP 400, 409 e 401** e executar as tarefas pendentes. Tudo foi validado contra o banco real (`nurnxrtxdcasrjcwxvky`) antes e depois das mudanças. `spec.md` não foi alterado (regra 1.5).

### 5.2 Diagnóstico dos erros HTTP 400, 409 e 401

| Código | Onde aparecia | Causa-raiz encontrada | Correção aplicada |
|--------|---------------|-----------------------|-------------------|
| **401** | `estoque.js`, `contas.js`, `atendimento.js`, `faturamento.js` | As policies RLS eram permissivas em alguns pontos e inexistentes em outros; o front dependia do papel `anon` para tabelas protegidas. O sintoma era mascarado por consultas que engoliam o erro e caíam em dados mock. | RLS habilitada em todas as tabelas + remoção de **todas** as policies; o cliente não toca mais em tabelas, apenas em RPCs `SECURITY DEFINER` com `GRANT EXECUTE`. |
| **400** | Login e CRUD de contas | O código enviava colunas que **não existem** no schema: `usuarios.senha`, `perfil = 'cliente'`, `perfil = 'mesa'` e `motivo` (a coluna correta é `justificativa`). O PostgREST devolve 400 para coluna/valor inválido. | Contrato fechado em RPC: o front envia apenas parâmetros nomeados; o banco valida tipos, perfis e status. |
| **409** | Salvar ficha técnica e itens do pedido | `upsert` em `prato_ingredientes` sem `on_conflict` na chave composta `(prato_id, ingrediente_id)` e inserção de itens com `id` manual. | `salvar_prato` usa `ON CONFLICT (prato_id, ingrediente_id) DO UPDATE`; `criar_pedido_mesa` gera os itens no servidor. O front nunca envia `id`. |

**Achados adicionais que também causavam falha silenciosa:**

1. `auth.js` **aceitava qualquer senha**: a condição era `if (user.senha && user.senha !== passwordInput && passwordInput !== '123456')`. Como a coluna `senha` não existe, `user.senha` era sempre `undefined` e a verificação era pulada. Havia ainda um backdoor literal `'123456'` e quatro contas mock embutidas.
2. `expectedProfile` era usado apenas para escolher o redirecionamento — não impedia entrar na aba "Gerente" com uma conta de mesa.
3. Não existia gerente no banco: sem usuário com `perfil = 'gerente'`, era impossível administrar o sistema.
4. `safeSupabaseQuery(query, 2500)` devolvia `{data: null, error: null}` no timeout, e as telas então exibiam dados fictícios — o que escondia 400/401 em produção.
5. `criar_pedido_mesa` (quando existia no front) fazia **duas** requisições (pedido e itens) sem transação: se a segunda falhasse, sobrava pedido vazio; o estoque era debitado no cliente com valores lidos antes.
6. O painel de atendimento assinava `postgres_changes` em tabelas que o `anon` não podia ler — a inscrição "funcionava" sem entregar eventos.
7. `faturamento.js` somava pedidos com status `Pronto` e ignorava `entregue_em`.

### 5.3 Banco de dados (migração `20261017_neoorder_hardening.sql`)

- **15 seções, 1.800+ linhas**, idempotente, aplicada integralmente no projeto Supabase `nurnxrtxdcasrjcwxvky`.
- Novas tabelas: `sessoes_funcionario`, `login_tentativas`; novas colunas em `usuarios`: `senha_hash`, `senha_atualizada_em`, `atualizado_em`.
- Índice único `usuarios_login_lower_key` (login sem diferenciar maiúsculas).
- Status normalizados e CHECK recriado: `Recebido` → `Pendente`, `Em preparo` → `Em Preparo`; conjunto canônico `Pendente | Em Preparo | Pronto | Entregue | Cancelado`.
- **24 RPCs** de negócio + helpers internos privados (ver `supabase-schema.md`).
- RLS: 11 tabelas com RLS **ativa e zero policies**; `REVOKE ALL` de tabelas/sequences para `PUBLIC`, `anon` e `authenticated`.
- `COMMENT ON FUNCTION` documentando as regras de cada RPC.

### 5.4 Disponibilidade dos pratos

**Antes:** o front lia `dish.disponivel`, coluna que não existe em `pratos`; o valor era sempre `undefined` e a interface exibia "Disponível (∞)". Um prato sem nenhum insumo ficava eternamente disponível e um prato com estoque zerado continuava vendável.

**Depois:** `pratos_cardapio()` calcula `porcoes = MIN(FLOOR(estoque / quantidade_por_porcao))` por ficha técnica:

- com ficha e estoque zerado → `disponivel = false`, badge **Indisponível** e botão desabilitado;
- com ficha e estoque positivo → `disponivel = true` e contagem de porções no painel do gerente;
- sem ficha técnica → sempre disponível (decisão registrada: não há como calcular consumo).

Nenhuma quantidade de estoque é exposta ao cliente (RF-25).

### 5.5 Imagens

- As 5 URLs do Unsplash usadas em `app.js` e nos mocks estavam repetidas ou quebradas (404).
- Os 7 registros `Prato Teste%` não tinham imagem (`imagem` vazia).
- Foram geradas **8 imagens locais** em `assets/pratos/` (1200×900, JPEG progressivo, 145–212 KB, uma por prato do cardápio) e um `sem-imagem.svg` como fallback.
- `onerror` com fallback em todas as `<img>`; `datalist` com as imagens disponíveis no cadastro de pratos; `pratos_cardapio()` devolve o fallback quando `imagem` está vazia.
- Os 7 pratos de teste foram **removidos** (não possuíam pedidos vinculados); o cardápio agora tem exatamente **8 pratos**, todos com imagem única.

### 5.6 Envio de pedidos à cozinha

- Uma única RPC (`criar_pedido_mesa`) executa: validação do prato ativo → `FOR SHARE` no prato → `FOR UPDATE` nos insumos → verificação de estoque → débito → gravação dos itens com o preço do banco → total. Qualquer falha desfaz tudo.
- O front não envia preço nem total; não há como forjar valores.
- Mensagens de erro específicas: "Estoque insuficiente do insumo X para o prato selecionado", "Prato indisponível ou inativo", "Quantidade inválida (de 1 a 50 por item)".
- O alerta de sucesso só aparece **após** a confirmação da RPC; em erro, o carrinho é preservado para nova tentativa.

### 5.7 Autenticação, sessão e perfis

- Login por RPC com bcrypt; token de 64 caracteres, hash SHA-256 no banco, expiração de 12 h e uma sessão ativa por usuário.
- `js/auth.js` valida no cliente **e** o banco valida no servidor: a aba escolhida precisa corresponder ao perfil real (fim da escalada de privilégio).
- Bloqueio de força bruta com 5 falhas em 15 minutos. **Importante:** a primeira versão lançava exceção ao registrar a falha, o que desfazia o `INSERT` no rollback da transação e deixava o bloqueio inoperante. A função passou a **retornar** `{sucesso:false, codigo, mensagem}` para que a tentativa seja persistida; o teste com 7 tentativas confirmou o bloqueio a partir da 6ª.
- Login bem-sucedido limpa o histórico de falhas do usuário.
- Perfis reais: `mesa`, `atendente`, `gerente`. O 4º perfil "Cliente" foi removido da interface porque o CHECK de `usuarios.tipo` só aceita `mesa` e `funcionario` (e `spec.md` não define login de cliente).
- Bootstrap: `sistema_precisa_bootstrap()` + `criar_gerente_inicial()` permitem criar o primeiro gerente apenas quando não existe gerente ativo.

### 5.8 Front-end

- `js/supabase.js` virou o único ponto de acesso ao banco: `NeoAPI.callRpc`, sessão em `sessionStorage`, tradução de SQLSTATE, `NeoUI` (toasts, dinheiro, datas, badges, spinner, estado vazio) e tema.
- Removidos `safeSupabaseQuery`, `MOCK_DISHES`, contas mock e todos os fallbacks fictícios.
- `cardapio.js`: carrinho persistido por mesa, contador, envio transacional, histórico com barra de progresso e chamado de funcionário com limite de 3 por 30 min (regra do banco).
- **RF-26:** botão flutuante "Chamar Funcionário" também na landing page (`index.html`) sempre que houver sessão de mesa ativa, reaproveitando a mesma RPC de chamados.
- **RF-32:** a dashboard de faturamento abre no período **mês corrente** (antes abria em "Hoje"), mantendo os filtros de dia/semana.
- `atendimento.js`: polling de 8 s (pausa com a aba oculta), colunas Pendente/Em Preparo/Pronto, ações de avanço, cancelamento com confirmação e som consertado.
- `estoque.js`: CRUD de insumos, pratos com ficha técnica dinâmica e indicador de porções; `contas.js`: CRUD de mesas e funcionários com perfil; `faturamento.js`: período, KPIs e backup.
- `styles.css`: novos componentes (`toast`, `empty-state`, `spinner`, `order-card`, `call-card`, `qty-control`, `badge-*`, `dish-thumb`), mantendo a paleta `#E85D04/#FFF8F0/#2B2D42`, Poppins e o breakpoint único de 767 px.

### 5.9 Validação executada

| # | Verificação | Resultado |
|---|-------------|-----------|
| 1 | `pratos_cardapio()` | 8 pratos, 0 sem imagem, 8 imagens distintas |
| 2 | Login gerente/atendente/mesa (com variação de maiúsculas) | OK |
| 3 | Mesa tentando `listar_estoque` / `painel_atendimento` | bloqueado (`28000`) |
| 4 | Criar pedido (2× Risoto) | total 180,00; estoque de Cogumelo paris 4 → 3,84 |
| 5 | Fluxo Pendente → Em Preparo → Pronto → Entregue | OK, `entregue_em` gravado |
| 6 | Cancelar pedido já entregue | bloqueado (`P0001`) |
| 7 | Cancelar pedido pendente | estoque estornado (6 → 6) |
| 8 | Chamado de mesa + resolução | `atendido_em` gravado |
| 9 | Criar mesa com senha curta | bloqueado (`22023`) |
| 10 | Promover mesa a gerente | bloqueado (`22023`) |
| 11 | Criar/excluir prato e conta | OK |
| 12 | Relatório do mês | 1 pedido entregue, R$ 180,00, ticket 180,00 |
| 13 | Backup | 8 tabelas, 15 pratos e 10 usuários no momento do teste (antes da limpeza), sem hash de senha |
| 14 | `anon` lendo `pratos` / `usuarios` | `permission denied` |
| 15 | `anon` executando `pratos_cardapio` / `autenticar_usuario` | OK |
| 16 | `anon` executando `seed_dados_demo` | `permission denied` |
| 17 | Força bruta (7 tentativas) | bloqueio a partir da 6ª (`42901`) |
| 18 | Fluxo completo executado **como `anon`** (login mesa → pedido → login atendente → Em Preparo → Pronto → Entregue) | pedido 70,00 entregue, `entregue_em` gravado |
| 19 | Atendente chamando `relatorio_faturamento` | bloqueado (`42501`) |
| 20 | `npm test` (`tests/smoke.js`, jsdom + RPC simulada) | 8 cenários, nenhuma exceção |

Backup, migração e scripts foram validados por SQL; o sandbox de desenvolvimento não acessa `*.supabase.co` por HTTP, portanto o teste de interface usou um cliente simulado com o mesmo contrato das RPCs.

### 5.10 Limpeza de dados

- 7 pratos `Prato Teste%` removidos do catálogo (sem pedidos vinculados, portanto sem impacto histórico). A migração mantém, por segurança, um `UPDATE ... ativo = false` para ambientes onde esses pratos já tenham pedidos.
- 2 contas legadas (`jfpalacio29@gmail.com`, `neoorderorder@gmail.com`) estavam como `funcionario/atendente` **sem senha**, herdadas de um login social antigo; não conseguiam autenticar. Foram inativadas e podem ser reativadas com nova senha em `contas.html`.
- Pedidos, chamados e tentativas de login gerados durante os testes foram removidos; o estoque foi restaurado aos valores do seed.
- Ficou **um** pedido de demonstração — Mesa 05, 1× Pizza de 4 Queijos, R$ 70,00, status `Entregue` — justamente o que foi criado pela validação executada com o papel `anon` (o mesmo usado pelo navegador). Ele serve de evidência do fluxo completo e deixa a tela de faturamento com dados reais.
- Pasta `image-search/` (rascunhos de banco de imagens, não utilizados e com marcas d'água) removida. As imagens oficiais ficam em `assets/pratos/`.

### 5.11 Pendências conhecidas em 18/10/2026 (registro histórico; escopo atualizado na seção 1.15)

1. **Programa de fidelidade:** na data deste registro, a tabela `clientes` existia, mas o login do cliente ainda não estava definido e a interface foi removida. A implementação passa a ser requisito atual na seção 1.15.11.
2. **QR Code das mesas:** na data deste registro, as colunas `qr_code_ativo`/`qr_token_hash` estavam reservadas, sem fluxo implementado. O fluxo completo passa a ser requisito atual na seção 1.15.3 e 1.15.7. *Atualização 20/10/2026:* login por QR e gestão de QR implementados no front-end sobre as funções já existentes no banco; renovação automática por atendimento ainda pendente — ver seção 8.
3. **Backup de contas:** `backup_importar` não restaura `usuarios` de propósito (evita sobrescrever senhas e permitir escalada). Contas devem ser recriadas pelo painel.
4. **Tempo real:** na data deste registro, o painel usava polling de 8 s. A sincronização em tempo real passa a ser requisito atual na seção 1.15.1, sem reabrir leitura direta insegura das tabelas.
5. **Testes automatizados:** existe um smoke test de interface (`tests/smoke.js`, `npm test`) que valida as 8 telas contra o contrato das RPCs. Faltam testes de integração com o banco real e E2E em navegador (Playwright + Supabase local).

---

## 6. Análise Técnica de 17/10/2026 — Pendências Identificadas

> Registro histórico da análise entregue pelo stakeholder junto com o backlog v2.3 (status "Pendente").
> **Nota histórica:** a versão anterior do documento registrava esses itens como executados em 18/10/2026, com resultados descritos na **seção 5**. Esse registro histórico não substitui uma nova validação do estado atual do código e do Supabase; as prioridades atuais devem seguir os status das TASK-08 a TASK-11 e os critérios de teste real.


### 6.1. Prioridade Alta — Integridade e Funcionamento do Sistema

- **Consistência dos Status dos Pedidos:** Revisar os status utilizados no frontend e no banco de dados, garantindo compatibilidade com as restrições existentes e evitando falhas nas atualizações.
- **Correção do Registro de Chamados:** Verificar a utilização dos campos da tabela `chamados`, especialmente a correspondência entre `motivo` e `justificativa`.
- **Autenticação e Perfis de Acesso:** Revisar a validação dos perfis de Gerente, Atendente, Mesa e Cliente, garantindo compatibilidade com o esquema real do banco de dados e evitando verificações baseadas em campos inexistentes.
- **Segurança das Operações:** Revisar as políticas RLS das tabelas utilizadas pelos módulos do sistema, garantindo que cada perfil tenha somente as permissões necessárias.
- **Operações no Banco de Dados:** Avaliar a utilização das funções RPC existentes ou necessárias para operações críticas, como criação de pedidos, atualização de status, consulta de pedidos da mesa, faturamento e criação de chamados.
- **Tratamento de Erros:** Eliminar mensagens de sucesso falsas e garantir que falhas de gravação ou consulta sejam informadas corretamente ao usuário.
- **Dados Iniciais:** Verificar a existência e a consistência dos dados necessários para o funcionamento do sistema, incluindo mesas, pratos, ingredientes, estoque e fichas técnicas.

### 6.2. Prioridade Média — Funcionalidades e Experiência de Uso

- **Atualização em Tempo Real:** Verificar a configuração do Supabase Realtime e garantir a atualização dos pedidos e chamados nos módulos correspondentes.
- **Chamados de Atendimento:** Garantir que a solicitação de atendimento funcione corretamente nas telas aplicáveis e que os chamados sejam registrados e exibidos aos funcionários.
- **Faturamento:** Validar os cálculos financeiros, os filtros por período, a quantidade de pedidos, o ticket médio e os pratos mais vendidos.
- **Estoque e Cancelamentos:** Verificar a baixa de ingredientes na criação de pedidos e o estorno correspondente em cancelamentos, evitando inconsistências no estoque.
- **Navegação e Interface:** Revisar os links entre módulos, os menus e a adaptação das telas para dispositivos móveis.

### 6.3. Prioridade Baixa — Documentação e Qualidade

- **Testes de Regressão:** Criar ou atualizar testes para os principais fluxos do sistema, incluindo autenticação, disponibilidade, imagens, pedidos, chamados, estoque e faturamento.
- **Documentação Técnica:** Conferir se o `backlog.md` e o `supabase-schema.md` correspondem ao comportamento real do sistema e ao esquema atual do banco de dados.
- **Validação Final:** Executar os fluxos principais antes de registrar tarefas como concluídas, documentando os erros encontrados e as correções efetivamente validadas.
Autenticação por QR Code para gerente e atendente e suporte a múltiplas sessões simultâneas

Prioridade: Alta

Status: Pendente

Descrição:

Revisar e adequar o sistema de autenticação do NeoOrder para permitir acessos simultâneos de vários funcionários em diferentes dispositivos, com login por QR Code para os cargos de gerente e atendente. Garantir que as sessões sejam independentes e que as permissões de cada cargo sejam respeitadas no frontend e no backend.

Requisitos:

* Implementar login por QR Code para gerente e atendente, com permissões específicas para cada cargo.
* Permitir múltiplos logins simultâneos, sem desconectar automaticamente outras sessões ativas.
* Garantir que cada dispositivo possua uma sessão independente, com expiração, encerramento e revogação próprios.
* Utilizar QR Codes seguros, preferencialmente individuais por funcionário, com tokens protegidos, possibilidade de revogação e política de expiração.
* Manter separados os QR Codes de autenticação dos funcionários e os QR Codes das mesas dos clientes.
* Validar cargos e permissões no backend, sem depender exclusivamente das verificações do frontend.
* Preservar o funcionamento do login convencional, dos pedidos, do cardápio e das sessões das mesas.
* Auditar o esquema do Supabase, as tabelas, as funções RPC, as políticas RLS e as migrações para identificar incompatibilidades com a implementação atual.
* Documentar as alterações de código e as eventuais mudanças necessárias no banco de dados.

Critérios de validação:

* Gerente e atendente conseguem autenticar-se pelos respectivos QR Codes.
* As permissões administrativas são exclusivas dos usuários autorizados.
* Dois ou mais funcionários conseguem permanecer conectados em dispositivos diferentes ao mesmo tempo.
* Encerrar uma sessão não encerra as demais.
* QR Codes inválidos, expirados ou revogados são rejeitados corretamente.
* Um QR Code de mesa não concede acesso às funcionalidades administrativas.
* O login convencional continua funcionando.
* Os testes automatizados e os testes de integração são documentados, distinguindo simulações de testes realizados com o Supabase real.

Restrições e segurança:

Não realizar alterações no banco de produção, nas políticas RLS, nas funções RPC ou nas migrações aplicadas sem autorização explícita. Antes de qualquer alteração no banco, apresentar o diagnóstico de compatibilidade, o SQL proposto e os riscos para revisão. Não realizar merge da PR até a revisão e a validação dos requisitos.

Documentação:

Atualizar o histórico de alterações e o backlog com as mudanças realizadas, os testes executados, os problemas encontrados e as pendências restantes.

## 7. Responsividade e Acessibilidade — 20/10/2026 (v2.5)

### 7.1 Escopo e decisões
- Classificação das telas: **mesa** = `cardapio.html`; **gestão** = `atendimento.html`, `estoque.html`, `contas.html`, `faturamento.html`; **públicas** = `index.html` (FAB "Chamar" só com sessão de mesa) e `login.html`.
- Gestão: menu hambúrguer (botão "Menu", `aria-expanded`/`aria-controls`) abaixo de 1024 px; de 1024 a 1279 px os links ficam numa 2ª linha do cabeçalho; a partir de 1280 px, uma linha só (navegação atual).
- Mesa: barra inferior até 767 px com ícone + rótulo (Cardápio, Carrinho, Pedidos, Chamar). Ela reaproveita as ações já existentes (carrinho, histórico, chamado); as mesmas ações do cabeçalho ficam ocultas nessa faixa para não duplicar. Sem novas rotas.
- Tabelas de Contas e Estoque continuam como tabelas: abaixo de 600 px rolam dentro do contêiner (largura mínima de 600 px), sem rolagem da página; a coluna "Ações" fica fixa à direita enquanto a tabela rola.
- Nenhuma cor nova: apenas tokens já existentes. Banco, migrações, RLS, autenticação, RPC e Realtime não foram alterados.

### 7.2 Divergência registrada do `agents.md` §6
O §6 define **barra inferior no mobile** para a navegação. A barra inferior foi aplicada à interface da **mesa**; nas telas de **gestão** foi adotado o **menu hambúrguer** por decisão explícita do stakeholder (20/10/2026), pois são 4 destinos com rótulos longos mais as ações de sessão. Logo à esquerda e ações à direita foram mantidas. **Altura:** o §6 fixa 64 px; a barra mede 65 px na maior parte das telas, mas a gestão entre 1024 e 1279 px tem 105 px (links na 2ª linha) e o cabeçalho público (`index.html`) tem 113–122 px entre 320 e 390 px, onde deixa de ser fixo (`position: relative`, abaixo de 768 px) para não ocupar a tela. Divergência aceita para não cortar nem sobrepor itens; não bloqueia uso.

### 7.3 Pendência separada — contraste da paleta (não alterado)
Medido pelo `tests/responsive.mjs` (WCAG 2.x, mínimo 4,5:1 para texto normal). A paleta foi mantida por decisão do stakeholder; correção depende de nova definição de cores.
- Tema claro: `--text-muted` #8D99AE ≈ 2,7–2,9:1 (subtítulos, descrições, rodapé); texto laranja `--primary` #E85D04 sobre fundo claro ≈ 3,3–3,5:1 (preços, botões secundários — incluindo o novo botão "Menu" e "Início" —, abas ativas); badge "Disponível" ≈ 2,8:1; abas inativas ≈ 2,5:1.
- Tema escuro: badge pendente (amarelo) ≈ 1,3:1; badge indisponível ≈ 1,9:1; botão `btn-danger`/"Sair" ≈ 2,2:1; contador de chamados pendentes ≈ 2,1:1; KPI de cancelados ≈ 1,9:1.
- Componentes novos (barra inferior e painel do menu) passam no teste.

### 7.4 Outras observações
- Carrossel: intervalo atual de 6000 ms versus 5 s do RNF-06 — fora do escopo desta entrega, mantido.
- Toasts passaram para baixo do cabeçalho e não bloqueiam toques (`pointer-events: none`), mas ainda podem cobrir visualmente parte de um modal por alguns segundos.
- **Ícones antes da fonte carregar (corrigido em 20/10/2026):** com rede lenta, os spans `material-symbols-outlined` mostram o nome do ícone como texto (`table_restaurant`, `dark_mode`…) até a fonte chegar, gerando rolagem horizontal de 12 a 229 px a 320 px em todas as páginas (pior caso: cardápio). Regra global reserva 1em por ícone (`width: 1em; overflow: hidden`). `tests/responsive.mjs` passou a repetir cada página a 320 px **sem** a fonte de ícones.
- **Foco ao fechar modal após re-render (corrigido em 20/10/2026):** se a lista é redesenhada com o modal aberto (ex.: gerar QR em Contas), o botão que abriu o modal deixa de existir; o `NeoModal` agora devolve o foco ao botão equivalente (mesmo `id` ou mesmo primeiro atributo `data-*`).

## 8. QR Code das mesas — 20/10/2026

### 8.1 O que foi implementado (somente front-end)
- **Login por QR (`login.html?qr=…`):** `js/auth.js` detecta o parâmetro, retira o token da URL antes de qualquer requisição (`history.replaceState`), chama `iniciar_sessao_mesa` uma única vez (trava contra clique duplo, recarga e eventos repetidos), confere que a sessão devolvida é do tipo `mesa`, encerra uma sessão de equipe que estivesse aberta no aparelho, grava a sessão no formato existente (`neoorder_session`) e vai para `cardapio.html` com `location.replace` (o link com token não fica no histórico). Estados com mensagens amigáveis: carregando, QR inválido/desativado ou mesa indisponível (o banco responde `28000` sem distinguir o motivo, de propósito), falha de rede e erro do servidor, com "Tentar novamente" e "Entrar com usuário e senha". `<meta name="referrer" content="no-referrer">` no login. O token nunca é registrado no console.
- **Gestão (`contas.html`, só gerente):** badge "QR ativo"/"Sem QR" na coluna de status de cada mesa; modal "QR Code da mesa" com status consultado no servidor (QR ativo, sessão aberta), gerar/renovar (pede confirmação quando já há QR ativo ou sessão aberta, pois renovar encerra a sessão), QR desenhado localmente (`js/vendor/qrcode-generator.js`, MIT — o token não sai para serviços externos), destino com o token mascarado, copiar link, imprimir (só QR + nome da mesa) e desativar. O token fica apenas em memória e é descartado ao fechar o modal; por isso, para reimprimir é preciso gerar um novo.
- Login por senha e demais perfis inalterados.

### 8.2 Decisões que dependem do negócio (não alteradas — recomendação mais segura)
O mecanismo atual atende 1.15.3 só em parte: o token é seguro, não previsível e revogável manualmente, mas **não é renovado automaticamente** a cada atendimento (1.15.3/1.15.7) e **não é revogado no fechamento da conta** (1.15.6), porque o fluxo de fechamento (1.15.5) ainda não existe.
1. **QR estático / foto do QR:** quem fotografa o QR pode abrir a sessão de fora do restaurante enquanto ele não for renovado — e, como só existe uma sessão por mesa, derrubar a sessão de quem está na mesa. *Recomendação:* renovar o QR no fechamento da conta (no servidor) e, enquanto isso não existir, renovar pela gestão a cada troca de cliente.
2. **Uma sessão por mesa:** cada leitura derruba o celular anterior; impede vários clientes da mesma mesa. *Recomendação:* manter até definir a regra de várias sessões por mesa junto com a divisão da conta (1.15.4).
3. **Validade:** sessão de 12 h, QR sem expiração. *Recomendação:* expirar o QR no fechamento da conta, não por tempo.
4. **Token em `?qr=`:** o front já remove o token da URL e do Referer, mas ele ainda chega ao servidor de hospedagem no primeiro acesso (logs de acesso). *Recomendação:* passar a gerar `login.html#qr=…` (fragmento não é enviado ao servidor), exigindo ajuste em `gerar_qr_code_mesa.url_relativa`.
5. **Limite de tentativas:** `iniciar_sessao_mesa` não tem limite; com 256 bits de entropia, adivinhar um token é inviável — prioridade baixa.

Qualquer um desses itens exige mudança no banco: será apresentada como SQL + impacto para aprovação antes de aplicar.

### 8.3 Divergência banco × repositório (não corrigida)
- As funções de QR existem no banco, mas não estão em `supabase/migrations/`; o histórico de migrações do projeto está vazio.
- A migração do repositório revoga `EXECUTE` de `iniciar_sessao_mesa`, mas no banco ela está liberada para `anon` (necessário para o login por QR funcionar).
- O banco tem 46 funções executáveis por `anon`; o repositório declara 24. Sincronizar às cegas pode quebrar o login por QR ou reabrir funções antigas — requer revisão função a função e aprovação.

### 8.4 Testes
- `tests/qr.test.js` (jsdom, em `npm test`): 34 cenários com respostas simuladas — sucesso, inválido, desativado/mesa inativa, rede, servidor, cliques repetidos, sessão de mesa sem acesso de equipe, login por senha, token fora da URL e dos logs, gestão por perfil.
- `tests/qr-browser.mjs` (`npm run test:qr-browser`, Chromium real): gestão gera o QR → a imagem exibida é **decodificada** (jsQR) → o link abre no "celular" em 320–1440 px → cardápio da mesa correta. Usa um simulador em Node que reproduz as regras das funções reais (hash, QR/mesa ativos, sessão única, `_exigir_gerente`). **Não** substitui um teste contra o Supabase real nem a leitura com câmera física.
- Pendente de validação manual: Supabase real, Safari/iOS, leitores de tela, leitura do QR impresso com câmera.

## 9. Múltiplas Sessões, QR de Equipe e Logout de Mesa por PIN — 20/10/2026 (v2.6; requisito atualizado em 23/10/2026)

### 9.1 Objetivo
Atender as prioridades máximas do stakeholder (múltiplos acessos simultâneos, QR de gerente/atendente e autorização segura para encerrar a sessão de uma mesa) sem quebrar os fluxos existentes de cardápio, pedidos, estoque e faturamento. **Requisito vigente desde 23/10/2026:** o encerramento da sessão de mesa deve ser autorizado exclusivamente por PIN individual de 6 dígitos de um gerente ou atendente autorizado. Qualquer fluxo anterior de autorização deve ser substituído no código e na migração pelo fluxo de PIN. Todas as mudanças de banco são propostas como migração pendente de aprovação (não aplicada automaticamente em produção).

### 9.2 Diagnóstico prévio
- **Sessões:** `autenticar_usuario` fazia `UPDATE sessoes_* SET ativa=false WHERE usuario_id = ...` a cada login, impondo 1 sessão por conta. Dois gerentes com logins diferentes já eram independentes (linhas diferentes), mas o mesmo gerente em dois tablets se desconectava no primeiro ao logar no segundo. `iniciar_sessao_mesa` e `gerar_qr_code_mesa` tinham o mesmo `UPDATE` (uma sessão por mesa), o que impedia vários celulares da mesma mesa — decisão registrada em 8.2 como “manter até definir divisão de conta”, porém incompatível com a nova prioridade de múltiplos dispositivos.
- **QR staff:** Não existia. As colunas `qr_code_ativo`/`qr_token_hash` em `usuarios` já estavam em produção (ver §8.3) mas só eram usadas para mesa. Não havia RPC para `FUNC-`, nem UI de gestão para staff.
- **Logout mesa:** `encerrar_sessao` aceitava qualquer token ativo sem validação adicional, permitindo que um cliente encerrasse a própria sessão (ou, com token vazado, a de outra mesa) sem autorização. O botão “Sair” em `cardapio.html` chamava `NeoAuth.logout()` que apenas fazia `encerrar_sessao(token)` + `clear`.

### 9.3 Mudanças aplicadas (código) e propostas (banco)

**Banco (migração `20261020_neoorder_multisession_qr_staff_logout.sql`, idempotente, não aplicada em produção sem aprovação):**
- `autenticar_usuario` recriada sem os `UPDATE ativa=false`; insere novo token preservando os anteriores.
- `gerar_qr_code_mesa` e `iniciar_sessao_mesa` recriadas sem `UPDATE sessoes_mesa` (preservam sessões existentes); contrato mantido (MESA- + 64 hex, 12 h).
- Novas RPCs: `gerar_qr_code_funcionario`, `iniciar_sessao_funcionario_qr`, `status_qr_funcionarios`, `desativar_qr_funcionario` (todas SECURITY DEFINER, EXECUTE para anon/authenticated, gerência via `_exigir_gerente`).
- **Contrato legado supersedido (não é requisito vigente):** a implementação anterior usava `encerrar_sessao_mesa_autorizada(p_session_token_mesa, p_staff_login, p_staff_senha)` e validava a senha de login do funcionário. Esse contrato não deve ser apresentado nem implantado como solução final. O contrato atual deve receber o token/identificador da sessão da mesa e o PIN de 6 dígitos (por exemplo, `p_session_token_mesa, p_pin`), ou outro contrato tecnicamente justificado após auditoria do esquema real; não exigir login/senha nesse fluxo e não presumir que o banco já aceita PIN.
- `encerrar_sessao` endurecida: se token é de mesa ativa, levanta 42501 instruindo a usar a autorizada; sessões de funcionário continuam diretas.
- Índices e colunas: `ADD COLUMN IF NOT EXISTS qr_code_ativo/qr_token_hash` + índice em `qr_token_hash` (já existiam em produção).

**Frontend:**
- `js/supabase.js`: novos métodos `encerrarSessaoMesaAutorizada`, `iniciarSessaoFuncionarioQr`, `gerarQrCodeFuncionario`, `statusQrFuncionarios`, `desativarQrFuncionario`.
- `js/auth.js`: login por QR detecta prefixo `MESA-` vs `FUNC-`; mensagem e redirecionamento por perfil (mesa→cardapio, atendente→atendimento, gerente→faturamento); `NeoAuth.logout()` para mesa abre modal de autorização (cardapio.html tem modal estático, demais páginas criam fallback dinâmico), `logoutMesaComAutorizacao` chama a nova RPC, limpa `neoorder_session` e `neoorder_cart_<mesa_id>` e redireciona.
- `contas.html` + `js/contas.js`: gestão unificada de QR (mesa e staff) com badges, `status_qr_mesas` + `status_qr_funcionarios`, modal com nota dinâmica, geração local do QR (qrcode-generator.js) e mascaramento do link.
- `cardapio.html`: atualizar o modal `logoutMesaModal` para solicitar exclusivamente o PIN individual de seis dígitos, com acessibilidade por teclado e leitor de tela.
- `tests/qr.test.js`: mock atualizado para incluir staff, cenários 10b/10j ajustados; 6a preservado (token de mesa que retorna staff deve ser recusado e encerrado).

### 9.4 Testes executados (simulados, sem Supabase real)
- `npm test` (jsdom): `smoke.js` 8 cenários OK; `qr.test.js` 34 cenários OK (inclui novos cenários de staff QR: geração, status e isolamento; geração inválida, desativado, rede, sessão não-mesa).
- Teste manual simulado legado (jsdom, sem rede): cobria uma versão anterior do encerramento autorizado de mesa. Esse teste não valida o requisito vigente de PIN e deve ser atualizado para cobrir PIN válido/inválido, funcionário identificado, tentativas excedidas e bloqueio de bypass.
- Pendente de validação com banco real: login por QR em dispositivo físico, leitura de QR impresso com câmera, Safari/iOS, leitores de tela, múltiplas sessões simultâneas no Supabase de produção e revogação efetiva após geração de novo QR.

### 9.5 Riscos e pendências restantes
- A migração ainda não foi aplicada em produção; até lá, `encerrar_sessao` direto para mesa ainda funcionará (inseguro) e `status_qr_funcionarios` retornará 42883 (tratado como indisponível, QR de staff oculto).
- QR estático: quem fotografar o QR de mesa ou staff pode reutilizar enquanto não for regenerado (recomendação: regenerar a cada troca de cliente e expirar no fechamento de conta — fluxo de fechamento ainda pendente §1.15.5).
- Sessões têm 12 h fixas; não há expiração curta para QR. Fragmento `#qr=` para evitar logs de hospedagem ainda pendente (§8.2 item 4).
- Acesso público de demonstração por QR (pendência de alta prioridade) permanece pendente, sem tarefa numerada no roadmap, conforme orientação.

## 10. Auditoria Pós-Merge — 21/10/2026 (v2.7)

### 10.1 Por que as funcionalidades não apareceram
Após o merge do PR #20 (8eaf3fe) verificou-se:

**Código:** ✅ **Presente em `main`.** `git show main` confirma: `supabase/migrations/20261020_*.sql` (640 linhas), `js/auth.js` com `FUNC-`/`MESA-` e `logoutMesaComAutorizacao`, `js/supabase.js` com 5 novas RPCs, `js/contas.js` com gestão unificada, `cardapio.html` com modal de logout, `supabase-schema.md` v2.6 e `backlog.md` §9. `git diff main..HEAD` vazio na branch de auditoria confirma que não há código faltando no repositório.

**Supabase (banco):** ❌ **Migração não aplicada.** `backlog.md` §9.5 e `supabase-schema.md` já indicavam “pendente de aplicação em produção”. Ao chamar `status_qr_funcionarios` ou `encerrar_sessao_mesa_autorizada` o PostgREST retorna `PGRST202 / 42883 Could not find function`, fazendo o frontend ocultar botões de QR de staff (antes da correção) e falhar no logout seguro. `autenticar_usuario` antiga ainda invalida sessões anteriores, impedindo P1 multi-sessão. **Causa raiz:** alteração de banco requer autorização explícita (instrução do prompt), não foi aplicada automaticamente.

**Publicação (GitHub Pages):** ✅ **Built em `main`** (`gh api pages` → `status: built`, `source.branch: main`, `https://neoorder-ayjp.github.io/NeoOrder/`). O commit 8eaf3fe já está em Pages; eventual cache de CDN/navegador pode atrasar visibilidade, mas não há branch divergente.

**Conclusão:** problema não é código ausente ou revert, mas **banco desatualizado + UX que escondia funcionalidades quando RPC não existia** (interpretado como “não implementado”).

### 10.2 Correções desta PR (sem alterar banco de produção sem autorização)
- **UX resiliente:** `js/contas.js` agora exibe QR de mesa e staff sempre (mesmo quando `status_qr_*` falha), com badge `QR pendente` e botão desabilitado + tooltip “QR requer atualização do banco” e `console.warn` com código do erro, em vez de ocultar. Teste `10j` atualizado para validar esse comportamento.
- **Fallback de encerramento (histórico):** `js/auth.js` `logoutMesaComAutorizacao` detecta `PGRST202/42883` e faz fallback para `encerrar_sessao` legado com aviso de que a validação de autorização ainda não está ativa no banco. Esse fallback não satisfaz o requisito vigente de PIN e não deve ser tratado como encerramento seguro; revisar o comportamento para não apresentar uma autorização insegura como válida.
- **Documentação:** nova seção 10, histórico 2.7, e `supabase-schema.md` mantido v2.6 com nota de pendência. A migração continua **não aplicada**; seu conteúdo (idempotente) está em `supabase/migrations/20261020_*.sql` para revisão e aplicação manual via SQL Editor quando autorizada.

### 10.3 Validação pós-correção
- `npm test` → smoke 8 OK, qr 34 OK (com nova UX).
- `node tests/prioridades.test.js` → 10 OK nos testes simulados históricos (P1 multi-sessão, P2 isolamento e P3 encerramento autorizado na versão legada). **Não comprova o requisito vigente de PIN**; os testes precisam ser adaptados e executados novamente.
- Teste manual simulado histórico (jsdom, sem rede): QR de mesa válido → cardápio, QR de staff gerente → faturamento, atendente → atendimento; QR inválido/revogado → 28000 sem distinguir. A parte de encerramento desse teste pertence ao fluxo legado e **não valida o requisito atual de PIN**; precisa ser refeita após a implementação. Nenhum teste que valide apenas senha de login pode contar como teste de aceitação do logout por PIN.
- **Pendente com banco real:** aplicar migração em staging/produção, testar leitura de QR impresso com câmera, Safari/iOS, múltiplos dispositivos reais e expiração.

### 10.4 Próximos passos (requer autorização)
1. Auditar a assinatura real das RPCs e o estado de aplicação de cada migração. Tratar `20261020_neoorder_multisession_qr_staff_logout.sql` como artefato legado e revisar integralmente `supabase/migrations/20261022_neoorder_pin_encerramento_mesa.sql`. Não reescrever o histórico de migrações já aplicadas. Preparar uma migração corretiva nova, se necessária, e atualizar `supabase-schema.md` apenas para refletir o desenho verificado/proposto, distinguindo claramente estado atual e estado pretendido. Apresentar SQL, compatibilidade, riscos e plano de rollback para aprovação. Não fazer merge nem aplicar em produção.
2. Confirmar as funções de QR existentes e suas permissões no banco real, sem presumir que a contagem esperada de funções prova a correção. Comparar nomes, assinaturas, argumentos, proprietário, `EXECUTE` efetivo e estado das migrações com o repositório e `supabase-schema.md`; registrar divergências.
3. Antes de qualquer aprovação para produção, testar em banco Supabase/PostgreSQL isolado: gerar QR de gerente/atendente, validar permissões e isolamento; testar encerramento por PIN correto/incorreto, PIN ambíguo, funcionário inativo/sem permissão, limite de tentativas, chamadas diretas às RPCs, concorrência e persistência da auditoria. Testes com mocks/jsdom não contam como validação SQL real.
4. Somente após validação real em ambiente autorizado, revisão do stakeholder e aprovação explícita para as ações correspondentes, atualizar os status do roadmap. Não fazer merge, publicar tag nem aplicar a migração em produção sem autorização explícita. Não usar testes simulados como evidência de conclusão.

## 11. Requisito Atual — PIN Individual para Encerrar Sessão de Mesa (23/10/2026)

**Status em 23/10/2026: implementação reportada na branch `arena/bc7a1516-neoorder`, commit `ad00246`; validação real pendente.** A migração `20261023_neoorder_pin_only_hmac_correcao.sql` é a corretiva proposta para o fluxo PIN-only; não foi aplicada em produção. Esta seção prevalece sobre qualquer descrição anterior de autorização para encerramento de mesa por outro método.

### Comportamento esperado

- Ao solicitar o encerramento da sessão de uma mesa, pedir **somente o PIN individual de 6 dígitos** do funcionário autorizador. Não solicitar nome de usuário, login nem credenciais de acesso da conta nesse fluxo.
- O PIN deve pertencer a um gerente ou atendente ativo e autorizado. Cada funcionário deve ter seu próprio PIN; não utilizar um PIN compartilhado entre toda a equipe.
- O backend deve identificar o funcionário correspondente ao PIN, validar sua situação e suas permissões e encerrar somente a sessão da mesa especificada.
- O PIN deve ser armazenado somente por meio de um verificador criptográfico adequado a um segredo de baixa entropia, com desenho resistente a tentativa offline e proteção adicional contra tentativas online. Não presumir que SHA-256 simples é suficiente; avaliar KDF apropriada e/ou HMAC com segredo mantido exclusivamente no backend, conforme a arquitetura. Nunca armazenar PIN em texto puro, localStorage, logs ou respostas de API, nem retorná-lo pelo backend.
- Aplicar limite de tentativas, atraso/bloqueio progressivo e auditoria sem registrar o PIN. Tratar colisões de PIN: impedir PIN duplicado entre funcionários ativos ou adotar um mecanismo seguro que identifique inequivocamente o funcionário sem exigir outras credenciais nesse fluxo.
- Validar a autorização no backend/RPC; não confiar em validações do navegador. A chamada deve ser atômica e impedir que o identificador/token da mesa seja trocado para encerrar outra sessão.
- Se o PIN for inválido, estiver duplicado/ambíguo, pertencer a funcionário inativo ou não autorizado, negar a operação sem revelar qual funcionário ou PIN existe.
- O PIN é exclusivo para autorizar o encerramento da sessão de mesa. O login normal de funcionários permanece como fluxo independente, sem ser solicitado neste processo.

### Alterações técnicas necessárias

**Estado do banco:** a migração e as alterações em `supabase-schema.md` abaixo são trabalho proposto. Este backlog não comprova que qualquer migração foi aplicada, e nenhuma mudança em produção está autorizada por este documento.

- Auditar `js/auth.js`, `js/supabase.js`, `cardapio.html`, todas as RPCs relacionadas, `supabase-schema.md`, as migrações anteriores, `supabase/migrations/20261022_neoorder_pin_encerramento_mesa.sql` (versão superseded) e `supabase/migrations/20261023_neoorder_pin_only_hmac_correcao.sql` (corretiva proposta, não aplicada em produção). Inspecionar os arquivos SQL completos e suas dependências; não concluir a revisão apenas por snippets, testes de frontend ou resumo de agente.
- Substituir o contrato legado de autorização por um contrato de PIN adequado, com identificação inequívoca do funcionário. O nome final da RPC e seus parâmetros devem ser definidos após inspecionar o esquema real. Não modificar retroativamente migrações que já tenham sido aplicadas; se houver incompatibilidade, propor uma nova migração corretiva revisada.
- **Compatibilidade de assinatura PostgreSQL/PostgREST:** verificar se alguma função existente é alterada com `CREATE OR REPLACE FUNCTION` e mudança de nome de parâmetro de entrada (por exemplo, `p_staff_senha` para `p_pin`). Confirmar o comportamento na versão PostgreSQL utilizada; se a alteração não for permitida ou quebrar chamadas nomeadas do PostgREST, propor uma estratégia compatível e documentada, sem assumir que a migração executará.
- **Persistência de tentativas e transações:** comprovar que tentativas inválidas ficam gravadas mesmo quando a RPC retorna erro; uma exceção não pode provocar rollback do próprio registro de falha. Verificar todos os ramos de erro e sucesso, e se alguma exceção posterior desfaz o registro. Testar isso no PostgreSQL isolado.
- **Concorrência e bloqueio:** revisar a ordem entre bloqueio consultivo/transacional, contagem das falhas e gravação da nova tentativa; testar chamadas paralelas para confirmar que o limite de cinco falhas em quinze minutos não pode ser ultrapassado por concorrência. O controle deve ser no servidor, persistente e associado a uma identidade/chave adequada, não ao estado do navegador.
- **Identificação do funcionário e colisões de PIN:** confirmar que o mecanismo identifica exatamente um gerente/atendente ativo autorizado. Não confiar apenas na suposição de que os PINs não colidem. Definir e impor a política de unicidade/ambiguidade no backend sem exigir login ou senha de conta nesse fluxo.
- **Força do PIN:** o PIN tem somente um milhão de combinações possíveis. Avaliar o armazenamento com KDF apropriada para segredo de baixa entropia e/ou HMAC com segredo exclusivamente no backend, além de limitação de tentativas e controles contra enumeração. Não considerar bcrypt sozinho como substituto da limitação online; não usar SHA-256 simples como se eliminasse o risco de busca offline. Nunca registrar o PIN em texto puro.
- **Segurança de funções:** revisar todas as funções `SECURITY DEFINER`, `SET search_path`, qualificação de tabelas/funções, permissões para alterar objetos nos schemas envolvidos, proprietário das funções, `GRANT` e `REVOKE` efetivos para `PUBLIC`, `anon` e `authenticated`, incluindo helpers privados. Não presumir que um `REVOKE` ou `GRANT` isolado garante a permissão efetiva; conferir privilégios herdados e assinaturas exatas expostas pelo PostgREST.
- **Mensagens e enumeração:** erros de PIN inválido, PIN duplicado/ambíguo, funcionário inexistente, inativo ou sem autorização não devem permitir inferir qual funcionário ou PIN existe. Manter respostas externas consistentes quando apropriado e registrar internamente somente os dados mínimos de auditoria, nunca o PIN.
- **Unicidade de login:** confirmar no schema real a existência, definição e validade do índice único por `lower(login)` e se a seleção do funcionário depende desse índice. Não tomar a existência de um índice documentado como prova de que ele está aplicado no banco.
- **Idempotência e compatibilidade:** executar a migração desde o início em um banco isolado com schema compatível e testar a segunda execução. Verificar dependências e efeitos sobre `20261017_neoorder_hardening.sql`, `20261020_neoorder_multisession_qr_staff_logout.sql`, funções existentes, sessões simultâneas, QR Codes, pedidos, RLS e contratos usados pelo frontend. Não presumir idempotência porque há `IF NOT EXISTS` em algumas instruções.
- **Evidências obrigatórias:** apresentar trechos SQL exatos com arquivo e linha, assinaturas anteriores e propostas, consultas usadas para conferir estado/permissões, resultado de primeira e segunda execução da migração em ambiente isolado, casos de teste e limitações. Separar claramente fatos verificados, inferências e itens ainda não testados.
- Criar ou adaptar a gestão segura de PINs individuais, incluindo definição, alteração, revogação e reset conforme política aprovada, sem exibir nem recuperar o PIN existente. Se não houver regra aprovada para configuração/reset, apresentar opções e riscos antes de implementar. Avaliar expiração/rotação e definir o prazo com o stakeholder, sem inventar prazo como requisito já aprovado.
- Atualizar mensagens da interface, documentação, testes automatizados e testes de integração para deixar explícito que o PIN é o único método de autorização nesse fluxo.
- **Limite de autorização:** a migração `20261022_neoorder_pin_encerramento_mesa.sql` permanece pendente. Não aplicar SQL em produção, não alterar permissões/RLS/RPCs críticas em produção, não fazer merge e não publicar release. Primeiro entregar o relatório técnico e o plano de correção para revisão; qualquer ação posterior depende de autorização explícita.

### Critérios de aceitação

1. PIN correto de gerente autorizado encerra apenas a sessão de mesa escolhida.
2. PIN correto de atendente autorizado encerra apenas a sessão de mesa escolhida.
3. PIN incorreto, ambíguo, inativo ou sem permissão é recusado.
4. Limite de tentativas funciona e os logs não contêm PINs.
5. Chamadas diretas às RPCs não contornam a validação nem permitem encerrar outra mesa.
6. Encerrar uma sessão de mesa não afeta sessões de outros dispositivos ou mesas.
7. Testes simulados são identificados como simulados; o requisito só é concluído após teste com Supabase real em ambiente autorizado.
8. Backlog e histórico de alterações refletem o progresso real, sem declarar a funcionalidade pronta antes da validação. A revisão da migração inclui compatibilidade das assinaturas, persistência transacional das tentativas, concorrência, colisões de PIN, segurança de `SECURITY DEFINER`/`search_path`, privilégios efetivos, idempotência e compatibilidade com o schema real.

---

### TASK-11 — Acesso Público de Demonstração por QR Code

Prioridade: Alta
Status: Pendente

Objetivo: Permitir que o público conheça e visualize o sistema NeoOrder por meio de um QR Code exclusivo, sem poder realizar alterações ou executar operações.

Requisitos:

* Permitir o acesso a esse perfil exclusivamente por QR Code, sem login por senha.
* Criar um perfil específico para demonstração pública, separado dos perfis de gerente, atendente e mesa/cliente.
* Permitir somente a visualização das telas e dos dados autorizados para demonstração.
* Priorizar dados fictícios ou de demonstração, sem expor informações privadas, financeiras ou administrativas.
* Bloquear criação, edição, exclusão, envio de pedidos, alteração de status, modificação de estoque, pagamentos, estornos e operações administrativas.
* Impedir a geração de QR Codes de funcionários e qualquer tentativa de elevar as permissões do perfil público.
* Implementar as restrições no frontend, backend e Supabase, incluindo as autorizações necessárias nas RPCs e políticas RLS. Esconder botões não é suficiente.
* Utilizar um QR Code com credencial imprevisível, validade definida e possibilidade de revogação e renovação.
* Garantir que a expiração ou revogação impeça o acesso conforme a política de sessão definida.
* Manter esse acesso separado dos QR Codes de gerente, atendente e mesa.

Critérios de validação:

* O público consegue visualizar somente o conteúdo autorizado.
* Nenhuma operação de escrita pode ser executada, inclusive por chamadas diretas ao Supabase.
* Dados privados e administrativos permanecem protegidos.
* QR Codes expirados ou revogados deixam de conceder acesso.
* Os demais fluxos do sistema continuam funcionando.

Observações técnicas: Antes de implementar, analisar a autenticação, as sessões, as RPCs, as políticas RLS e o esquema atual do Supabase. Não alterar o banco de produção, políticas RLS, RPCs críticas ou migrações já aplicadas sem apresentar o plano e obter autorização explícita. Registrar as mudanças no histórico de alterações e não considerar a pendência concluída sem testes reais.


## 12. Corretiva PIN-only, validação pendente e limpeza de referências internas na interface — 23/10/2026

### 12.1 Estado informado pela branch `arena/bc7a1516-neoorder`

O relatório da Arena IA informa que o commit `ad00246` contém a implementação corretiva PIN-only, além de atualizações no backlog, schema, frontend e testes. Este registro documenta o estado reportado, não substitui revisão independente do código nem prova que a migração foi aplicada ao banco.

- Migração corretiva proposta: `supabase/migrations/20261023_neoorder_pin_only_hmac_correcao.sql`.
- Migração anterior `20261022_neoorder_pin_encerramento_mesa.sql`: manter como histórico/superseded; não editar retroativamente se já tiver sido aplicada em algum ambiente.
- Armazenamento descrito: HMAC-SHA-256 com `pin_pepper` mantido no backend e bcrypt (`bf`, custo 11) como verificador armazenado. Nunca armazenar PIN em texto puro.
- Contrato do frontend reportado: encerramento por PIN-only, com dois parâmetros (`p_session_token_mesa`, `p_pin`), sem login ou senha normal.
- Colisões: a configuração do PIN deve impedir duplicidade entre funcionários ativos; a operação de encerramento deve recusar resultado ambíguo sem revelar a identidade ou a existência de contas.
- Tentativas: o bloqueio reportado é de cinco falhas em quinze minutos, com controle de concorrência no backend. A persistência e a concorrência ainda precisam de teste real PostgreSQL/Supabase.
- Fallback: não voltar a usar `encerrar_sessao` com senha normal como substituto do PIN. Se a RPC PIN-only não estiver disponível, informar que o recurso ainda não está disponível e não apresentar o encerramento como autorizado.
- Schema/backlog: manter `supabase-schema.md` e este backlog alinhados ao código e distinguir migração proposta, migração aplicada e comportamento comprovado.

### 12.2 Resultados de teste relatados e limites

Segundo o relatório da Arena IA:

- `npm test`: smoke tests — 8 cenários aprovados; testes de QR Code — 34 cenários aprovados.
- `node tests/prioridades.test.js`: 13/13 cenários simulados aprovados.
- Os testes de prioridades usam simulações/mocks e não comprovam execução das funções SQL no Supabase real.
- Integração PostgreSQL/Supabase real, testes manuais em dispositivos, carga concorrente real e teste do plano de reversão continuam pendentes.
- O relatório informa que nenhuma migração foi aplicada em produção, nenhum merge foi feito e nenhuma publicação foi realizada. Manter essa distinção até haver evidência atualizada.

### 12.3 Verificações obrigatórias antes do merge

1. Executar a migração corretiva em um banco isolado compatível com as migrações anteriores; testar primeira e segunda execução, dependências, idempotência e rollback.
2. Verificar assinaturas exatas das RPCs, argumentos nomeados usados pelo PostgREST, privilégios efetivos, `SECURITY DEFINER`, `search_path`, `GRANT`/`REVOKE` e acesso a `pin_pepper`.
3. Provar no banco isolado que as tentativas falhas persistem, que o limite de cinco falhas em quinze minutos é resistente a concorrência e que erros não revelam existência de PIN/funcionário.
4. Testar PIN correto, incorreto, duplicado/ambíguo, funcionário inativo ou não autorizado, acesso direto às RPCs, revogação/reset de PIN e encerramento apenas da sessão solicitada.
5. Revalidar regressões de login, múltiplas sessões, QR de equipe, QR público somente leitura, cardápio, disponibilidade, imagens, pedidos à cozinha, atendimento, estoque e faturamento.
6. Rever o plano de reversão para preservar dados e PINs já cadastrados; não remover colunas, hashes ou segredos sem avaliar dependências e backup.
7. Não marcar as prioridades como concluídas até haver evidência de testes reais no ambiente autorizado. Não aplicar migrações em produção, alterar RLS/dados de produção, fazer merge ou publicar sem autorização explícita.

### 12.4 Remover referências internas à especificação visíveis na aplicação

**Status: Pendente de varredura, correção e verificação.** Foi relatado que a tela de faturamento exibe um número/identificador de recurso da especificação técnica. Referências desse tipo são internas ao desenvolvimento e não devem aparecer indevidamente para usuários da aplicação.

- Fazer uma busca completa pelo repositório por referências à especificação, incluindo `spec`, `SPEC`, números de recursos/requisitos, identificadores e frases que revelem a origem interna de uma funcionalidade.
- Inspecionar todas as páginas e componentes visíveis: faturamento, cardápio, atendimento, contas, modais, títulos, descrições, tooltips, mensagens de erro, notificações e estados vazios. Priorizar o local de faturamento onde o problema foi observado, sem limitar a busca a ele.
- Remover referências internas à especificação dos textos apresentados ao usuário. Quando necessário, substituí-las por descrições claras e naturais da função, sem perder informação operacional importante.
- Verificar se comentários, configurações, logs ou mensagens auxiliares podem ser expostos pela interface. Corrigir as ocorrências que possam chegar ao usuário.
- Preservar identificadores necessários ao código, nomes de funções, migrações e documentação técnica interna. Não apagar documentação técnica nem remover funcionalidades apenas para eliminar referências visíveis.
- Executar uma segunda busca após as correções e registrar as ocorrências encontradas, os arquivos modificados e os resultados dos testes.
- Verificar visualmente a tela de faturamento e as demais telas afetadas em desktop e em tamanhos menores. Executar testes de regressão para confirmar que textos, cálculos e funcionalidades permanecem corretos.
- Atualizar a descrição e o status da TASK-07 existente; não criar uma nova tarefa apenas para essa correção. Não marcar como concluído até a interface ser verificada.

### 12.5 Critério de conclusão

O PIN-only só pode ser considerado validado após testes de integração real em ambiente autorizado. A limpeza de referências internas só pode ser considerada concluída após busca no repositório, inspeção visual das páginas afetadas e testes de regressão. As duas atividades devem ter evidências separadas. Nenhuma instrução deste backlog autoriza alterações em produção, merge ou publicação.
