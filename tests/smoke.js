// tests/smoke.js — Smoke test de interface com jsdom e Supabase simulado.
//
// Executa as páginas reais com os scripts locais do projeto e respostas
// fictícias no formato exato das RPCs (supabase-schema.md), verificando que
// cada tela renderiza sem exceções. Não acessa a rede.
//
// Uso: npm install && npm test

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const erros = [];

// ---------------------------------------------------------------------------
// Fixtures no contrato das RPCs
// ---------------------------------------------------------------------------

const iso = () => new Date().toISOString();

const fixture = {
  pratos_cardapio: [
    { id: 'p1', nome: 'Risoto de Cogumelos', descricao: 'Arroz arbóreo cremoso', preco: 90, imagem: 'assets/pratos/risoto-cogumelos.jpg', destaque: true, disponivel: true, porcoes: 50 },
    { id: 'p2', nome: 'Pizza de 4 Queijos', descricao: 'Massa artesanal', preco: 70, imagem: 'assets/pratos/pizza-quatro-queijos.jpg', destaque: true, disponivel: false, porcoes: 0 },
    { id: 'p3', nome: 'Prato sem foto', descricao: 'Teste de fallback', preco: 25, imagem: null, destaque: false, disponivel: true, porcoes: null }
  ],
  sistema_precisa_bootstrap: false,
  painel_atendimento: {
    chamados: [{ id: 'c1', mesa_nome: 'Mesa 02', justificativa: 'Pedir a conta', status: 'Pendente', criado_em: iso() }],
    pedidos: [
      { id: 'o1', mesa_nome: 'Mesa 01', status: 'Pendente', valor_total: 180, criado_em: iso(), itens: [{ nome: 'Risoto', quantidade: 2, preco_unitario: 90 }] },
      { id: 'o2', mesa_nome: 'Mesa 03', status: 'Em Preparo', valor_total: 70, criado_em: iso(), itens: [{ nome: 'Pizza', quantidade: 1, preco_unitario: 70 }] },
      { id: 'o3', mesa_nome: 'Mesa 04', status: 'Pronto', valor_total: 42, criado_em: iso(), itens: [{ nome: 'Burger', quantidade: 1, preco_unitario: 42 }] }
    ],
    gerado_em: iso()
  },
  listar_estoque: [
    { id: 'e1', nome: 'Arroz arbóreo', quantidade: 12.5, unidade: 'kg', atualizado_em: iso(), pratos_vinculados: 1 },
    { id: 'e2', nome: 'Cogumelo paris', quantidade: 0, unidade: 'kg', atualizado_em: iso(), pratos_vinculados: 2 }
  ],
  listar_pratos_admin: [
    { id: 'p1', nome: 'Risoto de Cogumelos', descricao: '', preco: 90, imagem: 'assets/pratos/risoto-cogumelos.jpg', destaque: true, ativo: true, disponivel: true, porcoes: 5, receita: [{ ingrediente_id: 'e1', nome: 'Arroz arbóreo', unidade: 'kg', quantidade: 0.2 }] },
    { id: 'p4', nome: 'Prato inativo', descricao: '', preco: 10, imagem: '', destaque: false, ativo: false, disponivel: false, porcoes: 0, receita: [] }
  ],
  listar_contas: [
    { id: 'u1', tipo: 'mesa', nome: 'Mesa 01', login: 'Mesa 01', perfil: 'mesa', ativo: true, criado_em: iso(), tem_senha: true },
    { id: 'u2', tipo: 'funcionario', nome: 'Gerente NeoOrder', login: 'gerente', perfil: 'gerente', ativo: true, criado_em: iso(), tem_senha: true }
  ],
  relatorio_faturamento: {
    faturamento_total: 180, qtd_pedidos: 1, ticket_medio: 180, qtd_cancelados: 0,
    pratos_mais_vendidos: [{ nome: 'Risoto de Cogumelos', quantidade: 2, receita: 180 }],
    pedidos: [{ id: 'o1', mesa_nome: 'Mesa 01', status: 'Entregue', valor_total: 180, criado_em: iso(), entregue_em: iso() }],
    periodo: {}
  },
  meus_pedidos_mesa: [
    { id: 'o1', status: 'Em Preparo', valor_total: 180, criado_em: iso(), entregue_em: null, itens: [{ prato_id: 'p1', nome: 'Risoto de Cogumelos', quantidade: 2, preco_unitario: 90 }] }
  ],
  backup_exportar: { meta: {}, tabelas: { usuarios: [], estoque: [], pratos: [] } }
};

function fakeClient() {
  return {
    rpc: async name => ({ data: name in fixture ? fixture[name] : null, error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } })
  };
}

const mesaSession = {
  usuario: { id: 'm1', nome: 'Mesa 01', login: 'Mesa 01', tipo: 'mesa', perfil: 'mesa' },
  token: 'a'.repeat(64),
  tipoSessao: 'mesa',
  expiraEm: new Date(Date.now() + 3600000).toISOString()
};

const gerenteSession = {
  usuario: { id: 'u2', nome: 'Gerente NeoOrder', login: 'gerente', tipo: 'funcionario', perfil: 'gerente' },
  token: 'b'.repeat(64),
  tipoSessao: 'funcionario',
  expiraEm: new Date(Date.now() + 3600000).toISOString()
};

// Aguarda microtarefas/MutationObservers (NeoModal, NeoNav) do jsdom.
const tick = window => new Promise(resolve => window.setTimeout(resolve, 0));

function pressionar(window, key, opts = {}) {
  const alvo = window.document.activeElement || window.document.body;
  alvo.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
}

// Verificações comuns de responsividade/acessibilidade (v2.5)
function checarAcessibilidadeBase(doc, pagina) {
  assert(doc.querySelectorAll('#btnToggleTheme').length === 1, `${pagina}: botão de tema deve ser único`);
  const icones = [...doc.querySelectorAll('.material-symbols-outlined')];
  assert(icones.length > 0 && icones.every(i => i.getAttribute('aria-hidden') === 'true'), `${pagina}: ícones de ligadura devem ter aria-hidden`);
  doc.querySelectorAll('.modal-overlay').forEach(overlay => {
    const card = overlay.querySelector('.modal-card');
    assert(card.getAttribute('role') === 'dialog' && card.getAttribute('aria-modal') === 'true', `${pagina}: #${overlay.id} sem role=dialog/aria-modal`);
    const titulo = doc.getElementById(card.getAttribute('aria-labelledby'));
    assert(titulo && titulo.textContent.trim(), `${pagina}: #${overlay.id} sem título acessível`);
    overlay.querySelectorAll('.modal-close').forEach(btn => assert(btn.getAttribute('aria-label'), `${pagina}: botão fechar sem aria-label`));
  });
}

function checarMenuGestao(window, pagina) {
  const doc = window.document;
  const toggle = doc.getElementById('btnNavToggle');
  const painel = doc.getElementById('navPanel');
  assert(doc.querySelector('.header--admin') && toggle && painel, `${pagina}: cabeçalho de gestão sem menu hambúrguer`);
  assert(toggle.getAttribute('aria-controls') === 'navPanel' && toggle.getAttribute('aria-expanded') === 'false', `${pagina}: estado inicial do menu incorreto`);
  assert(doc.querySelectorAll('.nav-links').length === 1, `${pagina}: menu de navegação duplicado`);
  const atual = doc.querySelector('.nav-link[aria-current="page"]');
  assert(atual && atual.getAttribute('href') === pagina, `${pagina}: link ativo sem aria-current`);
  toggle.focus();
  toggle.click();
  assert(painel.classList.contains('is-open') && toggle.getAttribute('aria-expanded') === 'true', `${pagina}: menu não abriu`);
  pressionar(window, 'Escape');
  assert(!painel.classList.contains('is-open') && toggle.getAttribute('aria-expanded') === 'false', `${pagina}: Esc não fechou o menu`);
  assert(doc.activeElement === toggle, `${pagina}: foco não voltou ao botão do menu`);
}

function checarTabela(doc, seletorCorpo, pagina) {
  const corpo = doc.querySelector(seletorCorpo);
  const caixa = corpo.closest('.table-container');
  assert(caixa.getAttribute('role') === 'region' && caixa.getAttribute('tabindex') === '0' && caixa.getAttribute('aria-label'), `${pagina}: contêiner da tabela não é região rolável acessível`);
  assert(corpo.closest('table').classList.contains('data-table--scroll'), `${pagina}: tabela sem data-table--scroll`);
  assert(corpo.closest('table').querySelector('th.cell-actions'), `${pagina}: cabeçalho de ações sem cell-actions`);
  corpo.querySelectorAll('tr').forEach(tr => {
    const acoes = tr.querySelector('td.cell-actions');
    assert(acoes, `${pagina}: linha sem célula de ações`);
    acoes.querySelectorAll('button').forEach(b => assert(b.getAttribute('aria-label') && !b.getAttribute('style'), `${pagina}: botão de ação sem aria-label ou com estilo inline`));
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function executarPagina(arquivo, scripts, sessao, asserts) {
  const html = fs.readFileSync(path.join(ROOT, arquivo), 'utf8');
  const semScripts = html.replace(/<script src="[^"]*"[^>]*><\/script>/g, '');

  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    if (!/navigation/i.test(e.message)) erros.push(`${arquivo}: ${e.message}`);
  });
  vc.on('error', (...args) => erros.push(`${arquivo}: console.error ${args.join(' ')}`));

  const dom = new JSDOM(semScripts, {
    url: `https://example.test/${arquivo}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });

  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.AudioContext = function () {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
    this.createOscillator = () => ({ connect() {}, start() {}, stop() {}, frequency: {}, type: '' });
    this.createGain = () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
    this.resume = () => {};
  };

  window.supabase = { createClient: fakeClient };
  window.alert = () => {};
  window.confirm = () => false;

  if (sessao) window.sessionStorage.setItem('neoorder_session', JSON.stringify(sessao));

  try {
    scripts.forEach(rel => window.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
    // jsdom dispara DOMContentLoaded de forma assíncrona após o parse.
  } catch (err) {
    erros.push(`${arquivo}: exceção ao executar scripts: ${err.stack}`);
  }

  return new Promise(resolve => {
    setTimeout(() => {
      Promise.resolve()
        .then(() => asserts(window))
        .catch(err => erros.push(`${arquivo}: assert falhou: ${err.message}`))
        .then(() => {
          dom.window.close();
          resolve();
        });
    }, 600);
  });
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

(async () => {
  await executarPagina('index.html', ['js/supabase.js', 'js/app.js'], null, window => {
    const doc = window.document;
    assert(doc.querySelectorAll('.carousel-slide').length === 2, 'carrossel deveria ter 2 destaques');
    assert(doc.querySelectorAll('#menu-grid .card-dish').length === 3, 'grid deveria ter 3 pratos');
    assert(doc.querySelectorAll('#menu-grid .badge-unavailable').length >= 1, 'prato sem estoque sem badge');
    const imgs = [...doc.querySelectorAll('#menu-grid .card-dish-img')].map(i => i.getAttribute('src'));
    assert(imgs.some(src => src === 'assets/pratos/sem-imagem.svg'), 'fallback de imagem não aplicado');
    assert(doc.getElementById('btnCallStaffGlobal').style.display === 'none', 'FAB visível sem sessão de mesa');
    checarAcessibilidadeBase(doc, 'index.html');
    const indicadores = [...doc.querySelectorAll('.carousel-indicators .indicator')];
    assert(indicadores.length === 2 && indicadores.every(i => i.tagName === 'BUTTON' && i.getAttribute('aria-label')), 'indicadores do carrossel devem ser botões com rótulo');
    assert(indicadores[0].getAttribute('aria-current') === 'true', 'indicador ativo sem aria-current');
    assert(!doc.body.classList.contains('has-fab'), 'espaço do FAB reservado sem sessão de mesa');
  });

  await executarPagina('index.html', ['js/supabase.js', 'js/app.js'], mesaSession, async window => {
    const doc = window.document;
    const fab = doc.getElementById('btnCallStaffGlobal');
    assert(fab && fab.style.display !== 'none', 'RF-26: FAB não apareceu para a mesa');
    assert(doc.body.classList.contains('has-fab'), 'FAB visível sem reservar espaço (has-fab)');
    fab.focus();
    fab.click();
    assert(doc.getElementById('callStaffGlobalModal').style.display === 'flex', 'modal de chamado não abriu');
    await tick(window);
    assert(doc.body.classList.contains('modal-open'), 'modal aberto sem travar o scroll do body');
    assert(doc.getElementById('callStaffGlobalModal').contains(doc.activeElement), 'foco não entrou no modal');
    pressionar(window, 'Escape');
    assert(doc.getElementById('callStaffGlobalModal').style.display === 'none', 'Esc não fechou o modal');
    await tick(window);
    assert(doc.activeElement === fab, 'foco não voltou ao FAB ao fechar o modal');
    assert(!doc.body.classList.contains('modal-open'), 'body continuou travado após fechar o modal');
  });

  await executarPagina('login.html', ['js/supabase.js', 'js/auth.js'], null, window => {
    const doc = window.document;
    assert(doc.getElementById('tabClientBtn') === null, 'aba Cliente deveria ter sido removida');
    assert(doc.querySelectorAll('.segmented-control .tab-btn').length === 3, 'esperava 3 abas de perfil');
    assert(!doc.querySelector('.segmented-control').getAttribute('style'), 'segmented-control do login não deve ter grade inline');
    assert(doc.querySelectorAll('.segmented-control .tab-btn[aria-pressed="true"]').length === 1, 'aba ativa sem aria-pressed');
    checarAcessibilidadeBase(doc, 'login.html');
  });

  await executarPagina('cardapio.html', ['js/supabase.js', 'js/auth.js', 'js/cardapio.js'], mesaSession, async window => {
    const doc = window.document;
    assert(doc.getElementById('mesaTitle').textContent === 'Mesa 01', 'nome da mesa não renderizado');
    assert(doc.querySelectorAll('#dishesGrid .card-dish').length === 3, 'cardápio da mesa vazio');
    assert(doc.querySelectorAll('#dishesGrid [data-add]').length === 2, 'botões de adicionar incorretos');

    doc.querySelector('[data-add]').click();
    assert(doc.getElementById('cartBadge').textContent === '1', 'badge do carrinho não atualizou');
    assert(doc.getElementById('cartTotalValue').textContent.includes('90'), 'total do carrinho incorreto');

    // Barra inferior da mesa (agents.md §6): 4 destinos, sem novas rotas
    await tick(window);
    checarAcessibilidadeBase(doc, 'cardapio.html');
    const barra = doc.querySelector('nav.bottom-nav');
    assert(barra && barra.getAttribute('aria-label'), 'barra inferior da mesa ausente');
    const rotulos = [...barra.querySelectorAll('.bottom-nav-item')].map(i => i.lastElementChild.textContent.trim());
    assert(JSON.stringify(rotulos) === JSON.stringify(['Cardápio', 'Carrinho', 'Pedidos', 'Chamar']), `rótulos da barra inferior: ${rotulos}`);
    assert([...barra.querySelectorAll('a[href]')].every(a => a.getAttribute('href').startsWith('#')), 'barra inferior não pode criar rotas');
    assert(doc.body.classList.contains('has-bottom-nav'), 'body sem reserva de espaço para a barra inferior');
    assert(doc.querySelectorAll('.header--mesa .mesa-header-action').length === 3, 'ações do cabeçalho da mesa sem classe de ocultação mobile');
    assert([...doc.querySelectorAll('[data-cart-count]')].every(el => el.textContent === '1'), 'contadores do carrinho dessincronizados');
    assert(doc.getElementById('bottomNavCart').getAttribute('aria-label') === 'Carrinho (1 item)', 'aria-label do carrinho não atualizou');
    assert(doc.querySelector('#cartItemsContainer .cart-item-total'), 'total do item sem classe cart-item-total');

    const carrinhoBtn = doc.getElementById('bottomNavCart');
    carrinhoBtn.focus();
    carrinhoBtn.click();
    assert(doc.getElementById('cartModal').style.display === 'flex', 'carrinho não abriu pela barra inferior');
    await tick(window);
    assert(doc.getElementById('cartModal').contains(doc.activeElement), 'foco não entrou no carrinho');
    pressionar(window, 'Escape');
    assert(doc.getElementById('cartModal').style.display === 'none', 'Esc não fechou o carrinho');
    await tick(window);
    assert(doc.activeElement === carrinhoBtn, 'foco não voltou ao botão Carrinho');

    doc.getElementById('bottomNavCall').click();
    assert(doc.getElementById('callStaffModal').style.display === 'flex', 'Chamar da barra inferior não abriu o modal');
    pressionar(window, 'Escape');
    await tick(window);

    doc.getElementById('bottomNavHistory').click();
    await tick(window);
    assert(doc.getElementById('historyModal').style.display === 'flex', 'Pedidos da barra inferior não abriu o histórico');
    doc.getElementById('btnOpenHistory').click();
  });

  await executarPagina('atendimento.html', ['js/supabase.js', 'js/auth.js', 'js/atendimento.js'], gerenteSession, window => {
    const doc = window.document;
    checarAcessibilidadeBase(doc, 'atendimento.html');
    checarMenuGestao(window, 'atendimento.html');
    assert(doc.querySelectorAll('#callsContainer .call-card').length === 1, 'chamados não renderizados');
    assert(doc.getElementById('badgePendingCalls').textContent.includes('1'), 'badge de chamados incorreto');
    assert(doc.querySelectorAll('#colReceived .order-card').length === 1, 'coluna Pendente vazia');
    assert(doc.querySelectorAll('#colInPrep .order-card').length === 1, 'coluna Em Preparo vazia');
    assert(doc.querySelectorAll('#colDone .order-card').length === 1, 'coluna Pronto vazia');
    assert(doc.querySelector('#colDone [data-status="Entregue"]') !== null, 'ação Entregar ausente');
  });

  await executarPagina('estoque.html', ['js/supabase.js', 'js/auth.js', 'js/estoque.js'], gerenteSession, window => {
    const doc = window.document;
    checarAcessibilidadeBase(doc, 'estoque.html');
    checarMenuGestao(window, 'estoque.html');
    assert(doc.querySelectorAll('#ingredientsTableBody tr').length === 2, 'insumos não renderizados');
    assert(doc.querySelectorAll('#dishesTableBody tr').length === 2, 'pratos não renderizados');
    assert(doc.getElementById('kpiTotalIngredientes').textContent === '2', 'KPI de insumos incorreto');
    assert(doc.getElementById('kpiAlertaIngredientes').textContent === '1', 'KPI de alerta incorreto');
    assert(doc.getElementById('kpiTotalPratos').textContent === '1', 'KPI de pratos ativos incorreto');

    doc.getElementById('btnNewDish').click();
    assert(doc.getElementById('dishModal').style.display === 'flex', 'modal de prato não abriu');
    doc.getElementById('btnAddRecipeRow').click();
    assert(doc.querySelectorAll('#recipeContainer .recipe-row').length === 1, 'linha de receita não criada');
    const linha = doc.querySelector('#recipeContainer .recipe-row');
    assert(!linha.getAttribute('style'), 'linha de receita não deve ter grade inline');
    assert([...linha.querySelectorAll('select, input, button')].every(el => el.getAttribute('aria-label')), 'campos da receita sem aria-label');
    checarTabela(doc, '#ingredientsTableBody', 'estoque.html');
    checarTabela(doc, '#dishesTableBody', 'estoque.html');
  });

  await executarPagina('contas.html', ['js/supabase.js', 'js/auth.js', 'js/contas.js'], gerenteSession, window => {
    const doc = window.document;
    checarAcessibilidadeBase(doc, 'contas.html');
    checarMenuGestao(window, 'contas.html');
    assert(doc.querySelectorAll('#accountsTableBody tr').length === 2, 'contas não renderizadas');
    checarTabela(doc, '#accountsTableBody', 'contas.html');
    assert(doc.querySelectorAll('#tabFilterClientes').length === 0, 'filtro de clientes deveria sair');
    doc.getElementById('btnNewAccount').click();
    assert(doc.getElementById('accountModal').style.display === 'flex', 'modal de conta não abriu');
    assert([...doc.getElementById('accountTipo').options].length === 2, 'tipos de conta incorretos');
  });

  await executarPagina('faturamento.html', ['js/supabase.js', 'js/auth.js', 'js/faturamento.js'], gerenteSession, window => {
    const doc = window.document;
    assert(doc.getElementById('kpiTotalRevenue').textContent.includes('180'), 'KPI de faturamento incorreto');
    assert(doc.getElementById('kpiCompletedOrders').textContent === '1', 'KPI de pedidos incorreto');
    assert(doc.querySelectorAll('#topDishesTableBody tr').length === 1, 'top pratos vazio');
    assert(doc.querySelectorAll('#salesLogTableBody tr').length === 1, 'extrato vazio');
    assert(doc.getElementById('filterMonth').classList.contains('active'), 'RF-32: mês deveria ser o filtro inicial');
    assert(doc.getElementById('filterMonth').getAttribute('aria-pressed') === 'true', 'filtro ativo sem aria-pressed');
    checarAcessibilidadeBase(doc, 'faturamento.html');
    checarMenuGestao(window, 'faturamento.html');
    const botaoImportar = doc.getElementById('btnImportJson');
    assert(botaoImportar && botaoImportar.tagName === 'BUTTON', 'Importar Backup deve ser um botão alcançável por teclado');
    let abriuSeletor = false;
    doc.getElementById('importJsonInput').click = () => { abriuSeletor = true; };
    botaoImportar.click();
    assert(abriuSeletor, 'botão Importar Backup não aciona o seletor de arquivo');
  });

  if (erros.length) {
    console.error('FALHAS:\n' + erros.map(e => ' - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('Smoke test OK — 8 cenários, nenhuma exceção de execução.');
})();
