// js/auth.js — Autenticação NeoOrder
//
// A senha é verificada no banco (bcrypt via pgcrypto) pela RPC
// `autenticar_usuario`. O front-end nunca lê a tabela `usuarios`.
// A sessão devolvida é um token opaco de 64 caracteres com validade de 12 h.

(function () {
  const TABS = {
    mesa: { btn: 'tabMesaBtn', content: 'mesaTabContent' },
    atendente: { btn: 'tabAttendantBtn', content: 'attendantTabContent' },
    gerente: { btn: 'tabManagerBtn', content: 'managerTabContent' }
  };

  let currentTab = 'mesa';

  document.addEventListener('DOMContentLoaded', async () => {
    bindTabs();
    bindForms();

    const type = new URLSearchParams(window.location.search).get('type');
    if (type === 'staff' || type === 'atendente') switchTab('atendente');
    else if (type === 'gerente') switchTab('gerente');
    else switchTab('mesa');

    await checkBootstrap();
  });

  function bindTabs() {
    Object.entries(TABS).forEach(([key, cfg]) => {
      const btn = document.getElementById(cfg.btn);
      if (btn) btn.addEventListener('click', () => switchTab(key));
    });
  }

  function switchTab(profile) {
    if (!TABS[profile]) return;
    currentTab = profile;
    hideAlert();

    Object.entries(TABS).forEach(([key, cfg]) => {
      const btn = document.getElementById(cfg.btn);
      const content = document.getElementById(cfg.content);
      if (!btn || !content) return;
      const active = key === profile;
      btn.classList.toggle('active', active);
      content.style.display = active ? 'block' : 'none';
    });
  }

  function bindForms() {
    const mesaForm = document.getElementById('mesaForm');
    if (mesaForm) {
      mesaForm.addEventListener('submit', e => {
        e.preventDefault();
        handleLogin(
          document.getElementById('tableLogin').value,
          document.getElementById('tablePassword').value,
          'mesa',
          document.getElementById('btnMesaSubmit')
        );
      });
    }

    const attendantForm = document.getElementById('attendantForm');
    if (attendantForm) {
      attendantForm.addEventListener('submit', e => {
        e.preventDefault();
        handleLogin(
          document.getElementById('attendantLogin').value,
          document.getElementById('attendantPassword').value,
          'atendente',
          document.getElementById('btnAttendantSubmit')
        );
      });
    }

    const managerForm = document.getElementById('managerForm');
    if (managerForm) {
      managerForm.addEventListener('submit', e => {
        e.preventDefault();
        handleLogin(
          document.getElementById('managerLogin').value,
          document.getElementById('managerPassword').value,
          'gerente',
          document.getElementById('btnManagerSubmit')
        );
      });
    }

    const bootstrapForm = document.getElementById('bootstrapForm');
    if (bootstrapForm) {
      bootstrapForm.addEventListener('submit', e => {
        e.preventDefault();
        handleBootstrap();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  async function handleLogin(loginRaw, senhaRaw, expected, button) {
    hideAlert();
    const login = String(loginRaw || '').trim();
    const senha = String(senhaRaw || '');

    if (!login || !senha) {
      showAlert('Informe o usuário e a senha.');
      return;
    }

    NeoUI.setBusy(button, true, 'Entrando...');

    try {
      const data = await NeoAPI.autenticar(login, senha);

      if (!data || !data.session_token || !data.usuario) {
        showAlert('Resposta inválida do servidor. Tente novamente.');
        return;
      }

      const perfilEfetivo = data.usuario.tipo === 'mesa' ? 'mesa' : (data.usuario.perfil || 'atendente');

      // Impede escalada de privilégio: a aba escolhida precisa bater com o perfil real.
      if (expected === 'mesa' && perfilEfetivo !== 'mesa') {
        await NeoAPI.encerrarSessao(data.session_token).catch(() => {});
        showAlert('Esta conta não é uma mesa. Use a aba correta para entrar.');
        return;
      }
      if (expected === 'gerente' && perfilEfetivo !== 'gerente') {
        await NeoAPI.encerrarSessao(data.session_token).catch(() => {});
        showAlert('Esta conta não possui perfil de gerente.');
        return;
      }
      if (expected === 'atendente' && perfilEfetivo === 'mesa') {
        await NeoAPI.encerrarSessao(data.session_token).catch(() => {});
        showAlert('Esta conta é de mesa. Use a aba Mesa.');
        return;
      }

      NeoAPI.Session.save(data);

      if (perfilEfetivo === 'mesa') {
        window.location.href = 'cardapio.html';
      } else if (perfilEfetivo === 'gerente') {
        window.location.href = 'faturamento.html';
      } else {
        window.location.href = 'atendimento.html';
      }
    } catch (err) {
      console.warn('Falha no login:', err);
      showAlert(err.message || 'Não foi possível entrar. Tente novamente.');
    } finally {
      NeoUI.setBusy(button, false);
    }
  }

  // ---------------------------------------------------------------------------
  // Bootstrap: primeiro acesso (não existe gerente ativo)
  // ---------------------------------------------------------------------------

  async function checkBootstrap() {
    const panel = document.getElementById('bootstrapPanel');
    if (!panel) return;

    try {
      const precisa = await NeoAPI.precisaBootstrap();
      panel.style.display = precisa ? 'block' : 'none';
      if (precisa) {
        const card = document.querySelector('.auth-card');
        if (card) card.style.maxWidth = '560px';
      }
    } catch (err) {
      // Se a checagem falhar (ex.: offline), o formulário normal continua disponível.
      console.warn('Não foi possível verificar o bootstrap:', err);
      panel.style.display = 'none';
    }
  }

  async function handleBootstrap() {
    const nome = document.getElementById('bootstrapNome').value.trim();
    const login = document.getElementById('bootstrapLogin').value.trim();
    const senha = document.getElementById('bootstrapSenha').value;
    const senha2 = document.getElementById('bootstrapSenha2').value;
    const button = document.getElementById('btnBootstrapSubmit');

    hideAlert();

    if (!login || !nome) {
      showAlert('Informe o nome e o usuário do gerente inicial.');
      return;
    }
    if (senha.length < 8) {
      showAlert('A senha do gerente deve ter no mínimo 8 caracteres.');
      return;
    }
    if (senha !== senha2) {
      showAlert('As senhas não conferem.');
      return;
    }

    NeoUI.setBusy(button, true, 'Criando...');

    try {
      await NeoAPI.criarGerenteInicial(login, senha, nome);
      NeoUI.toast('Gerente inicial criado. Faça login para continuar.', 'success', 6000);
      document.getElementById('bootstrapPanel').style.display = 'none';
      document.getElementById('managerLogin').value = login;
      switchTab('gerente');
      document.getElementById('managerPassword').focus();
    } catch (err) {
      showAlert(err.message || 'Não foi possível criar o gerente inicial.');
    } finally {
      NeoUI.setBusy(button, false);
    }
  }

  function showAlert(msg) {
    const el = document.getElementById('authAlert');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'flex';
  }

  function hideAlert() {
    const el = document.getElementById('authAlert');
    if (!el) return;
    el.style.display = 'none';
    el.textContent = '';
  }

  // ---------------------------------------------------------------------------
  // API de sessão usada pelas páginas internas
  // ---------------------------------------------------------------------------

  window.NeoAuth = {
    getUser() {
      const session = NeoAPI.Session.get();
      return session ? session.usuario : null;
    },
    getToken() {
      return NeoAPI.Session.token();
    },
    profile() {
      const user = this.getUser();
      if (!user) return null;
      return user.tipo === 'mesa' ? 'mesa' : (user.perfil || 'atendente');
    },
    async logout() {
      const token = this.getToken();
      try {
        if (token) await NeoAPI.encerrarSessao(token);
      } catch (err) {
        console.warn('Falha ao encerrar sessão no servidor:', err);
      } finally {
        NeoAPI.Session.clear();
        window.location.href = 'login.html';
      }
    },
    requireAuth(allowedProfiles = []) {
      const user = this.getUser();
      if (!user) {
        window.location.href = 'login.html';
        return null;
      }
      const perfil = this.profile();
      if (allowedProfiles.length && !allowedProfiles.includes(perfil)) {
        NeoAPI.Session.clear();
        window.location.href = 'login.html?type=' + (perfil === 'mesa' ? 'mesa' : 'staff');
        return null;
      }
      return user;
    }
  };

  // Ajustes de interface comuns às páginas internas.
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnLogout');
    if (btn) btn.addEventListener('click', () => window.NeoAuth.logout());

    // Esconde atalhos que o perfil atual não pode executar (ex.: atendente
    // não acessa gestão). O servidor já bloqueia via _exigir_gerente; aqui
    // evitamos apenas o link que levaria a um redirecionamento.
    const perfil = window.NeoAuth.profile();
    document.querySelectorAll('[data-requires]').forEach(el => {
      const exigido = el.getAttribute('data-requires');
      if (exigido && perfil !== exigido) el.style.display = 'none';
    });
  });
})();
