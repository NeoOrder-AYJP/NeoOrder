# Backlog — Registro de Alteracoes e Tarefas de Desenvolvimento

Projeto: Sistema de Gerenciamento de Pedidos de Restaurante (NeoOrder)
Data de atualizacao: 29/09/2026

---

## 1. Planejamento de Tarefas do Sistema (Roadmap de Desenvolvimento)

Abaixo está a quebra organizada do desenvolvimento do projeto em tarefas sequenciais, baseada nos requisitos funcionais (`spec.md`), modelo do banco de dados (`supabase-schema.md`) e diretrizes de design (`agents.md`).

| ID Tarefa | Módulo | Descrição Resumida | Requisitos Atendidos | Prioridade | Status |
|-----------|--------|---------------------|----------------------|------------|--------|
| **TASK-01** | **Landing Page** | Estrutura base HTML/CSS/JS, integração com Supabase, Hero Carousel com slides em destaque rotativos (5s) e Cardápio Completo com badges de disponibilidade e botões de login. | RF-01, RF-02, RF-03, RF-04, RNF-01 a RNF-07 | Alta | **Concluído** |
| **TASK-02** | **Autenticação e Contas** | Telas de login para Mesa e Funcionário, gerenciamento de sessões/perfil (Mesa, Atendente, Gerente) e CRUD de contas de mesas e funcionários no painel do Gerente. | RF-05, RF-06, RF-07, RF-08, RF-09, RF-10, RF-11, RN-05, RN-10 | Alta | **Concluído** |
| **TASK-03** | **Cardápio e Estoque (Gerente)** | Tela de controle de estoque de ingredientes (CRUD), cadastramento de pratos vinculando ingredientes e quantidades por porção, e cálculo automático da disponibilidade de cada prato. | RF-21, RF-22, RF-23, RF-24, RF-25, RF-37, RF-38, RF-39, RF-40, RN-02, RN-05 | Alta | **Em Andamento** |
| **TASK-04** | **Pedidos e Carrinho (Mesa)** | Seleção de pratos disponíveis, controle de quantidades, carrinho de compras, finalização de pedido com débito automático no estoque e visualização do histórico de pedidos da mesa. | RF-12, RF-13, RF-14, RF-15, RF-16, RF-17, RF-18, RN-01, RN-03, RN-07 | Alta | Pendente |
| **TASK-05** | **Atendimento e Chamados** | Botão "Chamar Funcionário" com justificativa (Mesa), dashboard de chamados com alerta sonoro e controle de autoplay (Atendente/Gerente), e acompanhamento/atualização de status dos pedidos em tempo real (com estorno em cancelamento). | RF-19, RF-20, RF-26, RF-27, RF-28, RF-29, RF-30, RF-31, RN-04, RN-06 | Alta | Pendente |
| **TASK-06** | **Faturamento (Gerente)** | Dashboard financeira exclusiva para Gerentes, filtro por período (dia, semana, mês), cálculo de total faturado, quantidade de pedidos, ticket médio e pratos mais vendidos. | RF-32, RF-33, RF-34, RF-35, RF-36, RN-04, RN-08, RN-09 | Alta | Pendente |
| **TASK-07** | **Backup e Polimento Final** | Funcionalidade de exportação e importação do estado do sistema em JSON, validação total de RLS, responsividade mobile e acessibilidade. | RF-41, RF-42, RNF-02, RNF-05, RNF-06, RNF-07 | Média | Pendente |

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
| 29/09/2026 | 1.4 | Adicionado | Estoque/Cardápio | Inicio da TASK-03 (Controle de Estoque e Cadastramento de Pratos no Cardápio para Gerente). | Jules | Em Andamento |

---

## 3. Registro do Sprint Atual: TASK-03 (Cardápio e Estoque - Gerente)

- **Objetivo**: Implementar a tela de controle de estoque de ingredientes (CRUD), cadastramento e edição de pratos no cardápio com vinculação de receitas/ingredientes por porção e cálculo automático de disponibilidade em tempo real.
- **Arquivos criados/modificados**:
  - `backlog.md` (Atualizado com status das tarefas)
  - `estoque.html` (Interface do Gerente para gestão de estoque e pratos do cardápio)
  - `js/estoque.js` (Lógica de CRUD de insumos e pratos, vinculação de ingredientes e cálculo de disponibilidade com Supabase)
