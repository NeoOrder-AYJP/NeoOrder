// js/contas.js — Gerenciamento de contas (gerente)
//
// Mesas e funcionários vivem na tabela `usuarios`. Senhas são gravadas com
// bcrypt no banco (RPC `salvar_conta`); o front-end nunca as lê.

(function () {
  let token = null;
  let contas = [];
  let filtro = 'todas';
  let busca = '';
  // QR Code das mesas: estado vindo de status_qr_mesas (mesa_id -> { qr_code_ativo, sessao_aberta })
  let qrStatus = new Map();
  let qrDisponivel = false;

  document.addEventListener('DOMContentLoaded', async () => {
    const user = window.NeoAuth.requireAuth(['gerente']);
    if (!user) return;

    token = window.NeoAuth.getToken();

    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.textContent = `${user.nome} (GERENTE)`;

    bindEventos();
    await carregarContas();
  });

  async function carregarContas() {
    const body = document.getElementById('accountsTableBody');
    if (body) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:var(--space-xl);"><span class="spinner"></span></td></tr>';
    }

    try {
      const [data] = await Promise.all([NeoAPI.listarContas(token), carregarStatusQr()]);
      contas = Array.isArray(data) ? data : [];
      renderContas();
    } catch (err) {
      console.error('Erro ao carregar contas:', err);
      if (body) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:var(--space-xl);">${escapeHtml(err.message || 'Erro ao carregar contas.')}</td></tr>`;
      }
    }
  }

  // Falha aqui não impede a gestão de contas: apenas oculta os controles de QR.
  async function carregarStatusQr() {
    try {
      const data = await NeoAPI.statusQrMesas(token);
      const mesas = data && Array.isArray(data.mesas) ? data.mesas : [];
      qrStatus = new Map(mesas.map(m => [m.mesa_id, { ativo: !!m.qr_code_ativo, sessao: !!m.sessao_aberta }]));
      qrDisponivel = true;
    } catch (err) {
      qrDisponivel = false;
      qrStatus = new Map();
      console.warn('Status dos QR Codes indisponível:', err && err.message);
    }
  }

  function qrBadge(conta) {
    if (!qrDisponivel || conta.tipo !== 'mesa') return '';
    const st = qrStatus.get(conta.id);
    return st && st.ativo
      ? '<span class="badge badge-available qr-badge">QR ativo</span>'
      : '<span class="badge badge-unavailable qr-badge">Sem QR</span>';
  }

  function tipoLabel(conta) {
    if (conta.tipo === 'mesa') return '<span class="badge badge-ready">Mesa</span>';
    const perfil = (conta.perfil || 'atendente').toLowerCase();
    const label = perfil.charAt(0).toUpperCase() + perfil.slice(1);
    return `<span class="badge badge-pending">${escapeHtml(label)}</span>`;
  }

  function renderContas() {
    const body = document.getElementById('accountsTableBody');
    if (!body) return;

    const termo = busca.toLowerCase();
    const lista = contas.filter(c => {
      const okFiltro = filtro === 'todas'
        || (filtro === 'mesas' && c.tipo === 'mesa')
        || (filtro === 'staff' && c.tipo === 'funcionario');
      const okBusca = !termo
        || String(c.nome || '').toLowerCase().includes(termo)
        || String(c.login || '').toLowerCase().includes(termo);
      return okFiltro && okBusca;
    });

    if (!lista.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:var(--space-xl);">Nenhuma conta encontrada.</td></tr>';
      return;
    }

    body.innerHTML = '';
    lista.forEach(conta => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(conta.nome)}</strong></td>
        <td><code style="font-size:13px;">${escapeHtml(conta.login || '—')}</code></td>
        <td>${tipoLabel(conta)}</td>
        <td>${conta.ativo
          ? '<span class="badge badge-available">Ativo</span>'
          : '<span class="badge badge-unavailable">Inativo</span>'}${qrBadge(conta)}</td>
        <td class="cell-actions">${qrDisponivel && conta.tipo === 'mesa' ? `
          <button type="button" class="btn btn-secondary btn-icon" data-qr="${conta.id}" title="QR Code" aria-label="QR Code de ${escapeHtml(conta.nome)}" aria-haspopup="dialog">
            <span class="material-symbols-outlined" style="font-size:16px;">qr_code_2</span>
          </button>` : ''}
          <button type="button" class="btn btn-secondary btn-icon" data-edit="${conta.id}" title="Editar" aria-label="Editar ${escapeHtml(conta.nome)}">
            <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
          </button>
          <button type="button" class="btn btn-secondary btn-icon" data-toggle="${conta.id}" title="${conta.ativo ? 'Inativar' : 'Ativar'}" aria-label="${conta.ativo ? 'Inativar' : 'Ativar'} ${escapeHtml(conta.nome)}">
            <span class="material-symbols-outlined" style="font-size:16px;">${conta.ativo ? 'block' : 'check_circle'}</span>
          </button>
          <button type="button" class="btn btn-danger btn-icon" data-del="${conta.id}" title="Excluir" aria-label="Excluir ${escapeHtml(conta.nome)}">
            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
          </button>
        </td>`;
      body.appendChild(tr);
    });

    body.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => abrirConta(btn.dataset.edit)));
    body.querySelectorAll('[data-toggle]').forEach(btn =>
      btn.addEventListener('click', () => alternarStatus(btn.dataset.toggle)));
    body.querySelectorAll('[data-del]').forEach(btn =>
      btn.addEventListener('click', () => excluirConta(btn.dataset.del)));
    body.querySelectorAll('[data-qr]').forEach(btn =>
      btn.addEventListener('click', () => abrirQr(btn.dataset.qr)));
  }

  // ---------------------------------------------------------------------------
  // QR Code da mesa (RPCs gerar_qr_code_mesa / status_qr_mesas / desativar_qr_mesa,
  // todas exigem sessão de gerente no servidor via _exigir_gerente)
  // ---------------------------------------------------------------------------

  let qrMesaId = null;      // mesa aberta no modal
  let qrUrlAtual = null;    // link completo, apenas em memória enquanto o modal está aberto
  let qrOcupado = false;    // evita gerar/desativar em duplicidade

  function mesaAtual() {
    return contas.find(c => c.id === qrMesaId && c.tipo === 'mesa') || null;
  }

  function abrirQr(id) {
    const conta = contas.find(c => c.id === id && c.tipo === 'mesa');
    if (!conta) return;
    qrMesaId = id;
    limparQrGerado();
    const titulo = document.getElementById('qrModalTitle');
    if (titulo) titulo.textContent = `QR Code — ${conta.nome}`;
    renderQrStatus();
    const modal = document.getElementById('qrModal');
    if (modal) modal.style.display = 'flex';
    atualizarStatusQr(id);
  }

  // Consulta o estado atual no servidor (sessão pode ter sido aberta/fechada depois do carregamento).
  async function atualizarStatusQr(id) {
    try {
      const data = await NeoAPI.statusQrMesas(token);
      const mesas = data && Array.isArray(data.mesas) ? data.mesas : [];
      qrStatus = new Map(mesas.map(m => [m.mesa_id, { ativo: !!m.qr_code_ativo, sessao: !!m.sessao_aberta }]));
      if (qrMesaId === id && !qrOcupado && !qrUrlAtual) renderQrStatus();
      renderContas();
    } catch (err) {
      console.warn('Não foi possível atualizar o status do QR Code:', err && err.message);
    }
  }

  function fecharQr() {
    limparQrGerado();
    qrMesaId = null;
    fecharModal('qrModal');
  }

  function limparQrGerado() {
    qrUrlAtual = null;
    const figura = document.getElementById('qrFigure');
    if (figura) figura.innerHTML = '';
    const preview = document.getElementById('qrLinkPreview');
    if (preview) preview.textContent = '';
    const resultado = document.getElementById('qrResult');
    if (resultado) resultado.hidden = true;
    const imprimir = document.getElementById('btnQrPrint');
    if (imprimir) imprimir.hidden = true;
  }

  function renderQrStatus(extra) {
    const conta = mesaAtual();
    const el = document.getElementById('qrStatus');
    if (!conta || !el) return;
    const st = qrStatus.get(conta.id) || { ativo: false, sessao: false };
    const partes = [
      st.ativo ? '<span class="badge badge-available">QR Code ativo</span>' : '<span class="badge badge-unavailable">Sem QR Code ativo</span>',
      st.sessao ? '<span class="badge badge-pending">Sessão aberta agora</span>' : '<span class="badge badge-ready">Nenhuma sessão aberta</span>'
    ];
    if (!conta.ativo) partes.push('<span>Mesa inativa: ative a conta para gerar um QR Code.</span>');
    if (extra) partes.push(`<span>${escapeHtml(extra)}</span>`);
    el.innerHTML = partes.join(' ');

    const gerar = document.getElementById('btnQrGenerate');
    if (gerar && !qrOcupado) {
      gerar.disabled = !conta.ativo;
      const rotulo = gerar.querySelector('span:last-child');
      if (rotulo) rotulo.textContent = st.ativo ? 'Gerar novo QR Code' : 'Gerar QR Code';
    }
    const desativar = document.getElementById('btnQrDeactivate');
    if (desativar && !qrOcupado) desativar.hidden = !st.ativo;
  }

  // Exibe o link sem o token completo (o QR e o botão "Copiar" usam o valor inteiro).
  function mascararLink(url) {
    return url.replace(/([?&]qr=)([^&#]{0,9})[^&#]*?([^&#]{4})(?=$|[&#])/, '$1$2…$3');
  }

  async function gerarQr() {
    const conta = mesaAtual();
    if (!conta || qrOcupado) return;
    if (typeof window.qrcode !== 'function') {
      NeoUI.toast('Gerador de QR Code indisponível. Recarregue a página.', 'error', 6000);
      return;
    }
    const st = qrStatus.get(conta.id) || {};
    if ((st.ativo || st.sessao) && !window.confirm(
      `Gerar um novo QR Code para "${conta.nome}"?\n\nO QR Code anterior deixará de funcionar e a sessão aberta nesta mesa será encerrada.`)) {
      return;
    }

    const botao = document.getElementById('btnQrGenerate');
    qrOcupado = true;
    NeoUI.setBusy(botao, true, 'Gerando...');
    try {
      const data = await NeoAPI.gerarQrCodeMesa(token, conta.id);
      if (!data || data.mesa_id !== conta.id || !data.qr_token) {
        throw new Error('Resposta inesperada do servidor ao gerar o QR Code.');
      }
      const relativa = typeof data.url_relativa === 'string' && data.url_relativa.indexOf('login.html?qr=') === 0
        ? data.url_relativa
        : 'login.html?qr=' + encodeURIComponent(data.qr_token);
      qrUrlAtual = new URL(relativa, window.location.href).href;

      const qr = window.qrcode(0, 'M');
      qr.addData(qrUrlAtual);
      qr.make();
      document.getElementById('qrFigure').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      document.getElementById('qrFigure').setAttribute('aria-label', `QR Code de acesso da ${conta.nome}`);
      document.getElementById('qrPrintTitle').textContent = data.mesa_nome || conta.nome;
      document.getElementById('qrLinkPreview').textContent = mascararLink(qrUrlAtual);
      document.getElementById('qrResult').hidden = false;
      document.getElementById('btnQrPrint').hidden = false;

      qrStatus.set(conta.id, { ativo: true, sessao: false });
      qrOcupado = false;
      NeoUI.setBusy(botao, false);
      renderQrStatus(`Gerado agora${data.gerado_por ? ` por ${data.gerado_por}` : ''}.`);
      renderContas();
      NeoUI.toast('QR Code gerado. Imprima ou copie o link agora.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível gerar o QR Code.', 'error', 7000);
    } finally {
      if (qrOcupado) {
        qrOcupado = false;
        NeoUI.setBusy(botao, false);
        renderQrStatus();
      }
    }
  }

  async function desativarQr() {
    const conta = mesaAtual();
    if (!conta || qrOcupado) return;
    if (!window.confirm(`Desativar o QR Code de "${conta.nome}"?\n\nEle deixará de funcionar e a sessão aberta nesta mesa será encerrada.`)) return;

    const botao = document.getElementById('btnQrDeactivate');
    qrOcupado = true;
    NeoUI.setBusy(botao, true, 'Desativando...');
    try {
      await NeoAPI.desativarQrMesa(token, conta.id);
      qrStatus.set(conta.id, { ativo: false, sessao: false });
      limparQrGerado();
      NeoUI.toast('QR Code desativado.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível desativar o QR Code.', 'error', 7000);
    } finally {
      qrOcupado = false;
      NeoUI.setBusy(botao, false);
      renderQrStatus();
      renderContas();
    }
  }

  function imprimirQr() {
    if (!qrUrlAtual) return;
    const fim = () => document.body.classList.remove('printing-qr');
    document.body.classList.add('printing-qr');
    window.addEventListener('afterprint', fim, { once: true });
    try { window.print(); } finally { setTimeout(fim, 1000); }
  }

  async function copiarLinkQr() {
    if (!qrUrlAtual) return;
    try {
      await navigator.clipboard.writeText(qrUrlAtual);
      NeoUI.toast('Link copiado.', 'success');
    } catch (err) {
      NeoUI.toast('Não foi possível copiar automaticamente. Use o QR Code impresso.', 'error', 6000);
    }
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------

  function abrirConta(id) {
    const form = document.getElementById('accountForm');
    if (form) form.reset();

    const conta = id ? contas.find(c => c.id === id) : null;

    const idEl = document.getElementById('accountId');
    if (idEl) idEl.value = conta ? conta.id : '';

    const tipoEl = document.getElementById('accountTipo');
    if (tipoEl) tipoEl.value = conta ? conta.tipo : 'mesa';

    setVal('accountNome', conta ? conta.nome : '');
    setVal('accountLogin', conta ? conta.login : '');
    setVal('accountSenha', '');

    const perfilEl = document.getElementById('accountPerfil');
    if (perfilEl) perfilEl.value = conta && conta.perfil ? conta.perfil : 'atendente';

    const statusEl = document.getElementById('accountStatus');
    if (statusEl) statusEl.value = conta ? String(Boolean(conta.ativo)) : 'true';

    atualizarPerfilVisivel();

    const titulo = document.getElementById('modalTitle');
    if (titulo) titulo.textContent = conta ? 'Editar Conta' : 'Nova Conta';

    const senha = document.getElementById('accountSenha');
    if (senha) {
      senha.required = !conta;
      senha.placeholder = conta ? 'Deixe em branco para manter a senha atual' : 'Mínimo de 6 caracteres';
    }

    const modal = document.getElementById('accountModal');
    if (modal) modal.style.display = 'flex';
  }

  function atualizarPerfilVisivel() {
    const tipoEl = document.getElementById('accountTipo');
    const grupo = document.getElementById('groupPerfil');
    if (!tipoEl || !grupo) return;
    grupo.style.display = tipoEl.value === 'funcionario' ? 'block' : 'none';
  }

  async function salvarConta(e) {
    e.preventDefault();

    const id = (document.getElementById('accountId') || {}).value || null;
    const tipo = (document.getElementById('accountTipo') || {}).value;
    const nome = (document.getElementById('accountNome') || {}).value || '';
    const login = (document.getElementById('accountLogin') || {}).value || '';
    const senha = (document.getElementById('accountSenha') || {}).value || '';
    const perfil = (document.getElementById('accountPerfil') || {}).value;
    const ativo = (document.getElementById('accountStatus') || {}).value === 'true';

    if (!nome.trim() || !login.trim()) {
      return NeoUI.toast('Informe o nome e o login da conta.', 'error');
    }
    if (!id && senha.length < 6) {
      return NeoUI.toast('A senha deve ter no mínimo 6 caracteres.', 'error');
    }
    if (senha && senha.length < 6) {
      return NeoUI.toast('A nova senha deve ter no mínimo 6 caracteres.', 'error');
    }

    const button = e.target.querySelector('button[type="submit"]');
    NeoUI.setBusy(button, true, 'Salvando...');

    try {
      await NeoAPI.salvarConta(token, {
        id,
        tipo,
        nome: nome.trim(),
        login: login.trim(),
        senha: senha || null,
        perfil: tipo === 'funcionario' ? perfil : null,
        ativo
      });

      fecharModal('accountModal');
      await carregarContas();
      NeoUI.toast('Conta salva com sucesso.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível salvar a conta.', 'error', 7000);
    } finally {
      NeoUI.setBusy(button, false);
    }
  }

  async function alternarStatus(id) {
    const conta = contas.find(c => c.id === id);
    if (!conta) return;

    try {
      await NeoAPI.definirStatusConta(token, id, !conta.ativo);
      await carregarContas();
      NeoUI.toast(conta.ativo ? 'Conta inativada.' : 'Conta reativada.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível alterar o status.', 'error', 6000);
    }
  }

  async function excluirConta(id) {
    const conta = contas.find(c => c.id === id);
    if (!conta) return;
    if (!window.confirm(`Excluir a conta "${conta.nome}"? Sessões abertas serão encerradas.`)) return;

    try {
      await NeoAPI.excluirConta(token, id);
      await carregarContas();
      NeoUI.toast('Conta excluída.', 'success');
    } catch (err) {
      NeoUI.toast(err.message || 'Não foi possível excluir a conta.', 'error', 7000);
    }
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------

  function bindEventos() {
    const btnNew = document.getElementById('btnNewAccount');
    if (btnNew) btnNew.addEventListener('click', () => abrirConta(null));

    const form = document.getElementById('accountForm');
    if (form) form.addEventListener('submit', salvarConta);

    const tipo = document.getElementById('accountTipo');
    if (tipo) tipo.addEventListener('change', atualizarPerfilVisivel);

    const filtros = {
      tabFilterAll: 'todas',
      tabFilterMesas: 'mesas',
      tabFilterStaff: 'staff'
    };
    Object.entries(filtros).forEach(([btnId, valor]) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        filtro = valor;
        Object.keys(filtros).forEach(otherId => {
          const other = document.getElementById(otherId);
          if (other) other.classList.toggle('active', otherId === btnId);
        });
        renderContas();
      });
    });

    ['btnCloseModal', 'btnCancelModal'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => fecharModal('accountModal'));
    });

    const modal = document.getElementById('accountModal');
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    const ligar = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    ligar('btnCloseQrModal', fecharQr);
    ligar('btnQrGenerate', gerarQr);
    ligar('btnQrDeactivate', desativarQr);
    ligar('btnQrPrint', imprimirQr);
    ligar('btnCopyQrLink', copiarLinkQr);
    const qrModal = document.getElementById('qrModal');
    if (qrModal) {
      qrModal.addEventListener('click', e => {
        if (e.target === qrModal) fecharQr();
      });
    }
  }

  function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value === null || value === undefined ? '' : value;
  }
})();
