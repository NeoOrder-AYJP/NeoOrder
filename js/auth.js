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
  // Login pelo QR Code da mesa (login.html?qr=<token>)
  // RPC: iniciar_sessao_mesa(p_qr_token text, p_duracao_horas integer)
  // ---------------------------------------------------------------------------

  // Formato aceito antes de consultar o servidor. O banco gera "MESA-" + 64 hex
  // e exige ao menos 20 caracteres; aqui só barramos lixo evidente.
  const QR_TOKEN_FORMATO = /^[A-Za-z0-9_-]{20,200}$/;

  const QR_MENSAGENS = {
    invalido: {
      titulo: 'QR Code inválido ou desativado',
      texto: 'Este QR Code não abre mais a mesa. Peça ajuda a um atendente ou entre com o usuário e a senha da mesa.'
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

    try {
      const data = await NeoAPI.iniciarSessaoMesaQr(qrToken);

      // Somente uma sessão de MESA é aceita por este fluxo.
      const usuario = data && data.usuario;
      const ehMesa = usuario && usuario.tipo === 'mesa' && data.tipo_sessao === 'mesa';
      if (!data || !data.session_token || !ehMesa) {
        if (data && data.session_token) await NeoAPI.encerrarSessao(data.session_token).catch(() => {});
        qrPendente = null;
        console.warn('Login por QR: resposta do servidor não é uma sessão de mesa.');
        estadoQr('erro', 'sessao');
        return;
      }

      // Encerra no servidor uma sessão anterior desta aba (ex.: funcionário logado no mesmo aparelho).
      const anterior = NeoAPI.Session.token();
      if (anterior && anterior !== data.session_token) {
        await NeoAPI.encerrarSessao(anterior).catch(() => {});
      }

      NeoAPI.Session.save({ ...data, usuario: { ...usuario, perfil: 'mesa' } });
      qrPendente = null;
      estadoQr('sucesso');
      window.location.replace('cardapio.html');
    } catch (err) {
      const tipo = classificarErroQr(err);
      if (tipo === 'invalido') qrPendente = null;
      // Registra apenas a categoria e o código; nunca o token.
      console.warn('Login por QR falhou:', tipo, (err && err.code) || '');
      estadoQr('erro', tipo);
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
