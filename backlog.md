# Backlog — Registro de Alteracoes e Tarefas de Desenvolvimento

Projeto: Sistema de Gerenciamento de Pedidos de Restaurante (NeoOrder)
Data de atualizacao: 01/10/2026

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
| **TASK-07** | **Backup e Polimento Final** | Funcionalidade de exportação e importação do estado do sistema em JSON, validação total de RLS, responsividade mobile e acessibilidade. | RF-41, RF-42, RNF-02, RNF-05, RNF-06, RNF-07 | Média | **Concluído** |

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

---

## 3. Registro do Sprint Atual: TASK-06 & TASK-07 (Faturamento, Backup e Polimento Final)

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

### 1. Infraestrutura e Conexão (Supabase & GitHub Pages)
- **Correção do Erro 401 (Unauthorized):** Centralização das chaves públicas (`SUPABASE_URL` e `SUPABASE_ANON_KEY`) no arquivo `js/supabase.js` e inclusão obrigatória dos cabeçalhos HTTP (`apikey` e `Authorization: Bearer <ANON_KEY>`) nas requisições.
- **Ordem de Importação de Scripts:** Garantia de que a CDN do Supabase e o script `js/supabase.js` sejam carregados no topo de todas as páginas HTML antes de qualquer módulo de negócio.
- **Remoção de Dependência Local:** Eliminação do uso de arquivos `.env` para execução direta e estática via GitHub Pages.

### 2. Correções de Bug, Revisão de Código e Interface (UI/UX)
- **Revisão e Correção de Bugs de Código (`contas.js` e outros):** Varredura completa e correção de erros de lógica/execução nos scripts do sistema, com foco na estabilização do `js/contas.js`.
- **Fidelidade ao Design (`themes`):** Padronização visual de todas as interfaces seguindo os componentes e folhas de estilo armazenados no diretório `themes/`.
- **Resolução de Loading Infinito:** Tratamento de erros e validação de retornos vazios no carregamento do cardápio (`cardapio.html` / `js/cardapio.js`) e do gerenciamento de contas (`contas.html` / `js/contas.js`).
- **Sistema de Temas:** Implementação do botão de alternância entre **Tema Claro (Light)** e **Tema Escuro (Dark)**, com persistência da preferência do usuário via `localStorage`.
- **Carrinho Interativo:** Implementação e manutenção do stepper de quantidade (`- 1 +`) para os itens do carrinho no cardápio.

### 3. Perfis de Acesso e Permissões
- **Reformulação do Login (4 Perfis):** Reestruturação do painel de login (`login.html` / `js/auth.js`) para suportar quatro perfis distintos: Gerente, Atendente/Funcionário, Mesa e Cliente (Fidelidade com login por Usuário/Senha e campo opcional de Telefone).
- **Visão do Atendente:** Restauração da tela operacional em `atendimento.html` para exibir os chamados ativos das mesas (com justificativas pré-definidas) e os pedidos em andamento (Pendente / Em Preparo).
- **Aba de Gerenciamento de Estoque:** Reativação/criação da interface de controle de estoque (`estoque.html` / `js/estoque.js`) para consulta e edição de insumos pelo Gerente.
- **Restauração do Faturamento:** Reativação do painel financeiro e de relatórios (`faturamento.html` / `js/faturamento.js`) restrito ao Gerente.

### 4. Sistema de Fidelidade
- **Mecanismo de Pontuação e Visitas:** Integração com a tabela `clientes` e a função RPC (`identificar_cliente_fidelidade`) no Supabase, suportando o vínculo do telefone (opcional) associado à conta do cliente.
- **Exibição no Frontend:** Exibição do saldo de pontos e do número de visitas no cabeçalho/topo do `cardapio.html` quando o cliente estiver identificado.

### 5. Regras de Documentação
- **Preservação da Especificação:** Congelamento total do arquivo `spec.md` (sem alterações).
- **Atualização Centralizada no `backlog.md`:** Registro de todas as tarefas na tabela principal e acompanhamento no histórico de alterações.
