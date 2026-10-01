// Accounts Management Logic for Gerente (NeoOrder)

const db = window.supabaseClient;
if (!db) {
  console.error("Supabase client não encontrado. Verifique o carregamento de js/supabase.js.");
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check manager permission
  const currentUser = window.NeoAuth ? window.NeoAuth.requireAuth(['gerente']) : null;
  if (!currentUser) return;

  // Display manager info
  const userInfo = document.getElementById('userInfo');
  if (userInfo) {
    userInfo.textContent = `${currentUser.nome} (${(currentUser.perfil || currentUser.tipo || 'GERENTE').toUpperCase()})`;
  }

  // Logout Handler
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (window.NeoAuth) window.NeoAuth.logout();
    });
  }

  // DOM Elements
  const accountsTableBody = document.getElementById('accountsTableBody');
  const btnNewAccount = document.getElementById('btnNewAccount');
  const accountModal = document.getElementById('accountModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const accountForm = document.getElementById('accountForm');
  const accountTipo = document.getElementById('accountTipo');
  const groupPerfil = document.getElementById('groupPerfil');

  // Filter Tabs
  const tabFilterAll = document.getElementById('tabFilterAll');
  const tabFilterMesas = document.getElementById('tabFilterMesas');
  const tabFilterClientes = document.getElementById('tabFilterClientes');
  const tabFilterStaff = document.getElementById('tabFilterStaff');

  let currentFilter = 'all';
  let accountsList = [];

  // In-memory fallback dataset
  const fallbackAccounts = [
    { id: '11111111-1111-1111-1111-111111111111', nome: 'Mesa 01', login: 'Mesa 01', senha: '123', tipo: 'mesa', perfil: 'mesa', ativo: true },
    { id: '11111111-1111-1111-1111-111111111112', nome: 'Mesa 02', login: 'Mesa 02', senha: '123', tipo: 'mesa', perfil: 'mesa', ativo: true },
    { id: '44444444-4444-4444-4444-444444444444', nome: 'Cliente Maria', login: 'cliente1', senha: '123', tipo: 'cliente', perfil: 'cliente', ativo: true },
    { id: '22222222-2222-2222-2222-222222222222', nome: 'Atendente Carlos', login: 'atendente1', senha: '123', tipo: 'funcionario', perfil: 'atendente', ativo: true },
    { id: '33333333-3333-3333-3333-333333333333', nome: 'Gerente Ana', login: 'gerente1', senha: '123', tipo: 'funcionario', perfil: 'gerente', ativo: true }
  ];

  function getSupabase() {
    return window.supabaseClient || db || window.supabase;
  }

  // Load Accounts from Supabase
  async function loadAccounts() {
    try {
      const client = getSupabase();
      if (client && typeof client.from === 'function') {
        const query = client
          .from('usuarios')
          .select('*')
          .order('criado_em', { ascending: false });

        const { data, error } = await window.safeSupabaseQuery(query, 2500);

        if (error || !data || data.length === 0) {
          console.warn('Usando contas locais de demonstração');
          accountsList = [...fallbackAccounts];
        } else {
          accountsList = data;
        }
      } else {
        accountsList = [...fallbackAccounts];
      }
    } catch (err) {
      console.error('Erro ao carregar contas do Supabase:', err);
      accountsList = [...fallbackAccounts];
    }
    renderAccounts();
  }

  // Render Accounts Table
  function renderAccounts() {
    if (!accountsTableBody) return;

    let filtered = accountsList;
    if (currentFilter === 'mesa') {
      filtered = accountsList.filter(a => a.tipo === 'mesa');
    } else if (currentFilter === 'cliente') {
      filtered = accountsList.filter(a => a.tipo === 'cliente');
    } else if (currentFilter === 'funcionario') {
      filtered = accountsList.filter(a => a.tipo === 'funcionario');
    }

    if (filtered.length === 0) {
      accountsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: var(--space-xl);">
            Nenhuma conta encontrada.
          </td>
        </tr>`;
      return;
    }

    accountsTableBody.innerHTML = filtered.map(acc => {
      const badgeClass = acc.ativo ? 'badge-available' : 'badge-unavailable';
      const statusText = acc.ativo ? 'Ativo' : 'Inativo';

      let perfilBadge = 'Mesa';
      let iconName = 'table_restaurant';
      if (acc.tipo === 'cliente') {
        perfilBadge = 'Cliente';
        iconName = 'person';
      } else if (acc.tipo === 'funcionario') {
        perfilBadge = acc.perfil === 'gerente' ? 'Gerente' : 'Atendente';
        iconName = 'badge';
      }

      return `
        <tr>
          <td style="font-weight: 500;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-outlined" style="color: var(--text-muted);">
                ${iconName}
              </span>
              <span>${escapeHtml(acc.nome)}</span>
            </div>
          </td>
          <td><code>${escapeHtml(acc.login)}</code></td>
          <td><span class="badge badge-pending">${perfilBadge}</span></td>
          <td><span class="badge ${badgeClass}">${statusText}</span></td>
          <td style="text-align: right;">
            <button type="button" class="btn btn-secondary btn-edit" data-id="${acc.id}" style="padding: 4px 10px; min-height: 32px; font-size: 13px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
              <span>Editar</span>
            </button>
            <button type="button" class="btn ${acc.ativo ? 'btn-danger' : 'btn-primary'} btn-toggle-status" data-id="${acc.id}" style="padding: 4px 10px; min-height: 32px; font-size: 13px; margin-left: 4px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">${acc.ativo ? 'block' : 'check_circle'}</span>
              <span>${acc.ativo ? 'Inativar' : 'Ativar'}</span>
            </button>
            <button type="button" class="btn btn-danger btn-delete-account" data-id="${acc.id}" style="padding: 4px 8px; min-height: 32px; font-size: 13px; margin-left: 4px;" title="Excluir Conta">
              <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Event Listeners to Action Buttons
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openEditModal(id);
      });
    });

    document.querySelectorAll('.btn-toggle-status').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        await toggleAccountStatus(id);
      });
    });

    document.querySelectorAll('.btn-delete-account').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        await deleteAccount(id);
      });
    });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Filter Event Listeners
  if (tabFilterAll) tabFilterAll.addEventListener('click', () => setFilter('all', tabFilterAll));
  if (tabFilterMesas) tabFilterMesas.addEventListener('click', () => setFilter('mesa', tabFilterMesas));
  if (tabFilterClientes) tabFilterClientes.addEventListener('click', () => setFilter('cliente', tabFilterClientes));
  if (tabFilterStaff) tabFilterStaff.addEventListener('click', () => setFilter('funcionario', tabFilterStaff));

  function setFilter(filterType, activeBtn) {
    currentFilter = filterType;
    [tabFilterAll, tabFilterMesas, tabFilterClientes, tabFilterStaff].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
    renderAccounts();
  }

  // Modal Controls
  if (btnNewAccount) {
    btnNewAccount.addEventListener('click', () => openNewModal());
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  if (accountTipo) {
    accountTipo.addEventListener('change', () => {
      if (groupPerfil) {
        groupPerfil.style.display = accountTipo.value === 'funcionario' ? 'flex' : 'none';
      }
    });
  }

  function openNewModal() {
    document.getElementById('modalTitle').textContent = 'Nova Conta';
    document.getElementById('accountId').value = '';
    document.getElementById('accountTipo').value = 'mesa';
    document.getElementById('accountNome').value = '';
    document.getElementById('accountLogin').value = '';
    document.getElementById('accountSenha').value = '123';
    document.getElementById('accountPerfil').value = 'atendente';
    document.getElementById('accountStatus').value = 'true';
    if (groupPerfil) groupPerfil.style.display = 'none';
    if (accountModal) accountModal.style.display = 'flex';
  }

  function openEditModal(id) {
    const acc = accountsList.find(a => a.id === id);
    if (!acc) return;

    document.getElementById('modalTitle').textContent = 'Editar Conta';
    document.getElementById('accountId').value = acc.id;
    document.getElementById('accountTipo').value = acc.tipo;
    document.getElementById('accountNome').value = acc.nome;
    document.getElementById('accountLogin').value = acc.login;
    document.getElementById('accountSenha').value = acc.senha || '123';
    document.getElementById('accountPerfil').value = acc.perfil || 'atendente';
    document.getElementById('accountStatus').value = acc.ativo ? 'true' : 'false';

    if (groupPerfil) {
      groupPerfil.style.display = acc.tipo === 'funcionario' ? 'flex' : 'none';
    }
    if (accountModal) accountModal.style.display = 'flex';
  }

  function closeModal() {
    if (accountModal) accountModal.style.display = 'none';
  }

  // Form Submit (Save / Update)
  if (accountForm) {
    accountForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('accountId').value;
      const tipo = document.getElementById('accountTipo').value;
      const nome = document.getElementById('accountNome').value.trim();
      const login = document.getElementById('accountLogin').value.trim();
      const senha = document.getElementById('accountSenha').value.trim() || '123';
      const perfil = tipo === 'funcionario' ? document.getElementById('accountPerfil').value : tipo;
      const ativo = document.getElementById('accountStatus').value === 'true';

      const payload = { tipo, nome, login, senha, perfil, ativo };
      const client = getSupabase();

      try {
        if (id) {
          // Update
          if (client && typeof client.from === 'function') {
            const query = client.from('usuarios').update(payload).eq('id', id);
            await window.safeSupabaseQuery(query, 2000);
          }

          const idx = accountsList.findIndex(a => a.id === id);
          if (idx !== -1) {
            accountsList[idx] = { ...accountsList[idx], ...payload };
          }
        } else {
          // Insert
          const newId = crypto.randomUUID ? crypto.randomUUID() : `user-${Date.now()}`;
          const newAcc = { id: newId, ...payload, criado_em: new Date().toISOString() };

          if (client && typeof client.from === 'function') {
            const query = client.from('usuarios').insert([newAcc]);
            await window.safeSupabaseQuery(query, 2000);
          }

          accountsList.unshift(newAcc);
        }

        renderAccounts();
        closeModal();
      } catch (err) {
        console.error('Erro ao salvar conta:', err);
        alert('Erro ao salvar conta.');
      }
    });
  }

  // Toggle Account Active Status
  async function toggleAccountStatus(id) {
    const acc = accountsList.find(a => a.id === id);
    if (!acc) return;

    const newStatus = !acc.ativo;
    try {
      const client = getSupabase();
      if (client && typeof client.from === 'function') {
        const query = client.from('usuarios').update({ ativo: newStatus }).eq('id', id);
        await window.safeSupabaseQuery(query, 2000);
      }

      acc.ativo = newStatus;
      renderAccounts();
    } catch (err) {
      console.error('Erro ao alterar status:', err);
    }
  }

  // Delete Account
  async function deleteAccount(id) {
    if (!confirm('Deseja realmente excluir esta conta?')) return;

    try {
      const client = getSupabase();
      if (client && typeof client.from === 'function') {
        const query = client.from('usuarios').delete().eq('id', id);
        await window.safeSupabaseQuery(query, 2000);
      }

      accountsList = accountsList.filter(a => a.id !== id);
      renderAccounts();
    } catch (err) {
      console.error('Erro ao excluir conta:', err);
    }
  }

  // Initial Load
  await loadAccounts();
});
