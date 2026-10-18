// js/estoque.js — Estoque e ficha técnica (gerente)
//
// Toda leitura/escrita passa pelas RPCs `listar_estoque`, `listar_pratos_admin`,
// `salvar_ingrediente`, `excluir_ingrediente`, `salvar_prato` e `excluir_prato`.

(function () {
  const PLACEHOLDER = 'assets/pratos/sem-imagem.svg';
  const LIMITE_BAIXO = 5;

  let token = null;
  let ingredientes = [];
  let pratos = [];
  let abaAtual = 'estoque';

  document.addEventListener('DOMContentLoaded', async () => {
    const user = window.NeoAuth.requireAuth(['gerente']);
    if (!user) return;

    token = window.NeoAuth.getToken();

    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.textContent = `${user.nome} (GERENTE)`;

    bindEventos();
    await carregarTudo();
  });

  async function carregarTudo() {
    await Promise.all([carregarIngredientes(), carregarPratos()]);
    renderKpis();
  }

  async function carregarIngredientes() {
    try {
      const data = await NeoAPI.listarEstoque(token);
      ingredientes = Array.isArray(data) ? data : [];
      renderIngredientes();
    } catch (err) {
      console.error('Erro ao carregar estoque:', err);
      const body = document.getElementById('ingredientsTableBody');
      if (body) body.innerHTML = linhaErro(5, err.message);
      tratarSessao(err);
    }
  }

  async function carregarPratos() {
    try {
      const data = await NeoAPI.listarPratosAdmin(token);
      pratos = Array.isArray(data) ? data : [];
      renderPratos();
    } catch (err) {
      console.error('Erro ao carregar pratos:', err);
      const body = document.getElementById('dishesTableBody');
      if (body) body.innerHTML = linhaErro(6, err.message);
      tratarSessao(err);
    }
  }

  function tratarSessao(err) {
    if (err && (err.code === '28000' || /sess[aã]o/i.test(err.message || ''))) {
      NeoUI.toast('Sessão expirada. Faça login novamente.', 'error', 5000);
      setTimeout(() => window.NeoAuth.logout(), 1500);
    }
  }

  // ---------------------------------------------------------------------------
  // KPIs
  // ---------------------------------------------------------------------------

  function renderKpis() {
    const total = ingredientes.length;
    const baixos = ingredientes.filter(i => Number(i.quantidade) <= LIMITE_BAIXO).length;
    const totalPratos = pratos.filter(p => p.ativo).length;

    setText('kpiTotalIngredientes', total);
    setText('kpiAlertaIngredientes', baixos);
    setText('kpiTotalPratos', totalPratos);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  // ---------------------------------------------------------------------------
  // Tabela de insumos
  // ---------------------------------------------------------------------------

  function statusIngrediente(qtd) {
    const n = Number(qtd);
    if (n <= 0) return '<span class="badge badge-unavailable">Esgotado</span>';
    if (n <= LIMITE_BAIXO) return '<span class="badge badge-pending">Estoque baixo</span>';
    return '<span class="badge badge-available">Disponível</span>';
  }

  function renderIngredientes() {
    const body = document.getElementById('ingredientsTableBody');
    if (!body) return;

    if (!ingredientes.length) {
      body.innerHTML = linhaVazia(5, 'Nenhum insumo cadastrado. Clique em "Novo Insumo" para começar.');
      return;
    }

    body.innerHTML = '';
    ingredientes.forEach(ing => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(ing.nome)}</strong></td>
        <td style="text-align:right;">${formatarNumero(ing.quantidade)}</td>
        <td style="text-align:center;">${escapeHtml(ing.unidade)}</td>
        <td>${statusIngrediente(ing.quantidade)}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="btn btn-secondary" style="padding:6px 10px;min-height:32px;" data-edit-ing="${ing.id}">
            <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
          </button>
          <button type="button" class="btn btn-danger" style="padding:6px 10px;min-height:32px;" data-del-ing="${ing.id}">
            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
          </button>
        </td>`;
      body.appendChild(tr);
    });

    body.querySelectorAll('[data-edit-ing]').forEach(btn =>
      btn.addEventListener('click', () => abrirIngrediente(btn.dataset.editIng)));
    body.querySelectorAll('[data-del-ing]').forEach(btn =>
      btn.addEventListener('click', () => excluirIngrediente(btn.dataset.delIng)));
  }

  // ---------------------------------------------------------------------------
  // Tabela de pratos
  // ---------------------------------------------------------------------------

  function renderPratos() {
    const body = document.getElementById('dishesTableBody');
    if (!body) return;

    if (!pratos.length) {
      body.innerHTML = linhaVazia(6, 'Nenhum prato cadastrado. Clique em "Novo Prato" para começar.');
      return;
    }

    body.innerHTML = '';
    pratos.forEach(prato => {
      const disponibilidade = prato.porcoes === null || prato.porcoes === undefined
        ? '<span class="badge badge-ready">Sem ficha técnica</span>'
        : prato.porcoes > 0
          ? `<span class="badge badge-available">${prato.porcoes} porçõe${prato.porcoes === 1 ? 'm' : 's'}</span>`
          : '<span class="badge badge-unavailable">Sem estoque</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="dish-cell">
            <img src="${escapeHtml(prato.imagem || PLACEHOLDER)}" class="dish-thumb" alt=""
                 onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
            <div>
              <strong>${escapeHtml(prato.nome)}</strong>
              <div style="font-size:12px;color:var(--text-muted);">${(prato.receita || []).length} insumo(s) na ficha</div>
            </div>
          </div>
        </td>
        <td>${NeoUI.money(prato.preco)}</td>
        <td>${prato.destaque ? '<span class="badge badge-pending">Destaque</span>' : '<span class="text-muted">—</span>'}</td>
        <td>${disponibilidade}</td>
        <td>${prato.ativo ? '<span class="badge badge-available">Ativo</span>' : '<span class="badge badge-unavailable">Inativo</span>'}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="btn btn-secondary" style="padding:6px 10px;min-height:32px;" data-edit-dish="${prato.id}">
            <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
          </button>
          <button type="button" class="btn btn-danger" style="padding:6px 10px;min-height:32px;" data-del-dish="${prato.id}">
            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
          </button>
        </td>`;
      body.appendChild(tr);
    });

    body.querySelectorAll('[data-edit-dish]').forEach(btn =>
      btn.addEventListener('click', () => abrirPrato(btn.dataset.editDish)));
    body.querySelectorAll('[data-del-dish]').forEach(btn =>
      btn.addEventListener('click', () => excluirPrato(btn.dataset.delDish)));
  }

  // ---------------------------------------------------------------------------
  // Modal de insumo
  // ---------------------------------------------------------------------------

  function abrirIngrediente(id) {
    const form = document.getElementById('ingredientForm');
    if (form) form.reset();

    const ing = id ? ingredientes.find(i => i.id === id) : null;

    setVal('ingredientId', ing ? ing.id : '');
    setVal('ingredientNome', ing ? ing.nome : '');
    setVal('ingredientUnidade', ing ? ing.unidade : 'kg');
    setVal('ingredientQuantidade', ing ? ing.quantidade : '');

    setText('ingredientModalTitle', ing ? 'Editar Insumo' : 'Novo Insumo');
    abrirModal('ingredientModal');
  }

  async function salvarIngrediente(e) {
    e.preventDefault();
    const id = getVal('ingredientId') || null;
    const nome = getVal('ingredientNome').trim();
    const unidade = getVal('ingredientUnidade');
    const quantidade = Number(getVal('ingredientQuantidade'));

    if (!nome) return NeoUI.toast('Informe o nome do insumo.', 'error');
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      return NeoUI.toast('Informe uma quantidade válida (zero ou maior).', 'error');
    }

    const button = e.target.querySelector('button[type="submit"]');
    NeoUI.setBusy(button, true, 'Salvando...');

    try {
      await NeoAPI.salvarIngrediente(token, id, nome, unidade, quantidade);
      fecharModal('ingredientModal');
      await carregarTudo();
      NeoUI.toast('Insumo salvo com sucesso.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível salvar o insumo.', 'error', 6000);
      tratarSessao(err);
    } finally {
      NeoUI.setBusy(button, false);
    }
  }

  async function excluirIngrediente(id) {
    const ing = ingredientes.find(i => i.id === id);
    if (!ing) return;
    if (!window.confirm(`Excluir o insumo "${ing.nome}"? Esta ação não pode ser desfeita.`)) return;

    try {
      await NeoAPI.excluirIngrediente(token, id);
      await carregarTudo();
      NeoUI.toast('Insumo excluído.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível excluir o insumo.', 'error', 7000);
      tratarSessao(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Modal de prato
  // ---------------------------------------------------------------------------

  function abrirPrato(id) {
    const form = document.getElementById('dishForm');
    if (form) form.reset();

    const prato = id ? pratos.find(p => p.id === id) : null;

    setVal('dishId', prato ? prato.id : '');
    setVal('dishNome', prato ? prato.nome : '');
    setVal('dishDescricao', prato ? prato.descricao : '');
    setVal('dishPreco', prato ? prato.preco : '');
    setVal('dishImagem', prato ? prato.imagem : '');
    setChecked('dishDestaque', prato ? prato.destaque : false);
    setChecked('dishAtivo', prato ? prato.ativo : true);

    setText('dishModalTitle', prato ? 'Editar Prato' : 'Novo Prato');

    const container = document.getElementById('recipeContainer');
    if (container) container.innerHTML = '';

    if (prato && Array.isArray(prato.receita)) {
      prato.receita.forEach(item =>
        adicionarLinhaReceita(item.ingrediente_id, item.quantidade));
    }

    abrirModal('dishModal');
  }

  function adicionarLinhaReceita(ingredienteId = '', quantidade = '') {
    const container = document.getElementById('recipeContainer');
    if (!container) return;

    if (container.querySelector('p')) container.innerHTML = '';

    if (!ingredientes.length) {
      container.innerHTML = '<p class="text-muted" style="font-size:13px;">Cadastre insumos antes de montar a ficha técnica.</p>';
      return;
    }

    const row = document.createElement('div');
    row.className = 'recipe-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 110px 36px;gap:8px;align-items:center;';

    const options = ingredientes.map(ing => {
      const selected = String(ing.id) === String(ingredienteId) ? ' selected' : '';
      return `<option value="${ing.id}"${selected}>${escapeHtml(ing.nome)} (${escapeHtml(ing.unidade)})</option>`;
    }).join('');

    row.innerHTML = `
      <select class="input-field" data-ingrediente style="padding-left:14px;">${options}</select>
      <input type="number" class="input-field" data-quantidade min="0.001" step="0.001"
             placeholder="Qtd." value="${quantidade !== '' ? escapeHtml(String(quantidade)) : ''}" required>
      <button type="button" class="btn btn-danger" style="padding:6px;min-height:36px;" title="Remover">
        <span class="material-symbols-outlined" style="font-size:16px;">close</span>
      </button>`;

    row.querySelector('button').addEventListener('click', () => {
      row.remove();
      if (!container.children.length) {
        container.innerHTML = '<p class="text-muted" style="font-size:13px;">Nenhum insumo na ficha. O prato ficará sempre disponível.</p>';
      }
    });

    container.appendChild(row);
  }

  function coletarReceita() {
    const rows = document.querySelectorAll('#recipeContainer .recipe-row');
    const receita = [];
    rows.forEach(row => {
      const ingredienteId = row.querySelector('[data-ingrediente]').value;
      const quantidade = Number(row.querySelector('[data-quantidade]').value);
      if (ingredienteId && Number.isFinite(quantidade) && quantidade > 0) {
        receita.push({ ingrediente_id: ingredienteId, quantidade });
      }
    });
    return receita;
  }

  async function salvarPrato(e) {
    e.preventDefault();

    const id = getVal('dishId') || null;
    const nome = getVal('dishNome').trim();
    const preco = Number(getVal('dishPreco'));

    if (!nome) return NeoUI.toast('Informe o nome do prato.', 'error');
    if (!Number.isFinite(preco) || preco < 0) return NeoUI.toast('Informe um preço válido.', 'error');

    const dados = {
      nome,
      descricao: getVal('dishDescricao').trim(),
      preco,
      imagem: getVal('dishImagem').trim(),
      destaque: isChecked('dishDestaque'),
      ativo: isChecked('dishAtivo')
    };

    const button = e.target.querySelector('button[type="submit"]');
    NeoUI.setBusy(button, true, 'Salvando...');

    try {
      await NeoAPI.salvarPrato(token, id, dados, coletarReceita());
      fecharModal('dishModal');
      await carregarTudo();
      NeoUI.toast('Prato salvo com sucesso.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível salvar o prato.', 'error', 7000);
      tratarSessao(err);
    } finally {
      NeoUI.setBusy(button, false);
    }
  }

  async function excluirPrato(id) {
    const prato = pratos.find(p => p.id === id);
    if (!prato) return;
    if (!window.confirm(`Remover o prato "${prato.nome}" do cardápio?`)) return;

    try {
      const res = await NeoAPI.excluirPrato(token, id);
      await carregarTudo();
      NeoUI.toast(res && res.mensagem ? res.mensagem : 'Prato removido.', 'success', 5000);
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível excluir o prato.', 'error', 7000);
      tratarSessao(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Eventos e utilidades
  // ---------------------------------------------------------------------------

  function bindEventos() {
    const btnNewIng = document.getElementById('btnNewIngredient');
    if (btnNewIng) btnNewIng.addEventListener('click', () => abrirIngrediente(null));

    const btnNewDish = document.getElementById('btnNewDish');
    if (btnNewDish) btnNewDish.addEventListener('click', () => abrirPrato(null));

    const formIng = document.getElementById('ingredientForm');
    if (formIng) formIng.addEventListener('submit', salvarIngrediente);

    const formDish = document.getElementById('dishForm');
    if (formDish) formDish.addEventListener('submit', salvarPrato);

    const btnAddRow = document.getElementById('btnAddRecipeRow');
    if (btnAddRow) btnAddRow.addEventListener('click', () => adicionarLinhaReceita());

    const tabEstoque = document.getElementById('tabViewEstoque');
    const tabPratos = document.getElementById('tabViewPratos');
    if (tabEstoque) tabEstoque.addEventListener('click', () => trocarAba('estoque'));
    if (tabPratos) tabPratos.addEventListener('click', () => trocarAba('pratos'));

    const fechar = {
      'btnCloseIngredientModal': 'ingredientModal',
      'btnCancelIngredientModal': 'ingredientModal',
      'btnCloseDishModal': 'dishModal',
      'btnCancelDishModal': 'dishModal'
    };
    Object.entries(fechar).forEach(([btnId, modalId]) => {
      const btn = document.getElementById(btnId);
      if (btn) btn.addEventListener('click', () => fecharModal(modalId));
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.style.display = 'none';
      });
    });
  }

  function trocarAba(aba) {
    abaAtual = aba;
    const painelEstoque = document.getElementById('panelEstoque');
    const painelPratos = document.getElementById('panelPratos');
    const tabEstoque = document.getElementById('tabViewEstoque');
    const tabPratos = document.getElementById('tabViewPratos');

    const estoqueAtivo = aba === 'estoque';
    if (painelEstoque) painelEstoque.style.display = estoqueAtivo ? 'block' : 'none';
    if (painelPratos) painelPratos.style.display = estoqueAtivo ? 'none' : 'block';
    if (tabEstoque) tabEstoque.classList.toggle('active', estoqueAtivo);
    if (tabPratos) tabPratos.classList.toggle('active', !estoqueAtivo);
  }

  function abrirModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  }

  function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value === null || value === undefined ? '' : value;
  }

  function isChecked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  }

  function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(value);
  }

  function formatarNumero(valor) {
    const n = Number(valor);
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  }

  function linhaVazia(colspan, mensagem) {
    return `<tr><td colspan="${colspan}" style="text-align:center;color:var(--text-muted);padding:var(--space-xl);">${escapeHtml(mensagem)}</td></tr>`;
  }

  function linhaErro(colspan, mensagem) {
    return `<tr><td colspan="${colspan}" style="text-align:center;color:var(--danger);padding:var(--space-xl);">${escapeHtml(mensagem || 'Erro ao carregar dados.')}</td></tr>`;
  }
})();
