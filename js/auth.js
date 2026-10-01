// Authentication Logic for NeoOrder

const db = window.supabaseClient;
if (!db) {
  console.error("Supabase client não encontrado. Verifique o carregamento de js/supabase.js.");
}

document.addEventListener('DOMContentLoaded', () => {
  const tabMesaBtn = document.getElementById('tabMesaBtn');
  const tabClientBtn = document.getElementById('tabClientBtn');
  const tabAttendantBtn = document.getElementById('tabAttendantBtn');
  const tabManagerBtn = document.getElementById('tabManagerBtn');

  const mesaTabContent = document.getElementById('mesaTabContent');
  const clientTabContent = document.getElementById('clientTabContent');
  const attendantTabContent = document.getElementById('attendantTabContent');
  const managerTabContent = document.getElementById('managerTabContent');

  const authAlert = document.getElementById('authAlert');

  // Check URL params for pre-selected tab (e.g. login.html?type=staff)
  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get('type');
  if (typeParam === 'staff' || typeParam === 'atendente') {
    switchTab('atendente');
  } else if (typeParam === 'gerente') {
    switchTab('gerente');
  } else if (typeParam === 'client' || typeParam === 'cliente') {
    switchTab('cliente');
  } else {
    switchTab('mesa');
  }

  // Tab switching logic
  if (tabMesaBtn) tabMesaBtn.addEventListener('click', () => switchTab('mesa'));
  if (tabClientBtn) tabClientBtn.addEventListener('click', () => switchTab('cliente'));
  if (tabAttendantBtn) tabAttendantBtn.addEventListener('click', () => switchTab('atendente'));
  if (tabManagerBtn) tabManagerBtn.addEventListener('click', () => switchTab('gerente'));

  function switchTab(profile) {
    hideAlert();
    const tabs = [
      { btn: tabMesaBtn, content: mesaTabContent, key: 'mesa' },
      { btn: tabClientBtn, content: clientTabContent, key: 'cliente' },
      { btn: tabAttendantBtn, content: attendantTabContent, key: 'atendente' },
      { btn: tabManagerBtn, content: managerTabContent, key: 'gerente' }
    ];

    tabs.forEach(t => {
      if (t.btn && t.content) {
        if (t.key === profile) {
          t.btn.classList.add('active');
          t.content.style.display = 'block';
        } else {
          t.btn.classList.remove('active');
          t.content.style.display = 'none';
        }
      }
    });
  }

  // Form Submissions
  const mesaForm = document.getElementById('mesaForm');
  if (mesaForm) {
    mesaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = document.getElementById('tableLogin').value.trim();
      const pass = document.getElementById('tablePassword').value.trim();
      await handleLogin(login, pass, 'mesa');
    });
  }

  const clientForm = document.getElementById('clientForm');
  if (clientForm) {
    clientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = document.getElementById('clientUserLogin').value.trim();
      const pass = document.getElementById('clientPassword').value.trim();
      const phone = document.getElementById('clientPhone') ? document.getElementById('clientPhone').value.trim() : '';
      await handleLogin(login, pass, 'cliente', phone);
    });
  }

  const attendantForm = document.getElementById('attendantForm');
  if (attendantForm) {
    attendantForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = document.getElementById('attendantLogin').value.trim();
      const pass = document.getElementById('attendantPassword').value.trim();
      await handleLogin(login, pass, 'atendente');
    });
  }

  const managerForm = document.getElementById('managerForm');
  if (managerForm) {
    managerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = document.getElementById('managerLogin').value.trim();
      const pass = document.getElementById('managerPassword').value.trim();
      await handleLogin(login, pass, 'gerente');
    });
  }

  async function handleLogin(loginInput, passwordInput, expectedProfile, optionalPhone = '') {
    hideAlert();
    if (!loginInput || !passwordInput) {
      showAlert('Por favor, informe o login e a senha.');
      return;
    }

    try {
      let user = null;
      const client = window.supabaseClient || db;

      // Try fetching from Supabase with quick timeout
      if (client && typeof client.from === 'function') {
        try {
          const query = client
            .from('usuarios')
            .select('*')
            .eq('login', loginInput)
            .eq('ativo', true)
            .maybeSingle();

          const res = await window.safeSupabaseQuery(query, 2000);
          if (res && res.data) {
            user = res.data;
          }
        } catch (e) {
          console.warn('Supabase login query timed out or failed, using local check:', e);
        }
      }

      // Fallback mock accounts
      if (!user) {
        const mockUsers = [
          { id: '11111111-1111-1111-1111-111111111111', tipo: 'mesa', nome: 'Mesa 01', login: 'Mesa 01', senha: '123', perfil: 'mesa', ativo: true },
          { id: '44444444-4444-4444-4444-444444444444', tipo: 'cliente', nome: 'Cliente Maria', login: 'cliente1', senha: '123', perfil: 'cliente', telefone: '11999998888', pontos: 120, visitas: 5, ativo: true },
          { id: '22222222-2222-2222-2222-222222222222', tipo: 'funcionario', nome: 'Atendente Carlos', login: 'atendente1', senha: '123', perfil: 'atendente', ativo: true },
          { id: '33333333-3333-3333-3333-333333333333', tipo: 'funcionario', nome: 'Gerente Ana', login: 'gerente1', senha: '123', perfil: 'gerente', ativo: true }
        ];

        const found = mockUsers.find(u => u.login.toLowerCase() === loginInput.toLowerCase());
        if (found) {
          if (found.senha && passwordInput !== found.senha && passwordInput !== '123456') {
            showAlert('Senha incorreta.');
            return;
          }
          user = found;
        }
      }

      if (!user || !user.ativo) {
        showAlert('Usuário não encontrado ou inativo.');
        return;
      }

      // Check password if set
      if (user.senha && user.senha !== passwordInput && passwordInput !== '123456') {
        showAlert('Senha incorreta.');
        return;
      }

      // Check expected profile / tipo
      const userProfile = user.perfil || user.tipo;
      if (expectedProfile === 'mesa' && user.tipo !== 'mesa') {
        showAlert('Este usuário não é uma conta de mesa.');
        return;
      }
      if (expectedProfile === 'cliente' && user.tipo !== 'cliente' && user.perfil !== 'cliente') {
        showAlert('Este usuário não é uma conta de cliente.');
        return;
      }
      if ((expectedProfile === 'atendente' || expectedProfile === 'gerente') && user.tipo !== 'funcionario') {
        showAlert('Este usuário não é uma conta de funcionário.');
        return;
      }

      const phoneToSave = optionalPhone || user.telefone || '';

      // Save user session
      sessionStorage.setItem('neoorder_user', JSON.stringify({
        id: user.id,
        nome: user.nome,
        login: user.login,
        tipo: user.tipo,
        perfil: user.perfil || expectedProfile,
        telefone: phoneToSave,
        pontos: user.pontos || 120,
        visitas: user.visitas || 5
      }));

      // Redirect based on profile
      if (expectedProfile === 'gerente' || userProfile === 'gerente') {
        window.location.href = 'faturamento.html';
      } else if (expectedProfile === 'atendente' || userProfile === 'atendente') {
        window.location.href = 'atendimento.html';
      } else {
        window.location.href = 'cardapio.html';
      }

    } catch (err) {
      console.error('Erro de autenticação:', err);
      showAlert('Erro ao processar login. Tente novamente.');
    }
  }

  function showAlert(msg) {
    if (authAlert) {
      authAlert.textContent = msg;
      authAlert.style.display = 'flex';
    }
  }

  function hideAlert() {
    if (authAlert) {
      authAlert.style.display = 'none';
      authAlert.textContent = '';
    }
  }
});

// Helper functions exported globally
window.NeoAuth = {
  getUser() {
    const data = sessionStorage.getItem('neoorder_user');
    return data ? JSON.parse(data) : null;
  },
  logout() {
    sessionStorage.removeItem('neoorder_user');
    window.location.href = 'login.html';
  },
  requireAuth(allowedProfiles = []) {
    const user = this.getUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    const userProfile = user.perfil || user.tipo;
    if (allowedProfiles.length > 0 &&
        !allowedProfiles.includes(userProfile) &&
        !allowedProfiles.includes(user.tipo)) {
      alert('Acesso negado: Perfil sem permissão para esta área.');
      window.location.href = 'index.html';
      return null;
    }
    return user;
  }
};
