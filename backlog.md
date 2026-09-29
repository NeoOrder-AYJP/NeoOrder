# Backlog — Registro de Alteracoes e Correcoes

Projeto: Sistema de Gerenciamento de Pedidos de Restaurante
Data de criacao: 03/09/2026

---

## Como registrar uma entrada

Cada entrada deve conter:

- Data: data da alteracao no formato DD/MM/AAAA
- Versao: versao da spec ou do sistema afetada
- Tipo: Alteracao / Correcao / Adicionado / Removido / Refatoracao
- Modulo: area afetada (ex: Landing Page, Autenticacao, Pedidos, Estoque, etc.)
- Descricao: resumo claro do que foi modificado
- Autor: quem fez a alteracao
- Status: Pendente / Em andamento / Concluido / Revertido

---

## Historico

| Data | Versao | Tipo | Modulo | Descricao | Autor | Status |
|------|--------|------|--------|-----------|-------|--------|
| 27/08/2026 | 1.0 | Adicionado | Especificacao | Criacao da especificacao inicial com requisitos funcionais, nao-funcionais, regras de negocio, modelo de dados e arquitetura. | Stakeholder | Concluido |
| 27/08/2026 | 1.0 | Adicionado | Design | Inclusao do requisito RNF-07: interface corporativa, limpa e minimalista. | Stakeholder | Concluido |
| 27/08/2026 | 1.0 | Adicionado | Design | Criacao da secao de Diretrizes de Design com paleta de cores e principios visuais. | Stakeholder | Concluido |
| 03/09/2026 | 1.1 | Refatoracao | Estrutura | Separacao da especificacao em dois documentos: spec.md (requisitos) e agents.md (diretrizes de design). Tema e cores removidos da spec. | Stakeholder | Concluido |
| 03/09/2026 | 1.1 | Adicionado | Design | Criacao do agents.md com diretrizes completas de UI/UX corporativo, limpo e minimalista: filosofia, paleta, tipografia, espacamento, componentes, navegacao, responsividade, acessibilidade, iconografia e animacoes. | Stakeholder | Concluido |
| 03/09/2026 | 1.1 | Adicionado | Gerenciamento | Criacao do backlog.md para rastreamento formal de alteracoes, correcoes e evolucoes do projeto. | Stakeholder | Concluido |

---

## Pendencias

| ID | Data | Prioridade | Modulo | Descricao | Responsavel | Prazo |
|----|------|------------|--------|-----------|-------------|-------|
| P-001 | 03/09/2026 | Alta | Landing Page | Implementar slides automaticos rotativos com destaques do cardapio. | A definir | A definir |
| P-002 | 03/09/2026 | Alta | Autenticacao | Implementar login por mesa com credenciais criadas pelo gerente. | A definir | A definir |
| P-003 | 03/09/2026 | Alta | Pedidos | Implementar carrinho, selecao de quantidades e finalizacao de pedidos. | A definir | A definir |
| P-004 | 03/09/2026 | Alta | Estoque | Implementar controle de ingredientes e calculo automatico de disponibilidade de pratos. | A definir | A definir |
| P-005 | 03/09/2026 | Alta | Chamados | Implementar botao de chamada de funcionario com justificativa e dashboard de chamados com notificacao sonora. | A definir | A definir |
| P-006 | 03/09/2026 | Alta | Faturamento | Implementar dashboard de faturamento mensal exclusiva para gerentes. | A definir | A definir |
| P-007 | 03/09/2026 | Media | Backup | Implementar exportacao e importacao de dados em JSON. | A definir | A definir |
| P-008 | 03/09/2026 | Media | Responsividade | Garantir funcionamento correto em dispositivos moveis e desktops. | A definir | A definir |

---

## Notas

- Todas as alteracoes devem ser registradas neste documento antes de serem aplicadas no codigo.
- Entradas de correcao devem incluir a referencia ao bug ou problema que motivou a mudanca.
- Decisoes arquiteturais significativas devem ser documentadas na secao de Historico com tipo "Refatoracao".
