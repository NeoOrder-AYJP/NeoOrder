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
