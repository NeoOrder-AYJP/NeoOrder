// js/contas.js — Gerenciamento de contas (gerente)
//
// Mesas e funcionários vivem na tabela `usuarios`. Senhas são gravadas com
// bcrypt no banco (RPC `salvar_conta`); o front-end nunca as lê.

(function () {
  let token = null;
  let contas = [];
  let filtro = 'todas';
  let busca = '';

  document.addEventListener('DOMContentLoaded', async () => {
    const user = window.NeoAuth.requireAuth(['gerente']);
    if (!user) return;

    token = window.NeoAuth.getToken();

    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.textContent = `${user.nome} (GERENTE)`;

    bindEventos();
    await carregarContas();
  });

  async function carregarContas() {
    const body = document.getElementById('accountsTableBody');
    if (body) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:var(--space-xl);"><span class="spinner"></span></td></tr>';
    }

    try {
      const data = await NeoAPI.listarContas(token);
      contas = Array.isArray(data) ? data : [];
      renderContas();
    } catch (err) {
      console.error('Erro ao carregar contas:', err);
      if (body) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:var(--space-xl);">${escapeHtml(err.message || 'Erro ao carregar contas.')}</td></tr>`;
      }
    }
  }

  function tipoLabel(conta) {
    if (conta.tipo === 'mesa') return '<span class="badge badge-ready">Mesa</span>';
    const perfil = (conta.perfil || 'atendente').toLowerCase();
    const label = perfil.charAt(0).toUpperCase() + perfil.slice(1);
    return `<span class="badge badge-pending">${escapeHtml(label)}</span>`;
  }

  function renderContas() {
    const body = document.getElementById('accountsTableBody');
    if (!body) return;

    const termo = busca.toLowerCase();
    const lista = contas.filter(c => {
      const okFiltro = filtro === 'todas'
        || (filtro === 'mesas' && c.tipo === 'mesa')
        || (filtro === 'staff' && c.tipo === 'funcionario');
      const okBusca = !termo
        || String(c.nome || '').toLowerCase().includes(termo)
        || String(c.login || '').toLowerCase().includes(termo);
      return okFiltro && okBusca;
    });

    if (!lista.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:var(--space-xl);">Nenhuma conta encontrada.</td></tr>';
      return;
    }

    body.innerHTML = '';
    lista.forEach(conta => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(conta.nome)}</strong></td>
        <td><code style="font-size:13px;">${escapeHtml(conta.login || '—')}</code></td>
        <td>${tipoLabel(conta)}</td>
        <td>${conta.ativo
          ? '<span class="badge badge-available">Ativo</span>'
          : '<span class="badge badge-unavailable">Inativo</span>'}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="btn btn-secondary" style="padding:6px 10px;min-height:32px;" data-edit="${conta.id}" title="Editar">
            <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
          </button>
          <button type="button" class="btn btn-secondary" style="padding:6px 10px;min-height:32px;" data-toggle="${conta.id}" title="${conta.ativo ? 'Inativar' : 'Ativar'}">
            <span class="material-symbols-outlined" style="font-size:16px;">${conta.ativo ? 'block' : 'check_circle'}</span>
          </button>
          <button type="button" class="btn btn-danger" style="padding:6px 10px;min-height:32px;" data-del="${conta.id}" title="Excluir">
            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
          </button>
        </td>`;
      body.appendChild(tr);
    });

    body.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => abrirConta(btn.dataset.edit)));
    body.querySelectorAll('[data-toggle]').forEach(btn =>
      btn.addEventListener('click', () => alternarStatus(btn.dataset.toggle)));
    body.querySelectorAll('[data-del]').forEach(btn =>
      btn.addEventListener('click', () => excluirConta(btn.dataset.del)));
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------

  function abrirConta(id) {
    const form = document.getElementById('accountForm');
    if (form) form.reset();

    const conta = id ? contas.find(c => c.id === id) : null;

    const idEl = document.getElementById('accountId');
    if (idEl) idEl.value = conta ? conta.id : '';

    const tipoEl = document.getElementById('accountTipo');
    if (tipoEl) tipoEl.value = conta ? conta.tipo : 'mesa';

    setVal('accountNome', conta ? conta.nome : '');
    setVal('accountLogin', conta ? conta.login : '');
    setVal('accountSenha', '');

    const perfilEl = document.getElementById('accountPerfil');
    if (perfilEl) perfilEl.value = conta && conta.perfil ? conta.perfil : 'atendente';

    const statusEl = document.getElementById('accountStatus');
    if (statusEl) statusEl.value = conta ? String(Boolean(conta.ativo)) : 'true';

    atualizarPerfilVisivel();

    const titulo = document.getElementById('modalTitle');
    if (titulo) titulo.textContent = conta ? 'Editar Conta' : 'Nova Conta';

    const senha = document.getElementById('accountSenha');
    if (senha) {
      senha.required = !conta;
      senha.placeholder = conta ? 'Deixe em branco para manter a senha atual' : 'Mínimo de 6 caracteres';
    }

    const modal = document.getElementById('accountModal');
    if (modal) modal.style.display = 'flex';
  }

  function atualizarPerfilVisivel() {
    const tipoEl = document.getElementById('accountTipo');
    const grupo = document.getElementById('groupPerfil');
    if (!tipoEl || !grupo) return;
    grupo.style.display = tipoEl.value === 'funcionario' ? 'block' : 'none';
  }

  async function salvarConta(e) {
    e.preventDefault();

    const id = (document.getElementById('accountId') || {}).value || null;
    const tipo = (document.getElementById('accountTipo') || {}).value;
    const nome = (document.getElementById('accountNome') || {}).value || '';
    const login = (document.getElementById('accountLogin') || {}).value || '';
    const senha = (document.getElementById('accountSenha') || {}).value || '';
    const perfil = (document.getElementById('accountPerfil') || {}).value;
    const ativo = (document.getElementById('accountStatus') || {}).value === 'true';

    if (!nome.trim() || !login.trim()) {
      return NeoUI.toast('Informe o nome e o login da conta.', 'error');
    }
    if (!id && senha.length < 6) {
      return NeoUI.toast('A senha deve ter no mínimo 6 caracteres.', 'error');
    }
    if (senha && senha.length < 6) {
      return NeoUI.toast('A nova senha deve ter no mínimo 6 caracteres.', 'error');
    }

    const button = e.target.querySelector('button[type="submit"]');
    NeoUI.setBusy(button, true, 'Salvando...');

    try {
      await NeoAPI.salvarConta(token, {
        id,
        tipo,
        nome: nome.trim(),
        login: login.trim(),
        senha: senha || null,
        perfil: tipo === 'funcionario' ? perfil : null,
        ativo
      });

      fecharModal('accountModal');
      await carregarContas();
      NeoUI.toast('Conta salva com sucesso.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível salvar a conta.', 'error', 7000);
    } finally {
      NeoUI.setBusy(button, false);
    }
  }

  async function alternarStatus(id) {
    const conta = contas.find(c => c.id === id);
    if (!conta) return;

    try {
      await NeoAPI.definirStatusConta(token, id, !conta.ativo);
      await carregarContas();
      NeoUI.toast(conta.ativo ? 'Conta inativada.' : 'Conta reativada.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível alterar o status.', 'error', 6000);
    }
  }

  async function excluirConta(id) {
    const conta = contas.find(c => c.id === id);
    if (!conta) return;
    if (!window.confirm(`Excluir a conta "${conta.nome}"? Sessões abertas serão encerradas.`)) return;

    try {
      await NeoAPI.excluirConta(token, id);
      await carregarContas();
      NeoUI.toast('Conta excluída.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível excluir a conta.', 'error', 7000);
    }
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------

  function bindEventos() {
    const btnNew = document.getElementById('btnNewAccount');
    if (btnNew) btnNew.addEventListener('click', () => abrirConta(null));

    const form = document.getElementById('accountForm');
    if (form) form.addEventListener('submit', salvarConta);

    const tipo = document.getElementById('accountTipo');
    if (tipo) tipo.addEventListener('change', atualizarPerfilVisivel);

    const filtros = {
      tabFilterAll: 'todas',
      tabFilterMesas: 'mesas',
      tabFilterStaff: 'staff'
    };
    Object.entries(filtros).forEach(([btnId, valor]) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        filtro = valor;
        Object.keys(filtros).forEach(otherId => {
          const other = document.getElementById(otherId);
          if (other) other.classList.toggle('active', otherId === btnId);
        });
        renderContas();
      });
    });

    ['btnCloseModal', 'btnCancelModal'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => fecharModal('accountModal'));
    });

    const modal = document.getElementById('accountModal');
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }
  }

  function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value === null || value === undefined ? '' : value;
  }
})();
