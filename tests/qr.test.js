// tests/qr.test.js — Login e gestão por QR Code da mesa (jsdom + Supabase simulado).
//
// As respostas simuladas seguem o contrato real das RPCs conferido no banco
// em 20/10/2026 (ver supabase-schema.md, seção "QR Code da mesa"):
//   iniciar_sessao_mesa(p_qr_token text, p_duracao_horas integer)  -> anon
//   gerar_qr_code_mesa(p_session_token text, p_mesa_id uuid)        -> gerente
//   status_qr_mesas(p_session_token text)                           -> gerente
//   desativar_qr_mesa(p_session_token text, p_mesa_id uuid)         -> gerente
// Erros usam os mesmos códigos do banco (28000 para QR inválido/desativado/
// mesa inativa; 42501 para perfil sem permissão). Não acessa a rede.
//
// Uso: npm test   (ou: node tests/qr.test.js)

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const falhas = [];
let cenarios = 0;

const QR = 'MESA-' + '3f'.repeat(32);            // mesmo formato gerado pelo banco
const SESSAO_MESA_TOKEN = 'c'.repeat(64);
const futuro = () => new Date(Date.now() + 12 * 3600 * 1000).toISOString();

const respostaMesa = (extra = {}) => ({
  data: {
    sucesso: true,
    usuario: { id: 'm1', nome: 'Mesa 01', login: 'Mesa 01', tipo: 'mesa', perfil: 'mesa' },
    tipo_sessao: 'mesa', session_token: SESSAO_MESA_TOKEN, expira_em: futuro(), via: 'qr_code', ...extra
  },
  error: null
});
const erroPg = (code, message) => ({ data: null, error: { code, message, details: null, hint: null } });
const erroRede = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } });

const sessoes = {
  gerente: { usuario: { id: 'u2', nome: 'Gerente', login: 'gerente', tipo: 'funcionario', perfil: 'gerente' }, token: 'g'.repeat(64), tipoSessao: 'funcionario', expiraEm: futuro() },
  atendente: { usuario: { id: 'u3', nome: 'Ana', login: 'ana', tipo: 'funcionario', perfil: 'atendente' }, token: 'h'.repeat(64), tipoSessao: 'funcionario', expiraEm: futuro() },
  mesa: { usuario: { id: 'm1', nome: 'Mesa 01', login: 'Mesa 01', tipo: 'mesa', perfil: 'mesa' }, token: SESSAO_MESA_TOKEN, tipoSessao: 'mesa', expiraEm: futuro() }
};

const contasFixture = [
  { id: 'm1', tipo: 'mesa', nome: 'Mesa 01', login: 'Mesa 01', perfil: 'mesa', ativo: true },
  { id: 'm2', tipo: 'mesa', nome: 'Mesa 02', login: 'Mesa 02', perfil: 'mesa', ativo: false },
  { id: 'u2', tipo: 'funcionario', nome: 'Gerente', login: 'gerente', perfil: 'gerente', ativo: true }
];
const statusFixture = {
  mesas: [
    { mesa_id: 'm1', mesa_nome: 'Mesa 01', ativo: true, qr_code_ativo: true, sessao_aberta: true },
    { mesa_id: 'm2', mesa_nome: 'Mesa 02', ativo: false, qr_code_ativo: false, sessao_aberta: false }
  ],
  gerado_em: new Date().toISOString()
};

const espera = ms => new Promise(r => setTimeout(r, ms));
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------------------
// Harness: carrega a página real com scripts locais e RPCs controladas
// ---------------------------------------------------------------------------

const SCRIPTS = {
  'login.html': ['js/supabase.js', 'js/auth.js'],
  'contas.html': ['js/supabase.js', 'js/auth.js', 'js/vendor/qrcode-generator.js', 'js/contas.js'],
  'estoque.html': ['js/supabase.js', 'js/auth.js', 'js/estoque.js'],
  'atendimento.html': ['js/supabase.js', 'js/auth.js', 'js/atendimento.js'],
  'faturamento.html': ['js/supabase.js', 'js/auth.js', 'js/faturamento.js']
};

async function abrir(arquivo, { query = '', sessao = null, rpc = () => ({ data: null, error: null }), confirmar = true } = {}) {
  const html = fs.readFileSync(path.join(ROOT, arquivo), 'utf8').replace(/<script src="[^"]*"[^>]*><\/script>/g, '');
  const logs = [];
  const navegacoes = [];
  const vc = new VirtualConsole();
  ['log', 'info', 'warn', 'error', 'debug'].forEach(nivel => vc.on(nivel, (...a) => logs.push(`${nivel}: ${a.map(x => (x && x.message) || String(x)).join(' ')}`)));
  vc.on('jsdomError', e => { if (/navigation/i.test(e.message)) navegacoes.push(e.message); else logs.push('jsdomError: ' + e.message); });

  const dom = new JSDOM(html, { url: `https://neoorder.test/${arquivo}${query}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  const chamadas = [];
  window.supabase = {
    createClient: () => ({
      rpc: async (nome, params) => {
        chamadas.push({ nome, params });
        const r = await rpc(nome, params, chamadas);
        return r;
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; } })
    })
  };
  window.alert = () => {};
  window.confirm = () => confirmar;
  window.print = () => { window.__imprimiu = (window.__imprimiu || 0) + 1; };
  window.HTMLCanvasElement.prototype.getContext = () => null;
  if (sessao) window.sessionStorage.setItem('neoorder_session', JSON.stringify(sessao));

  (SCRIPTS[arquivo] || []).forEach(rel => window.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
  await espera(120);
  return { window, doc: window.document, chamadas, logs, navegacoes, fechar: () => window.close() };
}

async function cenario(nome, fn) {
  cenarios++;
  try {
    await fn();
  } catch (err) {
    falhas.push(`${nome}: ${err.message}`);
  }
}

const sessaoSalva = w => JSON.parse(w.sessionStorage.getItem('neoorder_session') || 'null');
const visivel = el => !!el && !el.hidden && !el.closest('[hidden]');
const texto = (doc, id) => (doc.getElementById(id) || {}).textContent || '';
const semToken = (ctx, onde) => {
  const tudo = [ctx.window.location.href, ...ctx.logs, ctx.window.sessionStorage.getItem('neoorder_session') || '',
    JSON.stringify(Object.assign({}, ctx.window.localStorage))].join('\n');
  assert(!tudo.includes(QR) && !tudo.includes(QR.slice(5, 30)), `${onde}: token do QR apareceu em URL, logs ou armazenamento`);
};

// ---------------------------------------------------------------------------
// Cenários — login por QR
// ---------------------------------------------------------------------------

(async () => {
  // 1 + 9. QR válido: chama a RPC com a assinatura real, salva sessão de mesa, limpa a URL, redireciona
  await cenario('1. QR válido inicia a sessão da mesa', async () => {
    const ctx = await abrir('login.html', { query: `?qr=${QR}`, rpc: n => (n === 'iniciar_sessao_mesa' ? respostaMesa() : { data: null, error: null }) });
    const qrCalls = ctx.chamadas.filter(c => c.nome === 'iniciar_sessao_mesa');
    assert(qrCalls.length === 1, `esperava 1 chamada de iniciar_sessao_mesa, houve ${qrCalls.length}`);
    assert(qrCalls[0].params.p_qr_token === QR && qrCalls[0].params.p_duracao_horas === 12, 'parâmetros da RPC divergem da assinatura real');
    assert(!ctx.chamadas.some(c => c.nome === 'autenticar_usuario'), 'não deveria chamar o login por senha');
    const s = sessaoSalva(ctx.window);
    assert(s && s.token === SESSAO_MESA_TOKEN && s.usuario.tipo === 'mesa' && s.tipoSessao === 'mesa', 'sessão de mesa não foi salva no formato do NeoOrder');
    assert(ctx.window.NeoAuth.profile() === 'mesa', 'perfil efetivo deveria ser mesa');
    assert(!ctx.window.location.search.includes('qr='), 'token permaneceu na URL');
    assert(ctx.navegacoes.length === 1, 'deveria redirecionar ao cardápio (1 navegação)');
    assert(/Mesa liberada/.test(texto(ctx.doc, 'qrLoginTitle')), 'estado de sucesso não exibido');
    semToken(ctx, 'QR válido');
    ctx.fechar();
  });

  await cenario('9. Outros parâmetros da URL são preservados ao remover o token', async () => {
    const ctx = await abrir('login.html', { query: `?type=mesa&qr=${QR}#topo`, rpc: () => erroPg('28000', 'QR Code inválido, expirado ou mesa inativa.') });
    assert(ctx.window.location.search === '?type=mesa' && ctx.window.location.hash === '#topo', `URL final inesperada: ${ctx.window.location.search}${ctx.window.location.hash}`);
    ctx.fechar();
  });

  // 2. QR inválido (formato) — nem chega ao servidor
  await cenario('2. QR com formato inválido mostra mensagem sem chamar o servidor', async () => {
    const ctx = await abrir('login.html', { query: '?qr=abc<script>' });
    assert(!ctx.chamadas.some(c => c.nome === 'iniciar_sessao_mesa'), 'não deveria chamar iniciar_sessao_mesa');
    assert(visivel(ctx.doc.getElementById('qrLoginPanel')) && !visivel(ctx.doc.getElementById('passwordLoginArea')), 'painel de QR deveria substituir o formulário');
    assert(/inválido ou desativado/.test(texto(ctx.doc, 'qrLoginTitle')), 'mensagem de QR inválido ausente');
    assert(!visivel(ctx.doc.getElementById('btnQrRetry')), '"Tentar novamente" não faz sentido para QR inválido');
    assert(!ctx.doc.body.innerHTML.includes('<script>abc') && !texto(ctx.doc, 'qrLoginMessage').includes('abc'), 'conteúdo da URL refletido na página');
    assert(!sessaoSalva(ctx.window), 'nenhuma sessão deveria ser criada');
    ctx.fechar();
  });

  await cenario('2b. QR vazio (?qr=) é tratado como inválido', async () => {
    const ctx = await abrir('login.html', { query: '?qr=' });
    assert(/inválido ou desativado/.test(texto(ctx.doc, 'qrLoginTitle')) && !ctx.chamadas.some(c => c.nome === 'iniciar_sessao_mesa'), 'QR vazio não tratado');
    ctx.fechar();
  });

  // 3. Desativado / regenerado / mesa inativa / inexistente: o banco responde 28000 em todos os casos
  for (const [rotulo, msg] of [['inexistente', 'QR Code inválido.'], ['desativado ou mesa inativa', 'QR Code inválido, expirado ou mesa inativa.']]) {
    await cenario(`3. QR ${rotulo} não inicia sessão`, async () => {
      const ctx = await abrir('login.html', { query: `?qr=${QR}`, rpc: n => (n === 'iniciar_sessao_mesa' ? erroPg('28000', msg) : { data: null, error: null }) });
      assert(!sessaoSalva(ctx.window), 'sessão criada indevidamente');
      assert(ctx.navegacoes.length === 0, 'não deveria redirecionar');
      assert(/inválido ou desativado/.test(texto(ctx.doc, 'qrLoginTitle')), 'mensagem adequada ausente');
      assert(!/sess[aã]o expirou/i.test(ctx.doc.body.textContent), 'não pode exibir "sessão expirou" para QR inválido');
      assert(!visivel(ctx.doc.getElementById('btnQrRetry')) && visivel(ctx.doc.getElementById('btnQrUsePassword')), 'ações de recuperação incorretas');
      assert(ctx.doc.activeElement === ctx.doc.getElementById('btnQrUsePassword'), 'foco deveria ir para a ação disponível');
      semToken(ctx, `QR ${rotulo}`);
      ctx.fechar();
    });
  }

  // 4. Rede e servidor
  await cenario('4a. Falha de rede: mensagem própria, repetir funciona', async () => {
    let n = 0;
    const ctx = await abrir('login.html', { query: `?qr=${QR}`, rpc: nome => (nome === 'iniciar_sessao_mesa' ? (++n === 1 ? erroRede() : respostaMesa()) : { data: null, error: null }) });
    assert(/Sem conexão/.test(texto(ctx.doc, 'qrLoginTitle')), 'mensagem de rede ausente');
    const retry = ctx.doc.getElementById('btnQrRetry');
    assert(visivel(retry) && !retry.disabled, '"Tentar novamente" deveria estar disponível');
    assert(!sessaoSalva(ctx.window), 'sem sessão após falha');
    retry.click();
    await espera(80);
    assert(n === 2 && sessaoSalva(ctx.window), 'repetir deveria iniciar a sessão');
    assert(!ctx.window.location.search.includes('qr='), 'token voltou para a URL');
    semToken(ctx, 'rede');
    ctx.fechar();
  });

  await cenario('4b. Exceção de rede (fetch rejeitado) é tratada', async () => {
    const ctx = await abrir('login.html', { query: `?qr=${QR}`, rpc: nome => { if (nome === 'iniciar_sessao_mesa') throw new TypeError('Failed to fetch'); return { data: null, error: null }; } });
    assert(/Sem conexão/.test(texto(ctx.doc, 'qrLoginTitle')), 'exceção de rede não classificada');
    ctx.fechar();
  });

  await cenario('4c. Erro do servidor: mensagem genérica sem detalhes técnicos', async () => {
    const ctx = await abrir('login.html', { query: `?qr=${QR}`, rpc: nome => (nome === 'iniciar_sessao_mesa' ? erroPg('XX000', 'relation "sessoes_mesa" does not exist') : { data: null, error: null }) });
    const corpo = ctx.doc.body.textContent;
    assert(/Não foi possível validar o QR Code agora/.test(texto(ctx.doc, 'qrLoginTitle')), 'mensagem de erro do servidor ausente');
    assert(!/relation|sessoes_mesa|XX000/.test(corpo), 'detalhe técnico exposto ao cliente');
    assert(visivel(ctx.doc.getElementById('btnQrRetry')), 'erro temporário deveria permitir repetir');
    ctx.fechar();
  });

  await cenario('4d. Função ausente no banco (PGRST202) não quebra a página', async () => {
    const ctx = await abrir('login.html', { query: `?qr=${QR}`, rpc: nome => (nome === 'iniciar_sessao_mesa' ? erroPg('PGRST202', 'Could not find the function public.iniciar_sessao_mesa') : { data: null, error: null }) });
    assert(/Não foi possível validar/.test(texto(ctx.doc, 'qrLoginTitle')), 'função ausente deveria cair em erro genérico');
    ctx.doc.getElementById('btnQrUsePassword').click();
    await espera(30);
    assert(visivel(ctx.doc.getElementById('mesaForm')) && !visivel(ctx.doc.getElementById('qrLoginPanel')), '"Entrar com usuário e senha" deveria mostrar o formulário');
    assert(ctx.doc.activeElement === ctx.doc.getElementById('tableLogin'), 'foco deveria ir para o usuário da mesa');
    ctx.fechar();
  });

  // 5. Cliques repetidos / execução duplicada
  await cenario('5. Cliques repetidos não criam sessões duplicadas', async () => {
    let n = 0;
    const ctx = await abrir('login.html', {
      query: `?qr=${QR}`,
      rpc: async nome => {
        if (nome !== 'iniciar_sessao_mesa') return { data: null, error: null };
        n++;
        if (n === 1) return erroRede();
        await espera(150);
        return respostaMesa();
      }
    });
    const retry = ctx.doc.getElementById('btnQrRetry');
    for (let i = 0; i < 5; i++) retry.click();
    assert(retry.disabled, 'botão deveria ficar desabilitado durante a validação');
    await espera(260);
    assert(n === 2, `esperava 2 chamadas no total (falha + 1 repetição), houve ${n}`);
    assert(ctx.navegacoes.length === 1, 'deveria haver um único redirecionamento');
    ctx.fechar();
  });

  await cenario('5b. Recarregar após processar não reenvia o token', async () => {
    const ctx = await abrir('login.html', { query: `?qr=${QR}`, rpc: () => erroPg('28000', 'QR Code inválido.') });
    const urlRecarregada = ctx.window.location.href;
    ctx.fechar();
    assert(!urlRecarregada.includes('qr='), 'URL recarregável ainda contém o token');
    const ctx2 = await abrir('login.html', { query: new URL(urlRecarregada).search });
    assert(!ctx2.chamadas.some(c => c.nome === 'iniciar_sessao_mesa') && !visivel(ctx2.doc.getElementById('qrLoginPanel')), 'recarregar não deveria repetir o login por QR');
    ctx2.fechar();
  });

  // 6. Sessão de mesa não vira sessão de funcionário
  await cenario('6a. Resposta que não é de mesa é recusada e encerrada no servidor', async () => {
    const ctx = await abrir('login.html', {
      query: `?qr=${QR}`,
      rpc: nome => (nome === 'iniciar_sessao_mesa'
        ? respostaMesa({ usuario: { id: 'u2', nome: 'Gerente', login: 'gerente', tipo: 'funcionario', perfil: 'gerente' }, tipo_sessao: 'funcionario' })
        : { data: null, error: null })
    });
    assert(!sessaoSalva(ctx.window), 'sessão de funcionário não pode ser aceita pelo QR');
    assert(ctx.chamadas.some(c => c.nome === 'encerrar_sessao' && c.params.p_session_token === SESSAO_MESA_TOKEN), 'token recebido deveria ser encerrado');
    assert(ctx.navegacoes.length === 0, 'não deveria redirecionar');
    ctx.fechar();
  });

  await cenario('6b. Perfil gravado é sempre "mesa", mesmo que o servidor envie outro perfil', async () => {
    const ctx = await abrir('login.html', { query: `?qr=${QR}`, rpc: n => (n === 'iniciar_sessao_mesa' ? respostaMesa({ usuario: { id: 'm1', nome: 'Mesa 01', login: 'Mesa 01', tipo: 'mesa', perfil: 'gerente' } }) : { data: null, error: null }) });
    assert(sessaoSalva(ctx.window).usuario.perfil === 'mesa' && ctx.window.NeoAuth.profile() === 'mesa', 'perfil deveria ser mesa');
    ctx.fechar();
  });

  for (const pagina of ['contas.html', 'estoque.html', 'atendimento.html', 'faturamento.html']) {
    await cenario(`6c. Sessão de mesa não acessa ${pagina}`, async () => {
      const ctx = await abrir(pagina, { sessao: sessoes.mesa, rpc: () => ({ data: [], error: null }) });
      assert(ctx.navegacoes.length >= 1, 'deveria redirecionar ao login');
      assert(!sessaoSalva(ctx.window), 'sessão deveria ser descartada ao tentar acessar a gestão');
      const proibidas = ['listar_contas', 'status_qr_mesas', 'gerar_qr_code_mesa', 'desativar_qr_mesa', 'listar_estoque', 'painel_atendimento', 'relatorio_faturamento'];
      assert(!ctx.chamadas.some(c => proibidas.includes(c.nome)), `RPC de gestão chamada com sessão de mesa: ${ctx.chamadas.map(c => c.nome).join(',')}`);
      ctx.fechar();
    });
  }

  await cenario('6d. QR aberto num aparelho com sessão de funcionário encerra a sessão anterior', async () => {
    const ctx = await abrir('login.html', { query: `?qr=${QR}`, sessao: sessoes.atendente, rpc: n => (n === 'iniciar_sessao_mesa' ? respostaMesa() : { data: null, error: null }) });
    assert(ctx.chamadas.some(c => c.nome === 'encerrar_sessao' && c.params.p_session_token === sessoes.atendente.token), 'sessão anterior não foi encerrada');
    assert(sessaoSalva(ctx.window).usuario.tipo === 'mesa', 'sessão final deveria ser de mesa');
    ctx.fechar();
  });

  // 7. Login convencional
  for (const [aba, form, loginId, senhaId, usuario] of [
    ['tabMesaBtn', 'mesaForm', 'tableLogin', 'tablePassword', { id: 'm1', nome: 'Mesa 01', tipo: 'mesa', perfil: 'mesa' }],
    ['tabAttendantBtn', 'attendantForm', 'attendantLogin', 'attendantPassword', { id: 'u3', nome: 'Ana', tipo: 'funcionario', perfil: 'atendente' }],
    ['tabManagerBtn', 'managerForm', 'managerLogin', 'managerPassword', { id: 'u2', nome: 'Gerente', tipo: 'funcionario', perfil: 'gerente' }]]) {
    await cenario(`7. Login por senha continua funcionando (${aba})`, async () => {
      const ctx = await abrir('login.html', {
        rpc: n => (n === 'autenticar_usuario'
          ? { data: { sucesso: true, session_token: 'z'.repeat(64), tipo_sessao: usuario.tipo === 'mesa' ? 'mesa' : 'funcionario', expira_em: futuro(), usuario }, error: null }
          : { data: false, error: null })
      });
      assert(!visivel(ctx.doc.getElementById('qrLoginPanel')) && visivel(ctx.doc.getElementById('passwordLoginArea')), 'sem ?qr= o painel de QR não deve aparecer');
      ctx.doc.getElementById(aba).click();
      ctx.doc.getElementById(loginId).value = 'usuario';
      ctx.doc.getElementById(senhaId).value = 'segredo123';
      ctx.doc.getElementById(form).dispatchEvent(new ctx.window.Event('submit', { cancelable: true, bubbles: true }));
      await espera(60);
      assert(ctx.chamadas.some(c => c.nome === 'autenticar_usuario') && !ctx.chamadas.some(c => c.nome === 'iniciar_sessao_mesa'), 'fluxo de senha alterado');
      assert(sessaoSalva(ctx.window) && sessaoSalva(ctx.window).usuario.perfil === usuario.perfil, 'sessão não salva');
      assert(!ctx.logs.some(l => l.includes('segredo123')), 'senha apareceu em log');
      ctx.fechar();
    });
  }

  await cenario('7b. Senha errada continua mostrando a mensagem do servidor', async () => {
    const ctx = await abrir('login.html', { rpc: n => (n === 'autenticar_usuario' ? { data: { sucesso: false, codigo: '28000', mensagem: 'Usuário ou senha inválidos.' }, error: null } : { data: false, error: null }) });
    ctx.doc.getElementById('tableLogin').value = 'Mesa 01';
    ctx.doc.getElementById('tablePassword').value = 'errada';
    ctx.doc.getElementById('mesaForm').dispatchEvent(new ctx.window.Event('submit', { cancelable: true, bubbles: true }));
    await espera(60);
    assert(texto(ctx.doc, 'authAlert') === 'Usuário ou senha inválidos.', `mensagem inesperada: ${texto(ctx.doc, 'authAlert')}`);
    ctx.fechar();
  });

  // ---------------------------------------------------------------------------
  // 10. Gestão de QR (contas.html)
  // ---------------------------------------------------------------------------

  const rpcGestao = (over = {}) => (nome, params) => {
    if (nome in over) return over[nome](params);
    if (nome === 'listar_contas') return { data: contasFixture, error: null };
    if (nome === 'status_qr_mesas') return { data: statusFixture, error: null };
    if (nome === 'gerar_qr_code_mesa') return { data: { mesa_id: params.p_mesa_id, mesa_nome: 'Mesa 01', qr_token: QR, url_relativa: 'login.html?qr=' + QR, gerado_por: 'Gerente', gerado_em: new Date().toISOString() }, error: null };
    if (nome === 'desativar_qr_mesa') return { data: { mesa_id: params.p_mesa_id, qr_code_ativo: false }, error: null };
    return { data: null, error: null };
  };

  await cenario('10a. Atendente não acessa a gestão de QR', async () => {
    const ctx = await abrir('contas.html', { sessao: sessoes.atendente, rpc: rpcGestao() });
    assert(ctx.navegacoes.length >= 1 && !ctx.chamadas.some(c => /qr|listar_contas/.test(c.nome)), 'atendente não deveria chegar às RPCs de QR');
    ctx.fechar();
  });

  await cenario('10b. Gerente vê o estado e só mesas têm o botão de QR', async () => {
    const ctx = await abrir('contas.html', { sessao: sessoes.gerente, rpc: rpcGestao() });
    const st = ctx.chamadas.find(c => c.nome === 'status_qr_mesas');
    assert(st && st.params.p_session_token === sessoes.gerente.token, 'status_qr_mesas deveria usar o token do gerente');
    const botoes = [...ctx.doc.querySelectorAll('[data-qr]')].map(b => b.dataset.qr);
    assert(botoes.join(',') === 'm1,m2', `botões de QR esperados só nas mesas, obtido: ${botoes}`);
    assert([...ctx.doc.querySelectorAll('[data-qr]')].every(b => b.getAttribute('aria-label') && !b.getAttribute('style')), 'botão de QR sem nome acessível');
    const linhas = [...ctx.doc.querySelectorAll('#accountsTableBody tr')].map(tr => tr.textContent);
    assert(linhas[0].includes('QR ativo') && linhas[1].includes('Sem QR') && !linhas[2].includes('QR'), 'selos de estado do QR incorretos');
    ctx.fechar();
  });

  await cenario('10c. Gerar QR: mesa correta, imagem local, link mascarado, imprimir', async () => {
    const ctx = await abrir('contas.html', { sessao: sessoes.gerente, rpc: rpcGestao() });
    ctx.doc.querySelector('[data-qr="m1"]').click();
    await espera(40);
    const modal = ctx.doc.getElementById('qrModal');
    assert(modal.style.display === 'flex', 'modal de QR não abriu');
    assert(/Sessão aberta agora/.test(texto(ctx.doc, 'qrStatus')) && /QR Code ativo/.test(texto(ctx.doc, 'qrStatus')), 'estado atual não exibido');
    assert(visivel(ctx.doc.getElementById('btnQrDeactivate')), 'desativar deveria estar disponível para QR ativo');
    ctx.doc.getElementById('btnQrGenerate').click();
    await espera(60);
    const g = ctx.chamadas.filter(c => c.nome === 'gerar_qr_code_mesa');
    assert(g.length === 1 && g[0].params.p_mesa_id === 'm1' && g[0].params.p_session_token === sessoes.gerente.token, 'gerar_qr_code_mesa com parâmetros incorretos');
    const svg = ctx.doc.querySelector('#qrFigure svg');
    assert(svg && svg.querySelector('path') && svg.querySelector('path').getAttribute('d').length > 500, 'imagem do QR não foi gerada');
    const preview = texto(ctx.doc, 'qrLinkPreview');
    assert(preview.startsWith('https://neoorder.test/login.html?qr=MESA-') && preview.includes('…') && !preview.includes(QR), `link deveria estar mascarado: ${preview}`);
    assert(visivel(ctx.doc.getElementById('btnQrPrint')), 'imprimir deveria aparecer após gerar');
    ctx.doc.getElementById('btnQrPrint').click();
    assert(ctx.window.__imprimiu === 1, 'impressão não acionada');
    assert(!ctx.logs.some(l => l.includes(QR)), 'token em log');
    // Fechar descarta a imagem e o link da memória/DOM
    ctx.doc.getElementById('btnCloseQrModal').click();
    await espera(20);
    assert(ctx.doc.getElementById('qrFigure').innerHTML === '' && !ctx.doc.body.innerHTML.includes(QR), 'QR deveria ser descartado ao fechar');
    ctx.fechar();
  });

  await cenario('10d. Cliques repetidos em "Gerar" geram uma única vez', async () => {
    const ctx = await abrir('contas.html', {
      sessao: sessoes.gerente,
      rpc: rpcGestao({ gerar_qr_code_mesa: async p => { await espera(100); return { data: { mesa_id: p.p_mesa_id, mesa_nome: 'Mesa 01', qr_token: QR, url_relativa: 'login.html?qr=' + QR }, error: null }; } })
    });
    ctx.doc.querySelector('[data-qr="m1"]').click();
    await espera(30);
    for (let i = 0; i < 4; i++) ctx.doc.getElementById('btnQrGenerate').click();
    await espera(200);
    assert(ctx.chamadas.filter(c => c.nome === 'gerar_qr_code_mesa').length === 1, 'geração duplicada');
    ctx.fechar();
  });

  await cenario('10e. Cancelar a confirmação não regenera o QR ativo', async () => {
    const ctx = await abrir('contas.html', { sessao: sessoes.gerente, rpc: rpcGestao(), confirmar: false });
    ctx.doc.querySelector('[data-qr="m1"]').click();
    await espera(30);
    ctx.doc.getElementById('btnQrGenerate').click();
    ctx.doc.getElementById('btnQrDeactivate').click();
    await espera(40);
    assert(!ctx.chamadas.some(c => c.nome === 'gerar_qr_code_mesa' || c.nome === 'desativar_qr_mesa'), 'ação executada sem confirmação');
    ctx.fechar();
  });

  await cenario('10f. Desativar QR chama a RPC da mesa correta e atualiza o estado', async () => {
    const ctx = await abrir('contas.html', { sessao: sessoes.gerente, rpc: rpcGestao() });
    ctx.doc.querySelector('[data-qr="m1"]').click();
    await espera(30);
    ctx.doc.getElementById('btnQrDeactivate').click();
    await espera(60);
    const d = ctx.chamadas.filter(c => c.nome === 'desativar_qr_mesa');
    assert(d.length === 1 && d[0].params.p_mesa_id === 'm1' && d[0].params.p_session_token === sessoes.gerente.token, 'desativar_qr_mesa com parâmetros incorretos');
    assert(/Sem QR Code ativo/.test(texto(ctx.doc, 'qrStatus')) && !visivel(ctx.doc.getElementById('btnQrDeactivate')), 'estado não atualizado após desativar');
    ctx.fechar();
  });

  await cenario('10g. Mesa inativa: gerar fica indisponível', async () => {
    const ctx = await abrir('contas.html', { sessao: sessoes.gerente, rpc: rpcGestao() });
    ctx.doc.querySelector('[data-qr="m2"]').click();
    await espera(30);
    assert(ctx.doc.getElementById('btnQrGenerate').disabled && /Mesa inativa/.test(texto(ctx.doc, 'qrStatus')), 'mesa inativa deveria bloquear a geração');
    ctx.fechar();
  });

  await cenario('10h. Servidor recusa (42501): mensagem do servidor, nenhum QR exibido', async () => {
    const ctx = await abrir('contas.html', { sessao: sessoes.gerente, rpc: rpcGestao({ gerar_qr_code_mesa: () => erroPg('42501', 'Acesso negado: apenas gerentes podem executar esta ação.') }) });
    ctx.doc.querySelector('[data-qr="m1"]').click();
    await espera(30);
    ctx.doc.getElementById('btnQrGenerate').click();
    await espera(60);
    assert(!ctx.doc.querySelector('#qrFigure svg') && !visivel(ctx.doc.getElementById('btnQrPrint')), 'QR não deveria aparecer após recusa');
    assert(/apenas gerentes/.test(ctx.doc.getElementById('neo-toast-host').textContent), 'mensagem de recusa ausente');
    assert(!ctx.doc.getElementById('btnQrGenerate').disabled, 'botão deveria voltar ao normal');
    ctx.fechar();
  });

  await cenario('10i. Resposta para outra mesa é rejeitada', async () => {
    const ctx = await abrir('contas.html', { sessao: sessoes.gerente, rpc: rpcGestao({ gerar_qr_code_mesa: () => ({ data: { mesa_id: 'm9', qr_token: QR, url_relativa: 'login.html?qr=' + QR }, error: null }) }) });
    ctx.doc.querySelector('[data-qr="m1"]').click();
    await espera(30);
    ctx.doc.getElementById('btnQrGenerate').click();
    await espera(60);
    assert(!ctx.doc.querySelector('#qrFigure svg'), 'QR de outra mesa não pode ser exibido');
    ctx.fechar();
  });

  await cenario('10j. Sem status_qr_mesas, contas continuam funcionando e o QR fica oculto', async () => {
    const ctx = await abrir('contas.html', { sessao: sessoes.gerente, rpc: rpcGestao({ status_qr_mesas: () => erroPg('PGRST202', 'Could not find the function') }) });
    assert(ctx.doc.querySelectorAll('#accountsTableBody tr').length === 3, 'contas deveriam continuar listadas');
    assert(!ctx.doc.querySelector('[data-qr]'), 'botão de QR não deveria aparecer sem a função no banco');
    ctx.fechar();
  });

  await cenario('10k. O QR gerado aponta para o login da mesa (decodificação da URL)', async () => {
    // A URL codificada é a mesma mostrada (mascarada) e copiada; confere o conteúdo
    // regerando com a mesma biblioteca e comparando o desenho.
    const ctx = await abrir('contas.html', { sessao: sessoes.gerente, rpc: rpcGestao() });
    ctx.doc.querySelector('[data-qr="m1"]').click();
    await espera(30);
    ctx.doc.getElementById('btnQrGenerate').click();
    await espera(60);
    const q = ctx.window.qrcode(0, 'M');
    q.addData('https://neoorder.test/login.html?qr=' + QR);
    q.make();
    const esperado = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }).match(/ d="([^"]+)"/)[1];
    const obtido = ctx.doc.querySelector('#qrFigure svg path').getAttribute('d');
    assert(obtido === esperado, 'QR não codifica https://<site>/login.html?qr=<token>');
    ctx.fechar();
  });

  if (falhas.length) {
    console.error(`FALHAS (${falhas.length}/${cenarios}):\n` + falhas.map(f => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log(`Teste de QR Code OK — ${cenarios} cenários.`);
})();
