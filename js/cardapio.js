// js/cardapio.js — Pedidos da mesa (cardápio.html)
//
// Fluxo: pratos_cardapio() → carrinho local → criar_pedido_mesa().
// O banco valida estoque, preço e disponibilidade dentro de uma transação.

(function () {
  const PLACEHOLDER = 'assets/pratos/sem-imagem.svg';
  const CART_PREFIX = 'neoorder_cart_';

  let user = null;
  let token = null;
  let pratos = [];
  let carrinho = [];
  let filtro = 'todos';
  let busca = '';

  document.addEventListener('DOMContentLoaded', async () => {
    user = window.NeoAuth.requireAuth(['mesa']);
    if (!user) return;

    token = window.NeoAuth.getToken();

    const mesaTitle = document.getElementById('mesaTitle');
    if (mesaTitle) mesaTitle.textContent = user.nome || 'Mesa';

    carrinho = carregarCarrinho();
    bindEvents();
    renderCarrinho();

    await carregarPratos();
  });

  // ---------------------------------------------------------------------------
  // Dados
  // ---------------------------------------------------------------------------

  async function carregarPratos() {
    const grid = document.getElementById('dishesGrid');
    if (grid) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="spinner"></span><span>Carregando cardápio...</span></div>';
    }

    try {
      const data = await NeoAPI.pratosCardapio();
      pratos = Array.isArray(data) ? data : [];
      renderPratos();
    } catch (err) {
      console.error('Erro ao carregar cardápio:', err);
      if (grid) NeoUI.empty(grid, 'cloud_off', 'Não foi possível carregar o cardápio', err.message);
    }
  }

  function renderPratos() {
    const grid = document.getElementById('dishesGrid');
    if (!grid) return;

    const termo = busca.trim().toLowerCase();
    const lista = pratos.filter(p => {
      const okBusca = !termo ||
        String(p.nome).toLowerCase().includes(termo) ||
        String(p.descricao || '').toLowerCase().includes(termo);
      const okFiltro = filtro === 'todos' || p.disponivel !== false;
      return okBusca && okFiltro;
    });

    if (!lista.length) {
      NeoUI.empty(grid, 'search_off', 'Nenhum prato encontrado',
        termo ? 'Tente outro termo de busca.' : 'Ajuste o filtro para ver mais opções.');
      return;
    }

    grid.innerHTML = '';
    lista.forEach(prato => {
      const disponivel = prato.disponivel !== false;
      const noCarrinho = carrinho.find(i => i.id === prato.id);
      const card = document.createElement('div');
      card.className = `card-dish ${disponivel ? '' : 'unavailable'}`;

      card.innerHTML = `
        <img src="${escapeHtml(prato.imagem || PLACEHOLDER)}" class="card-dish-img" alt="${escapeHtml(prato.nome)}"
             loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
        <div class="card-dish-header">
          <h3 class="card-dish-title">${escapeHtml(prato.nome)}</h3>
        </div>
        <div style="margin-bottom: var(--space-xs);">
          ${disponivel
            ? '<span class="badge badge-available"><span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> Disponível</span>'
            : '<span class="badge badge-unavailable"><span class="material-symbols-outlined" style="font-size:14px;">block</span> Indisponível</span>'}
        </div>
        <p class="card-dish-desc">${escapeHtml(prato.descricao || '')}</p>
        <div class="card-dish-footer">
          <span class="card-dish-price">${NeoUI.money(prato.preco)}</span>
          ${disponivel
            ? `<button type="button" class="btn btn-primary" style="padding:8px 14px;font-size:13px;" data-add="${prato.id}">
                 <span class="material-symbols-outlined" style="font-size:16px;">add_shopping_cart</span>
                 <span>${noCarrinho ? `No carrinho (${noCarrinho.quantidade})` : 'Adicionar'}</span>
               </button>`
            : '<button type="button" class="btn btn-secondary" style="padding:8px 14px;font-size:13px;" disabled>Sem estoque</button>'}
        </div>`;

      grid.appendChild(card);
    });

    grid.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => adicionar(btn.dataset.add));
    });
  }

  // ---------------------------------------------------------------------------
  // Carrinho (persistido por mesa)
  // ---------------------------------------------------------------------------

  function cartKey() {
    return CART_PREFIX + (user ? user.id : 'anon');
  }

  function carregarCarrinho() {
    try {
      const raw = sessionStorage.getItem(cartKey());
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (err) {
      return [];
    }
  }

  function salvarCarrinho() {
    try {
      sessionStorage.setItem(cartKey(), JSON.stringify(carrinho));
    } catch (err) {
      console.warn('Não foi possível salvar o carrinho:', err);
    }
  }

  function adicionar(id) {
    const prato = pratos.find(p => String(p.id) === String(id));
    if (!prato) return;

    if (prato.disponivel === false) {
      NeoUI.toast('Este prato está indisponível no momento.', 'error');
      return;
    }

    const item = carrinho.find(i => i.id === prato.id);
    if (item) {
      item.quantidade += 1;
    } else {
      carrinho.push({
        id: prato.id,
        nome: prato.nome,
        preco: Number(prato.preco),
        imagem: prato.imagem || PLACEHOLDER,
        quantidade: 1
      });
    }

    salvarCarrinho();
    renderCarrinho();
    renderPratos();
    NeoUI.toast(`${prato.nome} adicionado ao carrinho.`, 'success', 2200);
  }

  function alterarQuantidade(id, delta) {
    const item = carrinho.find(i => String(i.id) === String(id));
    if (!item) return;

    item.quantidade += delta;
    if (item.quantidade <= 0) {
      carrinho = carrinho.filter(i => String(i.id) !== String(id));
    }
    if (item.quantidade > 50) item.quantidade = 50;

    salvarCarrinho();
    renderCarrinho();
    renderPratos();
  }

  function totalCarrinho() {
    return carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
  }

  function renderCarrinho() {
    const container = document.getElementById('cartItemsContainer');
    const totalEl = document.getElementById('cartTotalValue');
    const confirmBtn = document.getElementById('btnConfirmOrder');

    const qtdTotal = carrinho.reduce((acc, i) => acc + i.quantidade, 0);
    // Contador no cabeçalho (desktop/tablet) e na barra inferior (mobile)
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = String(qtdTotal); });
    const rotulo = `Carrinho (${qtdTotal} ${qtdTotal === 1 ? 'item' : 'itens'})`;
    ['btnToggleCart', 'bottomNavCart'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.setAttribute('aria-label', rotulo);
    });
    if (totalEl) totalEl.textContent = totalCarrinho().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (confirmBtn) confirmBtn.disabled = carrinho.length === 0;

    if (!container) return;

    if (!carrinho.length) {
      container.innerHTML = `
        <div class="empty-state" style="border:none;background:transparent;">
          <span class="material-symbols-outlined">shopping_cart</span>
          <strong>Seu carrinho está vazio</strong>
          <span>Adicione pratos do cardápio para continuar.</span>
        </div>`;
      return;
    }

    container.innerHTML = '';
    carrinho.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <img src="${escapeHtml(item.imagem)}" class="dish-thumb" alt="${escapeHtml(item.nome)}"
             onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(item.nome)}</div>
          <div class="cart-item-price">${NeoUI.money(item.preco)} · un.</div>
        </div>
        <div class="qty-control">
          <button type="button" aria-label="Diminuir quantidade de ${escapeHtml(item.nome)}" data-dec="${item.id}">−</button>
          <span aria-label="Quantidade">${item.quantidade}</span>
          <button type="button" aria-label="Aumentar quantidade de ${escapeHtml(item.nome)}" data-inc="${item.id}">+</button>
        </div>
        <strong class="cart-item-total">${NeoUI.money(item.preco * item.quantidade)}</strong>`;
      container.appendChild(row);
    });

    container.querySelectorAll('[data-dec]').forEach(btn =>
      btn.addEventListener('click', () => alterarQuantidade(btn.dataset.dec, -1)));
    container.querySelectorAll('[data-inc]').forEach(btn =>
      btn.addEventListener('click', () => alterarQuantidade(btn.dataset.inc, 1)));
  }

  // ---------------------------------------------------------------------------
  // Envio do pedido
  // ---------------------------------------------------------------------------

  async function confirmarPedido() {
    if (!carrinho.length) return;

    const button = document.getElementById('btnConfirmOrder');
    NeoUI.setBusy(button, true, 'Enviando...');

    const itens = carrinho.map(i => ({ prato_id: i.id, quantidade: i.quantidade }));

    try {
      const resultado = await NeoAPI.criarPedido(token, itens);

      carrinho = [];
      salvarCarrinho();
      renderCarrinho();
      fecharModal('cartModal');
      await carregarPratos();

      NeoUI.toast(`Pedido enviado para a cozinha! Total ${NeoUI.money(resultado.valor_total)}.`, 'success', 5000);
      abrirHistorico();
    } catch (err) {
      console.error('Erro ao enviar pedido:', err);
      NeoUI.toast(err.message || 'Não foi possível enviar o pedido.', 'error', 7000);
      await carregarPratos();
    } finally {
      NeoUI.setBusy(button, false);
    }
  }

  // ---------------------------------------------------------------------------
  // Histórico
  // ---------------------------------------------------------------------------

  const STATUS_ORDER = ['Pendente', 'Em Preparo', 'Pronto', 'Entregue'];

  function progresso(status) {
    if (status === 'Cancelado') {
      return '<div class="order-progress"><div class="order-progress-step cancelled" style="grid-column:1/-1"></div></div>';
    }
    const idx = STATUS_ORDER.indexOf(status);
    return `<div class="order-progress">${STATUS_ORDER.map((s, i) =>
      `<div class="order-progress-step ${i < idx ? 'done' : i === idx ? 'current' : ''}"></div>`).join('')}</div>`;
  }

  async function abrirHistorico() {
    const modal = document.getElementById('historyModal');
    const container = document.getElementById('historyOrdersContainer');
    if (!modal) return;

    modal.style.display = 'flex';
    if (container) container.innerHTML = '<div style="text-align:center;padding:var(--space-xl);"><span class="spinner"></span></div>';

    try {
      const pedidos = await NeoAPI.meusPedidos(token);
      renderHistorico(Array.isArray(pedidos) ? pedidos : []);
    } catch (err) {
      if (container) NeoUI.empty(container, 'error', 'Não foi possível carregar o histórico', err.message);
    }
  }

  function renderHistorico(pedidos) {
    const container = document.getElementById('historyOrdersContainer');
    if (!container) return;

    if (!pedidos.length) {
      NeoUI.empty(container, 'receipt_long', 'Nenhum pedido ainda', 'Seus pedidos aparecerão aqui.');
      return;
    }

    container.innerHTML = '';
    pedidos.forEach(pedido => {
      const el = document.createElement('div');
      el.className = 'history-order';
      const itens = (pedido.itens || [])
        .map(i => `${i.quantidade}× ${escapeHtml(i.nome)}`)
        .join(' · ');

      el.innerHTML = `
        <div class="history-order-header">
          <div>
            <div style="font-weight:600;font-size:14px;">Pedido #${String(pedido.id).slice(0, 8)}</div>
            <div class="order-card-meta">${NeoUI.dateTime(pedido.criado_em)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${NeoUI.statusBadge(pedido.status)}
            <span class="history-order-total">${NeoUI.money(pedido.valor_total)}</span>
          </div>
        </div>
        <div class="history-order-items">${itens || 'Sem itens'}</div>
        ${progresso(pedido.status)}`;
      container.appendChild(el);
    });
  }

  // ---------------------------------------------------------------------------
  // Chamar funcionário
  // ---------------------------------------------------------------------------

  async function enviarChamado(e) {
    e.preventDefault();
    const select = document.getElementById('callSelectReason');
    const outro = document.getElementById('callJustification');
    const button = document.getElementById('btnSubmitCallStaff');

    let motivo = select ? select.value : '';
    if (motivo === 'Outro') {
      motivo = outro && outro.value.trim() ? outro.value.trim() : 'Outro motivo';
    }

    if (!motivo) {
      NeoUI.toast('Informe o motivo do chamado.', 'error');
      return;
    }

    NeoUI.setBusy(button, true, 'Enviando...');

    try {
      await NeoAPI.criarChamado(token, motivo);
      fecharModal('callStaffModal');
      if (select) select.value = 'Pedir a conta';
      if (outro) outro.value = '';
      const group = document.getElementById('callOtherGroup');
      if (group) group.style.display = 'none';
      NeoUI.toast('Chamado enviado. Um atendente já foi avisado.', 'success', 5000);
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível enviar o chamado.', 'error', 7000);
    } finally {
      NeoUI.setBusy(button, false);
    }
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  function abrirModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  }

  function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function bindEvents() {
    const search = document.getElementById('inputSearchDish');
    if (search) {
      search.addEventListener('input', () => {
        busca = search.value;
        renderPratos();
      });
    }

    const filterAll = document.getElementById('filterAll');
    const filterAvailable = document.getElementById('filterAvailable');
    if (filterAll) {
      filterAll.addEventListener('click', () => {
        filtro = 'todos';
        filterAll.classList.add('active');
        if (filterAvailable) filterAvailable.classList.remove('active');
        renderPratos();
      });
    }
    if (filterAvailable) {
      filterAvailable.addEventListener('click', () => {
        filtro = 'disponiveis';
        filterAvailable.classList.add('active');
        if (filterAll) filterAll.classList.remove('active');
        renderPratos();
      });
    }

    const btnCart = document.getElementById('btnToggleCart');
    if (btnCart) btnCart.addEventListener('click', () => abrirModal('cartModal'));

    // Barra inferior (≤ 767px): mesmas ações do cabeçalho, sem novas rotas
    const bottomCart = document.getElementById('bottomNavCart');
    if (bottomCart) bottomCart.addEventListener('click', () => abrirModal('cartModal'));
    const bottomHistory = document.getElementById('bottomNavHistory');
    if (bottomHistory) bottomHistory.addEventListener('click', abrirHistorico);
    const bottomCall = document.getElementById('bottomNavCall');
    if (bottomCall) bottomCall.addEventListener('click', () => abrirModal('callStaffModal'));
    const btnCloseCart = document.getElementById('btnCloseCartModal');
    if (btnCloseCart) btnCloseCart.addEventListener('click', () => fecharModal('cartModal'));

    const btnConfirm = document.getElementById('btnConfirmOrder');
    if (btnConfirm) btnConfirm.addEventListener('click', confirmarPedido);

    const btnCall = document.getElementById('btnCallStaff');
    if (btnCall) btnCall.addEventListener('click', () => abrirModal('callStaffModal'));
    const btnCloseCall = document.getElementById('btnCloseCallStaffModal');
    if (btnCloseCall) btnCloseCall.addEventListener('click', () => fecharModal('callStaffModal'));
    const btnCancelCall = document.getElementById('btnCancelCallStaff');
    if (btnCancelCall) btnCancelCall.addEventListener('click', () => fecharModal('callStaffModal'));

    const callForm = document.getElementById('callStaffForm');
    if (callForm) callForm.addEventListener('submit', enviarChamado);

    const selectReason = document.getElementById('callSelectReason');
    if (selectReason) {
      selectReason.addEventListener('change', () => {
        const group = document.getElementById('callOtherGroup');
        if (group) group.style.display = selectReason.value === 'Outro' ? 'block' : 'none';
      });
    }

    const btnHistory = document.getElementById('btnOpenHistory');
    if (btnHistory) btnHistory.addEventListener('click', abrirHistorico);
    const btnCloseHistory = document.getElementById('btnCloseHistoryModal');
    if (btnCloseHistory) btnCloseHistory.addEventListener('click', () => fecharModal('historyModal'));

    // Fechar modais ao clicar fora
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.style.display = 'none';
      });
    });
    // Esc e foco dos modais: tratados por NeoModal (js/supabase.js)
  }
})();
