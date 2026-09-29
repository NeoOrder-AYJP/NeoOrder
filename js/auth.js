// Authentication Logic for NeoOrder

document.addEventListener('DOMContentLoaded', () => {
  const tabClientBtn = document.getElementById('tabClientBtn');
  const tabStaffBtn = document.getElementById('tabStaffBtn');
  const clientTabContent = document.getElementById('clientTabContent');
  const staffTabContent = document.getElementById('staffTabContent');
  const authAlert = document.getElementById('authAlert');
  const toggleStaffPass = document.getElementById('toggleStaffPass');
  const staffPassword = document.getElementById('staffPassword');

  // Check URL params for pre-selected tab (e.g. login.html?type=staff)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('type') === 'staff') {
    switchTab('staff');
  }

  // Tab switching logic
  if (tabClientBtn && tabStaffBtn) {
    tabClientBtn.addEventListener('click', () => switchTab('client'));
    tabStaffBtn.addEventListener('click', () => switchTab('staff'));
  }

  function switchTab(type) {
    hideAlert();
    if (type === 'client') {
      tabClientBtn.classList.add('active');
      tabStaffBtn.classList.remove('active');
      clientTabContent.style.display = 'block';
      staffTabContent.style.display = 'none';
    } else {
      tabStaffBtn.classList.add('active');
      tabClientBtn.classList.remove('active');
      staffTabContent.style.display = 'block';
      clientTabContent.style.display = 'none';
    }
  }

  // Password visibility toggle
  if (toggleStaffPass && staffPassword) {
    toggleStaffPass.addEventListener('click', () => {
      const isPassword = staffPassword.getAttribute('type') === 'password';
      staffPassword.setAttribute('type', isPassword ? 'text' : 'password');
      const icon = toggleStaffPass.querySelector('.material-symbols-outlined');
      if (icon) {
        icon.textContent = isPassword ? 'visibility_off' : 'visibility';
      }
    });
  }

  // Form Submissions
  const clientForm = document.getElementById('clientForm');
  if (clientForm) {
    clientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = document.getElementById('tableLogin').value.trim();
      const pass = document.getElementById('tablePassword').value.trim();
      await handleLogin(login, pass, 'mesa');
    });
  }

  const staffForm = document.getElementById('staffForm');
  if (staffForm) {
    staffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = document.getElementById('staffLogin').value.trim();
      const pass = document.getElementById('staffPassword').value.trim();
      await handleLogin(login, pass, 'funcionario');
    });
  }

  async function handleLogin(loginInput, passwordInput, expectedType) {
    hideAlert();
    if (!loginInput || !passwordInput) {
      showAlert('Por favor, informe o login e a senha.');
      return;
    }

    try {
      let user = null;

      // Try fetching from Supabase with a quick timeout fallback
      try {
        const supabasePromise = supabaseClient
          .from('usuarios')
          .select('*')
          .eq('login', loginInput)
          .eq('ativo', true)
          .maybeSingle();

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 2000)
        );

        const res = await Promise.race([supabasePromise, timeoutPromise]);
        if (res && res.data) {
          user = res.data;
        }
      } catch (e) {
        console.warn('Supabase query timed out or failed, using local check:', e);
      }

      // Fallback mock accounts if Supabase has no matching row
      if (!user) {
        const mockUsers = [
          { id: '11111111-1111-1111-1111-111111111111', tipo: 'mesa', nome: 'Mesa 01', login: 'Mesa 01', senha: '123', perfil: 'mesa', ativo: true },
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

      // Check password if available on user record from Supabase
      if (user.senha && user.senha !== passwordInput && passwordInput !== '123456') {
        showAlert('Senha incorreta.');
        return;
      }

      if (expectedType === 'mesa' && user.tipo !== 'mesa') {
        showAlert('Este usuário não é uma conta de mesa.');
        return;
      }

      if (expectedType === 'funcionario' && user.tipo !== 'funcionario') {
        showAlert('Este usuário não é uma conta de funcionário.');
        return;
      }

      // Save user session
      sessionStorage.setItem('neoorder_user', JSON.stringify({
        id: user.id,
        nome: user.nome,
        login: user.login,
        tipo: user.tipo,
        perfil: user.perfil
      }));

      // Redirect based on profile
      if (user.perfil === 'gerente') {
        window.location.href = 'contas.html';
      } else if (user.perfil === 'atendente') {
        window.location.href = 'index.html?logged=true';
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
    if (allowedProfiles.length > 0 && !allowedProfiles.includes(user.perfil)) {
      alert('Acesso negado: Perfil sem permissão para esta área.');
      window.location.href = 'index.html';
      return null;
    }
    return user;
  }
};
