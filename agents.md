# Agents — Diretrizes de Design do Sistema

Versao: 1.0
Data: 03/09/2026
Status: Ativo

---

## 1. Filosofia de Design

O sistema adota uma abordagem corporativa, limpa e minimalista. A interface prioriza clareza, eficiencia e consistencia visual sobre ornamentacao. Cada elemento deve ter uma funcao definida; a ausencia de distracoes visuais e um principio fundamental.

Principios orientadores:

- Hierarquia visual clara: o usuario deve identificar imediatamente o que e mais importante em cada tela.
- Espacamento generoso: margens e paddings amplos reduzem a sensacao de aglomeracao e melhoram a legibilidade.
- Tipografia legivel: uso de uma ou no maximo duas familias tipograficas, com pesos bem definidos para titulos, subtitulos e corpo.
- Ausencia de elementos desnecessarios: decoracoes puramente esteticas devem ser evitadas.
- Consistencia total: padroes de botoes, campos, cards e navegacao devem ser identicos em todas as telas.
- Feedback visual sutil: estados de hover, active e focus devem ser perceptiveis, mas nunca invasivos.

---

## 2. Paleta de Cores

A paleta remete a gastronomia e fome, aplicada de forma contida e sofisticada. Saturacao excessiva e evitada para manter o tom corporativo.

| Uso | Cor | Hex |
|-----|-----|-----|
| Primaria (fome, energia) | Laranja vibrante | E85D04 |
| Secundaria (calor) | Vermelho tomate | D00000 |
| Destaque (otimismo) | Amarelo mostarda | FFBA08 |
| Base (conforto) | Marrom terroso | 6F4E37 |
| Fundo claro | Creme | FFF8F0 |
| Texto principal | Grafite | 2B2D42 |
| Texto secundario | Cinza medio | 8D99AE |
| Sucesso | Verde | 2A9D8F |
| Erro / Indisponivel | Vermelho escuro | 9D0208 |

Regras de aplicacao:

- A cor primaria (E85D04) deve ser usada com moderacao: botoes principais de acao, indicadores de estado ativo e elementos de destaque.
- O fundo claro (FFF8F0) e o padrao para todas as telas, criando uma base quente e acolhedora sem competir com o conteudo.
- Texto principal (2B2D42) garante alto contraste em fundos claros; texto secundario (8D99AE) e reservado para legendas, metadados e informacoes de menor peso.
- Cores de erro e sucesso devem ser aplicadas exclusivamente em badges, bordas sutis ou icones, nunca como fundo de grandes areas.

---

## 3. Tipografia

Familia principal: Poppins (Google Fonts)
Familia alternativa: Roboto (Google Fonts)

| Elemento | Tamanho | Peso | Altura da linha |
|----------|---------|------|-----------------|
| Titulo de pagina (H1) | 32px | 600 | 1.2 |
| Titulo de secao (H2) | 24px | 600 | 1.3 |
| Titulo de card (H3) | 18px | 500 | 1.4 |
| Corpo de texto | 16px | 400 | 1.6 |
| Legenda / metadata | 13px | 400 | 1.5 |
| Botao primario | 15px | 500 | 1.0 |
| Input / campo de texto | 15px | 400 | 1.0 |

Regras:

- Titulos nunca devem usar peso 700 ou superior; 600 e o maximo permitido.
- Corpo de texto nunca deve ser menor que 16px em telas desktop; em mobile, o minimo e 14px.
- Espacamento entre letras (letter-spacing) deve ser neutro (0) para corpo e ligeiramente negativo (-0.5px) para titulos grandes.

---

## 4. Espacamento e Grid

O sistema utiliza uma escala de espacamento baseada em multiplos de 8px:

| Token | Valor |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |
| 2xl | 48px |
| 3xl | 64px |

Regras:

- Padding interno de cards: 24px (lg).
- Gap entre elementos de formulario: 16px (md).
- Margem entre secoes de uma pagina: 48px (2xl).
- Largura maxima do conteudo: 1200px, centralizado com margens automaticas.
- Em mobile, a largura maxima e 100% com padding lateral de 16px.

---

## 5. Componentes Visuais

### 5.1 Botoes

| Variante | Fundo | Texto | Borda | Hover |
|----------|-------|-------|-------|-------|
| Primario | E85D04 | FFF8F0 | nenhuma | escurecimento para C44A03 |
| Secundario | transparente | E85D04 | 1px solid E85D04 | fundo E85D04 com texto FFF8F0 |
| Perigo | 9D0208 | FFF8F0 | nenhuma | escurecimento para 7A0106 |
| Desabilitado | E5E5E5 | 8D99AE | nenhuma | sem alteracao |

- Raio de borda (border-radius): 8px para todos os botoes.
- Padding: 12px vertical, 24px horizontal.
- Transicao de hover: 200ms ease-in-out.

### 5.2 Campos de Entrada (Inputs)

- Fundo: FFF8F0.
- Borda: 1px solid DDD.
- Border-radius: 8px.
- Padding: 12px 16px.
- Estado focus: borda 2px solid E85D04, sem outline externo.
- Estado desabilitado: fundo F0F0F0, texto 8D99AE.

### 5.3 Cards

- Fundo: branco puro (FFFFFF).
- Borda: 1px solid EEE.
- Border-radius: 12px.
- Sombra: 0 2px 8px rgba(0, 0, 0, 0.04).
- Hover: sombra 0 4px 16px rgba(0, 0, 0, 0.08), transicao 200ms.

### 5.4 Tabelas

- Cabecalho: fundo FFF8F0, texto 2B2D42, peso 500.
- Linhas: alternancia sutil entre branco e FAF8F5.
- Bordas: 1px solid EEE entre linhas, sem bordas verticais.
- Padding de celula: 12px 16px.

### 5.5 Badges e Tags

- Border-radius: 999px (formato de pilula).
- Padding: 4px 12px.
- Tamanho de fonte: 13px.
- Variantes: disponivel (2A9D8F + branco), indisponivel (9D0208 + branco), pendente (FFBA08 + 2B2D42).

---

## 6. Navegacao e Layout

- A navegacao principal deve ser fixa no topo (desktop) ou na base (mobile).
- Altura da barra de navegacao: 64px.
- Logo ou identificador do sistema alinhado a esquerda; acoes do usuario alinhadas a direita.
- Em mobile, a navegacao deve usar icones com rotulos de texto abaixo, em uma barra inferior.
- Transicoes entre paginas: fade suave de 150ms.

---

## 7. Responsividade

| Breakpoint | Largura | Comportamento |
|------------|---------|---------------|
| Mobile | ate 767px | Layout de coluna unica, navegacao inferior, fontes reduzidas em 1 nivel |
| Tablet | 768px a 1023px | Layout de duas colunas onde aplicavel, navegacao lateral ou superior |
| Desktop | 1024px ou mais | Layout completo, navegacao superior, area de conteudo centralizada |

---

## 8. Acessibilidade

- Contraste minimo entre texto e fundo: 4.5:1 para corpo, 3:1 para elementos grandes.
- Todos os campos de formulario devem possuir label associada.
- Botoes e links devem ter area de toque minima de 44x44px em dispositivos moveis.
- Estados de foco devem ser visiveis via teclado (outline ou borda colorida).

---

## 9. Iconografia

- Conjunto: Font Awesome (versao gratuita) ou SVG inline monocromatico.
- Cor padrao: 8D99AE.
- Cor em estado ativo/destaque: E85D04.
- Tamanho padrao: 20px.
- Tamanho em botoes: 16px.
- Regra: icones devem acompanhar sempre um rotulo de texto, exceto em contextos onde o significado e universalmente reconhecido (ex: lupa para busca, X para fechar).

---

## 10. Animacoes e Transicoes

- Duracao padrao: 200ms.
- Curva de easing: ease-in-out.
- Animacoes permitidas: fade, slide suave (ate 16px), scale sutil (0.98 a 1.0).
- Animacoes proibidas: bounce, shake, rotacao, efeitos 3D, parallax.
- O sistema deve respeitar a preferencia do usuario por movimento reduzido (prefers-reduced-motion).

---

## 11. Glossario de Termos Visuais

| Termo | Definicao |
|-------|-----------|
| Hierarquia visual | Organizacao dos elementos por importancia, usando tamanho, peso e cor. |
| Espacamento generoso | Uso de margens e paddings amplos para criar respiro entre elementos. |
| Feedback sutil | Indicacao visual de interacao (hover, focus) que nao domina a atencao do usuario. |
| Saturacao contida | Uso de cores vivas com moderacao, evitando excesso de brilho ou contraste agressivo. |
