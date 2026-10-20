// js/auth.js — Autenticação NeoOrder
//
// A senha é verificada no banco (bcrypt via pgcrypto) pela RPC
// `autenticar_usuario`. O front-end nunca lê a tabela `usuarios`.
// A sessão devolvida é um token opaco de 64 caracteres com validade de 12 h.
// Mesas também entram pelo QR Code (login.html?qr=...): RPC `iniciar_sessao_mesa`.

(function () {
  const TABS = {
    mesa: { btn: 'tabMesaBtn', content: 'mesaTabContent' },
    atendente: { btn: 'tabAttendantBtn', content: 'attendantTabContent' },
    gerente: { btn: 'tabManagerBtn', content: 'managerTabContent' }
  };

  let currentTab = 'mesa';

  document.addEventListener('DOMContentLoaded', async () => {
    // Lê e remove o token do QR da URL antes de qualquer outra coisa
    // (não fica no histórico, não é reenviado ao recarregar a página).
    const qrToken = consumirTokenQrDaUrl();

    bindTabs();
    bindForms();
    bindQr();

    const type = new URLSearchParams(window.location.search).get('type');
    if (type === 'staff' || type === 'atendente') switchTab('atendente');
    else if (type === 'gerente') switchTab('gerente');
    else switchTab('mesa');

    if (qrToken !== null) {
      await iniciarLoginPorQr(qrToken);
      return;
    }

    await checkBootstrap();
  });

  // ---------------------------------------------------------------------------
  // Login por QR Code (mesa e equipe)
  // Mesa: iniciar_sessao_mesa(p_qr_token text, p_duracao_horas integer)
  // Equipe: iniciar_sessao_funcionario_qr(p_qr_token text, p_duracao_horas integer)
  // ---------------------------------------------------------------------------

  // Formato aceito antes de consultar o servidor. O banco gera "MESA-" / "FUNC-" + 64 hex
  // e exige ao menos 20 caracteres; aqui só barramos lixo evidente.
  const QR_TOKEN_FORMATO = /^[A-Za-z0-9_-]{20,200}$/;

  const QR_MENSAGENS = {
    invalido: {
      titulo: 'QR Code inválido ou desativado',
      texto: 'Este QR Code não abre mais a mesa. Peça ajuda a um atendente ou entre com o usuário e a senha da mesa.'
    },
    invalido_staff: {
      titulo: 'QR Code inválido ou desativado',
      texto: 'Este QR Code não concede mais acesso de equipe. Solicite um novo QR a um gerente.'
    },
    rede: {
      titulo: 'Sem conexão com o servidor',
      texto: 'Verifique a internet do celular e toque em “Tentar novamente”.'
    },
    servidor: {
      titulo: 'Não foi possível validar o QR Code agora',
      texto: 'Tente novamente em instantes ou chame um atendente.'
    },
    sessao: {
      titulo: 'Não foi possível abrir a mesa',
      texto: 'O QR Code não corresponde a uma mesa. Chame um atendente.'
    },
    sessao_staff: {
      titulo: 'Não foi possível abrir o acesso de equipe',
      texto: 'O QR Code não corresponde a um funcionário válido. Chame um gerente.'
    }
  };

  let qrEmAndamento = false;   // impede chamadas simultâneas (cliques repetidos)
  let qrPendente = null;       // mantido só em memória para "Tentar novamente"

  function consumirTokenQrDaUrl() {
    let url;
    try {
      url = new URL(window.location.href);
    } catch (e) {
      return null;
    }
    if (!url.searchParams.has('qr')) return null;
    const token = String(url.searchParams.get('qr') || '').trim();
    url.searchParams.delete('qr');
    try {
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (e) { /* navegadores sem History API: segue com o fluxo */ }
    return token;
  }

  function bindQr() {
    const retry = document.getElementById('btnQrRetry');
    if (retry) {
      retry.addEventListener('click', () => {
        if (qrPendente) iniciarLoginPorQr(qrPendente);
      });
    }
    const usarSenha = document.getElementById('btnQrUsePassword');
    if (usarSenha) {
      usarSenha.addEventListener('click', () => {
        qrPendente = null;
        mostrarPainelQr(false);
        switchTab('mesa');
        const campo = document.getElementById('tableLogin');
        if (campo) campo.focus();
        checkBootstrap();
      });
    }
  }

  function mostrarPainelQr(ativo) {
    const painel = document.getElementById('qrLoginPanel');
    const senha = document.getElementById('passwordLoginArea');
    if (painel) painel.hidden = !ativo;
    if (senha) senha.hidden = !!ativo;
  }

  function estadoQr(estado, tipoErro) {
    const titulo = document.getElementById('qrLoginTitle');
    const texto = document.getElementById('qrLoginMessage');
    const spinner = document.getElementById('qrLoginSpinner');
    const icone = document.getElementById('qrLoginIcon');
    const acoes = document.getElementById('qrLoginActions');
    const retry = document.getElementById('btnQrRetry');
    const painel = document.getElementById('qrLoginPanel');

    mostrarPainelQr(true);
    const carregando = estado === 'carregando';
    const sucesso = estado === 'sucesso';
    if (painel) {
      painel.classList.toggle('is-error', estado === 'erro');
      painel.setAttribute('aria-busy', String(carregando || sucesso));
    }
    if (spinner) spinner.hidden = !(carregando || sucesso);
    if (icone) icone.hidden = carregando || sucesso;
    if (acoes) acoes.hidden = carregando || sucesso;

    if (carregando) {
      titulo.textContent = 'Validando o QR Code da mesa…';
      texto.textContent = 'Aguarde alguns segundos.';
    } else if (sucesso) {
      titulo.textContent = 'Mesa liberada!';
      texto.textContent = 'Abrindo o cardápio…';
    } else {
      const msg = QR_MENSAGENS[tipoErro] || QR_MENSAGENS.servidor;
      titulo.textContent = msg.titulo;
      texto.textContent = msg.texto;
      // Só faz sentido repetir quando a falha foi temporária.
      const podeRepetir = (tipoErro === 'rede' || tipoErro === 'servidor') && !!qrPendente;
      if (retry) {
        retry.hidden = !podeRepetir;
        retry.disabled = false; // a trava qrEmAndamento segue impedindo cliques simultâneos
      }
      const foco = podeRepetir ? retry : document.getElementById('btnQrUsePassword');
      if (foco) foco.focus();
    }
  }

  // Classifica a falha sem expor detalhes técnicos ao cliente.
  function classificarErroQr(err) {
    const code = String((err && err.code) || '');
    const original = err && err.original;
    const raw = [
      err && err.message,
      original && (original.message || original.details || original.hint),
      typeof original === 'string' ? original : ''
    ].filter(Boolean).join(' ');

    // 28000: QR inexistente, desativado, regenerado ou mesa inativa
    // (o banco não diferencia de propósito, para não revelar quais mesas existem).
    if (code === '28000' || /qr code inv[aá]lido/i.test(raw)) return 'invalido';
    if (/failed to fetch|networkerror|load failed|network request failed|tempo esgotado|timeout|n[aã]o foi poss[ií]vel conectar/i.test(raw)) return 'rede';
    return 'servidor';
  }

  async function iniciarLoginPorQr(qrToken) {
    if (qrEmAndamento) return;
    hideAlert();

    if (!QR_TOKEN_FORMATO.test(qrToken)) {
      qrPendente = null;
      console.warn('Login por QR: formato de token inválido (nenhuma chamada ao servidor).');
      estadoQr('erro', 'invalido');
      return;
    }

    qrEmAndamento = true;
    qrPendente = qrToken;
    estadoQr('carregando');
    const retry = document.getElementById('btnQrRetry');
    if (retry) retry.disabled = true;

    const ehQrStaff = qrToken.startsWith('FUNC-');
    const ehQrMesa = qrToken.startsWith('MESA-');

    try {
      // Staff QR (FUNC-) — só tenta RPC de staff
      if (ehQrStaff) {
        const data = await NeoAPI.iniciarSessaoFuncionarioQr(qrToken);
        const usuario = data && data.usuario;
        const ehStaff = usuario && usuario.tipo === 'funcionario' && data.tipo_sessao === 'funcionario';
        if (!data || !data.session_token || !ehStaff) {
          if (data && data.session_token) await NeoAPI.encerrarSessao(data.session_token).catch(() => {});
          qrPendente = null;
          console.warn('Login por QR: resposta do servidor não é uma sessão de funcionário.');
          estadoQr('erro', 'sessao_staff');
          return;
        }
        const perfilEfetivo = (usuario.perfil || 'atendente');
        const anterior = NeoAPI.Session.token();
        if (anterior && anterior !== data.session_token) await NeoAPI.encerrarSessao(anterior).catch(() => {});
        NeoAPI.Session.save(data);
        qrPendente = null;
        const titulo = document.getElementById('qrLoginTitle');
        const textoM = document.getElementById('qrLoginMessage');
        if (titulo) titulo.textContent = perfilEfetivo === 'gerente' ? 'Acesso de gerente liberado!' : 'Acesso de atendente liberado!';
        if (textoM) textoM.textContent = 'Abrindo o painel…';
        estadoQr('sucesso');
        if (perfilEfetivo === 'gerente') window.location.replace('faturamento.html');
        else window.location.replace('atendimento.html');
        return;
      }

      // Mesa QR (MESA- ou sem prefixo legado) — tenta mesa
      const data = await NeoAPI.iniciarSessaoMesaQr(qrToken);
      const usuario = data && data.usuario;
      const ehMesa = usuario && usuario.tipo === 'mesa' && data.tipo_sessao === 'mesa';
      if (!data || !data.session_token || !ehMesa) {
        if (data && data.session_token) await NeoAPI.encerrarSessao(data.session_token).catch(() => {});
        qrPendente = null;
        console.warn('Login por QR: resposta do servidor não é uma sessão de mesa.');
        estadoQr('erro', 'sessao');
        return;
      }
      const anterior2 = NeoAPI.Session.token();
      if (anterior2 && anterior2 !== data.session_token) await NeoAPI.encerrarSessao(anterior2).catch(() => {});
      NeoAPI.Session.save({ ...data, usuario: { ...usuario, perfil: 'mesa' } });
      qrPendente = null;
      estadoQr('sucesso');
      window.location.replace('cardapio.html');
    } catch (err) {
      const tipo = classificarErroQr(err);
      // Mensagem de inválido deve diferenciar staff vs mesa quando prefixo claro
      if (tipo === 'invalido' && ehQrStaff) qrPendente = null;
      else if (tipo === 'invalido') qrPendente = null;
      console.warn('Login por QR falhou:', tipo, (err && err.code) || '');
      if (tipo === 'invalido' && ehQrStaff) estadoQr('erro', 'invalido_staff');
      else estadoQr('erro', tipo);
    } finally {
      qrEmAndamento = false;
      if (retry) retry.disabled = false;
    }
  }

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
    // Logout com validação: mesa exige autorização de staff (gerente/atendente)
    async logout() {
      const perfil = this.profile();
      const token = this.getToken();
      if (perfil === 'mesa') {
        // Mesa: exige senha de funcionário autorizador
        // Se existir modal dedicado (cardapio.html), abre; senão cria dinamicamente
        const modal = document.getElementById('logoutMesaModal');
        if (modal) {
          modal.style.display = 'flex';
          const inp = document.getElementById('logoutStaffLogin');
          if (inp) inp.focus();
          return;
        }
        // Fallback: modal dinâmico se a página não trouxe o HTML
        criarModalLogoutMesaDinamico();
        return;
      }
      try {
        if (token) await NeoAPI.encerrarSessao(token);
      } catch (err) {
        console.warn('Falha ao encerrar sessão no servidor:', err);
        // Se for erro 42501 para mesa, não limpa localmente sem autorização
        if (err && err.code === '42501') {
          if (typeof NeoUI !== 'undefined') NeoUI.toast(err.message || 'Encerramento não autorizado.', 'error', 5000);
          return;
        }
      } finally {
        // Staff: limpa local e redireciona mesmo se servidor falhar (sessão já expirada é ok)
        if (perfil !== 'mesa') {
          NeoAPI.Session.clear();
          window.location.href = 'login.html';
        }
      }
    },
    // Chamado pelo modal de logout da mesa (staff autoriza)
    async logoutMesaComAutorizacao(staffLogin, staffSenha, button) {
      const token = this.getToken();
      if (!token) { NeoAPI.Session.clear(); window.location.href = 'login.html'; return; }
      if (!staffLogin || !staffSenha) {
        if (typeof NeoUI !== 'undefined') NeoUI.toast('Informe o login e a senha do funcionário.', 'error');
        return;
      }
      if (button && typeof NeoUI !== 'undefined') NeoUI.setBusy(button, true, 'Validando...');
      try {
        await NeoAPI.encerrarSessaoMesaAutorizada(token, staffLogin, staffSenha);
        NeoAPI.Session.clear();
        // Limpa carrinho da mesa (sessão encerrada não deve vazar para próximo cliente)
        try {
          const u = this.getUser();
          if (u && u.id) sessionStorage.removeItem('neoorder_cart_' + u.id);
        } catch (e) {}
        window.location.href = 'login.html';
      } catch (err) {
        if (typeof NeoUI !== 'undefined') NeoUI.toast(err.message || 'Não foi possível encerrar a sessão da mesa.', 'error', 6000);
        throw err;
      } finally {
        if (button && typeof NeoUI !== 'undefined') NeoUI.setBusy(button, false);
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

  function criarModalLogoutMesaDinamico() {
    if (document.getElementById('logoutMesaModal')) {
      document.getElementById('logoutMesaModal').style.display = 'flex';
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'logoutMesaModal';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="logoutMesaTitle" style="max-width:480px;">
      <div class="modal-header">
        <h3 class="modal-title" id="logoutMesaTitle">Encerrar sessão da mesa</h3>
        <button type="button" class="modal-close" id="btnCloseLogoutMesaModal" aria-label="Fechar"><span class="material-symbols-outlined">close</span></button>
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:var(--space-md);">Esta ação exige autorização de um funcionário. Informe as credenciais de um gerente ou atendente para liberar a mesa.</p>
      <form id="logoutMesaForm" class="flex-col">
        <div class="form-group">
          <label for="logoutStaffLogin" class="form-label">Login do funcionário</label>
          <div class="input-wrapper">
            <span class="material-symbols-outlined input-icon">badge</span>
            <input type="text" id="logoutStaffLogin" class="input-field" placeholder="Ex: gerente" required autocomplete="username">
          </div>
        </div>
        <div class="form-group">
          <label for="logoutStaffSenha" class="form-label">Senha do funcionário</label>
          <div class="input-wrapper">
            <span class="material-symbols-outlined input-icon">lock</span>
            <input type="password" id="logoutStaffSenha" class="input-field" placeholder="••••••••" required autocomplete="current-password">
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="btnCancelLogoutMesa">Cancelar</button>
          <button type="submit" class="btn btn-danger" id="btnConfirmLogoutMesa"><span class="material-symbols-outlined">logout</span><span>Encerrar sessão</span></button>
        </div>
      </form>
    </div>`;
    document.body.appendChild(overlay);
    const fechar = () => { overlay.style.display = 'none'; };
    overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
    const closeBtn = overlay.querySelector('#btnCloseLogoutMesaModal');
    if (closeBtn) closeBtn.addEventListener('click', fechar);
    const cancelBtn = overlay.querySelector('#btnCancelLogoutMesa');
    if (cancelBtn) cancelBtn.addEventListener('click', fechar);
    const form = overlay.querySelector('#logoutMesaForm');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = document.getElementById('logoutStaffLogin').value;
      const senha = document.getElementById('logoutStaffSenha').value;
      const btn = document.getElementById('btnConfirmLogoutMesa');
      try { await window.NeoAuth.logoutMesaComAutorizacao(login, senha, btn); } catch (err) {}
    });
    const first = overlay.querySelector('#logoutStaffLogin');
    if (first) first.focus();
  }

  // Ajustes de interface comuns às páginas internas.
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnLogout');
    if (btn) btn.addEventListener('click', () => window.NeoAuth.logout());

    // Modal estático de logout da mesa (cardapio.html)
    const logoutMesaModal = document.getElementById('logoutMesaModal');
    if (logoutMesaModal) {
      const fechar = () => { logoutMesaModal.style.display = 'none'; };
      logoutMesaModal.addEventListener('click', e => { if (e.target === logoutMesaModal) fechar(); });
      const closeBtn = document.getElementById('btnCloseLogoutMesaModal');
      if (closeBtn) closeBtn.addEventListener('click', fechar);
      const cancelBtn = document.getElementById('btnCancelLogoutMesa');
      if (cancelBtn) cancelBtn.addEventListener('click', fechar);
      const form = document.getElementById('logoutMesaForm');
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const login = document.getElementById('logoutStaffLogin').value;
        const senha = document.getElementById('logoutStaffSenha').value;
        const btnConfirm = document.getElementById('btnConfirmLogoutMesa');
        try { await window.NeoAuth.logoutMesaComAutorizacao(login, senha, btnConfirm); } catch (err) {}
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && logoutMesaModal.style.display !== 'none' && logoutMesaModal.style.display !== '') {
          e.preventDefault();
          fechar();
        }
      });
    }

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
