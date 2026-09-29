# Especificação Técnica — Sistema de Gerenciamento de Pedidos de Restaurante

Versao: 1.1  
Data: 03/09/2026  
Status: Aprovado para desenvolvimento

---

## 1. Visão Geral

Sistema web responsivo para gestão de pedidos de um restaurante, com front-end em HTML5, CSS3 e JavaScript Vanilla e persistência de dados no **Supabase**, utilizando **PostgreSQL** como banco de dados. O sistema permite que clientes façam pedidos por meio de logins vinculados a mesas, visualizem disponibilidade de pratos e chamem funcionários. Funcionários (atendentes e gerentes) gerenciam pedidos, cardápio, estoque de ingredientes, contas de mesas e acompanham faturamento.

> Nota sobre persistência: Os dados do sistema são armazenados no **Supabase**, com **PostgreSQL** como banco de dados central. Dessa forma, os dados podem ser acessados e sincronizados entre os diferentes dispositivos autorizados a utilizar o sistema.

---

## 2. Atores do Sistema

| Ator | Descrição |
|------|-----------|
| Cliente (Mesa) | Usuário autenticado via login de mesa. Navega o cardápio, faz pedidos, visualiza histórico e chama funcionários. |
| Atendente | Funcionário autenticado. Atende chamados, visualiza e atualiza status de pedidos. |
| Gerente | Funcionário autenticado com permissões totais. Possui todas as permissões do atendente + gerenciamento de cardápio, estoque, contas de mesas e faturamento. |

---

## 3. Requisitos Funcionais

### Módulo: Landing Page (Pré-Login)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-01 | A landing page deve exibir uma sequência de slides automáticos e rotativos destacando pratos do cardápio. | Alta |
| RF-02 | Cada slide deve conter imagem, nome e breve descrição do prato em destaque. | Alta |
| RF-03 | A landing page deve possuir botões de acesso para "Fazer Pedido" (redireciona para login) e "Área do Funcionário" (redireciona para login de funcionário). | Alta |
| RF-04 | O cardápio completo deve estar visível na landing page com nome, descrição, preço, imagem e indicador de disponibilidade de cada prato. | Alta |

### Módulo: Autenticação e Contas

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-05 | O sistema deve possuir tela de login separada para Clientes (mesas) e Funcionários. | Alta |
| RF-06 | Cada mesa do restaurante terá um login próprio, criado exclusivamente pelo Gerente. Não haverá auto-cadastro de clientes. | Alta |
| RF-07 | O login de mesa será composto por identificador da mesa (ex: "Mesa 05") e senha definida pelo Gerente. | Alta |
| RF-08 | Funcionários devem fazer login com usuário e senha cadastrados pelo Gerente. | Alta |
| RF-09 | O sistema deve diferenciar o perfil do usuário após o login e redirecionar para a dashboard correspondente. | Alta |
| RF-10 | Gerentes devem ter acesso a uma tela de gerenciamento de contas de mesas, podendo criar, editar (nome da mesa, senha) e inativar/reativar contas. | Alta |
| RF-11 | Gerentes devem ter acesso a uma tela de gerenciamento de contas de funcionários, podendo criar, editar (nome, usuário, senha, perfil) e inativar/reativar contas. | Alta |

### Módulo: Cardápio e Pedidos

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-12 | O cliente deve visualizar o cardápio completo com nome, descrição, preço, imagem e status de disponibilidade de cada prato. | Alta |
| RF-13 | O sistema deve calcular automaticamente a disponibilidade de cada prato com base nos ingredientes necessários e na quantidade em estoque. | Alta |
| RF-14 | Pratos indisponíveis devem aparecer no cardápio com indicador visual claro (ex: cinza, badge "Indisponível") e não podem ser adicionados ao carrinho. | Alta |
| RF-15 | O cliente deve poder selecionar pratos disponíveis, definir quantidades e adicionar ao carrinho. | Alta |
| RF-16 | O cliente só pode finalizar um pedido se estiver logado com uma conta de mesa válida. | Alta |
| RF-17 | Ao confirmar um pedido, o sistema deve reduzir automaticamente do estoque a quantidade de ingredientes consumidos. | Alta |
| RF-18 | O cliente deve ter acesso a um histórico dos pedidos realizados por sua mesa, com data/hora, itens, quantidades e valor total. | Média |
| RF-19 | Funcionários devem visualizar todos os pedidos ativos em tempo real, com detalhes da mesa, itens, status e valor total. | Alta |
| RF-20 | Funcionários devem poder atualizar o status dos pedidos (ex: "Recebido", "Em preparo", "Pronto", "Entregue", "Cancelado"). | Alta |

### Módulo: Estoque

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-21 | Gerentes devem ter uma tela de controle de estoque listando todos os ingredientes com nome e quantidade atual. | Alta |
| RF-22 | Gerentes devem poder adicionar novos ingredientes ao estoque (nome, unidade de medida, quantidade inicial). | Alta |
| RF-23 | Gerentes devem poder editar a quantidade de cada ingrediente no estoque (entrada manual de reposição ou ajuste). | Alta |
| RF-24 | Ao cadastrar ou editar um prato, o Gerente deve informar quais ingredientes ele consome e em que quantidade por unidade servida. | Alta |
| RF-25 | Clientes e Atendentes não devem ter acesso à tela de estoque ou às quantidades de ingredientes. | Alta |

### Módulo: Chamados e Comunicação

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-26 | O cliente deve possuir um botão "Chamar Funcionário" visível em qualquer tela do sistema. | Alta |
| RF-27 | Ao clicar em "Chamar Funcionário", o cliente deve informar uma justificativa em campo de texto (ex: "Mesa 5 precisa de água", "Erro no pedido"). | Alta |
| RF-28 | Funcionários devem ter uma dashboard de "Chamados" listando todas as solicitações pendentes com hora, identificação da mesa e justificativa. | Alta |
| RF-29 | A dashboard de chamados deve emitir um som de notificação ao receber uma nova solicitação. | Alta |
| RF-30 | Na primeira visita à dashboard de chamados, deve haver um botão "Ativar Notificações Sonoras" para contornar a restrição de autoplay dos navegadores. | Alta |
| RF-31 | Funcionários devem poder marcar um chamado como "Atendido", removendo-o da lista de pendentes. | Média |

### Módulo: Faturamento

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-32 | O sistema deve calcular e exibir o faturamento total do mês atual em uma dashboard exclusiva para Gerentes. | Alta |
| RF-33 | A dashboard de faturamento deve permitir filtrar por período (dia, semana, mês). | Média |
| RF-34 | A dashboard deve exibir métricas como: total faturado, quantidade de pedidos, ticket médio e pratos mais vendidos. | Média |
| RF-35 | Pedidos com status "Cancelado" não devem ser considerados no cálculo de faturamento. | Alta |
| RF-36 | Atendentes e Clientes não devem ter acesso à dashboard de faturamento. | Alta |

### Módulo: Gerenciamento de Cardápio

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-37 | Gerentes devem poder adicionar novos pratos ao cardápio (nome, descrição, preço, imagem, ingredientes necessários, flag de destaque para slides). | Alta |
| RF-38 | Gerentes devem poder editar pratos existentes. | Alta |
| RF-39 | Gerentes devem poder remover pratos do cardápio. | Alta |
| RF-40 | Pratos marcados como "destaque" aparecerão nos slides da landing page. | Alta |

### Módulo: Backup e Exportação

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-41 | O Gerente deve poder exportar todos os dados do sistema (pedidos, estoque, contas, cardápio, faturamento) para um arquivo JSON. | Alta |
| RF-42 | O Gerente deve poder importar dados de um arquivo JSON previamente exportado, restaurando o estado do sistema. | Alta |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito |
|----|-----------|
| RNF-01 | A interface deve utilizar paleta de cores que remetam a gastronomia e fome: tons de laranja, vermelho, amarelo e marrom. |
| RNF-02 | O sistema deve ser totalmente responsivo, funcionando corretamente em desktops, tablets e smartphones. |
| RNF-03 | O tempo de carregamento inicial da landing page não deve exceder 3 segundos em conexão média. |
| RNF-04 | O sistema deve utilizar JavaScript no front-end e o **Supabase** como backend e camada de persistência, com **PostgreSQL** como banco de dados. |
| RNF-05 | A interface deve ser intuitiva, permitindo que um novo usuário complete um pedido em no máximo 5 interações após o login. |
| RNF-06 | Os slides da landing page devem alternar automaticamente a cada 5 segundos, com opção de navegação manual. |
| RNF-07 | A interface deve priorizar UI/UX corporativo, limpo e minimalista, com hierarquia visual clara, espaçamento generoso, tipografia legível e ausência de elementos desnecessários. |

---

## 5. Regras de Negócio

| ID | Regra |
|----|-------|
| RN-01 | Um prato só pode ser adicionado ao carrinho e pedido se estiver com status "Disponível". |
| RN-02 | A disponibilidade de um prato é calculada automaticamente: `disponível = estoque_do_ingrediente / quantidade_necessária_por_prato` para cada ingrediente. Se algum ingrediente estiver abaixo do necessário, o prato fica indisponível. |
| RN-03 | Ao confirmar um pedido, o sistema debita do estoque a quantidade de cada ingrediente multiplicada pela quantidade de pratos pedidos. |
| RN-04 | Pedidos com status "Cancelado" não entram no cálculo de faturamento e não geram débito de estoque (se o estoque já foi debitado, deve ser estornado). |
| RN-05 | Apenas usuários com perfil "Gerente" podem criar, editar e remover pratos; criar, editar e inativar contas de mesas; criar, editar e inativar contas de funcionários; visualizar faturamento; e gerenciar estoque. |
| RN-06 | Atendentes podem visualizar pedidos, atualizar status de pedidos, visualizar chamados e marcar chamados como atendidos. |
| RN-07 | Clientes (mesas) só podem visualizar o próprio histórico de pedidos e fazer novos pedidos. |
| RN-08 | O faturamento mensal é calculado como a soma do valor total de todos os pedidos finalizados (status "Entregue") dentro do período selecionado. |
| RN-09 | O ticket médio é calculado como `faturamento_total / quantidade_de_pedidos_finalizados`. |
| RN-10 | Cada mesa possui exatamente uma conta de login, criada e gerenciada pelo Gerente. |

---

## 6. Hierarquia de Permissões

| Funcionalidade | Cliente (Mesa) | Atendente | Gerente |
|----------------|----------------|-----------|---------|
| Visualizar landing page e cardápio | ✅ | ✅ | ✅ |
| Fazer pedidos | ✅ | ❌ | ❌ |
| Visualizar histórico próprio | ✅ | ❌ | ❌ |
| Chamar funcionário | ✅ | ❌ | ❌ |
| Visualizar todos os pedidos | ❌ | ✅ | ✅ |
| Atualizar status de pedidos | ❌ | ✅ | ✅ |
| Visualizar chamados | ❌ | ✅ | ✅ |
| Marcar chamado como atendido | ❌ | ✅ | ✅ |
| Gerenciar cardápio (CRUD) | ❌ | ❌ | ✅ |
| Gerenciar estoque | ❌ | ❌ | ✅ |
| Gerenciar contas de mesas | ❌ | ❌ | ✅ |
| Gerenciar contas de funcionários | ❌ | ❌ | ✅ |
| Visualizar faturamento | ❌ | ❌ | ✅ |
| Exportar/Importar dados | ❌ | ❌ | ✅ |

---

## 7. Fluxos de Tela

### 7.1 Fluxo do Cliente (Mesa)

```
Landing Page (slides + cardápio)
    ↓
Login de Mesa
    ↓
Dashboard do Cliente
    ├── Cardápio → Carrinho → Confirmação de Pedido
    ├── Meus Pedidos (histórico)
    └── Chamar Funcionário (modal com justificativa)
```

### 7.2 Fluxo do Atendente

```
Login de Funcionário
    ↓
Dashboard do Atendente
    ├── Pedidos Ativos (lista + atualização de status)
    └── Chamados (lista + marcar como atendido + notificação sonora)
```

### 7.3 Fluxo do Gerente

```
Login de Funcionário
    ↓
Dashboard do Gerente
    ├── Pedidos Ativos
    ├── Chamados
    ├── Cardápio (CRUD de pratos)
    ├── Estoque (CRUD de ingredientes)
    ├── Contas de Mesas (CRUD)
    ├── Contas de Funcionários (CRUD)
    ├── Faturamento (dashboard com filtros)
    └── Backup (exportar/importar JSON)
```

---

## 8. Modelo de Dados (Supabase / PostgreSQL)

### 8.1 Estrutura de Entidades

O banco de dados será estruturado em tabelas relacionais no **PostgreSQL do Supabase**, em vez de manter um único objeto JSON no navegador.

Principais tabelas previstas:

- `usuarios` — contas de mesas e funcionários, seus perfis e status.
- `pratos` — dados dos pratos do cardápio.
- `ingredientes` — ingredientes e quantidades disponíveis em estoque.
- `prato_ingredientes` — relação entre pratos e ingredientes, incluindo a quantidade necessária de cada ingrediente.
- `pedidos` — pedidos realizados pelas mesas, com status, valor total e datas.
- `pedido_itens` — itens pertencentes a cada pedido, com prato, quantidade e preço unitário.
- `chamados` — solicitações de atendimento feitas pelas mesas.

Os registros devem utilizar identificadores `UUID` e relacionamentos por **chaves primárias (PK)** e **chaves estrangeiras (FK)**. O Supabase será responsável pelo armazenamento e acesso aos dados, enquanto o JavaScript do front-end realizará as operações necessárias por meio da API/SDK do Supabase.

> Observação: senhas não devem ser armazenadas em texto puro. Para autenticação, deve ser utilizado o sistema de autenticação do Supabase (Supabase Auth), quando aplicável.

---

## 9. Arquitetura Técnica

| Camada | Tecnologia |
|--------|------------|
| Estrutura | HTML5 semântico |
| Estilização | CSS3 + Media Queries (responsivo) |
| Lógica | JavaScript Vanilla (ES6+) |
| Backend / Banco de dados | Supabase (PostgreSQL) |
| Ícones | Font Awesome ou SVG inline |
| Fonte | Google Fonts (sugestão: Poppins ou Roboto) |

---

## 10. Limitações Conhecidas

| Limitação | Descrição |
|---|---|
| Dependência de conexão | Como os dados ficam no Supabase, o sistema depende de conexão com a internet para consultar e atualizar o banco de dados. |
| Plano do Supabase | Os limites de armazenamento, requisições, usuários e outros recursos dependem do plano utilizado no Supabase. |
| Notificações sonoras | Navegadores bloqueiam autoplay de áudio. O som de notificação só funcionará após o usuário interagir com a página e ativar manualmente. |
| Concorrência | O banco de dados permite acesso simultâneo de diferentes dispositivos, mas operações que alteram estoque e outros dados compartilhados devem ser implementadas de forma segura para evitar inconsistências. |
| Segurança | O acesso aos dados deve ser protegido pelas políticas de segurança do Supabase, especialmente utilizando **Row Level Security (RLS)** para controlar o que cada perfil pode consultar ou alterar. |

---

## 11. Glossário

| Termo | Definição |
|-------|-----------|
| Mesa | Conta de cliente vinculada a uma mesa física do restaurante. |
| Prato | Item do cardápio que pode ser pedido pelo cliente. |
| Ingrediente | Componente necessário para preparar um prato, controlado em estoque. |
| Pedido | Conjunto de pratos solicitados por uma mesa, com valor total e status. |
| Chamado | Solicitação de atendimento feita por uma mesa aos funcionários. |
| Faturamento | Soma dos valores de pedidos finalizados em um período. |
| Ticket Médio | Valor médio gasto por pedido finalizado. |

---

## 12. Histórico de Versões

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 27/08/2026 | Especificacao inicial | Criacao do documento com todos os requisitos, regras e arquitetura. |
| 1.1 | 03/09/2026 | Refatoracao de estrutura | Separacao do design system para agents.md. Remocao da secao de tema e cores. Criacao do backlog.md. |

---

*Documento gerado com base nas decisões do stakeholder. Aprovado para início do desenvolvimento.*