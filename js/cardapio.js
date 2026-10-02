/**
 * NeoOrder - Cardápio & Pedidos da Mesa e Cliente
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Require Mesa or Cliente authentication session
  const user = window.NeoAuth ? window.NeoAuth.requireAuth(['mesa', 'cliente']) : null;
  if (!user) return;

  // Set header table/client info
  const mesaTitle = document.getElementById('mesaTitle');
  if (mesaTitle) {
    if (user.tipo === 'cliente' || user.perfil === 'cliente') {
      const pts = user.pontos !== undefined ? user.pontos : 120;
      const vis = user.visitas !== undefined ? user.visitas : 5;
      mesaTitle.textContent = `${user.nome} (🌟 ${pts} pts | ${vis} visitas)`;
    } else {
      mesaTitle.textContent = user.nome || `Mesa ${user.login}`;
    }
  }

  // Logout button
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (window.NeoAuth) window.NeoAuth.logout();
    });
  }

  // State
  let dishes = [];
  let ingredients = [];
  let pratoIngredientesMap = {};
  let cart = []; // items: { dishId, nome, preco, quantidade }
  let tableOrders = [];

  // Default Mock Fallbacks
  const mockIngredients = [
    { id: '11111111-1111-1111-1111-111111111111', nome: 'Mignon Bovino Prime', quantidade: 14.5, unidade: 'kg' },
    { id: '22222222-2222-2222-2222-222222222222', nome: 'Arroz Arbóreo Italiano', quantidade: 22.0, unidade: 'kg' },
    { id: '33333333-3333-3333-3333-333333333333', nome: 'Cogumelos Paris e Shimeji', quantidade: 1.2, unidade: 'kg' },
    { id: '44444444-4444-4444-4444-444444444444', nome: 'Salmão Fresco', quantidade: 0, unidade: 'kg' },
    { id: '55555555-5555-5555-5555-555555555555', nome: 'Laranja Pera', quantidade: 45.0, unidade: 'kg' }
  ];

  const mockDishes = [
    {
      id: 'd1111111-1111-1111-1111-111111111111',
      nome: 'Filé Mignon ao Roti',
      descricao: 'Medalhão de filé mignon grelhado com molho roti de especiarias e musseline de batatas.',
      preco: 89.90,
      imagem: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
      destaque: true,
      ativo: true
    },
    {
      id: 'd2222222-2222-2222-2222-222222222222',
      nome: 'Risoto de Cogumelos Frescos',
      descricao: 'Arroz arbóreo preparado com caldo de ervas, cogumelos Paris, Shimeji e finalizado com grana padano.',
      preco: 74.50,
      imagem: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=800&q=80',
      destaque: true,
      ativo: true
    },
    {
      id: 'd3333333-3333-3333-3333-333333333333',
      nome: 'Salmão Grelhado com Alcaparras',
      descricao: 'Posta de salmão grelhada ao molho de manteiga, alcaparras e legumes ao vapor.',
      preco: 98.00,
      imagem: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=80',
      destaque: false,
      ativo: true
    }
  ];

  const mockPratoIngredientes = [
    { prato_id: 'd1111111-1111-1111-1111-111111111111', ingrediente_id: '11111111-1111-1111-1111-111111111111', quantidade: 0.25 },
    { prato_id: 'd2222222-2222-2222-2222-222222222222', ingrediente_id: '22222222-2222-2222-2222-222222222222', quantidade: 0.20 },
    { prato_id: 'd2222222-2222-2222-2222-222222222222', ingrediente_id: '33333333-3333-3333-3333-333333333333', quantidade: 0.15 },
    { prato_id: 'd3333333-3333-3333-3333-333333333333', ingrediente_id: '44444444-4444-4444-4444-444444444444', quantidade: 0.30 }
  ];

  // DOM Elements
  const dishesGrid = document.getElementById('dishesGrid');
  const inputSearchDish = document.getElementById('inputSearchDish');
  const filterAll = document.getElementById('filterAll');
  const filterAvailable = document.getElementById('filterAvailable');

  const btnToggleCart = document.getElementById('btnToggleCart');
  const cartModal = document.getElementById('cartModal');
  const btnCloseCartModal = document.getElementById('btnCloseCartModal');
  const cartItemsContainer = document.getElementById('cartItemsContainer');
  const cartTotalValue = document.getElementById('cartTotalValue');
  const cartBadge = document.getElementById('cartBadge');
  const btnConfirmOrder = document.getElementById('btnConfirmOrder');

  const btnOpenHistory = document.getElementById('btnOpenHistory');
  const historyModal = document.getElementById('historyModal');
  const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
  const historyOrdersContainer = document.getElementById('historyOrdersContainer');

  const btnCallStaff = document.getElementById('btnCallStaff');
  const callStaffModal = document.getElementById('callStaffModal');
  const btnCloseCallStaffModal = document.getElementById('btnCloseCallStaffModal');
  const btnCancelCallStaff = document.getElementById('btnCancelCallStaff');
  const callStaffForm = document.getElementById('callStaffForm');
  const callJustification = document.getElementById('callJustification');

  let activeFilterMode = 'all'; // 'all' or 'available'

  // Helper to get supabase client safely
  // Load Menu and Stock Data
  async function loadData() {
    try {
      const client = window.supabaseClient;
      if (client && typeof client.from === 'function') {
        const dishQuery = client.from('pratos').select('*').eq('ativo', true).order('nome');
        const { data: dishData, error: dishErr } = await window.safeSupabaseQuery(dishQuery, 2500);
        dishes = (!dishErr && dishData && dishData.length > 0) ? dishData : [...mockDishes];

        const ingQuery = client.from('estoque').select('*');
        const { data: ingData, error: ingErr } = await window.safeSupabaseQuery(ingQuery, 2500);
        ingredients = (!ingErr && ingData && ingData.length > 0) ? ingData : [...mockIngredients];

        const piQuery = client.from('prato_ingredientes').select('*');
        const { data: piData, error: piErr } = await window.safeSupabaseQuery(piQuery, 2500);
        if (!piErr && piData && piData.length > 0) {
          pratoIngredientesMap = {};
          piData.forEach(row => {
            if (!pratoIngredientesMap[row.prato_id]) pratoIngredientesMap[row.prato_id] = [];
            pratoIngredientesMap[row.prato_id].push({
              ingrediente_id: row.ingrediente_id,
              quantidade: parseFloat(row.quantidade)
            });
          });
        } else {
          pratoIngredientesMap = {};
          mockPratoIngredientes.forEach(row => {
            if (!pratoIngredientesMap[row.prato_id]) pratoIngredientesMap[row.prato_id] = [];
            pratoIngredientesMap[row.prato_id].push({
              ingrediente_id: row.ingrediente_id,
              quantidade: parseFloat(row.quantidade)
            });
          });
        }
      } else {
        dishes = [...mockDishes];
        ingredients = [...mockIngredients];
        pratoIngredientesMap = {};
        mockPratoIngredientes.forEach(row => {
          if (!pratoIngredientesMap[row.prato_id]) pratoIngredientesMap[row.prato_id] = [];
          pratoIngredientesMap[row.prato_id].push({
            ingrediente_id: row.ingrediente_id,
            quantidade: parseFloat(row.quantidade)
          });
        });
      }
    } catch (err) {
      console.warn("Data loading fallback:", err);
      dishes = [...mockDishes];
      ingredients = [...mockIngredients];
    }

    renderDishes();
  }

  // Calculate portion availability
  function calculateAvailability(dishId) {
    const recipes = pratoIngredientesMap[dishId] || [];
    if (recipes.length === 0) return { isAvailable: true, portions: Infinity };

    let minPortions = Infinity;
    for (const item of recipes) {
      const ing = ingredients.find(i => i.id === item.ingrediente_id);
      if (!ing || parseFloat(item.quantidade) <= 0) continue;

      const avail = Math.floor(parseFloat(ing.quantidade) / parseFloat(item.quantidade));
      if (avail < minPortions) minPortions = avail;
    }

    if (minPortions === Infinity) return { isAvailable: false, portions: 0 };
    return {
      isAvailable: minPortions > 0,
      portions: minPortions
    };
  }

  // Render Dishes Grid
  function renderDishes() {
    if (!dishesGrid) return;
    const searchTerm = (inputSearchDish ? inputSearchDish.value : '').toLowerCase();

    const filtered = dishes.filter(dish => {
      const matchSearch = dish.nome.toLowerCase().includes(searchTerm) || (dish.descricao && dish.descricao.toLowerCase().includes(searchTerm));
      const avail = calculateAvailability(dish.id);

      if (activeFilterMode === 'available' && !avail.isAvailable) {
        return false;
      }
      return matchSearch;
    });

    if (filtered.length === 0) {
      dishesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: var(--space-2xl);">
          Nenhum prato encontrado com o filtro atual.
        </div>`;
      return;
    }

    dishesGrid.innerHTML = filtered.map(dish => {
      const avail = calculateAvailability(dish.id);
      const isAvailable = avail.isAvailable;

      const cartItem = cart.find(item => item.dishId === dish.id);
      const cartQty = cartItem ? cartItem.quantidade : 0;

      const badge = isAvailable
        ? `<span class="status-badge status-active">Disponível (${avail.portions === Infinity ? '∞' : avail.portions})</span>`
        : `<span class="status-badge status-inactive">Indisponível</span>`;

      const imgUrl = dish.imagem || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';

      const actionButtonHtml = cartQty > 0
        ? `
          <div style="display: flex; align-items: center; gap: 6px; background: var(--surface-container-low); padding: 2px 6px; border-radius: 8px; border: 1px solid var(--border-subtle);">
            <button type="button" class="btn btn-secondary btn-dish-qty-dec" data-id="${dish.id}" style="padding: 2px 10px; min-height: 32px; font-size: 16px; font-weight: 700;">-</button>
            <span style="font-weight: 700; font-size: 15px; min-width: 20px; text-align: center; color: var(--text-main);">${cartQty}</span>
            <button type="button" class="btn btn-primary btn-dish-qty-inc" data-id="${dish.id}" ${!isAvailable ? 'disabled' : ''} style="padding: 2px 10px; min-height: 32px; font-size: 16px; font-weight: 700;">+</button>
          </div>
        `
        : `
          <button type="button" class="btn btn-primary btn-add-cart" data-id="${dish.id}" ${!isAvailable ? 'disabled' : ''} style="padding: 6px 12px; min-height: 36px;">
            <span class="material-symbols-outlined" style="font-size: 18px;">add_shopping_cart</span>
            <span>Adicionar</span>
          </button>
        `;

      return `
        <div class="card flex-col" style="overflow: hidden; padding: 0; position: relative;">
          <div style="height: 160px; background-image: url('${imgUrl}'); background-size: cover; background-position: center; position: relative;">
            <div style="position: absolute; top: 12px; right: 12px;">${badge}</div>
          </div>

          <div style="padding: var(--space-md); flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <h3 style="font-size: 16px; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">${dish.nome}</h3>
              <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4; margin-bottom: var(--space-md);">${dish.descricao || ''}</p>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: var(--space-sm); margin-top: auto;">
              <span style="font-size: 18px; font-weight: 700; color: var(--primary);">
                R$ ${parseFloat(dish.preco).toFixed(2).replace('.', ',')}
              </span>

              ${actionButtonHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach Add to Cart Listeners
    dishesGrid.querySelectorAll('.btn-add-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        addToCart(id);
      });
    });

    // Attach Stepper Listeners
    dishesGrid.querySelectorAll('.btn-dish-qty-dec').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        updateCartQuantity(id, -1);
      });
    });

    dishesGrid.querySelectorAll('.btn-dish-qty-inc').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        updateCartQuantity(id, 1);
      });
    });
  }

  // --- CART FUNCTIONS ---

  function addToCart(dishId) {
    const dish = dishes.find(d => d.id === dishId);
    if (!dish) return;

    const existing = cart.find(item => item.dishId === dishId);
    if (existing) {
      existing.quantidade += 1;
    } else {
      cart.push({
        dishId: dish.id,
        nome: dish.nome,
        preco: parseFloat(dish.preco),
        quantidade: 1
      });
    }

    updateCartUI();
  }

  function updateCartQuantity(dishId, delta) {
    const item = cart.find(i => i.dishId === dishId);
    if (!item) return;

    item.quantidade += delta;
    if (item.quantidade <= 0) {
      cart = cart.filter(i => i.dishId !== dishId);
    }

    updateCartUI();
  }

  function updateCartUI() {
    // Badge
    const totalCount = cart.reduce((acc, curr) => acc + curr.quantidade, 0);
    if (cartBadge) cartBadge.textContent = totalCount;

    // Refresh dishes grid to sync stepper - 1 + buttons directly in menu
    renderDishes();

    if (!cartItemsContainer) return;

    if (cart.length === 0) {
      cartItemsContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: var(--space-xl);">
          Seu carrinho está vazio.
        </div>`;
      if (cartTotalValue) cartTotalValue.textContent = 'R$ 0,00';
      if (btnConfirmOrder) btnConfirmOrder.disabled = true;
      return;
    }

    let grandTotal = 0;
    cartItemsContainer.innerHTML = cart.map(item => {
      const subtotal = item.preco * item.quantidade;
      grandTotal += subtotal;

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-xs) 0; border-bottom: 1px solid var(--border-subtle);">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 14px; color: var(--text-main);">${item.nome}</div>
            <div style="font-size: 12px; color: var(--text-muted);">
              R$ ${item.preco.toFixed(2).replace('.', ',')} un.
            </div>
          </div>

          <div style="display: flex; items-center; gap: 6px;">
            <button type="button" class="btn btn-secondary btn-cart-adj" data-id="${item.dishId}" data-delta="-1" style="padding: 2px 8px; min-height: 28px;">-</button>
            <span style="font-weight: 600; font-size: 14px; width: 20px; text-align: center;">${item.quantidade}</span>
            <button type="button" class="btn btn-secondary btn-cart-adj" data-id="${item.dishId}" data-delta="1" style="padding: 2px 8px; min-height: 28px;">+</button>
          </div>
        </div>
      `;
    }).join('');

    if (cartTotalValue) cartTotalValue.textContent = `R$ ${grandTotal.toFixed(2).replace('.', ',')}`;
    if (btnConfirmOrder) btnConfirmOrder.disabled = false;

    // Attach Cart Adjusters
    cartItemsContainer.querySelectorAll('.btn-cart-adj').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const delta = parseInt(e.currentTarget.dataset.delta, 10);
        updateCartQuantity(id, delta);
      });
    });
  }

  // Confirm Order & Debit Stock
  if (btnConfirmOrder) {
    btnConfirmOrder.addEventListener('click', async () => {
      if (cart.length === 0) return;

      btnConfirmOrder.disabled = true;
      btnConfirmOrder.innerHTML = `<span>Enviando...</span>`;

      const grandTotal = cart.reduce((acc, curr) => acc + (curr.preco * curr.quantidade), 0);
      const pedidoId = crypto.randomUUID();

      const newPedido = {
        id: pedidoId,
        mesa_id: user.id,
        valor_total: grandTotal,
        status: 'Recebido',
        criado_em: new Date().toISOString()
      };

      const pedidoItens = cart.map(item => ({
        id: crypto.randomUUID(),
        pedido_id: pedidoId,
        prato_id: item.dishId,
        quantidade: item.quantidade,
        preco_unitario: item.preco
      }));

      // Debit ingredients from stock
      const client = window.supabaseClient;
      cart.forEach(item => {
        const recipes = pratoIngredientesMap[item.dishId] || [];
        recipes.forEach(r => {
          const ing = ingredients.find(i => i.id === r.ingrediente_id);
          if (ing) {
            const totalConsumo = parseFloat(r.quantidade) * item.quantidade;
            ing.quantidade = Math.max(0, parseFloat(ing.quantidade) - totalConsumo);

            if (client && typeof client.from === 'function') {
              const query = client.from('estoque').update({ quantidade: ing.quantidade, atualizado_em: new Date().toISOString() }).eq('id', ing.id);
              window.safeSupabaseQuery(query, 2000);
            }
          }
        });
      });

      if (client && typeof client.from === 'function') {
        const pQuery = client.from('pedidos').insert(newPedido);
        await window.safeSupabaseQuery(pQuery, 2000);

        const piQuery = client.from('pedido_itens').insert(pedidoItens);
        await window.safeSupabaseQuery(piQuery, 2000);
      }

      alert('Pedido confirmado e enviado para a cozinha com sucesso!');
      cart = [];
      updateCartUI();
      closeCartModal();
      renderDishes();

      btnConfirmOrder.innerHTML = `<span class="material-symbols-outlined">check_circle</span><span>Enviar Pedido para a Cozinha</span>`;
    });
  }

  // --- HISTORY FUNCTIONS ---

  async function loadOrderHistory() {
    if (!historyOrdersContainer) return;
    historyOrdersContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: var(--space-xl);">Carregando histórico...</div>`;

    let orders = [];
    try {
      const client = window.supabaseClient;
      if (client && typeof client.from === 'function') {
        const query = client
          .from('pedidos')
          .select('*, pedido_itens(*, pratos(nome))')
          .eq('mesa_id', user.id)
          .order('criado_em', { ascending: false });

        const { data, error } = await window.safeSupabaseQuery(query, 2500);

        if (!error && data) {
          orders = data;
        }
      }
    } catch (err) {
      console.warn("History fetch error:", err);
    }

    if (orders.length === 0) {
      historyOrdersContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: var(--space-xl);">
          Nenhum pedido realizado ainda.
        </div>`;
      return;
    }

    historyOrdersContainer.innerHTML = orders.map(ord => {
      const dateStr = new Date(ord.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      let statusStyle = 'background: rgba(42, 157, 143, 0.15); color: #2A9D8F;';
      if (ord.status === 'Cancelado') statusStyle = 'background: rgba(157, 2, 8, 0.15); color: #9D0208;';
      else if (ord.status === 'Recebido') statusStyle = 'background: rgba(232, 93, 4, 0.15); color: #E85D04;';

      const itemsList = (ord.pedido_itens || []).map(pi => `
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-main);">
          <span>${pi.quantidade}x ${pi.pratos ? pi.pratos.nome : 'Prato'}</span>
          <span>R$ ${(parseFloat(pi.preco_unitario) * pi.quantidade).toFixed(2).replace('.', ',')}</span>
        </div>
      `).join('');

      return `
        <div style="background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: var(--space-md);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-xs);">
            <span style="font-weight: 600; font-size: 14px; color: var(--text-main);">Horário: ${dateStr}</span>
            <span class="status-badge" style="${statusStyle}">${ord.status}</span>
          </div>

          <div class="flex-col" style="gap: 4px; margin: var(--space-xs) 0; border-top: 1px dashed var(--border-subtle); border-bottom: 1px dashed var(--border-subtle); padding: var(--space-xs) 0;">
            ${itemsList}
          </div>

          <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 15px; color: var(--primary); margin-top: var(--space-xs);">
            <span>Total:</span>
            <span>R$ ${parseFloat(ord.valor_total).toFixed(2).replace('.', ',')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- MODAL CONTROLS ---

  function openCartModal() { if (cartModal) cartModal.style.display = 'flex'; }
  function closeCartModal() { if (cartModal) cartModal.style.display = 'none'; }
  if (btnToggleCart) btnToggleCart.addEventListener('click', openCartModal);
  if (btnCloseCartModal) btnCloseCartModal.addEventListener('click', closeCartModal);

  function openHistoryModal() {
    if (historyModal) historyModal.style.display = 'flex';
    loadOrderHistory();
  }
  function closeHistoryModal() { if (historyModal) historyModal.style.display = 'none'; }
  if (btnOpenHistory) btnOpenHistory.addEventListener('click', openHistoryModal);
  if (btnCloseHistoryModal) btnCloseHistoryModal.addEventListener('click', closeHistoryModal);

  // --- CALL STAFF MODAL ---
  const callSelectReason = document.getElementById('callSelectReason');
  const callOtherGroup = document.getElementById('callOtherGroup');

  if (callSelectReason) {
    callSelectReason.addEventListener('change', () => {
      if (callSelectReason.value === 'Outro') {
        if (callOtherGroup) callOtherGroup.style.display = 'block';
        if (callJustification) callJustification.required = true;
      } else {
        if (callOtherGroup) callOtherGroup.style.display = 'none';
        if (callJustification) callJustification.required = false;
      }
    });
  }

  function openCallStaffModal() {
    if (callStaffForm) callStaffForm.reset();
    if (callOtherGroup) callOtherGroup.style.display = 'none';
    if (callJustification) callJustification.required = false;
    if (callStaffModal) callStaffModal.style.display = 'flex';
  }

  function closeCallStaffModal() {
    if (callStaffModal) callStaffModal.style.display = 'none';
  }

  if (btnCallStaff) btnCallStaff.addEventListener('click', openCallStaffModal);
  if (btnCloseCallStaffModal) btnCloseCallStaffModal.addEventListener('click', closeCallStaffModal);
  if (btnCancelCallStaff) btnCancelCallStaff.addEventListener('click', closeCallStaffModal);

  if (callStaffForm) {
    callStaffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      let motivo = callSelectReason ? callSelectReason.value : '';
      if (motivo === 'Outro' && callJustification) {
        motivo = callJustification.value.trim() || 'Outro';
      }
      if (!motivo) return;

      const newChamado = {
        id: crypto.randomUUID(),
        mesa_id: user.id,
        mesa_nome: user.nome || `Mesa ${user.login}`,
        motivo: motivo,
        status: 'Pendente',
        criado_em: new Date().toISOString()
      };

      try {
        const client = window.supabaseClient;
        if (client && typeof client.from === 'function') {
          const query = client.from('chamados').insert({
            id: newChamado.id,
            mesa_id: newChamado.mesa_id,
            motivo: newChamado.motivo,
            status: newChamado.status,
            criado_em: newChamado.criado_em
          });
          await window.safeSupabaseQuery(query, 2000);
        }
      } catch (err) {
        console.warn("Supabase chamados insert error:", err);
      }

      alert('Chamado enviado aos funcionários com sucesso!');
      closeCallStaffModal();
    });
  }

  // Filters
  if (filterAll) {
    filterAll.addEventListener('click', () => {
      filterAll.classList.add('active');
      if (filterAvailable) filterAvailable.classList.remove('active');
      activeFilterMode = 'all';
      renderDishes();
    });
  }

  if (filterAvailable) {
    filterAvailable.addEventListener('click', () => {
      filterAvailable.classList.add('active');
      if (filterAll) filterAll.classList.remove('active');
      activeFilterMode = 'available';
      renderDishes();
    });
  }

  if (inputSearchDish) inputSearchDish.addEventListener('input', () => renderDishes());

  // Realtime Subscription
  function setupRealtime() {
    const client = window.supabaseClient;
    if (client && typeof client.channel === 'function') {
      client
        .channel('cardapio-realtime')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          loadData();
        })
        .subscribe();
    }
  }

  // Initialize
  await loadData();
  setupRealtime();
});
