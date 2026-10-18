// js/faturamento.js — Faturamento e backup (gerente)
//
// Indicadores vêm de `relatorio_faturamento`, que considera apenas pedidos
// com status 'Entregue' e entregue_em dentro do período (RN-08).
// Backup completo via `backup_exportar` / `backup_importar`.

(function () {
  let token = null;
  let periodo = 'mes'; // RF-32: a visão inicial é o mês corrente
  let ultimoRelatorio = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const user = window.NeoAuth.requireAuth(['gerente']);
    if (!user) return;

    token = window.NeoAuth.getToken();

    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.textContent = `${user.nome} (GERENTE)`;

    bindEventos();
    await carregarRelatorio();
  });

  // ---------------------------------------------------------------------------
  // Períodos
  // ---------------------------------------------------------------------------

  function intervalo(escolha) {
    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setHours(0, 0, 0, 0);

    if (escolha === 'semana') {
      const diaSemana = inicio.getDay(); // 0 = domingo
      inicio.setDate(inicio.getDate() - diaSemana);
    } else if (escolha === 'mes') {
      inicio.setDate(1);
    }

    const fim = new Date(agora);
    fim.setHours(23, 59, 59, 999);
    // Inclui o restante do dia atual (o relatório usa < p_data_fim)
    fim.setDate(fim.getDate() + 1);
    fim.setHours(0, 0, 0, 0);

    return { inicio, fim };
  }

  function rotuloPeriodo(escolha) {
    return escolha === 'semana' ? 'esta semana' : escolha === 'mes' ? 'este mês' : 'hoje';
  }

  async function carregarRelatorio() {
    const { inicio, fim } = intervalo(periodo);

    try {
      const rel = await NeoAPI.relatorioFaturamento(token, inicio.toISOString(), fim.toISOString());
      ultimoRelatorio = rel;
      renderRelatorio(rel);
    } catch (err) {
      console.error('Erro ao carregar faturamento:', err);
      NeoUI.toast(err.message || 'Não foi possível carregar o relatório.', 'error', 6000);

      if (err.code === '28000' || /sess[aã]o/i.test(err.message || '')) {
        setTimeout(() => window.NeoAuth.logout(), 1500);
      }
    }
  }

  function renderRelatorio(rel) {
    if (!rel) return;

    setText('kpiTotalRevenue', NeoUI.money(rel.faturamento_total));
    setText('kpiCompletedOrders', String(rel.qtd_pedidos || 0));
    setText('kpiAverageTicket', NeoUI.money(rel.ticket_medio));
    setText('kpiCancelledOrders', String(rel.qtd_cancelados || 0));

    renderTopPratos(rel.pratos_mais_vendidos || []);
    renderPedidos(rel.pedidos || []);
  }

  function renderTopPratos(pratos) {
    const body = document.getElementById('topDishesTableBody');
    if (!body) return;

    if (!pratos.length) {
      body.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:var(--space-xl);">
        Nenhum pedido entregue ${rotuloPeriodo(periodo)}.
      </td></tr>`;
      return;
    }

    body.innerHTML = pratos.map(prato => `
      <tr>
        <td><strong>${escapeHtml(prato.nome)}</strong></td>
        <td style="text-align:center;">${prato.quantidade}</td>
        <td style="text-align:right;">${NeoUI.money(prato.receita)}</td>
      </tr>`).join('');
  }

  function renderPedidos(pedidos) {
    const body = document.getElementById('salesLogTableBody');
    if (!body) return;

    if (!pedidos.length) {
      body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:var(--space-xl);">
        Nenhum pedido registrado ${rotuloPeriodo(periodo)}.
      </td></tr>`;
      return;
    }

    body.innerHTML = pedidos.map(pedido => `
      <tr>
        <td><code style="font-size:12px;">#${String(pedido.id).slice(0, 8)}</code></td>
        <td>${escapeHtml(pedido.mesa_nome || 'Mesa')}</td>
        <td>${NeoUI.dateTime(pedido.criado_em)}</td>
        <td>${NeoUI.statusBadge(pedido.status)}</td>
        <td style="text-align:right;${pedido.status === 'Cancelado' ? 'color:var(--text-muted);text-decoration:line-through;' : ''}">
          ${NeoUI.money(pedido.valor_total)}
        </td>
      </tr>`).join('');
  }

  // ---------------------------------------------------------------------------
  // Backup
  // ---------------------------------------------------------------------------

  async function exportarBackup() {
    const button = document.getElementById('btnExportJson');
    NeoUI.setBusy(button, true, 'Gerando...');

    try {
      const backup = await NeoAPI.backupExportar(token);
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `neoorder-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const tabelas = backup && backup.tabelas ? Object.keys(backup.tabelas).length : 0;
      NeoUI.toast(`Backup exportado com ${tabelas} tabelas.`, 'success', 5000);
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível exportar o backup.', 'error', 7000);
    } finally {
      NeoUI.setBusy(button, false);
    }
  }

  function importarBackup(e) {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      NeoUI.toast('Arquivo muito grande (limite de 15 MB).', 'error');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      let payload;
      try {
        payload = JSON.parse(reader.result);
      } catch (err) {
        NeoUI.toast('Arquivo JSON inválido.', 'error');
        input.value = '';
        return;
      }

      const substituir = window.confirm(
        'Como deseja importar?\n\nOK = SUBSTITUIR os dados atuais (remove registros existentes).\nCancelar = MESCLAR (atualiza e insere sem apagar).'
      );
      const modo = substituir ? 'replace' : 'merge';

      const confirmar = window.confirm(
        `Confirmar importação em modo "${modo}"? Esta operação altera o banco de dados.`
      );
      if (!confirmar) {
        input.value = '';
        return;
      }

      try {
        const resultado = await NeoAPI.backupImportar(token, payload, modo);
        NeoUI.toast(resultado && resultado.mensagem ? resultado.mensagem : 'Backup importado com sucesso.', 'success', 6000);
        await carregarRelatorio();
      } catch (err) {
        NeoUI.toast(err.message || 'Não foi possível importar o backup.', 'error', 8000);
      } finally {
        input.value = '';
      }
    };

    reader.onerror = () => {
      NeoUI.toast('Não foi possível ler o arquivo.', 'error');
      input.value = '';
    };

    reader.readAsText(file, 'utf-8');
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------

  function bindEventos() {
    const botoes = {
      filterToday: 'hoje',
      filterWeek: 'semana',
      filterMonth: 'mes'
    };

    Object.entries(botoes).forEach(([btnId, valor]) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        periodo = valor;
        Object.keys(botoes).forEach(otherId => {
          const other = document.getElementById(otherId);
          if (other) other.classList.toggle('active', otherId === btnId);
        });
        await carregarRelatorio();
      });
    });

    const btnExport = document.getElementById('btnExportJson');
    if (btnExport) btnExport.addEventListener('click', exportarBackup);

    const inputImport = document.getElementById('importJsonInput');
    if (inputImport) inputImport.addEventListener('change', importarBackup);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
})();
