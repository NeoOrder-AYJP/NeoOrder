/**
 * NeoOrder - Estoque e Cardápio (Gerente)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Ensure user is authenticated and is a Gerente
  const user = NeoAuth.requireAuth(['gerente']);
  if (!user) return;

  const userInfoEl = document.getElementById('userInfo');
  if (userInfoEl) {
    userInfoEl.textContent = `${user.nome} (${(user.perfil || user.tipo).toUpperCase()})`;
  }

  // Bind logout button
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => NeoAuth.logout());
  }

  // Active state data
  let ingredients = [];
  let dishes = [];
  let pratoIngredientesMap = {}; // prato_id -> array of { ingrediente_id, quantidade }

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
  const tabViewEstoque = document.getElementById('tabViewEstoque');
  const tabViewPratos = document.getElementById('tabViewPratos');
  const panelEstoque = document.getElementById('panelEstoque');
  const panelPratos = document.getElementById('panelPratos');

  const ingredientsTableBody = document.getElementById('ingredientsTableBody');
  const dishesTableBody = document.getElementById('dishesTableBody');

  const kpiTotalIngredientes = document.getElementById('kpiTotalIngredientes');
  const kpiAlertaIngredientes = document.getElementById('kpiAlertaIngredientes');
  const kpiTotalPratos = document.getElementById('kpiTotalPratos');

  // Modals
  const btnNewIngredient = document.getElementById('btnNewIngredient');
  const ingredientModal = document.getElementById('ingredientModal');
  const btnCloseIngredientModal = document.getElementById('btnCloseIngredientModal');
  const btnCancelIngredientModal = document.getElementById('btnCancelIngredientModal');
  const ingredientForm = document.getElementById('ingredientForm');

  const btnNewDish = document.getElementById('btnNewDish');
  const dishModal = document.getElementById('dishModal');
  const btnCloseDishModal = document.getElementById('btnCloseDishModal');
  const btnCancelDishModal = document.getElementById('btnCancelDishModal');
  const dishForm = document.getElementById('dishForm');
  const btnAddRecipeRow = document.getElementById('btnAddRecipeRow');
  const recipeContainer = document.getElementById('recipeContainer');

  // Tab Switching Handler
  if (tabViewEstoque) {
    tabViewEstoque.addEventListener('click', () => {
      tabViewEstoque.classList.add('active');
      if (tabViewPratos) tabViewPratos.classList.remove('active');
      if (panelEstoque) panelEstoque.style.display = 'block';
      if (panelPratos) panelPratos.style.display = 'none';
    });
  }

  if (tabViewPratos) {
    tabViewPratos.addEventListener('click', () => {
      tabViewPratos.classList.add('active');
      if (tabViewEstoque) tabViewEstoque.classList.remove('active');
      if (panelPratos) panelPratos.style.display = 'block';
      if (panelEstoque) panelEstoque.style.display = 'none';
    });
  }

  // Helper to get supabase client safely
  function getClient() {
    return (window.getSupabase && window.getSupabase()) || window.supabaseClient || window.getSupabaseClient();
  }

  // Load All Data
  async function loadData() {
    try {
      const client = getClient();
      if (client && typeof client.from === 'function') {
        const { data: ingData, error: ingErr } = await client.from('estoque').select('*').order('nome');
        if (!ingErr && ingData && ingData.length > 0) {
          ingredients = ingData;
        } else {
          ingredients = [...mockIngredients];
        }

        const { data: dishData, error: dishErr } = await client.from('pratos').select('*').order('nome');
        if (!dishErr && dishData && dishData.length > 0) {
          dishes = dishData;
        } else {
          dishes = [...mockDishes];
        }

        const { data: piData, error: piErr } = await client.from('prato_ingredientes').select('*');
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
        ingredients = [...mockIngredients];
        dishes = [...mockDishes];
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
      console.warn("Data load error, falling back to mock data:", err);
      ingredients = [...mockIngredients];
      dishes = [...mockDishes];
      pratoIngredientesMap = {};
      mockPratoIngredientes.forEach(row => {
        if (!pratoIngredientesMap[row.prato_id]) pratoIngredientesMap[row.prato_id] = [];
        pratoIngredientesMap[row.prato_id].push({
          ingrediente_id: row.ingrediente_id,
          quantidade: parseFloat(row.quantidade)
        });
      });
    }

    renderKPIs();
    renderIngredientsTable();
    renderDishesTable();
  }

  // Render KPIs
  function renderKPIs() {
    let alertCount = 0;
    ingredients.forEach(ing => {
      if (parseFloat(ing.quantidade) <= 2.0) alertCount++;
    });

    if (kpiTotalIngredientes) kpiTotalIngredientes.textContent = ingredients.length;
    if (kpiAlertaIngredientes) kpiAlertaIngredientes.textContent = alertCount;
    if (kpiTotalPratos) kpiTotalPratos.textContent = dishes.length;
  }

  // Render Ingredients Table
  function renderIngredientsTable() {
    if (!ingredientsTableBody) return;

    if (ingredients.length === 0) {
      ingredientsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: var(--space-xl);">
            Nenhum insumo cadastrado no estoque.
          </td>
        </tr>`;
      return;
    }

    ingredientsTableBody.innerHTML = ingredients.map(ing => {
      const qte = parseFloat(ing.quantidade);
      let statusBadge = '<span class="status-badge status-active">Disponível</span>';
      if (qte === 0) {
        statusBadge = '<span class="status-badge status-inactive">Esgotado</span>';
      } else if (qte <= 2.0) {
        statusBadge = '<span class="status-badge" style="background: rgba(217, 119, 6, 0.15); color: #D97706;">Alerta (Baixo)</span>';
      }

      return `
        <tr>
          <td>
            <div style="font-weight: 500; color: var(--text-main);">${ing.nome}</div>
          </td>
          <td style="text-align: right; font-weight: 600; color: var(--text-main);">
            ${qte.toFixed(2)}
          </td>
          <td style="text-align: center; color: var(--text-muted);">
            ${ing.unidade}
          </td>
          <td>${statusBadge}</td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 4px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary btn-quick-adj" data-id="${ing.id}" data-delta="-1" style="padding: 2px 8px; min-height: 28px;" title="-1 em estoque">-1</button>
              <button type="button" class="btn btn-secondary btn-quick-adj" data-id="${ing.id}" data-delta="1" style="padding: 2px 8px; min-height: 28px;" title="+1 em estoque">+1</button>
              <button type="button" class="btn btn-secondary btn-edit-ing" data-id="${ing.id}" style="padding: 2px 8px; min-height: 28px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
              </button>
              <button type="button" class="btn btn-danger btn-del-ing" data-id="${ing.id}" style="padding: 2px 8px; min-height: 28px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Event Listeners
    ingredientsTableBody.querySelectorAll('.btn-quick-adj').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const delta = parseFloat(e.currentTarget.dataset.delta);
        adjustIngredientQuantity(id, delta);
      });
    });

    ingredientsTableBody.querySelectorAll('.btn-edit-ing').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        openIngredientModal(id);
      });
    });

    ingredientsTableBody.querySelectorAll('.btn-del-ing').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        deleteIngredient(id);
      });
    });
  }

  // Calculate Portion Availability for a Dish
  function calculateDishAvailability(dishId) {
    const recipes = pratoIngredientesMap[dishId] || [];
    if (recipes.length === 0) {
      return { portions: '∞ (Sem receita)', isAvailable: true };
    }

    let minPortions = Infinity;
    for (const item of recipes) {
      const ing = ingredients.find(i => i.id === item.ingrediente_id);
      if (!ing || parseFloat(item.quantidade) <= 0) continue;

      const availablePortions = Math.floor(parseFloat(ing.quantidade) / parseFloat(item.quantidade));
      if (availablePortions < minPortions) {
        minPortions = availablePortions;
      }
    }

    if (minPortions === Infinity) return { portions: '0 porções', isAvailable: false };
    return {
      portions: `${minPortions} porções`,
      isAvailable: minPortions > 0
    };
  }

  // Render Dishes Table
  function renderDishesTable() {
    if (!dishesTableBody) return;

    if (dishes.length === 0) {
      dishesTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: var(--space-xl);">
            Nenhum prato cadastrado no cardápio.
          </td>
        </tr>`;
      return;
    }

    dishesTableBody.innerHTML = dishes.map(dish => {
      const avail = calculateDishAvailability(dish.id);
      const availBadge = avail.isAvailable
        ? `<span class="status-badge status-active">${avail.portions}</span>`
        : `<span class="status-badge status-inactive">Indisponível (Falta Insumo)</span>`;

      const statusBadge = dish.ativo
        ? `<span class="status-badge status-active">Ativo</span>`
        : `<span class="status-badge status-inactive">Inativo</span>`;

      const destaqueBadge = dish.destaque
        ? `<span class="material-symbols-outlined" style="color: var(--primary);" title="Em Destaque no Carousel">star</span>`
        : `<span class="material-symbols-outlined" style="color: var(--border-input);" title="Normal">star_outline</span>`;

      return `
        <tr>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${dish.nome}</div>
            <div style="font-size: 12px; color: var(--text-muted); max-width: 300px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${dish.descricao || ''}</div>
          </td>
          <td style="font-weight: 600; color: var(--text-main);">
            R$ ${parseFloat(dish.preco).toFixed(2).replace('.', ',')}
          </td>
          <td style="text-align: center;">${destaqueBadge}</td>
          <td>${availBadge}</td>
          <td>${statusBadge}</td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 4px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary btn-edit-dish" data-id="${dish.id}" style="padding: 2px 8px; min-height: 28px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
              </button>
              <button type="button" class="btn btn-danger btn-del-dish" data-id="${dish.id}" style="padding: 2px 8px; min-height: 28px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Event Listeners
    dishesTableBody.querySelectorAll('.btn-edit-dish').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        openDishModal(id);
      });
    });

    dishesTableBody.querySelectorAll('.btn-del-dish').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        deleteDish(id);
      });
    });
  }

  // --- INGREDIENT ACTIONS ---

  async function adjustIngredientQuantity(id, delta) {
    const ing = ingredients.find(i => i.id === id);
    if (!ing) return;

    const newQte = Math.max(0, parseFloat(ing.quantidade) + delta);
    ing.quantidade = newQte;

    const client = getClient();
    if (client && typeof client.from === 'function') {
      client.from('estoque').update({ quantidade: newQte, atualizado_em: new Date().toISOString() }).eq('id', id).then();
    }

    renderKPIs();
    renderIngredientsTable();
    renderDishesTable();
  }

  function openIngredientModal(id = null) {
    if (ingredientForm) ingredientForm.reset();
    document.getElementById('ingredientId').value = '';

    if (id) {
      const ing = ingredients.find(i => i.id === id);
      if (ing) {
        document.getElementById('ingredientId').value = ing.id;
        document.getElementById('ingredientNome').value = ing.nome;
        document.getElementById('ingredientUnidade').value = ing.unidade;
        document.getElementById('ingredientQuantidade').value = ing.quantidade;
        document.getElementById('ingredientModalTitle').textContent = 'Editar Insumo';
      }
    } else {
      document.getElementById('ingredientModalTitle').textContent = 'Novo Insumo';
    }

    if (ingredientModal) ingredientModal.style.display = 'flex';
  }

  function closeIngredientModal() {
    if (ingredientModal) ingredientModal.style.display = 'none';
  }

  if (btnNewIngredient) btnNewIngredient.addEventListener('click', () => openIngredientModal());
  if (btnCloseIngredientModal) btnCloseIngredientModal.addEventListener('click', closeIngredientModal);
  if (btnCancelIngredientModal) btnCancelIngredientModal.addEventListener('click', closeIngredientModal);

  if (ingredientForm) {
    ingredientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('ingredientId').value;
      const nome = document.getElementById('ingredientNome').value.trim();
      const unidade = document.getElementById('ingredientUnidade').value;
      const quantidade = parseFloat(document.getElementById('ingredientQuantidade').value);

      closeIngredientModal();

      const client = getClient();
      if (id) {
        const ing = ingredients.find(i => i.id === id);
        if (ing) {
          ing.nome = nome;
          ing.unidade = unidade;
          ing.quantidade = quantidade;

          if (client && typeof client.from === 'function') {
            client.from('estoque').update({ nome, unidade, quantidade, atualizado_em: new Date().toISOString() }).eq('id', id).then();
          }
        }
      } else {
        const newIng = {
          id: crypto.randomUUID(),
          nome,
          unidade,
          quantidade,
          criado_em: new Date().toISOString()
        };
        ingredients.push(newIng);

        if (client && typeof client.from === 'function') {
          client.from('estoque').insert(newIng).then();
        }
      }

      renderKPIs();
      renderIngredientsTable();
      renderDishesTable();
    });
  }

  async function deleteIngredient(id) {
    if (!confirm('Deseja realmente remover este insumo do estoque?')) return;

    ingredients = ingredients.filter(i => i.id !== id);
    const client = getClient();
    if (client && typeof client.from === 'function') {
      client.from('estoque').delete().eq('id', id).then();
    }

    renderKPIs();
    renderIngredientsTable();
    renderDishesTable();
  }

  // --- DISH & RECIPE ACTIONS ---

  function addRecipeRow(ingredienteId = '', quantidade = '') {
    if (!recipeContainer) return;
    const row = document.createElement('div');
    row.className = 'recipe-row';
    row.style.cssText = 'display: flex; gap: var(--space-xs); align-items: center;';

    const ingOptions = ingredients.map(ing => `
      <option value="${ing.id}" ${ing.id === ingredienteId ? 'selected' : ''}>
        ${ing.nome} (${ing.unidade})
      </option>
    `).join('');

    row.innerHTML = `
      <select class="input-field recipe-ing-select" style="padding-left: 10px; flex: 2;">
        <option value="">Selecione o Insumo (Opcional)</option>
        ${ingOptions}
      </select>
      <input type="number" class="input-field recipe-ing-qte" step="0.001" min="0.001" placeholder="Qte por porção" value="${quantidade}" style="padding-left: 10px; flex: 1;">
      <button type="button" class="btn btn-danger btn-remove-recipe-row" style="padding: 4px 8px; min-height: 36px;">
        <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
      </button>
    `;

    row.querySelector('.btn-remove-recipe-row').addEventListener('click', () => {
      row.remove();
    });

    recipeContainer.appendChild(row);
  }

  if (btnAddRecipeRow) btnAddRecipeRow.addEventListener('click', () => addRecipeRow());

  function openDishModal(id = null) {
    if (dishForm) dishForm.reset();
    if (recipeContainer) recipeContainer.innerHTML = '';
    document.getElementById('dishId').value = '';

    if (id) {
      const dish = dishes.find(d => d.id === id);
      if (dish) {
        document.getElementById('dishId').value = dish.id;
        document.getElementById('dishNome').value = dish.nome;
        document.getElementById('dishDescricao').value = dish.descricao || '';
        document.getElementById('dishPreco').value = dish.preco;
        document.getElementById('dishImagem').value = dish.imagem || '';
        document.getElementById('dishDestaque').checked = !!dish.destaque;
        document.getElementById('dishAtivo').checked = !!dish.ativo;
        document.getElementById('dishModalTitle').textContent = 'Editar Prato';

        const recipes = pratoIngredientesMap[dish.id] || [];
        recipes.forEach(r => addRecipeRow(r.ingrediente_id, r.quantidade));
      }
    } else {
      document.getElementById('dishModalTitle').textContent = 'Novo Prato';
    }

    if (dishModal) dishModal.style.display = 'flex';
  }

  function closeDishModal() {
    if (dishModal) dishModal.style.display = 'none';
  }

  if (btnNewDish) btnNewDish.addEventListener('click', () => openDishModal());
  if (btnCloseDishModal) btnCloseDishModal.addEventListener('click', closeDishModal);
  if (btnCancelDishModal) btnCancelDishModal.addEventListener('click', closeDishModal);

  if (dishForm) {
    dishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('dishId').value;
      const nome = document.getElementById('dishNome').value.trim();
      const descricao = document.getElementById('dishDescricao').value.trim();
      const preco = parseFloat(document.getElementById('dishPreco').value);
      const imagem = document.getElementById('dishImagem').value.trim();
      const destaque = document.getElementById('dishDestaque').checked;
      const ativo = document.getElementById('dishAtivo').checked;

      closeDishModal();

      const recipeRows = recipeContainer ? recipeContainer.querySelectorAll('.recipe-row') : [];
      const newRecipes = [];
      recipeRows.forEach(row => {
        const ingId = row.querySelector('.recipe-ing-select').value;
        const qte = parseFloat(row.querySelector('.recipe-ing-qte').value);
        if (ingId && qte > 0) {
          newRecipes.push({ ingrediente_id: ingId, quantidade: qte });
        }
      });

      let dishId = id;
      const client = getClient();

      if (id) {
        const dish = dishes.find(d => d.id === id);
        if (dish) {
          dish.nome = nome;
          dish.descricao = descricao;
          dish.preco = preco;
          dish.imagem = imagem;
          dish.destaque = destaque;
          dish.ativo = ativo;

          if (client && typeof client.from === 'function') {
            const res = await window.safeSupabaseQuery(
              client.from('pratos').update({ nome, descricao, preco, imagem, destaque, ativo }).eq('id', id)
            );
            if (res.error) console.error("Erro ao atualizar prato:", res.error);
          }
        }
      } else {
        dishId = crypto.randomUUID();
        const newDish = {
          id: dishId,
          nome,
          descricao,
          preco,
          imagem,
          destaque,
          ativo,
          criado_em: new Date().toISOString()
        };
        dishes.push(newDish);

        if (client && typeof client.from === 'function') {
          const res = await window.safeSupabaseQuery(
            client.from('pratos').insert(newDish)
          );
          if (res.error) console.error("Erro ao inserir prato:", res.error);
        }
      }

      pratoIngredientesMap[dishId] = newRecipes;

      if (client && typeof client.from === 'function') {
        await window.safeSupabaseQuery(client.from('prato_ingredientes').delete().eq('prato_id', dishId));
        if (newRecipes.length > 0) {
          const piInserts = newRecipes.map(r => ({
            prato_id: dishId,
            ingrediente_id: r.ingrediente_id,
            quantidade: r.quantidade
          }));
          const piRes = await window.safeSupabaseQuery(client.from('prato_ingredientes').insert(piInserts));
          if (piRes.error) console.error("Erro ao inserir prato_ingredientes:", piRes.error);
        }
      }

      renderKPIs();
      renderDishesTable();
    });
  }

  async function deleteDish(id) {
    if (!confirm('Deseja realmente remover este prato do cardápio?')) return;

    dishes = dishes.filter(d => d.id !== id);
    delete pratoIngredientesMap[id];

    const client = getClient();
    if (client && typeof client.from === 'function') {
      client.from('prato_ingredientes').delete().eq('prato_id', id).then();
      client.from('pratos').delete().eq('id', id).then();
    }

    renderKPIs();
    renderDishesTable();
  }

  // Realtime Subscription
  function setupRealtime() {
    const client = getClient();
    if (client && typeof client.channel === 'function') {
      client
        .channel('estoque-realtime')
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
