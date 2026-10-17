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
| 29/09/2026 | 1.9 | Correcao | Geral/Integração | Padronização da ordem dos scripts HTML, eliminação do erro de declaração de 'db' na linha 1 em cardapio.js, estoque.js e faturamento.js, prevenção de loading infinito via safeSupabaseQuery timeout, suporte a 4 perfis de login e persistência de tema via localStorage. | Jules | Concluido |
| 29/09/2026 | 2.0 | Refatoracao | Infraestrutura/Supabase | Centralização de credenciais e cabeçalhos em js/supabase.js, substituição de IDs simples por UUIDs válidos em atendimento.js e faturamento.js (resolução de erro 400), e verificação das correções de subtópicos 1.1 a 1.5. | Jules | Concluido |
| 29/09/2026 | 2.1 | Correcao | Pedidos/Supabase | Remoção do campo 'id' na inserção de pedido_itens (resolução de erro 409 Conflict) e garantia de geração de UUID válido via crypto.randomUUID() na tabela pedidos (resolução de erro 400 Bad Request). | Jules | Concluido |
| 08/10/2026 | 2.2 | Correcao | Geral/Autenticação & HTTP | Resolução dos erros HTTP 401, 400 e 409 em estoque.js, cardapio.js, atendimento.js e faturamento.js, inclusão da função utilitária window.getSupabase(), eliminação de referências à variável 'db' e prevenção de loading infinito com tratamento de exceções no auth.js. | Jules | Concluido |
| 17/10/2026 | 2.3 | Correcao | Geral/Cardápio, Pedidos, Supabase e Responsividade | Registro das regressões de disponibilidade dos pratos, imagens repetidas, falha no envio de pedidos (400 e 409), verificação dos erros 401 e revisão da responsividade e funcionalidades pendentes. | Stakeholder | Pendente |


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

#### 1.7. Regressões de Disponibilidade, Imagens, Pedidos e Responsividade

- **Correção do Cálculo de Disponibilidade dos Pratos:**
  - **Problema:** A disponibilidade dos pratos deixou de funcionar corretamente após alterações recentes. Na tela inicial, os pratos podem aparecer como disponíveis mesmo quando não deveriam estar.
  - **Causa:** Investigar a função `calculateAvailability()`, os dados de estoque e da tabela `prato_ingredientes`, além da lógica utilizada em `app.js` para determinar a disponibilidade.
  - **Solução:** Corrigir o cálculo e garantir que a disponibilidade exibida na tela inicial e no cardápio corresponda aos dados reais do Supabase, considerando a quantidade de ingredientes necessária para preparar cada prato. Não considerar um prato disponível quando faltarem dados necessários para validar seu estoque.

- **Correção das Imagens dos Pratos:**
  - **Problema:** Após alterações recentes, vários pratos passaram a exibir a mesma imagem. Em outros casos, a interface apresenta a mensagem "Sem imagem".
  - **Causa:** Investigar as últimas Pull Requests, o carregamento das imagens, os caminhos dos arquivos e os dados associados a cada prato no banco de dados.
  - **Solução:** Restaurar as imagens corretas e garantir que cada prato utilize sua própria imagem. Implementar um tratamento adequado para imagens ausentes, sem substituir todas as imagens por uma imagem genérica. Validar o resultado na tela inicial e no cardápio completo.

- **Correção do Envio de Pedidos à Cozinha (Erros HTTP 400 e 409):**
  - **Problema:** O botão "Enviar pedido à cozinha" não registra corretamente o pedido no banco de dados. Foram observados erros HTTP 400 (Bad Request) e 409 (Conflict).
  - **Causa:** Investigar o payload enviado pelo `js/cardapio.js`, os campos obrigatórios das tabelas `pedidos` e `pedido_itens`, os UUIDs, as chaves primárias e estrangeiras, as restrições do banco e as políticas RLS.
  - **Solução:** Corrigir a criação do pedido e a inserção de seus itens de acordo com o esquema real do Supabase. Garantir que os identificadores tenham os formatos esperados e que não sejam enviados IDs duplicados ou campos inexistentes. Confirmar que o pedido seja registrado integralmente antes de apresentar uma mensagem de sucesso ao usuário.

- **Verificação dos Erros HTTP 401 (Unauthorized):**
  - **Problema:** O histórico registra a correção dos erros HTTP 401 em 08/10/2026, mas é necessário verificar se o problema foi realmente resolvido e se não voltou a ocorrer.
  - **Causa:** Investigar os cabeçalhos das requisições, as chaves do Supabase, a sessão de autenticação e as políticas RLS dos módulos afetados.
  - **Solução:** Reproduzir os fluxos de acesso e gravação de dados, identificar eventuais falhas restantes e corrigi-las. Registrar a correção como concluída somente após testes que confirmem o funcionamento.

- **Correção da Navegação e Responsividade:**
  - **Problema:** A navegação e a adaptação da interface a diferentes tamanhos de tela precisam ser revisadas para garantir uma experiência consistente.
  - **Causa:** Verificar os estilos responsivos, as regras de mídia CSS, os cabeçalhos das páginas e o comportamento dos menus em dispositivos móveis.
  - **Solução:** Padronizar a navegação entre as páginas, corrigir conflitos de CSS e garantir que menus, botões, tabelas, formulários e cards funcionem adequadamente em computadores, tablets e celulares.

- **Validação de Regressões após Pull Requests:**
  - **Problema:** Funcionalidades que estavam funcionando anteriormente apresentaram falhas após alterações recentes no projeto.
  - **Causa:** Mudanças no código podem ter afetado módulos dependentes, integrações com o Supabase ou comportamentos já implementados.
  - **Solução:** Comparar as alterações recentes com as versões anteriores que funcionavam, identificar a origem das regressões e criar testes de validação para disponibilidade, imagens, criação de pedidos, autenticação e responsividade. Evitar considerar uma funcionalidade concluída sem testar seus principais fluxos.

---

## 5. Pendências Identificadas na Análise Técnica

### 5.1. Prioridade Alta — Integridade e Funcionamento do Sistema

- **Consistência dos Status dos Pedidos:** Revisar os status utilizados no frontend e no banco de dados, garantindo compatibilidade com as restrições existentes e evitando falhas nas atualizações.
- **Correção do Registro de Chamados:** Verificar a utilização dos campos da tabela `chamados`, especialmente a correspondência entre `motivo` e `justificativa`.
- **Autenticação e Perfis de Acesso:** Revisar a validação dos perfis de Gerente, Atendente, Mesa e Cliente, garantindo compatibilidade com o esquema real do banco de dados e evitando verificações baseadas em campos inexistentes.
- **Segurança das Operações:** Revisar as políticas RLS das tabelas utilizadas pelos módulos do sistema, garantindo que cada perfil tenha somente as permissões necessárias.
- **Operações no Banco de Dados:** Avaliar a utilização das funções RPC existentes ou necessárias para operações críticas, como criação de pedidos, atualização de status, consulta de pedidos da mesa, faturamento e criação de chamados.
- **Tratamento de Erros:** Eliminar mensagens de sucesso falsas e garantir que falhas de gravação ou consulta sejam informadas corretamente ao usuário.
- **Dados Iniciais:** Verificar a existência e a consistência dos dados necessários para o funcionamento do sistema, incluindo mesas, pratos, ingredientes, estoque e fichas técnicas.

### 5.2. Prioridade Média — Funcionalidades e Experiência de Uso

- **Atualização em Tempo Real:** Verificar a configuração do Supabase Realtime e garantir a atualização dos pedidos e chamados nos módulos correspondentes.
- **Chamados de Atendimento:** Garantir que a solicitação de atendimento funcione corretamente nas telas aplicáveis e que os chamados sejam registrados e exibidos aos funcionários.
- **Faturamento:** Validar os cálculos financeiros, os filtros por período, a quantidade de pedidos, o ticket médio e os pratos mais vendidos.
- **Estoque e Cancelamentos:** Verificar a baixa de ingredientes na criação de pedidos e o estorno correspondente em cancelamentos, evitando inconsistências no estoque.
- **Navegação e Interface:** Revisar os links entre módulos, os menus e a adaptação das telas para dispositivos móveis.

### 5.3. Prioridade Baixa — Documentação e Qualidade

- **Testes de Regressão:** Criar ou atualizar testes para os principais fluxos do sistema, incluindo autenticação, disponibilidade, imagens, pedidos, chamados, estoque e faturamento.
- **Documentação Técnica:** Conferir se o `backlog.md` e o `supabase-schema.md` correspondem ao comportamento real do sistema e ao esquema atual do banco de dados.
- **Validação Final:** Executar os fluxos principais antes de registrar tarefas como concluídas, documentando os erros encontrados e as correções efetivamente validadas.
