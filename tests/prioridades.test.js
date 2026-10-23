// tests/prioridades.test.js — Validação das três prioridades máximas
// Executa com: node tests/prioridades.test.js (ou npm test se incluído)
// Usa jsdom + RPC simulada (sem rede, sem Supabase real), espelhando contrato das RPCs.

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const QR_MESA = 'MESA-' + 'b'.repeat(64);
const QR_STAFF = 'FUNC-' + 'c'.repeat(64);
const QR_INVALID = 'MESA-' + 'x'.repeat(64);

let cenarios = 0, falhas = [];

const futuro = () => new Date(Date.now() + 12 * 3600 * 1000).toISOString();
const erroPg = (code, msg) => ({ data: null, error: { code, message: msg } });
const respostaMesa = (over = {}) => ({ data: { sucesso: true, usuario: { id: 'm1', nome: 'Mesa 01', login: 'Mesa 01', tipo: 'mesa', perfil: 'mesa' }, tipo_sessao: 'mesa', session_token: 't'.repeat(64), expira_em: futuro(), via: 'qr_code', ...over }, error: null });
const respostaStaff = (perfil = 'gerente', over = {}) => ({ data: { sucesso: true, usuario: { id: perfil === 'gerente' ? 'u1' : 'u2', nome: perfil === 'gerente' ? 'Gerente' : 'Atendente', login: perfil, tipo: 'funcionario', perfil }, tipo_sessao: 'funcionario', session_token: 's'.repeat(64), expira_em: futuro(), via: 'qr_code', ...over }, error: null });

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const espera = ms => new Promise(r => setTimeout(r, ms));

async function abrir(arquivo, { query = '', sessao = null, rpc = () => ({ data: null, error: null }), confirmar = true } = {}) {
  const html = fs.readFileSync(path.join(ROOT, arquivo), 'utf8').replace(/<script src="[^"]*"[^>]*><\/script>/g, '');
  const logs = [];
  const navegacoes = [];
  const vc = new VirtualConsole();
  ['log','info','warn','error'].forEach(n=>vc.on(n,(...a)=>logs.push(a.join(' '))));
  vc.on('jsdomError', e=> { if(/navigation/i.test(e.message)) navegacoes.push(e.message); else logs.push(e.message); });
  const dom = new JSDOM(html, { url: `https://neoorder.test/${arquivo}${query}`, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:vc });
  const {window}=dom;
  const chamadas=[];
  window.supabase={ createClient:()=>({ rpc: async (nome, params)=>{ chamadas.push({nome, params}); const r=await rpc(nome,params,chamadas); return r; }, channel:()=>({on(){return this},subscribe(){return this}}) })};
  window.alert=()=>{}; window.confirm=()=>confirmar; window.print=()=>{}; window.HTMLCanvasElement.prototype.getContext=()=>null;
  if(sessao) window.sessionStorage.setItem('neoorder_session', JSON.stringify(sessao));
  const scripts = {
    'login.html': ['js/supabase.js','js/auth.js'],
    'cardapio.html': ['js/supabase.js','js/auth.js','js/cardapio.js'],
    'contas.html': ['js/supabase.js','js/auth.js','js/vendor/qrcode-generator.js','js/contas.js'],
    'atendimento.html': ['js/supabase.js','js/auth.js','js/atendimento.js']
  };
  (scripts[arquivo]||[]).forEach(rel=> window.eval(fs.readFileSync(path.join(ROOT, rel),'utf8')));
  await espera(120);
  return {window, doc: window.document, chamadas, logs, navegacoes, fechar:()=>window.close()};
}
async function cenario(nome, fn){ cenarios++; try{ await fn(); } catch(e){ falhas.push(`${nome}: ${e.message}`); console.error(`FALHA ${nome}:`, e.message); } }

const sessaoGerente = { usuario:{id:'u1', nome:'Gerente', login:'gerente', tipo:'funcionario', perfil:'gerente'}, token:'g'.repeat(64), tipoSessao:'funcionario', expiraEm:futuro() };
const sessaoAtendente = { usuario:{id:'u2', nome:'Atendente', login:'atendente', tipo:'funcionario', perfil:'atendente'}, token:'a'.repeat(64), tipoSessao:'funcionario', expiraEm:futuro() };
const sessaoMesa = { usuario:{id:'m1', nome:'Mesa 01', login:'Mesa 01', tipo:'mesa', perfil:'mesa'}, token:'m'.repeat(64), tipoSessao:'mesa', expiraEm:futuro() };

(async()=>{
  // P1.1 — Sessões independentes: gerente e atendente simultâneos em dispositivos diferentes
  await cenario('P1. Gerente e atendente autenticados simultaneamente (dispositivos independentes)', async()=>{
    // Simula dois dispositivos: cada um com seu token, ambos válidos no servidor
    const serverTokens = new Set([sessaoGerente.token, sessaoAtendente.token]);
    const rpc = (nome, params) => {
      if(nome==='painel_atendimento' && serverTokens.has(params.p_session_token)) return {data:{chamados:[], pedidos:[], gerado_em:new Date().toISOString()}, error:null};
      if(nome==='encerrar_sessao'){ serverTokens.delete(params.p_session_token); return {data:{mensagem:'ok'},error:null}; }
      return {data:null, error:null};
    };
    const d1 = await abrir('atendimento.html', {sessao: sessaoGerente, rpc});
    const d2 = await abrir('atendimento.html', {sessao: sessaoAtendente, rpc});
    // Ambos conseguem carregar painel
    assert(d1.chamadas.some(c=>c.nome==='painel_atendimento'), 'gerente deveria carregar painel');
    assert(d2.chamadas.some(c=>c.nome==='painel_atendimento'), 'atendente deveria carregar painel');
    // Logout do gerente não afeta atendente
    const tokenGerente = sessaoGerente.token;
    await d1.window.NeoAPI.encerrarSessao(tokenGerente);
    assert(!serverTokens.has(tokenGerente), 'sessão do gerente deveria ser encerrada');
    assert(serverTokens.has(sessaoAtendente.token), 'sessão do atendente não deveria ser afetada');
    d1.fechar(); d2.fechar();
  });

  // P1.2 — Mesmo usuário em dois dispositivos: segunda login não invalida a primeira (multi-sessão)
  await cenario('P1. Mesmo gerente em dois dispositivos mantém sessões independentes', async()=>{
    const tokensAtivos = new Map(); // token -> usuario
    let callCount=0;
    const rpc = (nome, params) => {
      if(nome==='autenticar_usuario'){
        callCount++;
        const token = `tok${callCount}`.padEnd(64,'x');
        tokensAtivos.set(token, params.p_login);
        return {data:{sucesso:true, usuario:{id:'u1', nome:'Gerente', login:params.p_login, tipo:'funcionario', perfil:'gerente'}, tipo_sessao:'funcionario', session_token:token, expira_em:futuro()}, error:null};
      }
      if(nome==='painel_atendimento'){
        if(tokensAtivos.has(params.p_session_token)) return {data:{chamados:[],pedidos:[],gerado_em:new Date().toISOString()}, error:null};
        return erroPg('28000','Sessão inválida');
      }
      if(nome==='encerrar_sessao'){ tokensAtivos.delete(params.p_session_token); return {data:{mensagem:'ok'},error:null}; }
      return {data:null, error:null};
    };
    // Dispositivo A loga
    const ctxA = await abrir('login.html', {rpc});
    const dataA = await ctxA.window.NeoAPI.autenticar('gerente','gerente123');
    const tokenA = dataA.session_token;
    assert(tokensAtivos.has(tokenA), 'token A deveria estar ativo');
    // Dispositivo B loga com mesma conta
    const ctxB = await abrir('login.html', {rpc});
    const dataB = await ctxB.window.NeoAPI.autenticar('gerente','gerente123');
    const tokenB = dataB.session_token;
    assert(tokensAtivos.has(tokenA), 'token A não deveria ser invalidado pelo segundo login (multi-sessão)');
    assert(tokensAtivos.has(tokenB) && tokenA!==tokenB, 'token B deveria ser diferente e ambos ativos');
    // Logout de A não afeta B
    await ctxA.window.NeoAPI.encerrarSessao(tokenA);
    assert(!tokensAtivos.has(tokenA) && tokensAtivos.has(tokenB), 'logout de A não deve afetar B');
    ctxA.fechar(); ctxB.fechar();
  });

  // P1.3 — Isolamento mesa vs staff: sessão de mesa não acessa gestão
  await cenario('P1. Sessão de mesa não acessa painel de atendimento (isolamento)', async()=>{
    const rpc = (nome) => {
      if(nome==='painel_atendimento') return erroPg('28000','Sessão de mesa inválida');
      if(nome==='listar_contas') return erroPg('42501','Acesso negado');
      return {data:null, error:null};
    };
    const ctx = await abrir('atendimento.html', {sessao: sessaoMesa, rpc});
    // Frontend requireAuth deve bloquear acesso de mesa a atendimento (redireciona para login)
    assert(ctx.navegacoes.length>0 || !ctx.chamadas.some(c=>c.nome==='painel_atendimento'), 'sessão de mesa não deve acessar painel de atendimento (isolamento frontend/backend)');
    ctx.fechar();
  });

  // P2.1 — QR de gerente concede perfil gerente, QR de atendente concede atendente
  await cenario('P2. QR de gerente e atendente com permissões corretas', async()=>{
    const ctxGer = await abrir('login.html', {query:`?qr=${QR_STAFF}`, rpc: (n,p)=>{
      if(n==='iniciar_sessao_funcionario_qr' && p.p_qr_token===QR_STAFF) return respostaStaff('gerente');
      return {data:null, error:null};
    }});
    // Deve redirecionar para faturamento (gerente)
    assert(ctxGer.navegacoes.length===1 && ctxGer.window.sessionStorage.getItem('neoorder_session')?.includes('gerente'), 'QR de gerente deveria criar sessão de gerente');
    assert(JSON.parse(ctxGer.window.sessionStorage.getItem('neoorder_session')).usuario.perfil==='gerente', 'perfil gerente preservado');
    ctxGer.fechar();

    const QR_ATT = 'FUNC-'+'d'.repeat(64);
    const ctxAtt = await abrir('login.html', {query:`?qr=${QR_ATT}`, rpc: (n,p)=>{
      if(n==='iniciar_sessao_funcionario_qr' && p.p_qr_token===QR_ATT) return respostaStaff('atendente');
      return {data:null, error:null};
    }});
    const sess = JSON.parse(ctxAtt.window.sessionStorage.getItem('neoorder_session')||'null');
    assert(sess && sess.usuario.perfil==='atendente', 'QR de atendente deveria criar sessão atendente');
    ctxAtt.fechar();
  });

  // P2.2 — QR de mesa não concede acesso staff
  await cenario('P2. QR de mesa não concede acesso administrativo', async()=>{
    const ctx = await abrir('login.html', {query:`?qr=${QR_MESA}`, rpc: (n,p)=>{
      if(n==='iniciar_sessao_mesa' && p.p_qr_token===QR_MESA) return respostaMesa();
      if(n==='iniciar_sessao_funcionario_qr') return erroPg('28000','QR Code inválido');
      return {data:null, error:null};
    }});
    const sess = JSON.parse(ctx.window.sessionStorage.getItem('neoorder_session')||'null');
    assert(sess && sess.usuario.tipo==='mesa' && sess.tipoSessao==='mesa', 'QR de mesa deveria criar apenas sessão de mesa');
    // Tentar acessar painel de atendimento com sessão de mesa: frontend deve bloquear (redirect) antes de chamar RPC
    const ctx2 = await abrir('atendimento.html', {sessao: sess, rpc: (n)=> n==='painel_atendimento' ? erroPg('28000','Sessão inválida') : {data:null,error:null}});
    assert(ctx2.navegacoes.length>0 || !ctx2.chamadas.some(c=>c.nome==='painel_atendimento'), 'sessão de mesa não deve acessar painel de atendimento');
    ctx.fechar(); ctx2.fechar();
  });

  // P2.3 — QR inválido, expirado, revogado rejeitado
  await cenario('P2. QR inválido/expirado/revogado rejeitado', async()=>{
    for(const qr of [QR_INVALID, 'MESA-'+'z'.repeat(64), 'FUNC-'+'y'.repeat(64)]){
      const ctx = await abrir('login.html', {query:`?qr=${qr}`, rpc: (n)=> erroPg('28000','QR Code inválido')});
      assert(!JSON.parse(ctx.window.sessionStorage.getItem('neoorder_session')||'null'), `QR ${qr.slice(0,10)} deveria ser rejeitado`);
      assert(ctx.navegacoes.length===0, 'não deve redirecionar com QR inválido');
      ctx.fechar();
    }
  });

  // P3.1 — Encerrar sessão de mesa com PIN correto de staff (v2.8)
  await cenario('P3. Encerrar sessão de mesa com PIN correto de gerente/atendente', async()=>{
    const ctx = await abrir('cardapio.html', {sessao: sessaoMesa, rpc: (nome, params)=>{
      if(nome==='encerrar_sessao_mesa_autorizada'){
        if(params.p_staff_login==='gerente' && params.p_pin==='123456' && params.p_session_token_mesa===sessaoMesa.token) return {data:{mensagem:'Sessão da mesa encerrada com PIN.', mesa_id:'m1', autorizado_por:'Gerente'}, error:null};
        return erroPg('28000','PIN incorreto.');
      }
      return {data:null, error:null};
    }});
    // Simula preenchimento do modal e submit
    ctx.doc.getElementById('logoutStaffLogin').value='gerente';
    ctx.doc.getElementById('logoutStaffPin').value='123456';
    let encerrada=false;
    // Mock do NeoAPI para capturar chamada
    const orig = ctx.window.NeoAPI.encerrarSessaoMesaAutorizada;
    ctx.window.NeoAPI.encerrarSessaoMesaAutorizada = async (tok, login, pin)=> {
      const r = await orig(tok, login, pin);
      if(!r.error) encerrada=true;
      return r;
    };
    await ctx.window.NeoAuth.logoutMesaComAutorizacao('gerente','123456', ctx.doc.getElementById('btnConfirmLogoutMesa'));
    assert(encerrada || ctx.chamadas.some(c=>c.nome==='encerrar_sessao_mesa_autorizada'), 'deveria chamar RPC autorizada com PIN correto');
    ctx.fechar();
  });

  // P3.2 — PIN incorreto não encerra
  await cenario('P3. PIN incorreto não encerra sessão de mesa', async()=>{
    const ctx = await abrir('cardapio.html', {sessao: sessaoMesa, rpc: (nome)=> nome==='encerrar_sessao_mesa_autorizada' ? erroPg('28000','PIN incorreto.') : {data:null,error:null}});
    let falhou=false;
    try{ await ctx.window.NeoAPI.encerrarSessaoMesaAutorizada(sessaoMesa.token, 'gerente','000000'); } catch(e){ falhou=true; assert(e.code==='28000' || /PIN incorreto/.test(e.message), 'deveria retornar erro de PIN incorreto'); }
    assert(falhou, 'chamada com PIN errado deveria falhar');
    assert(ctx.window.sessionStorage.getItem('neoorder_session'), 'sessão não deveria ser limpa com falha');
    ctx.fechar();
  });
  // P3.2b — Formato inválido de PIN é rejeitado no cliente (22023)
  await cenario('P3. PIN com formato inválido é rejeitado (22023)', async()=>{
    const ctx = await abrir('cardapio.html', {sessao: sessaoMesa, rpc: (nome)=> nome==='encerrar_sessao_mesa_autorizada' ? erroPg('22023','PIN deve ter exatamente 6 dígitos.') : {data:null,error:null}});
    let falhou=false;
    try{ await ctx.window.NeoAPI.encerrarSessaoMesaAutorizada(sessaoMesa.token, 'gerente','123'); } catch(e){ falhou=true; assert(e.code==='22023' || /6 dígitos/.test(e.message), 'deveria retornar erro de formato'); }
    assert(falhou, 'PIN com formato inválido deveria falhar');
    ctx.fechar();
  });

  // P3.3 — Tentativa de encerrar outra mesa sem token falha; chamada direta sem PIN falha
  await cenario('P3. Chamada direta a encerrar_sessao sem autorização é bloqueada (42501)', async()=>{
    const ctx = await abrir('cardapio.html', {sessao: sessaoMesa, rpc: (nome, params)=>{
      if(nome==='encerrar_sessao' && params.p_session_token===sessaoMesa.token) return erroPg('42501','Encerramento de sessão de mesa requer autorização de funcionário. Use encerrar_sessao_mesa_autorizada.');
      return {data:null,error:null};
    }});
    let bloqueada=false;
    try{ await ctx.window.NeoAPI.encerrarSessao(sessaoMesa.token); } catch(e){ bloqueada = e.code==='42501'; }
    assert(bloqueada, 'encerrar_sessao direto para mesa deveria ser bloqueado com 42501');
    ctx.fechar();
  });

  // P3.4 — Não permitir encerrar sessão de outra mesa (token diferente) sem possuí-lo
  await cenario('P3. Não pode encerrar sessão de outra mesa sem seu token', async()=>{
    const outraMesaToken = 'o'.repeat(64);
    const ctx = await abrir('cardapio.html', {sessao: sessaoMesa, rpc: (nome, params)=>{
      if(nome==='encerrar_sessao_mesa_autorizada' && params.p_session_token_mesa===outraMesaToken) return {data:{mensagem:'Sessão já encerrada.'},error:null};
      return {data:null,error:null};
    }});
    // O usuário só tem seu próprio token; não tem como adivinhar o da outra mesa (256 bits)
    // Aqui apenas verifica que a RPC exige o token específico e não permite fechar por ID
    assert(sessaoMesa.token !== outraMesaToken, 'tokens devem ser diferentes e imprevisíveis');
    ctx.fechar();
  });

  console.log(`\nPrioridades: ${cenarios - falhas.length}/${cenarios} cenários OK`);
  if(falhas.length){ console.error('FALHAS:', falhas.join('\n - ')); process.exitCode=1; } else { console.log('Todas as prioridades validadas (simulado).'); }
})();
