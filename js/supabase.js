// js/supabase.js — Cliente Supabase, sessão NeoOrder e utilitários de UI
//
// Toda a comunicação com o banco passa por funções RPC (SECURITY DEFINER).
// Nenhuma tela acessa tabelas diretamente: isso elimina os erros 400/409
// por divergência de colunas e o 401 por RLS mal configurada.

(function () {
  const SUPABASE_URL = 'https://nurnxrtxdcasrjcwxvky.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_e97hOiDRJhMbrF4smXlKWA_mV3it-Ef';
  const RPC_TIMEOUT_MS = 20000;
  const SESSION_KEY = 'neoorder_session';

  let supabaseClient = null;

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { apikey: SUPABASE_ANON_KEY } },
      db: { schema: 'public' }
    });
  } else {
    console.error('SDK do Supabase não carregado. Verifique a CDN antes de js/supabase.js.');
  }

  window.supabaseClient = supabaseClient;
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  window.getSupabaseClient = () => supabaseClient;
  window.getSupabase = () => supabaseClient;

  // ---------------------------------------------------------------------------
  // Sessão (token opaco emitido pelo banco no login)
  // ---------------------------------------------------------------------------

  const Session = {
    save(payload) {
      const data = {
        usuario: payload.usuario,
        token: payload.session_token,
        tipoSessao: payload.tipo_sessao,
        expiraEm: payload.expira_em
      };
      // sessionStorage: a sessão não sobrevive ao fechamento da aba (mesa compartilhada)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
      return data;
    },
    get() {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || !data.token || !data.usuario) return null;
        if (data.expiraEm && new Date(data.expiraEm).getTime() < Date.now()) {
          sessionStorage.removeItem(SESSION_KEY);
          return null;
        }
        return data;
      } catch (e) {
        console.warn('Sessão inválida:', e);
        return null;
      }
    },
    token() {
      const s = this.get();
      return s ? s.token : null;
    },
    clear() {
      sessionStorage.removeItem(SESSION_KEY);
    }
  };

  // ---------------------------------------------------------------------------
  // Chamadas RPC
  // ---------------------------------------------------------------------------

  class ApiError extends Error {
    constructor(message, code, original) {
      super(message);
      this.name = 'ApiError';
      this.code = code || '';
      this.original = original;
    }
  }

  function humanizeError(error) {
    if (!error) return 'Erro desconhecido ao falar com o servidor.';
    const raw = String(error.message || error.error_description || error || '').trim();
    const code = String(error.code || '');

    // PIN tem mensagem específica 28000 que não deve ser mascarada como "sessão expirou"
    if (/PIN/i.test(raw)) return raw;

    if (code === '28000' || /sess[aã]o.*(expir|inv[aá]lid)/i.test(raw)) {
      return 'Sua sessão expirou. Faça login novamente.';
    }
    if (code === '42501' || /acesso negado|permission denied/i.test(raw)) {
      return raw || 'Acesso negado para o seu perfil.';
    }
    if (code === '23505' || /duplicate key|j[aá] existe/i.test(raw)) {
      return raw || 'Este registro já existe.';
    }
    if (/invalid api key|jwt|unauthorized|401/i.test(raw)) {
      return 'Falha de autenticação com o Supabase. Verifique as chaves em js/supabase.js.';
    }
    if (/failed to fetch|networkerror|load failed|timeout/i.test(raw)) {
      return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.';
    }
    return raw || 'Não foi possível concluir a operação.';
  }

  async function callRpc(name, params = {}) {
    if (!supabaseClient) {
      throw new ApiError('Cliente Supabase indisponível. Recarregue a página.');
    }

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ApiError('Tempo esgotado ao contatar o servidor. Tente novamente.')), RPC_TIMEOUT_MS);
    });

    try {
      const request = supabaseClient.rpc(name, params);
      const result = await Promise.race([request, timeout]);
      clearTimeout(timer);

      if (result && result.error) {
        throw new ApiError(humanizeError(result.error), result.error.code, result.error);
      }
      return result ? result.data : null;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ApiError) throw err;
      throw new ApiError(humanizeError(err), err && err.code, err);
    }
  }

  const NeoAPI = {
    Session,
    ApiError,
    callRpc,
    // API pública
    pratosCardapio: () => callRpc('pratos_cardapio'),
    autenticar: async (login, senha) => {
      const res = await callRpc('autenticar_usuario', { p_login: login, p_senha: senha });
      if (!res || res.sucesso === false) {
        throw new ApiError((res && res.mensagem) || 'Não foi possível entrar.', res && res.codigo);
      }
      return res;
    },
    encerrarSessao: (token) => callRpc('encerrar_sessao', { p_session_token: token }),
    encerrarSessaoMesaAutorizada: async (mesaToken, pin) => {
      const res = await callRpc('encerrar_sessao_mesa_autorizada', {
        p_session_token_mesa: mesaToken,
        p_pin: pin
      });
      if (res && res.sucesso === false) {
        throw new ApiError(res.mensagem || 'PIN incorreto.', res.codigo, res);
      }
      return res;
    },
    // PIN individual de 6 dígitos para encerrar mesa (v2.8) — gestão exclusiva gerente
    definirPinFuncionario: (token, funcionarioId, pin) =>
      callRpc('definir_pin_funcionario', { p_session_token: token, p_target_usuario_id: funcionarioId, p_pin: pin }),
    removerPinFuncionario: (token, funcionarioId) =>
      callRpc('remover_pin_funcionario', { p_session_token: token, p_target_usuario_id: funcionarioId }),
    statusPinFuncionarios: (token) => callRpc('status_pin_funcionarios', { p_session_token: token }),
    // QR Code da mesa (assinaturas conferidas no banco em 20/10/2026; ver supabase-schema.md)
    // A duração de 12 h é a mesma da sessão aberta pelo login com senha.
    iniciarSessaoMesaQr: (qrToken) =>
      callRpc('iniciar_sessao_mesa', { p_qr_token: qrToken, p_duracao_horas: 12 }),
    gerarQrCodeMesa: (token, mesaId) =>
      callRpc('gerar_qr_code_mesa', { p_session_token: token, p_mesa_id: mesaId }),
    statusQrMesas: (token) => callRpc('status_qr_mesas', { p_session_token: token }),
    desativarQrMesa: (token, mesaId) =>
      callRpc('desativar_qr_mesa', { p_session_token: token, p_mesa_id: mesaId }),
    // QR Codes de equipe (gerente e atendente) — individual por funcionário
    iniciarSessaoFuncionarioQr: (qrToken) =>
      callRpc('iniciar_sessao_funcionario_qr', { p_qr_token: qrToken, p_duracao_horas: 12 }),
    gerarQrCodeFuncionario: (token, funcionarioId) =>
      callRpc('gerar_qr_code_funcionario', { p_session_token: token, p_funcionario_id: funcionarioId }),
    statusQrFuncionarios: (token) => callRpc('status_qr_funcionarios', { p_session_token: token }),
    desativarQrFuncionario: (token, funcionarioId) =>
      callRpc('desativar_qr_funcionario', { p_session_token: token, p_funcionario_id: funcionarioId }),
    precisaBootstrap: () => callRpc('sistema_precisa_bootstrap'),
    criarGerenteInicial: (login, senha, nome) =>
      callRpc('criar_gerente_inicial', { p_login: login, p_senha: senha, p_nome: nome }),
    // Mesa
    criarPedido: (token, itens) => callRpc('criar_pedido_mesa', { p_session_token: token, p_itens: itens }),
    meusPedidos: (token) => callRpc('meus_pedidos_mesa', { p_session_token: token }),
    criarChamado: (token, justificativa) =>
      callRpc('criar_chamado_mesa', { p_session_token: token, p_justificativa: justificativa }),
    // Atendimento
    painelAtendimento: (token) => callRpc('painel_atendimento', { p_session_token: token }),
    atualizarStatusPedido: (token, pedidoId, status) =>
      callRpc('atualizar_status_pedido', { p_session_token: token, p_pedido_id: pedidoId, p_novo_status: status }),
    resolverChamado: (token, chamadoId) =>
      callRpc('resolver_chamado', { p_session_token: token, p_chamado_id: chamadoId }),
    // Gerência
    listarEstoque: (token) => callRpc('listar_estoque', { p_session_token: token }),
    salvarIngrediente: (token, id, nome, unidade, quantidade) =>
      callRpc('salvar_ingrediente', {
        p_session_token: token, p_id: id, p_nome: nome, p_unidade: unidade, p_quantidade: quantidade
      }),
    excluirIngrediente: (token, id) =>
      callRpc('excluir_ingrediente', { p_session_token: token, p_id: id }),
    listarPratosAdmin: (token) => callRpc('listar_pratos_admin', { p_session_token: token }),
    salvarPrato: (token, id, dados, receita) =>
      callRpc('salvar_prato', { p_session_token: token, p_id: id, p_dados: dados, p_receita: receita }),
    excluirPrato: (token, id) => callRpc('excluir_prato', { p_session_token: token, p_id: id }),
    listarContas: (token) => callRpc('listar_contas', { p_session_token: token }),
    salvarConta: (token, conta) =>
      callRpc('salvar_conta', {
        p_session_token: token,
        p_id: conta.id || null,
        p_tipo: conta.tipo,
        p_nome: conta.nome,
        p_login: conta.login,
        p_senha: conta.senha || null,
        p_perfil: conta.perfil || null,
        p_ativo: conta.ativo
      }),
    definirStatusConta: (token, id, ativo) =>
      callRpc('definir_status_conta', { p_session_token: token, p_id: id, p_ativo: ativo }),
    excluirConta: (token, id) => callRpc('excluir_conta', { p_session_token: token, p_id: id }),
    relatorioFaturamento: (token, inicio, fim) =>
      callRpc('relatorio_faturamento', {
        p_session_token: token, p_data_inicio: inicio, p_data_fim: fim
      }),
    backupExportar: (token) => callRpc('backup_exportar', { p_session_token: token }),
    backupImportar: (token, payload, modo) =>
      callRpc('backup_importar', { p_session_token: token, p_payload: payload, p_modo: modo })
  };

  // ---------------------------------------------------------------------------
  // UI helpers (toast, confirmação, formatação)
  // ---------------------------------------------------------------------------

  const NeoUI = {
    toast(message, type = 'info', timeout = 4200) {
      let host = document.getElementById('neo-toast-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'neo-toast-host';
        host.className = 'toast-host';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        document.body.appendChild(host);
      }
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
      el.innerHTML = `<span class="material-symbols-outlined">${icon}</span><span>${escapeHtml(message)}</span>`;
      host.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 220);
      }, timeout);
    },
    money(value) {
      const n = Number(value || 0);
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },
    dateTime(value) {
      if (!value) return '—';
      return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    },
    time(value) {
      if (!value) return '—';
      return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    },
    statusBadge(status) {
      const map = {
        'Pendente': 'badge-pending',
        'Em Preparo': 'badge-preparing',
        'Pronto': 'badge-ready',
        'Entregue': 'badge-available',
        'Cancelado': 'badge-unavailable',
        'Atendido': 'badge-available'
      };
      const cls = map[status] || 'badge-pending';
      return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
    },
    setBusy(button, busy, labelWhenBusy = 'Processando...') {
      if (!button) return;
      if (busy) {
        button.dataset.originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<span class="spinner"></span><span>${escapeHtml(labelWhenBusy)}</span>`;
      } else {
        button.disabled = false;
        if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
      }
    },
    empty(container, icon, title, subtitle) {
      if (!container) return;
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined">${escapeHtml(icon)}</span>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(subtitle || '')}</span>
        </div>`;
    }
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.NeoAPI = NeoAPI;
  window.NeoUI = NeoUI;
  window.escapeHtml = escapeHtml;
  window.safeSupabaseQuery = null; // substituído por NeoAPI.callRpc (com erro real)

  // ---------------------------------------------------------------------------
  // Tema claro/escuro
  // ---------------------------------------------------------------------------

  (function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);

    document.addEventListener('DOMContentLoaded', () => {
      updateThemeIcons(saved);
      const btn = document.getElementById('btnToggleTheme');
      if (btn) {
        btn.addEventListener('click', () => {
          const current = document.documentElement.getAttribute('data-theme') || 'light';
          const next = current === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          localStorage.setItem('theme', next);
          updateThemeIcons(next);
        });
      }
    });
  })();

  // ---------------------------------------------------------------------------
  // Acessibilidade e navegação responsiva (comum a todas as páginas)
  // ---------------------------------------------------------------------------

  const ICON_SELECTOR = '.material-symbols-outlined, .fas, .far';
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Ícones de ligadura ("dark_mode", "close"...) não devem ser lidos como texto.
  function hideDecorativeIcons(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches(ICON_SELECTOR) && !root.hasAttribute('aria-hidden')) {
      root.setAttribute('aria-hidden', 'true');
    }
    root.querySelectorAll(ICON_SELECTOR).forEach(icon => {
      if (!icon.hasAttribute('aria-hidden')) icon.setAttribute('aria-hidden', 'true');
    });
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden]')) return false;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (node.style && node.style.display === 'none') return false;
    }
    return true;
  }

  // Menu hambúrguer das páginas de gestão (< 1024px)
  const NeoNav = {
    toggle: null,
    panel: null,
    isOpen() {
      return !!(this.panel && this.panel.classList.contains('is-open'));
    },
    open() {
      if (!this.toggle || !this.panel) return;
      this.panel.classList.add('is-open');
      this.toggle.setAttribute('aria-expanded', 'true');
      this.setLabel(true);
    },
    close(restoreFocus) {
      if (!this.toggle || !this.panel || !this.isOpen()) return;
      this.panel.classList.remove('is-open');
      this.toggle.setAttribute('aria-expanded', 'false');
      this.setLabel(false);
      if (restoreFocus) this.toggle.focus();
    },
    setLabel(open) {
      const icon = this.toggle.querySelector('.material-symbols-outlined');
      const label = this.toggle.querySelector('.nav-toggle-label');
      if (icon) icon.textContent = open ? 'close' : 'menu';
      if (label) label.textContent = open ? 'Fechar' : 'Menu';
      this.toggle.setAttribute('aria-label', open ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
    },
    init() {
      this.toggle = document.getElementById('btnNavToggle');
      this.panel = this.toggle ? document.getElementById(this.toggle.getAttribute('aria-controls')) : null;
      if (!this.toggle || !this.panel) return;

      this.toggle.addEventListener('click', () => (this.isOpen() ? this.close(false) : this.open()));

      // Fecha ao escolher um link
      this.panel.addEventListener('click', e => {
        if (e.target.closest('a[href]')) this.close(false);
      });

      // Fecha ao clicar fora do cabeçalho
      document.addEventListener('click', e => {
        if (this.isOpen() && !e.target.closest('.header')) this.close(false);
      });

      // Fecha quando o foco sai do cabeçalho pelo teclado
      const header = this.toggle.closest('.header');
      if (header) {
        header.addEventListener('focusout', e => {
          if (this.isOpen() && e.relatedTarget && !header.contains(e.relatedTarget)) this.close(false);
        });
      }

      // Volta ao layout de desktop: o painel deixa de ser um menu
      if (window.matchMedia) {
        const mq = window.matchMedia('(min-width: 1024px)');
        const onChange = () => { if (mq.matches) this.close(false); };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
      }
    }
  };

  // Modais: diálogo acessível sem mudar o contrato das páginas
  // (as telas continuam abrindo/fechando com style.display = 'flex' | 'none').
  const NeoModal = {
    stack: [],
    openers: new WeakMap(),
    card(overlay) {
      return overlay.querySelector('.modal-card') || overlay;
    },
    isOpen(overlay) {
      return overlay.style.display !== '' && overlay.style.display !== 'none';
    },
    top() {
      for (let i = this.stack.length - 1; i >= 0; i--) {
        if (this.isOpen(this.stack[i])) return this.stack[i];
      }
      return null;
    },
    prepare(overlay) {
      const card = this.card(overlay);
      if (!card.hasAttribute('role')) card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
      if (!card.hasAttribute('aria-labelledby') && !card.hasAttribute('aria-label')) {
        const title = card.querySelector('.modal-title');
        if (title) {
          if (!title.id) title.id = `${overlay.id || 'modal'}-titulo`;
          card.setAttribute('aria-labelledby', title.id);
        }
      }
      overlay.querySelectorAll('.modal-close').forEach(btn => {
        if (!btn.hasAttribute('aria-label')) btn.setAttribute('aria-label', 'Fechar');
      });
    },
    onOpen(overlay) {
      if (!this.stack.includes(overlay)) this.stack.push(overlay);
      const active = document.activeElement;
      if (active && active !== document.body && !overlay.contains(active)) {
        this.openers.set(overlay, { el: active, key: this.openerKey(active) });
      }
      NeoNav.close(false);
      document.body.classList.add('modal-open');
      const card = this.card(overlay);
      try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
    },
    onClose(overlay) {
      this.stack = this.stack.filter(o => o !== overlay);
      if (!this.top()) document.body.classList.remove('modal-open');
      const opener = this.openers.get(overlay);
      this.openers.delete(overlay);
      if (!opener) return;
      // A lista pode ter sido re-renderizada com o modal aberto: usa o botão equivalente.
      let target = opener.el;
      if (!target.isConnected && opener.key) {
        try { target = document.querySelector(opener.key); } catch (e) { target = null; }
      }
      if (target && isVisible(target)) target.focus();
    },
    // Seletor estável do gatilho (id ou primeiro data-*), para reencontrá-lo após re-render.
    openerKey(el) {
      const esc = window.CSS && CSS.escape ? CSS.escape : v => String(v).replace(/["\\]/g, '\\$&');
      if (el.id) return `#${esc(el.id)}`;
      const attr = [...el.attributes].find(a => a.name.startsWith('data-'));
      return attr ? `${el.tagName.toLowerCase()}[${attr.name}="${esc(attr.value)}"]` : null;
    },
    close(overlay) {
      // Prefere o botão de fechar da própria tela (mantém resets de formulário).
      const closeBtn = overlay.querySelector('.modal-close');
      if (closeBtn) closeBtn.click();
      if (this.isOpen(overlay)) overlay.style.display = 'none';
    },
    trapTab(e, overlay) {
      const card = this.card(overlay);
      const items = [...card.querySelectorAll(FOCUSABLE)].filter(el => isVisible(el) && el.getClientRects().length);
      if (!items.length) { e.preventDefault(); card.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!card.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    },
    init() {
      const overlays = [...document.querySelectorAll('.modal-overlay')];
      const observer = typeof MutationObserver === 'function'
        ? new MutationObserver(records => {
            records.forEach(rec => {
              const overlay = rec.target;
              const open = this.isOpen(overlay);
              const wasOpen = overlay.dataset.neoOpen === '1';
              if (open && !wasOpen) { overlay.dataset.neoOpen = '1'; this.onOpen(overlay); }
              if (!open && wasOpen) { overlay.dataset.neoOpen = '0'; this.onClose(overlay); }
            });
          })
        : null;
      overlays.forEach(overlay => {
        this.prepare(overlay);
        overlay.dataset.neoOpen = this.isOpen(overlay) ? '1' : '0';
        if (observer) observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
      });

      document.addEventListener('keydown', e => {
        const overlay = this.top();
        if (e.key === 'Escape') {
          if (overlay) { e.preventDefault(); this.close(overlay); return; }
          if (NeoNav.isOpen()) { e.preventDefault(); NeoNav.close(true); }
          return;
        }
        if (e.key === 'Tab' && overlay) this.trapTab(e, overlay);
      });
    }
  };

  window.NeoNav = NeoNav;
  window.NeoModal = NeoModal;

  document.addEventListener('DOMContentLoaded', () => {
    hideDecorativeIcons(document.body);
    if (typeof MutationObserver === 'function') {
      new MutationObserver(records => {
        records.forEach(rec => rec.addedNodes.forEach(node => {
          if (node.nodeType === 1) hideDecorativeIcons(node);
        }));
      }).observe(document.body, { childList: true, subtree: true });
    }
    NeoNav.init();
    NeoModal.init();
    syncSegmentedControls();
    markScrollableTables();
    syncUserChipTitle();
  });

  // Chip do usuário pode truncar com reticências: o nome completo fica no title
  function syncUserChipTitle() {
    const info = document.getElementById('userInfo');
    const chip = info && info.closest('.user-chip');
    if (!chip) return;
    const sync = () => chip.setAttribute('title', info.textContent.trim());
    sync();
    if (typeof MutationObserver === 'function') {
      new MutationObserver(sync).observe(info, { childList: true, characterData: true, subtree: true });
    }
  }

  // Marca tabelas que rolam na horizontal (sombra na coluna de ações fixa)
  function markScrollableTables() {
    const containers = document.querySelectorAll('.table-container');
    if (!containers.length || typeof ResizeObserver !== 'function') return;
    const update = c => c.classList.toggle('is-scrollable', c.scrollWidth > c.clientWidth + 1);
    const ro = new ResizeObserver(entries => entries.forEach(e => update(e.target.closest('.table-container'))));
    containers.forEach(c => {
      ro.observe(c);
      const table = c.querySelector('table');
      if (table) ro.observe(table);
    });
  }

  // Botões de filtro/aba (.segmented-control) expõem o estado ativo via aria-pressed
  function syncSegmentedControls() {
    const buttons = document.querySelectorAll('.segmented-control .tab-btn');
    const sync = btn => btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
    buttons.forEach(sync);
    if (typeof MutationObserver !== 'function') return;
    const observer = new MutationObserver(records => records.forEach(rec => sync(rec.target)));
    buttons.forEach(btn => observer.observe(btn, { attributes: true, attributeFilter: ['class'] }));
  }

  function updateThemeIcons(theme) {
    document.querySelectorAll('#btnToggleTheme').forEach(btn => {
      const icon = btn.querySelector('.material-symbols-outlined, .fas');
      if (!icon) return;
      if (icon.classList.contains('fas')) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      } else {
        icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
      }
    });
  }
})();
