// js/atendimento.js — Operação e atendimento (atendente e gerente)
//
// Painel alimentado por `painel_atendimento(token)`; toda mudança de status
// passa por `atualizar_status_pedido`, que valida transições e estorna o
// estoque no cancelamento (RN-04) dentro do banco.

(function () {
  const POLL_MS = 8000;

  let user = null;
  let token = null;
  let chamados = [];
  let pedidos = [];
  let knownCallIds = new Set();
  let primeiraCarga = true;
  let timer = null;
  let audioAtivo = false;
  let audioCtx = null;
  let selectedCancelId = null;

  document.addEventListener('DOMContentLoaded', async () => {
    user = window.NeoAuth.requireAuth(['atendente', 'gerente']);
    if (!user) return;

    token = window.NeoAuth.getToken();

    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
      const perfil = (user.perfil || 'atendente').toUpperCase();
      userInfo.textContent = `${user.nome} (${perfil})`;
    }

    setupAudio();
    setupCancelModal();
    setupVisibilityHandling();

    await carregarPainel();
    iniciarPolling();
  });

  // ---------------------------------------------------------------------------
  // Dados
  // ---------------------------------------------------------------------------

  function iniciarPolling() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) carregarPainel(true);
    }, POLL_MS);
  }

  function setupVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) carregarPainel(true);
    });
  }

  async function carregarPainel(silencioso = false) {
    try {
      const data = await NeoAPI.painelAtendimento(token);
      chamados = Array.isArray(data.chamados) ? data.chamados : [];
      pedidos = Array.isArray(data.pedidos) ? data.pedidos : [];

      const novosChamados = chamados.filter(c => !knownCallIds.has(c.id));
      if (!primeiraCarga && novosChamados.length && audioAtivo) {
        tocarAlerta();
      }
      chamados.forEach(c => knownCallIds.add(c.id));
      primeiraCarga = false;

      // O polling redesenha os cards: preserva o foco do teclado no mesmo botão
      const foco = chaveDoFoco();
      renderChamados();
      renderPedidos();
      restaurarFoco(foco);
    } catch (err) {
      console.error('Erro ao carregar painel:', err);
      if (err.code === '28000' || /sess[aã]o/i.test(err.message || '')) {
        NeoUI.toast('Sessão expirada. Faça login novamente.', 'error', 6000);
        setTimeout(() => window.NeoAuth.logout(), 1500);
        return;
      }
      if (!silencioso) NeoUI.toast(err.message || 'Não foi possível atualizar o painel.', 'error');
    }
  }

  function chaveDoFoco() {
    const el = document.activeElement;
    if (!el || !el.closest || el === document.body) return null;
    const esc = v => (window.CSS && CSS.escape ? CSS.escape(String(v)) : String(v));
    if (el.dataset && el.dataset.resolve) return `[data-resolve="${esc(el.dataset.resolve)}"]`;
    const card = el.closest('[data-pedido]');
    if (card) return `[data-pedido="${esc(card.dataset.pedido)}"] ${el.hasAttribute('data-cancel') ? '[data-cancel]' : '[data-status]'}`;
    return null;
  }

  function restaurarFoco(seletor) {
    if (!seletor) return;
    const alvo = document.querySelector(seletor);
    if (alvo && document.activeElement !== alvo) alvo.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------
  // Chamados
  // ---------------------------------------------------------------------------

  function renderChamados() {
    const container = document.getElementById('callsContainer');
    const badge = document.getElementById('badgePendingCalls');
    if (badge) badge.textContent = `${chamados.length} pendente${chamados.length === 1 ? '' : 's'}`;
    if (!container) return;

    if (!chamados.length) {
      NeoUI.empty(container, 'notifications_off', 'Nenhum chamado pendente', 'As mesas não fizeram chamados recentes.');
      return;
    }

    container.innerHTML = '';
    chamados.forEach(chamado => {
      const card = document.createElement('div');
      card.className = 'call-card';
      card.innerHTML = `
        <div class="flex-between">
          <span class="call-card-title">
            <span class="material-symbols-outlined" style="font-size:18px;color:var(--danger);">notifications_active</span>
            ${escapeHtml(chamado.mesa_nome || 'Mesa')}
          </span>
          <span class="order-card-meta">${horaRelativa(chamado.criado_em)}</span>
        </div>
        <div class="call-card-reason">${escapeHtml(chamado.justificativa || '')}</div>
        <div class="order-card-actions" style="justify-content:flex-end;">
          <button type="button" class="btn btn-primary" data-resolve="${chamado.id}" aria-label="Marcar chamado da ${escapeHtml(chamado.mesa_nome || 'mesa')} como atendido">
            <span class="material-symbols-outlined" style="font-size:16px;">task_alt</span>
            <span>Marcar como atendido</span>
          </button>
        </div>`;

      card.querySelector('[data-resolve]').addEventListener('click', e => resolverChamado(chamado.id, e.currentTarget));
      container.appendChild(card);
    });
  }

  async function resolverChamado(id, button) {
    NeoUI.setBusy(button, true, '...');
    try {
      await NeoAPI.resolverChamado(token, id);
      knownCallIds.delete(id);
      await carregarPainel(true);
      NeoUI.toast('Chamado atendido.', 'success', 2600);
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível atender o chamado.', 'error');
      NeoUI.setBusy(button, false);
    }
  }

  // ---------------------------------------------------------------------------
  // Pedidos (kanban)
  // ---------------------------------------------------------------------------

  function renderPedidos() {
    const colunas = {
      Pendente: document.getElementById('colReceived'),
      'Em Preparo': document.getElementById('colInPrep'),
      Pronto: document.getElementById('colDone')
    };
    const contadores = {
      Pendente: document.getElementById('countReceived'),
      'Em Preparo': document.getElementById('countInPrep'),
      Pronto: document.getElementById('countDone')
    };

    Object.values(colunas).forEach(col => { if (col) col.innerHTML = ''; });

    const grupos = { Pendente: [], 'Em Preparo': [], Pronto: [] };
    pedidos.forEach(p => {
      if (grupos[p.status]) grupos[p.status].push(p);
    });

    Object.keys(colunas).forEach(status => {
      if (contadores[status]) contadores[status].textContent = String(grupos[status].length);

      const col = colunas[status];
      if (!col) return;

      if (!grupos[status].length) {
        col.innerHTML = `<div class="order-card-meta" style="text-align:center;padding:var(--space-lg);">Nenhum pedido</div>`;
        return;
      }

      grupos[status].forEach(pedido => {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.dataset.pedido = pedido.id;
        const itens = (pedido.itens || [])
          .map(i => {
            const obs = i.observacao ? ` <em style="color:var(--warning); font-size:11px; font-weight:500;">— ${escapeHtml(i.observacao)}</em>` : '';
            return `<span>${i.quantidade}× ${escapeHtml(i.nome)}${obs}</span>`;
          })
          .join('');
        const obsGeral = pedido.observacao ? `<div style="margin: 8px 0; padding: 8px 10px; background: #fff8e1; border-left: 3px solid var(--warning); border-radius: 6px; font-size: 12px; line-height:1.4;"><strong style="color: var(--warning);">Obs. do pedido:</strong> ${escapeHtml(pedido.observacao)}</div>` : '';

        let acao = '';
        if (status === 'Pendente') {
          acao = `<button type="button" class="btn btn-primary" data-status="Em Preparo">
                    <span class="material-symbols-outlined" style="font-size:16px;">skillet</span>
                    <span>Iniciar preparo</span>
                  </button>`;
        } else if (status === 'Em Preparo') {
          acao = `<button type="button" class="btn btn-primary" data-status="Pronto">
                    <span class="material-symbols-outlined" style="font-size:16px;">room_service</span>
                    <span>Marcar pronto</span>
                  </button>`;
        } else {
          acao = `<button type="button" class="btn btn-primary" data-status="Entregue" style="background:var(--success);border:none;">
                    <span class="material-symbols-outlined" style="font-size:16px;">check_circle</span>
                    <span>Entregar</span>
                  </button>`;
        }

        card.innerHTML = `
          <div class="order-card-header">
            <span class="order-card-title">${escapeHtml(pedido.mesa_nome || 'Mesa')}</span>
            <span class="order-card-meta">${horaRelativa(pedido.criado_em)}</span>
          </div>
          <div class="order-card-meta">Pedido #${String(pedido.id).slice(0, 8)}</div>
          <div class="order-card-items">${itens || '<span class="order-card-meta">Sem itens</span>'}</div>
          ${obsGeral}
          <div class="order-card-total">${NeoUI.money(pedido.valor_total)}</div>
          <div class="order-card-actions">
            <button type="button" class="btn btn-danger" data-cancel aria-label="Cancelar pedido da ${escapeHtml(pedido.mesa_nome || 'mesa')}">
              <span class="material-symbols-outlined" style="font-size:16px;">cancel</span>
              <span>Cancelar</span>
            </button>
            ${acao}
          </div>`;

        card.querySelector('[data-status]').addEventListener('click', e =>
          mudarStatus(pedido.id, e.currentTarget.dataset.status, e.currentTarget));
        card.querySelector('[data-cancel]').addEventListener('click', () =>
          abrirCancelamento(pedido));
        col.appendChild(card);
      });
    });
  }

  async function mudarStatus(pedidoId, novoStatus, button) {
    NeoUI.setBusy(button, true, '...');
    try {
      await NeoAPI.atualizarStatusPedido(token, pedidoId, novoStatus);
      await carregarPainel(true);
      NeoUI.toast(`Pedido atualizado para "${novoStatus}".`, 'success', 2600);
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível atualizar o pedido.', 'error', 6000);
      NeoUI.setBusy(button, false);
    }
  }

  // ---------------------------------------------------------------------------
  // Cancelamento com confirmação (o estorno é feito no banco)
  // ---------------------------------------------------------------------------

  function setupCancelModal() {
    const modal = document.getElementById('cancelModal');
    if (!modal) return;

    const fechar = () => {
      modal.style.display = 'none';
      selectedCancelId = null;
    };

    ['btnCloseCancelModal', 'btnCancelModalBack'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', fechar);
    });

    const confirmar = document.getElementById('btnConfirmCancelOrder');
    if (confirmar) {
      confirmar.addEventListener('click', async () => {
        if (!selectedCancelId) return;
        NeoUI.setBusy(confirmar, true, 'Cancelando...');
        try {
          await NeoAPI.atualizarStatusPedido(token, selectedCancelId, 'Cancelado');
          fechar();
          await carregarPainel(true);
          NeoUI.toast('Pedido cancelado e estoque estornado.', 'success', 4000);
        } catch (err) {
          NeoUI.toast(err.message || 'Não foi possível cancelar o pedido.', 'error', 6000);
        } finally {
          NeoUI.setBusy(confirmar, false);
        }
      });
    }

    modal.addEventListener('click', e => {
      if (e.target === modal) fechar();
    });
  }

  function abrirCancelamento(pedido) {
    selectedCancelId = pedido.id;
    const modal = document.getElementById('cancelModal');
    const idEl = document.getElementById('modalOrderId');
    const mesaEl = document.getElementById('modalOrderMesa');
    if (idEl) idEl.textContent = `#${String(pedido.id).slice(0, 8)}`;
    if (mesaEl) mesaEl.textContent = pedido.mesa_nome || 'Mesa';
    if (modal) modal.style.display = 'flex';
  }

  // ---------------------------------------------------------------------------
  // Alertas sonoros
  // ---------------------------------------------------------------------------

  function setupAudio() {
    const btn = document.getElementById('btnAudioToggle');
    const label = document.getElementById('audioLabel');
    const icon = document.getElementById('audioIcon');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtx = new Ctx();
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      audioAtivo = !audioAtivo;

      if (audioAtivo) {
        btn.style.background = 'var(--success)';
        btn.style.color = '#FFFFFF';
        if (icon) icon.style.color = '#FFFFFF';
        if (label) label.textContent = 'Alertas Sonoros Ativos';
        tocarAlerta(); // feedback imediato (corrige o som que nunca tocava)
      } else {
        btn.style.background = 'var(--surface-card)';
        btn.style.color = 'var(--text-main)';
        if (icon) icon.style.color = 'var(--primary)';
        if (label) label.textContent = 'Ativar Alertas Sonoros';
      }
    });
  }

  function tocarAlerta() {
    if (!audioCtx) return;
    try {
      [880, 1180].forEach((freq, idx) => {
        const start = audioCtx.currentTime + idx * 0.18;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.18);
      });
    } catch (err) {
      console.warn('Falha ao tocar alerta:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Util
  // ---------------------------------------------------------------------------

  function horaRelativa(iso) {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
    return NeoUI.dateTime(iso);
  }
})();
