/**
 * NeoOrder - Operação e Atendimento (Atendente & Gerente)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Auth check: Allow atendente or gerente
  const user = NeoAuth.requireAuth(['atendente', 'gerente']);
  if (!user) return;

  const userInfoEl = document.getElementById('userInfo');
  if (userInfoEl) {
    userInfoEl.textContent = `${user.nome} (${(user.perfil || user.tipo).toUpperCase()})`;
  }

  // Logout button
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => NeoAuth.logout());
  }

  // Audio Alerts State & Web Audio API
  let audioAlertsActive = false;
  let audioContext = null;

  const btnAudioToggle = document.getElementById('btnAudioToggle');
  const audioIcon = document.getElementById('audioIcon');
  const audioLabel = document.getElementById('audioLabel');

  function toggleAudioAlerts() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }

    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }

    audioAlertsActive = !audioAlertsActive;

    if (audioAlertsActive) {
      btnAudioToggle.style.background = 'var(--success)';
      btnAudioToggle.style.color = '#FFFFFF';
      audioIcon.style.color = '#FFFFFF';
      audioLabel.textContent = 'Alertas Sonoros Ativos';
      playSampleBeep(880, 0.15);
    } else {
      btnAudioToggle.style.background = 'var(--surface-card)';
      btnAudioToggle.style.color = 'var(--text-main)';
      audioIcon.style.color = 'var(--primary)';
      audioLabel.textContent = 'Ativar Alertas Sonoros';
    }
  }

  function playSampleBeep(frequency = 880, duration = 0.2) {
    if (!audioAlertsActive || !audioContext) return;
    try {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.2, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (e) {
      console.warn("Audio playback error:", e);
    }
  }

  if (btnAudioToggle) {
    btnAudioToggle.addEventListener('click', toggleAudioAlerts);
  }

  // Helper for Supabase Client
  function getClient() {
    return window.supabaseClient;
  }

  // Data State
  let calls = [];
  let orders = [];
  let dishes = [];
  let ingredients = [];
  let pratoIngredientesMap = {};
  let knownCallIds = new Set();
  let knownOrderIds = new Set();
  let selectedCancelOrderId = null;

  // Default Mock Data Fallbacks
  const mockCalls = [
    {
      id: 'c1111111-1111-1111-1111-111111111111',
      mesa_id: '10000000-0000-0000-0000-000000000004',
      mesa_nome: 'Mesa 04',
      motivo: 'Solicitação de 2 taças extras de vinho e verificar reposição de azeite.',
      status: 'Pendente',
      criado_em: new Date(Date.now() - 2 * 60000).toISOString()
    },
    {
      id: 'c2222222-2222-2222-2222-222222222222',
      mesa_id: '10000000-0000-0000-0000-000000000008',
      mesa_nome: 'Mesa 08',
      motivo: 'Dúvida sobre o ponto da carne no prato Filé Mignon.',
      status: 'Pendente',
      criado_em: new Date(Date.now() - 4 * 60000).toISOString()
    }
  ];

  const mockOrders = [
    {
      id: 'a1033000-0000-0000-0000-000000001033',
      mesa_id: '10000000-0000-0000-0000-000000000002',
      mesa_nome: 'Mesa 02',
      valor_total: 89.90,
      status: 'Recebido',
      criado_em: new Date(Date.now() - 3 * 60000).toISOString(),
      pedido_itens: [
        { id: 'b1010000-0000-0000-0000-000000000001', prato_id: 'd1111111-1111-1111-1111-111111111111', quantidade: 1, preco_unitario: 89.90, pratos: { nome: 'Filé Mignon ao Roti' } }
      ]
    },
    {
      id: 'a1032000-0000-0000-0000-000000001032',
      mesa_id: '10000000-0000-0000-0000-000000000008',
      mesa_nome: 'Mesa 08',
      valor_total: 149.00,
      status: 'Em preparo',
      criado_em: new Date(Date.now() - 10 * 60000).toISOString(),
      pedido_itens: [
        { id: 'b1020000-0000-0000-0000-000000000002', prato_id: 'd2222222-2222-2222-2222-222222222222', quantidade: 2, preco_unitario: 74.50, pratos: { nome: 'Risoto de Cogumelos Frescos' } }
      ]
    },
    {
      id: 'a1030000-0000-0000-0000-000000001030',
      mesa_id: '10000000-0000-0000-0000-000000000001',
      mesa_nome: 'Mesa 01',
      valor_total: 98.00,
      status: 'Entregue',
      criado_em: new Date(Date.now() - 25 * 60000).toISOString(),
      pedido_itens: [
        { id: 'b1030000-0000-0000-0000-000000000003', prato_id: 'd3333333-3333-3333-3333-333333333333', quantidade: 1, preco_unitario: 98.00, pratos: { nome: 'Salmão Grelhado com Alcaparras' } }
      ]
    }
  ];

  // DOM Elements
  const callsContainer = document.getElementById('callsContainer');
  const badgePendingCalls = document.getElementById('badgePendingCalls');

  const colReceived = document.getElementById('colReceived');
  const colInPrep = document.getElementById('colInPrep');
  const colDone = document.getElementById('colDone');

  const countReceived = document.getElementById('countReceived');
  const countInPrep = document.getElementById('countInPrep');
  const countDone = document.getElementById('countDone');

  const cancelModal = document.getElementById('cancelModal');
  const btnCloseCancelModal = document.getElementById('btnCloseCancelModal');
  const btnCancelModalBack = document.getElementById('btnCancelModalBack');
  const btnConfirmCancelOrder = document.getElementById('btnConfirmCancelOrder');
  const modalOrderId = document.getElementById('modalOrderId');
  const modalOrderMesa = document.getElementById('modalOrderMesa');

  // Load Recipe and Stock Mappings for Stock Reversal (RN-04)
  async function loadStockAndRecipes() {
    try {
      const client = window.supabaseClient;
      if (client && typeof client.from === 'function') {
        const { data: ingData } = await client.from('estoque').select('*');
        if (ingData) ingredients = ingData;

        const { data: piData } = await client.from('prato_ingredientes').select('*');
        if (piData) {
          pratoIngredientesMap = {};
          piData.forEach(row => {
            if (!pratoIngredientesMap[row.prato_id]) pratoIngredientesMap[row.prato_id] = [];
            pratoIngredientesMap[row.prato_id].push({
              ingrediente_id: row.ingrediente_id,
              quantidade: parseFloat(row.quantidade)
            });
          });
        }
      }
    } catch (e) {
      console.warn("Error loading stock mappings:", e);
    }
  }

  // Poll Data
  async function fetchAllData() {
    await fetchCalls();
    await fetchOrders();
  }

  // Fetch Calls
  async function fetchCalls() {
    let freshCalls = [];
    try {
      const client = window.supabaseClient;
      if (client && typeof client.from === 'function') {
        const { data, error } = await client
          .from('chamados')
          .select('*, usuarios(nome, login)')
          .eq('status', 'Pendente')
          .order('criado_em', { ascending: false });

        if (!error && data && data.length > 0) {
          freshCalls = data.map(c => ({
            ...c,
            mesa_nome: c.usuarios ? (c.usuarios.nome || `Mesa ${c.usuarios.login}`) : (c.mesa_nome || 'Mesa')
          }));
        } else {
          freshCalls = mockCalls.filter(c => c.status === 'Pendente');
        }
      } else {
        freshCalls = mockCalls.filter(c => c.status === 'Pendente');
      }
    } catch (err) {
      freshCalls = mockCalls.filter(c => c.status === 'Pendente');
    }

    // Check for new calls to play alert
    let hasNew = false;
    freshCalls.forEach(c => {
      if (!knownCallIds.has(c.id)) {
        hasNew = true;
        knownCallIds.add(c.id);
      }
    });

    if (hasNew && knownCallIds.size > freshCalls.length) {
      playSampleBeep(880, 0.25);
    }

    calls = freshCalls;
    renderCalls();
  }

  // Render Calls
  function renderCalls() {
    if (badgePendingCalls) badgePendingCalls.textContent = `${calls.length} pendente${calls.length === 1 ? '' : 's'}`;

    if (!callsContainer) return;

    if (calls.length === 0) {
      callsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: var(--space-xl); background: var(--surface-card); border-radius: 12px; border: 1px solid var(--border-subtle);">
          <span class="material-symbols-outlined" style="color: var(--success); font-size: 32px; display: block; margin-bottom: 4px;">check_circle</span>
          <span style="font-weight: 600; color: var(--text-main);">Nenhum chamado pendente</span>
          <p style="font-size: 13px; margin-top: 2px;">Todas as solicitações de mesas foram atendidas.</p>
        </div>`;
      return;
    }

    callsContainer.innerHTML = calls.map(c => {
      const timeStr = new Date(c.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div class="card flex-col" style="justify-content: space-between; border-left: 4px solid var(--danger);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-xs);">
            <div>
              <div style="font-weight: 700; font-size: 16px; color: var(--primary);">${c.mesa_nome}</div>
              <div style="font-size: 12px; color: var(--text-muted);">Horário: ${timeStr}</div>
            </div>
            <span class="status-badge" style="background: rgba(157, 2, 8, 0.15); color: var(--danger);">Pendente</span>
          </div>

          <div style="background: var(--surface-container-low); padding: var(--space-sm); border-radius: 8px; margin-bottom: var(--space-md); font-size: 13px; color: var(--text-main);">
            "${c.motivo}"
          </div>

          <div style="display: flex; justify-content: flex-end;">
            <button type="button" class="btn btn-primary btn-resolve-call" data-id="${c.id}" style="background: var(--success); border: none; padding: 6px 14px; min-height: 36px;">
              <span class="material-symbols-outlined" style="font-size: 18px;">check</span>
              <span>Marcar como Atendido</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    callsContainer.querySelectorAll('.btn-resolve-call').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        await resolveCall(id);
      });
    });
  }

  // Resolve Call
  async function resolveCall(callId) {
    const call = calls.find(c => c.id === callId);
    if (call) call.status = 'Atendido';

    try {
      const client = window.supabaseClient;
      if (client && typeof client.from === 'function') {
        await client.from('chamados').update({ status: 'Atendido' }).eq('id', callId);
      }
    } catch (e) {
      console.warn("Resolve call error:", e);
    }

    calls = calls.filter(c => c.id !== callId);
    renderCalls();
  }

  // Fetch Orders
  async function fetchOrders() {
    let freshOrders = [];
    try {
      const client = window.supabaseClient;
      if (client && typeof client.from === 'function') {
        const { data, error } = await client
          .from('pedidos')
          .select('*, pedido_itens(*, pratos(nome)), usuarios(nome, login)')
          .order('criado_em', { ascending: false });

        if (!error && data && data.length > 0) {
          freshOrders = data.map(o => ({
            ...o,
            mesa_nome: o.usuarios ? (o.usuarios.nome || `Mesa ${o.usuarios.login}`) : (o.mesa_nome || 'Mesa')
          }));
        } else {
          freshOrders = [...mockOrders];
        }
      } else {
        freshOrders = [...mockOrders];
      }
    } catch (e) {
      freshOrders = [...mockOrders];
    }

    orders = freshOrders;
    renderOrdersKanban();
  }

  // Render Orders Kanban
  function renderOrdersKanban() {
    const receivedList = orders.filter(o => o.status === 'Recebido');
    const inPrepList = orders.filter(o => o.status === 'Em preparo');
    const doneList = orders.filter(o => o.status === 'Pronto' || o.status === 'Entregue');

    if (countReceived) countReceived.textContent = receivedList.length;
    if (countInPrep) countInPrep.textContent = inPrepList.length;
    if (countDone) countDone.textContent = doneList.length;

    if (colReceived) colReceived.innerHTML = renderOrderCardsGroup(receivedList, 'Recebido');
    if (colInPrep) colInPrep.innerHTML = renderOrderCardsGroup(inPrepList, 'Em preparo');
    if (colDone) colDone.innerHTML = renderOrderCardsGroup(doneList, 'Pronto');

    attachOrderActionListeners();
  }

  function renderOrderCardsGroup(groupOrders, currentStage) {
    if (groupOrders.length === 0) {
      return `<div style="text-align: center; color: var(--text-muted); padding: var(--space-md); font-size: 13px;">Sem pedidos nesta coluna.</div>`;
    }

    return groupOrders.map(ord => {
      const timeStr = new Date(ord.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const itemsHtml = (ord.pedido_itens || []).map(pi => `
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-main);">
          <span>${pi.quantidade}x ${pi.pratos ? pi.pratos.nome : 'Item'}</span>
          <span style="color: var(--text-muted);">R$ ${(parseFloat(pi.preco_unitario) * pi.quantidade).toFixed(2).replace('.', ',')}</span>
        </div>
      `).join('');

      let actionBtn = '';
      if (currentStage === 'Recebido') {
        actionBtn = `
          <button type="button" class="btn btn-primary btn-advance-order" data-id="${ord.id}" data-next="Em preparo" style="padding: 4px 10px; min-height: 32px; font-size: 13px;">
            <span>Iniciar Preparo</span>
            <span class="material-symbols-outlined" style="font-size: 16px;">arrow_forward</span>
          </button>
        `;
      } else if (currentStage === 'Em preparo') {
        actionBtn = `
          <button type="button" class="btn btn-primary btn-advance-order" data-id="${ord.id}" data-next="Entregue" style="background: var(--success); border: none; padding: 4px 10px; min-height: 32px; font-size: 13px;">
            <span class="material-symbols-outlined" style="font-size: 16px;">check_circle</span>
            <span>Marcar Entregue</span>
          </button>
        `;
      }

      return `
        <div class="card flex-col" style="padding: var(--space-md); gap: var(--space-xs); border: 1px solid var(--border-subtle); background: var(--surface-card);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 700; font-size: 15px; color: var(--primary);">${ord.mesa_nome}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${timeStr}</div>
          </div>

          <div style="background: var(--surface-container-low); padding: var(--space-xs) var(--space-sm); border-radius: 6px; margin: 4px 0;" class="flex-col">
            ${itemsHtml}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <span style="font-weight: 700; font-size: 14px; color: var(--text-main);">
              R$ ${parseFloat(ord.valor_total).toFixed(2).replace('.', ',')}
            </span>

            <div style="display: flex; gap: 6px;">
              ${currentStage !== 'Pronto' && currentStage !== 'Entregue' ? `
                <button type="button" class="btn btn-danger btn-open-cancel" data-id="${ord.id}" data-mesa="${ord.mesa_nome}" style="padding: 4px 8px; min-height: 32px; font-size: 12px;">
                  Cancelar
                </button>
              ` : ''}
              ${actionBtn}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function attachOrderActionListeners() {
    document.querySelectorAll('.btn-advance-order').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const nextStatus = e.currentTarget.dataset.next;
        await updateOrderStatus(id, nextStatus);
      });
    });

    document.querySelectorAll('.btn-open-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const mesa = e.currentTarget.dataset.mesa;
        openCancelModal(id, mesa);
      });
    });
  }

  async function updateOrderStatus(orderId, newStatus) {
    const ord = orders.find(o => o.id === orderId);
    if (ord) ord.status = newStatus;

    try {
      const client = window.supabaseClient;
      if (client && typeof client.from === 'function') {
        await client.from('pedidos').update({ status: newStatus }).eq('id', orderId);
      }
    } catch (e) {
      console.warn("Update order status error:", e);
    }

    renderOrdersKanban();
  }

  // Cancel & Restock (RN-04)
  function openCancelModal(orderId, mesaName) {
    selectedCancelOrderId = orderId;
    if (modalOrderId) modalOrderId.textContent = `#${orderId.substring(0, 8)}`;
    if (modalOrderMesa) modalOrderMesa.textContent = mesaName;
    if (cancelModal) cancelModal.style.display = 'flex';
  }

  function closeCancelModal() {
    if (cancelModal) cancelModal.style.display = 'none';
    selectedCancelOrderId = null;
  }

  if (btnCloseCancelModal) btnCloseCancelModal.addEventListener('click', closeCancelModal);
  if (btnCancelModalBack) btnCancelModalBack.addEventListener('click', closeCancelModal);

  if (btnConfirmCancelOrder) {
    btnConfirmCancelOrder.addEventListener('click', async () => {
      if (!selectedCancelOrderId) return;

      const ord = orders.find(o => o.id === selectedCancelOrderId);
      if (ord) {
        ord.status = 'Cancelado';

        // Perform stock reversal (RN-04)
        if (ord.pedido_itens && ord.pedido_itens.length > 0) {
          const client = window.supabaseClient;
          ord.pedido_itens.forEach(pi => {
            const recipes = pratoIngredientesMap[pi.prato_id] || [];
            recipes.forEach(r => {
              const totalEstorno = parseFloat(r.quantidade) * pi.quantidade;
              const ing = ingredients.find(i => i.id === r.ingrediente_id);
              if (ing) {
                ing.quantidade = parseFloat(ing.quantidade) + totalEstorno;
                if (client && typeof client.from === 'function') {
                  client.from('estoque').update({ quantidade: ing.quantidade, atualizado_em: new Date().toISOString() }).eq('id', ing.id).then();
                }
              }
            });
          });
        }

        // Update order status in Supabase
        try {
          const client = window.supabaseClient;
          if (client && typeof client.from === 'function') {
            await client.from('pedidos').update({ status: 'Cancelado' }).eq('id', selectedCancelOrderId);
          }
        } catch (e) {
          console.warn("Cancel order error:", e);
        }
      }

      closeCancelModal();
      renderOrdersKanban();
    });
  }

  // Realtime Subscription
  function setupRealtime() {
    const client = window.supabaseClient;
    if (client && typeof client.channel === 'function') {
      client
        .channel('atendimento-realtime')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          fetchAllData();
        })
        .subscribe();
    }
  }

  // Initialize and Set Polling Interval (every 5 seconds)
  await loadStockAndRecipes();
  await fetchAllData();
  setupRealtime();
  setInterval(fetchAllData, 5000);
});
