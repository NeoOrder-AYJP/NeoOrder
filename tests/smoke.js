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
      try {
        asserts(window);
      } catch (err) {
        erros.push(`${arquivo}: assert falhou: ${err.message}`);
      }
      dom.window.close();
      resolve();
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
  });

  await executarPagina('index.html', ['js/supabase.js', 'js/app.js'], mesaSession, window => {
    const doc = window.document;
    const fab = doc.getElementById('btnCallStaffGlobal');
    assert(fab && fab.style.display !== 'none', 'RF-26: FAB não apareceu para a mesa');
    fab.click();
    assert(doc.getElementById('callStaffGlobalModal').style.display === 'flex', 'modal de chamado não abriu');
  });

  await executarPagina('login.html', ['js/supabase.js', 'js/auth.js'], null, window => {
    const doc = window.document;
    assert(doc.getElementById('tabClientBtn') === null, 'aba Cliente deveria ter sido removida');
    assert(doc.querySelectorAll('.segmented-control .tab-btn').length === 3, 'esperava 3 abas de perfil');
  });

  await executarPagina('cardapio.html', ['js/supabase.js', 'js/auth.js', 'js/cardapio.js'], mesaSession, window => {
    const doc = window.document;
    assert(doc.getElementById('mesaTitle').textContent === 'Mesa 01', 'nome da mesa não renderizado');
    assert(doc.querySelectorAll('#dishesGrid .card-dish').length === 3, 'cardápio da mesa vazio');
    assert(doc.querySelectorAll('#dishesGrid [data-add]').length === 2, 'botões de adicionar incorretos');

    doc.querySelector('[data-add]').click();
    assert(doc.getElementById('cartBadge').textContent === '1', 'badge do carrinho não atualizou');
    assert(doc.getElementById('cartTotalValue').textContent.includes('90'), 'total do carrinho incorreto');

    doc.getElementById('btnOpenHistory').click();
  });

  await executarPagina('atendimento.html', ['js/supabase.js', 'js/auth.js', 'js/atendimento.js'], gerenteSession, window => {
    const doc = window.document;
    assert(doc.querySelectorAll('#callsContainer .call-card').length === 1, 'chamados não renderizados');
    assert(doc.getElementById('badgePendingCalls').textContent.includes('1'), 'badge de chamados incorreto');
    assert(doc.querySelectorAll('#colReceived .order-card').length === 1, 'coluna Pendente vazia');
    assert(doc.querySelectorAll('#colInPrep .order-card').length === 1, 'coluna Em Preparo vazia');
    assert(doc.querySelectorAll('#colDone .order-card').length === 1, 'coluna Pronto vazia');
    assert(doc.querySelector('#colDone [data-status="Entregue"]') !== null, 'ação Entregar ausente');
  });

  await executarPagina('estoque.html', ['js/supabase.js', 'js/auth.js', 'js/estoque.js'], gerenteSession, window => {
    const doc = window.document;
    assert(doc.querySelectorAll('#ingredientsTableBody tr').length === 2, 'insumos não renderizados');
    assert(doc.querySelectorAll('#dishesTableBody tr').length === 2, 'pratos não renderizados');
    assert(doc.getElementById('kpiTotalIngredientes').textContent === '2', 'KPI de insumos incorreto');
    assert(doc.getElementById('kpiAlertaIngredientes').textContent === '1', 'KPI de alerta incorreto');
    assert(doc.getElementById('kpiTotalPratos').textContent === '1', 'KPI de pratos ativos incorreto');

    doc.getElementById('btnNewDish').click();
    assert(doc.getElementById('dishModal').style.display === 'flex', 'modal de prato não abriu');
    doc.getElementById('btnAddRecipeRow').click();
    assert(doc.querySelectorAll('#recipeContainer .recipe-row').length === 1, 'linha de receita não criada');
  });

  await executarPagina('contas.html', ['js/supabase.js', 'js/auth.js', 'js/contas.js'], gerenteSession, window => {
    const doc = window.document;
    assert(doc.querySelectorAll('#accountsTableBody tr').length === 2, 'contas não renderizadas');
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
  });

  if (erros.length) {
    console.error('FALHAS:\n' + erros.map(e => ' - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('Smoke test OK — 8 cenários, nenhuma exceção de execução.');
})();
