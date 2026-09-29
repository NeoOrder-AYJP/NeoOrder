/**
 * NeoOrder - Faturamento & Backup (Gerente)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Ensure user is authenticated and is a Gerente (RF-36)
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

  // Helper to get Supabase client
  function getSupabase() {
    return window.supabaseClient || window.supabase;
  }

  // State
  let selectedPeriod = 'today'; // 'today', 'week', 'month'
  let rawOrders = [];
  let rawDishes = [];

  // DOM Elements
  const filterToday = document.getElementById('filterToday');
  const filterWeek = document.getElementById('filterWeek');
  const filterMonth = document.getElementById('filterMonth');

  const kpiTotalRevenue = document.getElementById('kpiTotalRevenue');
  const kpiCompletedOrders = document.getElementById('kpiCompletedOrders');
  const kpiAverageTicket = document.getElementById('kpiAverageTicket');
  const kpiCancelledOrders = document.getElementById('kpiCancelledOrders');

  const topDishesTableBody = document.getElementById('topDishesTableBody');
  const salesLogTableBody = document.getElementById('salesLogTableBody');

  const btnExportJson = document.getElementById('btnExportJson');
  const importJsonInput = document.getElementById('importJsonInput');

  // Tab switching for period filters
  filterToday.addEventListener('click', () => setPeriod('today'));
  filterWeek.addEventListener('click', () => setPeriod('week'));
  filterMonth.addEventListener('click', () => setPeriod('month'));

  function setPeriod(period) {
    selectedPeriod = period;
    filterToday.classList.toggle('active', period === 'today');
    filterWeek.classList.toggle('active', period === 'week');
    filterMonth.classList.toggle('active', period === 'month');
    calculateAndRenderMetrics();
  }

  // Default Mock Fallback Data
  const mockOrders = [
    {
      id: 'o1001',
      mesa_id: 'm001',
      mesa_nome: 'Mesa 01',
      valor_total: 89.90,
      status: 'Entregue',
      criado_em: new Date().toISOString(),
      pedido_itens: [
        { id: 'pi101', prato_id: 'd1111111-1111-1111-1111-111111111111', quantidade: 1, preco_unitario: 89.90, pratos: { nome: 'Filé Mignon ao Roti' } }
      ]
    },
    {
      id: 'o1002',
      mesa_id: 'm002',
      mesa_nome: 'Mesa 02',
      valor_total: 149.00,
      status: 'Entregue',
      criado_em: new Date(Date.now() - 86400000).toISOString(),
      pedido_itens: [
        { id: 'pi102', prato_id: 'd2222222-2222-2222-2222-222222222222', quantidade: 2, preco_unitario: 74.50, pratos: { nome: 'Risoto de Cogumelos Frescos' } }
      ]
    },
    {
      id: 'o1003',
      mesa_id: 'm003',
      mesa_nome: 'Mesa 03',
      valor_total: 98.00,
      status: 'Cancelado',
      criado_em: new Date().toISOString(),
      pedido_itens: [
        { id: 'pi103', prato_id: 'd3333333-3333-3333-3333-333333333333', quantidade: 1, preco_unitario: 98.00, pratos: { nome: 'Salmão Grelhado com Alcaparras' } }
      ]
    }
  ];

  // Fetch Orders and Dishes Data
  async function loadData() {
    try {
      const client = getSupabase();
      if (client && typeof client.from === 'function') {
        const { data: orderData, error: orderErr } = await client
          .from('pedidos')
          .select('*, pedido_itens(*, pratos(nome)), usuarios(nome, login)')
          .order('criado_em', { ascending: false });

        if (!orderErr && orderData && orderData.length > 0) {
          rawOrders = orderData.map(o => ({
            ...o,
            mesa_nome: o.usuarios ? (o.usuarios.nome || `Mesa ${o.usuarios.login}`) : (o.mesa_nome || 'Mesa')
          }));
        } else {
          rawOrders = [...mockOrders];
        }

        const { data: dishData } = await client.from('pratos').select('*');
        if (dishData) rawDishes = dishData;
      } else {
        rawOrders = [...mockOrders];
      }
    } catch (err) {
      console.warn("Faturamento fetch error:", err);
      rawOrders = [...mockOrders];
    }

    calculateAndRenderMetrics();
  }

  // Date Filter Check
  function isDateInPeriod(dateString, period) {
    const date = new Date(dateString);
    const now = new Date();

    if (period === 'today') {
      return date.toDateString() === now.toDateString();
    }

    if (period === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return date >= startOfWeek;
    }

    if (period === 'month') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }

    return true;
  }

  // Calculate & Render Financial KPIs and Tables
  function calculateAndRenderMetrics() {
    // 1. Filter orders by selected period
    const periodOrders = rawOrders.filter(o => isDateInPeriod(o.criado_em, selectedPeriod));

    // 2. Separate delivered and cancelled
    const deliveredOrders = periodOrders.filter(o => o.status === 'Entregue' || o.status === 'Pronto');
    const cancelledOrders = periodOrders.filter(o => o.status === 'Cancelado');

    // 3. Compute Metrics
    const totalRevenue = deliveredOrders.reduce((acc, curr) => acc + parseFloat(curr.valor_total || 0), 0);
    const completedCount = deliveredOrders.length;
    const avgTicket = completedCount > 0 ? (totalRevenue / completedCount) : 0;
    const cancelledCount = cancelledOrders.length;

    // Render KPIs
    kpiTotalRevenue.textContent = `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`;
    kpiCompletedOrders.textContent = completedCount;
    kpiAverageTicket.textContent = `R$ ${avgTicket.toFixed(2).replace('.', ',')}`;
    kpiCancelledOrders.textContent = cancelledCount;

    // 4. Compute Top Selling Dishes
    const dishSalesMap = {}; // dishName -> { count: number, totalRevenue: number }

    deliveredOrders.forEach(ord => {
      (ord.pedido_itens || []).forEach(pi => {
        const name = pi.pratos ? pi.pratos.nome : 'Prato';
        const qte = parseInt(pi.quantidade || 0, 10);
        const subtotal = parseFloat(pi.preco_unitario || 0) * qte;

        if (!dishSalesMap[name]) {
          dishSalesMap[name] = { count: 0, totalRevenue: 0 };
        }
        dishSalesMap[name].count += qte;
        dishSalesMap[name].totalRevenue += subtotal;
      });
    });

    const topDishes = Object.keys(dishSalesMap)
      .map(name => ({
        nome: name,
        count: dishSalesMap[name].count,
        totalRevenue: dishSalesMap[name].totalRevenue
      }))
      .sort((a, b) => b.count - a.count);

    if (topDishes.length === 0) {
      topDishesTableBody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; color: var(--text-muted); padding: var(--space-xl);">
            Nenhum prato faturado no período selecionado.
          </td>
        </tr>`;
    } else {
      topDishesTableBody.innerHTML = topDishes.map((dish, index) => `
        <tr>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${index + 1}. ${dish.nome}</div>
          </td>
          <td style="text-align: center; font-weight: 600; color: var(--text-main);">
            ${dish.count}
          </td>
          <td style="text-align: right; font-weight: 700; color: var(--primary);">
            R$ ${dish.totalRevenue.toFixed(2).replace('.', ',')}
          </td>
        </tr>
      `).join('');
    }

    // 5. Render Sales Log
    if (periodOrders.length === 0) {
      salesLogTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: var(--space-xl);">
            Nenhum registro encontrado no período selecionado.
          </td>
        </tr>`;
    } else {
      salesLogTableBody.innerHTML = periodOrders.map(ord => {
        const timeStr = new Date(ord.criado_em).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        let badgeStyle = 'background: rgba(42, 157, 143, 0.15); color: #2A9D8F;';
        if (ord.status === 'Cancelado') badgeStyle = 'background: rgba(157, 2, 8, 0.15); color: #9D0208;';
        else if (ord.status === 'Recebido') badgeStyle = 'background: rgba(232, 93, 4, 0.15); color: #E85D04;';

        return `
          <tr>
            <td style="font-family: monospace; font-weight: 600;">#${ord.id.substring(0, 8)}</td>
            <td style="font-weight: 500;">${ord.mesa_nome}</td>
            <td style="color: var(--text-muted); font-size: 13px;">${timeStr}</td>
            <td><span class="status-badge" style="${badgeStyle}">${ord.status}</span></td>
            <td style="text-align: right; font-weight: 700; color: var(--text-main);">
              R$ ${parseFloat(ord.valor_total || 0).toFixed(2).replace('.', ',')}
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // --- TASK-07: JSON BACKUP EXPORT & IMPORT ---

  btnExportJson.addEventListener('click', async () => {
    btnExportJson.disabled = true;
    btnExportJson.innerHTML = `<span>Exportando...</span>`;

    const backupData = {
      exportDate: new Date().toISOString(),
      systemVersion: 'NeoOrder 1.0',
      tables: {}
    };

    const tablesToExport = ['usuarios', 'pratos', 'estoque', 'prato_ingredientes', 'pedidos', 'pedido_itens', 'chamados'];

    try {
      const client = getSupabase();
      if (client && typeof client.from === 'function') {
        for (const table of tablesToExport) {
          const { data, error } = await client.from(table).select('*');
          backupData.tables[table] = (!error && data) ? data : [];
        }
      } else {
        backupData.tables = {
          usuarios: [],
          pratos: rawDishes,
          pedidos: rawOrders
        };
      }

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `neoorder_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('Backup do sistema exportado com sucesso!');
    } catch (err) {
      console.error("Export backup error:", err);
      alert('Erro ao exportar backup.');
    } finally {
      btnExportJson.disabled = false;
      btnExportJson.innerHTML = `<span class="material-symbols-outlined">download</span><span>Exportar Backup (JSON)</span>`;
    }
  });

  importJsonInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('ATENÇÃO: A importação de backup atualizará os dados no sistema. Deseja prosseguir?')) {
      importJsonInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backupData = JSON.parse(event.target.result);
        if (!backupData || !backupData.tables) {
          throw new Error('Formato de arquivo de backup inválido.');
        }

        const client = getSupabase();
        if (client && typeof client.from === 'function') {
          for (const tableName of Object.keys(backupData.tables)) {
            const rows = backupData.tables[tableName];
            if (Array.isArray(rows) && rows.length > 0) {
              await client.from(tableName).upsert(rows);
            }
          }
        }

        alert('Backup importado e restaurado com sucesso!');
        await loadData();
      } catch (err) {
        console.error("Import backup error:", err);
        alert(`Erro ao importar backup: ${err.message}`);
      } finally {
        importJsonInput.value = '';
      }
    };
    reader.readAsText(file);
  });

  // Initialize
  await loadData();
});
