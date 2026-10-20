// tests/qr-browser.mjs — Login por QR Code de ponta a ponta em navegador real.
//
// Chromium headless (puppeteer-core) + backend SIMULADO com estado, executado no
// Node e exposto às páginas por `exposeFunction`. O simulador reproduz as regras
// das funções reais conferidas no banco em 20/10/2026 (supabase-schema.md):
//   - gerar_qr_code_mesa: exige sessão de gerente (42501), mesa ativa (P0001);
//     guarda só o hash do token, ativa o QR e encerra as sessões da mesa;
//   - iniciar_sessao_mesa: token >= 20 caracteres, hash igual, QR ativo e mesa
//     ativa (senão 28000); encerra sessões anteriores da mesa; sessão de 1 a 24 h;
//   - status_qr_mesas / desativar_qr_mesa: exigem gerente.
// NÃO acessa o Supabase real.
//
// Fluxo validado: gerente gera o QR em contas.html -> a imagem é DECODIFICADA
// (jsQR, como uma câmera) -> um "celular" abre a URL decodificada -> cardápio da
// mesa correta. Também: estados de erro e teclado em 320–1440 px, token fora da
// URL e das requisições, QR antigo/desativado recusado, impressão só do QR.
//
// Uso: CHROME_PATH=/caminho/do/chrome npm run test:qr-browser
//      (CHROME_ARGS opcionais, como em test:responsive — ver README.md)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fixture, sessions } from './fixtures/responsive-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// QR_SHOTS=<pasta> salva capturas para inspeção visual (desligado por padrão).
const SHOTS = process.env.QR_SHOTS || '';
async function foto(page, nome) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${nome}.png`) });
}

const CHROME_PATH = process.env.CHROME_PATH;
if (!CHROME_PATH || !fs.existsSync(CHROME_PATH)) {
  console.error('ERRO: defina CHROME_PATH com o executável do Chrome/Chromium (veja README.md, "Testes").');
  process.exit(1);
}
const puppeteer = (await import('puppeteer-core')).default;
const pkgDir = name => path.dirname(require.resolve(`${name}/package.json`));
const FONT_DIRS = { poppins: pkgDir('@fontsource/poppins'), symbols: pkgDir('material-symbols'), fa: pkgDir('@fortawesome/fontawesome-free') };
const JSQR_SRC = fs.readFileSync(require.resolve('jsqr/dist/jsQR.js'), 'utf8');

// ---------------------------------------------------------------------------
// Servidor estático (repo + fontes locais)
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let base = ROOT; let rel = pathname;
  for (const [k, dir] of Object.entries(FONT_DIRS)) if (pathname.startsWith(`/__fonts/${k}/`)) { base = dir; rel = pathname.slice(`/__fonts/${k}/`.length); }
  const file = path.resolve(base, '.' + path.sep + rel);
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const poppinsCss = [400, 500, 600].map(w => `@font-face{font-family:'Poppins';font-weight:${w};font-display:block;src:url(${BASE}/__fonts/poppins/files/poppins-latin-${w}-normal.woff2) format('woff2');}`).join('');
const symbolsCss = `@font-face{font-family:'Material Symbols Outlined';font-weight:100 700;font-display:block;src:url(${BASE}/__fonts/symbols/material-symbols-outlined.woff2) format('woff2');}
.material-symbols-outlined{font-family:'Material Symbols Outlined';font-size:24px;line-height:1;display:inline-block;white-space:nowrap;direction:ltr;-webkit-font-feature-settings:'liga';}`;
const faCss = fs.readFileSync(path.join(FONT_DIRS.fa, 'css', 'all.min.css'), 'utf8').replace(/\.\.\/webfonts\//g, `${BASE}/__fonts/fa/webfonts/`);
const fakeSupabase = `window.supabase={createClient(){return{
  rpc:(n,p)=>window.__rpcNode(n,p||{}),
  channel(){return{on(){return this},subscribe(){return this}}}}}};`;

// ---------------------------------------------------------------------------
// Backend simulado com estado (regras das RPCs reais)
// ---------------------------------------------------------------------------

const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const db = {
  mesas: new Map([1, 2, 3, 4, 5, 6].map(n => ['m' + n, { id: 'm' + n, nome: 'Mesa 0' + n, login: 'Mesa 0' + n, tipo: 'mesa', ativo: true, qrAtivo: false, qrHash: null }])),
  sessoesMesa: [],                                   // { mesaId, hash, ativa, expira }
  staff: new Map([[sessions.gerente.token, 'gerente'], [sessions.atendente.token, 'atendente']]),
  falhaRede: 0,                                      // próximas N chamadas de iniciar_sessao_mesa falham por rede
  chamadas: []
};
const pgErr = (code, message) => ({ data: null, error: { code, message, details: null, hint: null } });
function exigirGerente(token) {
  const perfil = db.staff.get(token);
  if (!perfil) return pgErr('28000', 'Sessão inválida. Faça login novamente.');
  if (perfil !== 'gerente') return pgErr('42501', 'Acesso negado: apenas gerentes podem executar esta ação.');
  return null;
}
const sessaoAberta = id => db.sessoesMesa.some(s => s.mesaId === id && s.ativa && s.expira > Date.now());

async function backend(nome, p) {
  db.chamadas.push(nome);
  switch (nome) {
    case 'gerar_qr_code_mesa': {
      const e = exigirGerente(p.p_session_token); if (e) return e;
      const m = db.mesas.get(p.p_mesa_id); if (!m) return pgErr('P0002', 'Mesa não encontrada.');
      if (!m.ativo) return pgErr('P0001', 'Não é possível gerar QR Code para uma mesa inativa.');
      const token = 'MESA-' + crypto.randomBytes(32).toString('hex');
      Object.assign(m, { qrHash: hash(token), qrAtivo: true });
      db.sessoesMesa.filter(s => s.mesaId === m.id).forEach(s => { s.ativa = false; });
      return { data: { mesa_id: m.id, mesa_nome: m.nome, qr_token: token, url_relativa: 'login.html?qr=' + token, gerado_por: 'Gerente NeoOrder', gerado_em: new Date().toISOString() }, error: null };
    }
    case 'iniciar_sessao_mesa': {
      if (db.falhaRede > 0) { db.falhaRede--; return { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }; }
      const t = String(p.p_qr_token || '').trim();
      if (t.length < 20) return pgErr('28000', 'QR Code inválido.');
      const m = [...db.mesas.values()].find(x => x.ativo && x.qrAtivo && x.qrHash === hash(t));
      if (!m) return pgErr('28000', 'QR Code inválido, expirado ou mesa inativa.');
      const horas = Math.min(Math.max(p.p_duracao_horas || 12, 1), 24);
      const sess = crypto.randomBytes(32).toString('hex');
      db.sessoesMesa.filter(s => s.mesaId === m.id).forEach(s => { s.ativa = false; });
      db.sessoesMesa.push({ mesaId: m.id, hash: hash(sess), ativa: true, expira: Date.now() + horas * 3600e3, horas });
      return { data: { sucesso: true, usuario: { id: m.id, nome: m.nome, login: m.login, tipo: 'mesa', perfil: 'mesa' }, tipo_sessao: 'mesa', session_token: sess, expira_em: new Date(Date.now() + horas * 3600e3).toISOString(), via: 'qr_code' }, error: null };
    }
    case 'status_qr_mesas': {
      const e = exigirGerente(p.p_session_token); if (e) return e;
      return { data: { mesas: [...db.mesas.values()].map(m => ({ mesa_id: m.id, mesa_nome: m.nome, ativo: m.ativo, qr_code_ativo: m.qrAtivo, sessao_aberta: sessaoAberta(m.id) })), gerado_em: new Date().toISOString() }, error: null };
    }
    case 'desativar_qr_mesa': {
      const e = exigirGerente(p.p_session_token); if (e) return e;
      const m = db.mesas.get(p.p_mesa_id); if (!m) return pgErr('P0002', 'Mesa não encontrada.');
      Object.assign(m, { qrAtivo: false, qrHash: null });
      db.sessoesMesa.filter(s => s.mesaId === m.id).forEach(s => { s.ativa = false; });
      return { data: { mesa_id: m.id, qr_code_ativo: false }, error: null };
    }
    case 'encerrar_sessao': {
      db.sessoesMesa.filter(s => s.hash === hash(String(p.p_session_token || ''))).forEach(s => { s.ativa = false; });
      return { data: true, error: null };
    }
    case 'listar_contas':
      if (exigirGerente(p.p_session_token)) return exigirGerente(p.p_session_token);
      return { data: [...fixture.listar_contas.filter(c => c.tipo !== 'mesa'), ...[...db.mesas.values()].map(m => ({ id: m.id, tipo: 'mesa', nome: m.nome, login: m.login, perfil: 'mesa', ativo: m.ativo }))], error: null };
    default:
      return { data: nome in fixture ? fixture[nome] : null, error: null };
  }
}

// ---------------------------------------------------------------------------
// Utilidades de página
// ---------------------------------------------------------------------------

const extraArgs = (process.env.CHROME_ARGS || '').split(/\s+/).filter(Boolean);
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, args: ['--disable-dev-shm-usage', '--font-render-hinting=none', '--disable-gpu', ...extraArgs] });
const falhas = [];
let verificacoes = 0;
const check = (cond, msg) => { verificacoes++; if (!cond) falhas.push(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function novaPagina(w, h, { sessao = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 1024 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.exposeFunction('__rpcNode', (n, p) => backend(n, p));
  await page.setRequestInterception(true);
  const requisicoes = [];
  page.on('request', req => {
    const u = req.url();
    requisicoes.push({ url: u, referer: req.headers().referer || '' });
    if (u.startsWith(BASE)) return req.continue();
    if (u.includes('fonts.googleapis.com') && u.includes('Material+Symbols')) return req.respond({ status: 200, contentType: 'text/css', body: symbolsCss });
    if (u.includes('fonts.googleapis.com')) return req.respond({ status: 200, contentType: 'text/css', body: poppinsCss });
    if (u.includes('font-awesome') || u.includes('fontawesome')) return req.respond({ status: 200, contentType: 'text/css', body: faCss });
    if (u.includes('supabase')) return req.respond({ status: 200, contentType: 'application/javascript', body: fakeSupabase });
    return req.abort();
  });
  const logs = [];
  const erros = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => erros.push(String(e.message)));
  page.on('dialog', d => d.accept());
  await page.evaluateOnNewDocument(s => {
    if (!sessionStorage.getItem('__init')) {
      sessionStorage.setItem('__init', '1');
      if (s) sessionStorage.setItem('neoorder_session', JSON.stringify(s));
    }
  }, sessao);
  return { page, requisicoes, logs, erros };
}

const layout = page => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const r = el => el.getBoundingClientRect();
  const vis = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const botoes = [...document.querySelectorAll('#qrLoginPanel button, #qrModal .modal-actions button, #btnCopyQrLink')].filter(vis);
  return {
    overflow: document.documentElement.scrollWidth - vw,
    botoesPequenos: botoes.filter(b => r(b).height < 44).map(b => b.id || b.textContent.trim()),
    botoesFora: botoes.filter(b => r(b).left < -1 || r(b).right > vw + 1).map(b => b.id),
    textoCortado: [...document.querySelectorAll('.qr-login-title, .qr-login-message, .qr-print-title, #qrLinkPreview')].filter(vis).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className || el.id)
  };
});

// Decodifica o QR exibido (como uma câmera faria): SVG -> canvas -> jsQR.
async function decodificarQr(page) {
  await page.addScriptTag({ content: JSQR_SRC });
  return page.evaluate(async () => {
    const svg = document.querySelector('#qrFigure svg');
    if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    await img.decode();
    const lado = 400; const margem = 40;
    const c = document.createElement('canvas'); c.width = c.height = lado + margem * 2;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, margem, margem, lado, lado);
    const d = g.getImageData(0, 0, c.width, c.height);
    const r = window.jsQR(d.data, d.width, d.height);
    return r ? r.data : null;
  });
}

async function gerarNaGestao(w, h, mesaId) {
  const { page, logs, erros } = await novaPagina(w, h, { sessao: sessions.gerente });
  await page.goto(`${BASE}/contas.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector(`[data-qr="${mesaId}"]`, { timeout: 6000 });
  await page.$eval(`[data-qr="${mesaId}"]`, b => b.scrollIntoView({ block: 'center' }));
  await page.click(`[data-qr="${mesaId}"]`);
  await page.waitForSelector('#qrModal[style*="flex"]');
  await page.click('#btnQrGenerate');
  await page.waitForSelector('#qrFigure svg', { timeout: 6000 });
  return { page, logs, erros };
}

// ---------------------------------------------------------------------------
// 1. Cadeia completa: gestão gera -> QR decodificado -> celular abre -> cardápio
// ---------------------------------------------------------------------------

const ctxG = await gerarNaGestao(1440, 900, 'm3');
const urlDecodificada = await decodificarQr(ctxG.page);
check(urlDecodificada && urlDecodificada.startsWith(`${BASE}/login.html?qr=MESA-`) && urlDecodificada.length === `${BASE}/login.html?qr=MESA-`.length + 64,
  `QR decodificado não aponta para o login da mesa: ${urlDecodificada && urlDecodificada.slice(0, 60)}`);
const tokenQr = urlDecodificada ? new URL(urlDecodificada).searchParams.get('qr') : '';
const preview = await ctxG.page.$eval('#qrLinkPreview', el => el.textContent);
check(!preview.includes(tokenQr) && preview.includes('…'), 'link exibido na gestão deveria estar mascarado');
check(!ctxG.logs.some(l => tokenQr && l.includes(tokenQr)), 'token apareceu no console da gestão');
check(ctxG.erros.length === 0, `erros JS na gestão: ${ctxG.erros.join(' | ')}`);

const LARGURAS = [[320, 568], [360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
for (const [w, h] of LARGURAS) {
  const { page, requisicoes, logs, erros } = await novaPagina(w, h);
  await page.goto(urlDecodificada, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.pathname.endsWith('cardapio.html'), { timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#dishesGrid .card-dish', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => ({
    path: location.pathname, search: location.search,
    sessao: JSON.parse(sessionStorage.getItem('neoorder_session') || 'null'),
    pratos: document.querySelectorAll('#dishesGrid .card-dish').length,
    barra: (() => { const b = document.querySelector('.bottom-nav'); return !!b && b.getClientRects().length > 0 && getComputedStyle(b).display !== 'none'; })(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  const ctx = `celular ${w}px`;
  await foto(page, `celular-cardapio-${w}`);
  check(r.path.endsWith('cardapio.html'), `${ctx}: não chegou ao cardápio (${r.path})`);
  check(r.sessao && r.sessao.usuario.id === 'm3' && r.sessao.usuario.tipo === 'mesa', `${ctx}: sessão não é da Mesa 03`);
  check(r.pratos >= 6, `${ctx}: cardápio sem pratos (${r.pratos})`);
  check(w < 768 ? r.barra : true, `${ctx}: barra inferior da mesa ausente`);
  check(r.overflow <= 0, `${ctx}: rolagem horizontal de ${r.overflow}px`);
  check(!r.search.includes('qr='), `${ctx}: token na URL final`);

  // Só a navegação inicial (o próprio link escaneado) pode conter o token.
  const vazamentos = requisicoes.slice(1).filter(q => q.url.includes(tokenQr) || q.referer.includes(tokenQr));
  check(vazamentos.length === 0, `${ctx}: token enviado em requisição/Referer: ${vazamentos.map(v => v.url).join(', ').slice(0, 120)}`);
  check(!logs.some(l => l.includes(tokenQr)), `${ctx}: token no console`);
  check(erros.length === 0, `${ctx}: erros JS: ${erros.join(' | ')}`);
  const ativas = db.sessoesMesa.filter(s => s.mesaId === 'm3' && s.ativa);
  check(ativas.length === 1 && ativas[0].horas === 12, `${ctx}: esperado 1 sessão ativa de 12 h na mesa (há ${ativas.length})`);
  check(r.sessao && ativas.length === 1 && ativas[0].hash === hash(r.sessao.token), `${ctx}: sessão do celular não é a ativa no servidor`);
  // "Voltar" não pode reabrir o link com o token (login.html foi substituído no histórico)
  const chamadasAntes = db.chamadas.filter(n => n === 'iniciar_sessao_mesa').length;
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
  await sleep(150);
  const voltou = page.url();
  check(!voltou.includes('qr=') && !voltou.includes('login.html'), `${ctx}: "Voltar" levou a ${voltou.replace(BASE, '')}`);
  check(db.chamadas.filter(n => n === 'iniciar_sessao_mesa').length === chamadasAntes, `${ctx}: "Voltar" reenviou o token`);
  await page.close();
}

// ---------------------------------------------------------------------------
// 2. Estados de erro: mensagem, toque e teclado em todas as larguras
// ---------------------------------------------------------------------------

for (const [w, h] of LARGURAS) {
  // QR desconhecido (ex.: foto de um QR já regenerado)
  {
    const { page, erros } = await novaPagina(w, h);
    await page.goto(`${BASE}/login.html?qr=MESA-${'0'.repeat(64)}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#qrLoginPanel.is-error');
    const st = await page.evaluate(() => ({ titulo: document.getElementById('qrLoginTitle').textContent, foco: document.activeElement && document.activeElement.id, search: location.search }));
    const l = await layout(page);
    const ctx = `erro QR ${w}px`;
    await foto(page, `celular-erro-qr-${w}`);
    check(/inválido ou desativado/.test(st.titulo), `${ctx}: mensagem incorreta (${st.titulo})`);
    check(st.foco === 'btnQrUsePassword', `${ctx}: foco deveria estar em "Entrar com usuário e senha" (${st.foco})`);
    check(!st.search.includes('qr='), `${ctx}: token na URL`);
    check(l.overflow <= 0 && !l.botoesPequenos.length && !l.botoesFora.length && !l.textoCortado.length, `${ctx}: layout ${JSON.stringify(l)}`);
    await page.keyboard.press('Enter');
    await sleep(100);
    const depois = await page.evaluate(() => ({ form: !!document.getElementById('mesaForm').getClientRects().length, foco: document.activeElement && document.activeElement.id }));
    check(depois.form && depois.foco === 'tableLogin', `${ctx}: Enter não levou ao formulário da mesa (${JSON.stringify(depois)})`);
    check(erros.length === 0, `${ctx}: erros JS: ${erros.join(' | ')}`);
    await page.close();
  }
  // Rede instável: falha, depois "Tentar novamente" pelo teclado entra na mesa
  if (w === 320 || w === 768 || w === 1440) {
    const { page } = await novaPagina(w, h);
    db.falhaRede = 1;
    await page.goto(urlDecodificada.replace(/qr=.*/, 'qr=') + tokenQrAtual(), { waitUntil: 'networkidle0' });
    await page.waitForSelector('#qrLoginPanel.is-error');
    const st = await page.evaluate(() => ({ titulo: document.getElementById('qrLoginTitle').textContent, foco: document.activeElement && document.activeElement.id }));
    const l = await layout(page);
    check(/Sem conexão/.test(st.titulo) && st.foco === 'btnQrRetry', `rede ${w}px: estado ${JSON.stringify(st)}`);
    check(l.overflow <= 0 && !l.botoesPequenos.length && !l.textoCortado.length, `rede ${w}px: layout ${JSON.stringify(l)}`);
    await Promise.all([page.waitForNavigation({ timeout: 8000 }).catch(() => null), page.keyboard.press('Enter')]);
    check(page.url().endsWith('cardapio.html'), `rede ${w}px: "Tentar novamente" não abriu o cardápio (${page.url()})`);
    await page.close();
  }
}
function tokenQrAtual() { return tokenQr; }

// ---------------------------------------------------------------------------
// 3. Regras do servidor refletidas na interface
// ---------------------------------------------------------------------------

// 3a. Sessão única por mesa (regra atual do banco, igual ao login por senha):
//     um segundo aparelho com o mesmo QR encerra a sessão do primeiro.
{
  const antes = db.sessoesMesa.filter(s => s.mesaId === 'm3' && s.ativa).map(s => s.hash);
  const { page } = await novaPagina(390, 844);
  await page.goto(urlDecodificada, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.pathname.endsWith('cardapio.html'), { timeout: 8000 }).catch(() => {});
  const ativas = db.sessoesMesa.filter(s => s.mesaId === 'm3' && s.ativa);
  check(ativas.length === 1 && !antes.includes(ativas[0].hash), 'regra de sessão única por mesa não reproduzida (documentada como decisão pendente)');
  await page.close();
}

// 3b. Regenerar invalida o QR anterior (foto antiga não abre mais a mesa)
const ctxG2 = await gerarNaGestao(768, 1024, 'm3');
const urlNova = await decodificarQr(ctxG2.page);
check(urlNova && urlNova !== urlDecodificada, 'regenerar deveria produzir outro QR');
check(db.sessoesMesa.filter(s => s.mesaId === 'm3' && s.ativa).length === 0, 'regenerar deveria encerrar a sessão aberta da mesa');
{
  const { page } = await novaPagina(360, 740);
  await page.goto(urlDecodificada, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#qrLoginPanel.is-error', { timeout: 6000 }).catch(() => {});
  check(/inválido ou desativado/.test(await page.$eval('#qrLoginTitle', e => e.textContent)), 'QR antigo deveria ser recusado após regenerar');
  check(!(await page.evaluate(() => sessionStorage.getItem('neoorder_session'))), 'QR antigo não pode criar sessão');
  await page.close();
}

// 3c. Desativar pela gestão (teclado/toque), depois o QR novo é recusado
{
  const p = ctxG2.page;
  await p.click('#btnQrDeactivate');
  await p.waitForFunction(() => /Sem QR Code ativo/.test(document.getElementById('qrStatus').textContent), { timeout: 6000 }).catch(() => {});
  check(await p.$eval('#qrFigure', e => e.innerHTML === ''), 'imagem do QR deveria sumir ao desativar');
  const { page } = await novaPagina(390, 844);
  await page.goto(urlNova, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#qrLoginPanel.is-error', { timeout: 6000 }).catch(() => {});
  check(/inválido ou desativado/.test(await page.$eval('#qrLoginTitle', e => e.textContent)), 'QR desativado deveria ser recusado');
  await page.close();
}

// 3d. Mesa inativa: QR válido deixa de funcionar
{
  const ctx = await gerarNaGestao(1440, 900, 'm4');
  const url = await decodificarQr(ctx.page);
  db.mesas.get('m4').ativo = false;
  const { page } = await novaPagina(390, 844);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#qrLoginPanel.is-error', { timeout: 6000 }).catch(() => {});
  check(/inválido ou desativado/.test(await page.$eval('#qrLoginTitle', e => e.textContent)), 'QR de mesa inativa deveria ser recusado');
  db.mesas.get('m4').ativo = true;
  await page.close();
  await ctx.page.close();
}

// ---------------------------------------------------------------------------
// 4. Gestão: modal responsivo, QR legível e impressão só do QR
// ---------------------------------------------------------------------------

for (const [w, h] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
  const mesaGestao = 'm5';
  const { page, erros } = await gerarNaGestao(w, h, mesaGestao);
  await page.$eval('#qrFigure', e => e.scrollIntoView({ block: 'center' }));
  const m = await page.evaluate(() => {
    const fig = document.getElementById('qrFigure').getBoundingClientRect();
    const card = document.querySelector('#qrModal .modal-card');
    return { figW: Math.round(fig.width), dentro: fig.left >= 0 && fig.right <= document.documentElement.clientWidth, cardOverflow: card.scrollWidth - card.clientWidth, foco: card.contains(document.activeElement) };
  });
  const l = await layout(page);
  const ctx = `gestão ${w}px`;
  await foto(page, `gestao-modal-qr-${w}`);
  check(m.figW >= 160 && m.dentro, `${ctx}: QR pequeno ou fora da tela (${JSON.stringify(m)})`);
  check(m.cardOverflow <= 0 && l.overflow <= 0 && !l.botoesFora.length && !l.botoesPequenos.length && !l.textoCortado.length, `${ctx}: layout ${JSON.stringify({ ...m, ...l })}`);
  check(m.foco, `${ctx}: foco saiu do modal`);
  check(!!(await decodificarQr(page)), `${ctx}: QR exibido não pôde ser lido`);
  // Impressão
  await page.evaluate(() => document.body.classList.add('printing-qr'));
  await page.emulateMediaType('print');
  await foto(page, `gestao-impressao-${w}`);
  const imp = await page.evaluate(() => {
    const vis = sel => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'; };
    return { qr: vis('#qrFigure svg'), titulo: vis('#qrPrintTitle'), tabela: vis('.table-container'), cabecalho: vis('header'), acoes: vis('#qrModal .modal-actions'), link: vis('.qr-link') };
  });
  check(imp.qr && imp.titulo && !imp.tabela && !imp.cabecalho && !imp.acoes && !imp.link, `${ctx}: impressão deveria conter só o QR e o nome da mesa ${JSON.stringify(imp)}`);
  await page.emulateMediaType(null);
  // Esc fecha e descarta o QR
  await page.evaluate(() => document.body.classList.remove('printing-qr'));
  await page.keyboard.press('Escape');
  await sleep(80);
  check(await page.$eval('#qrModal', e => e.style.display === 'none') && await page.$eval('#qrFigure', e => e.innerHTML === ''), `${ctx}: Esc deveria fechar e descartar o QR`);
  // Gerar QR re-renderiza a lista; o foco deve voltar ao botão "QR" da mesma mesa.
  const focoFinal = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-qr'));
  check(focoFinal === mesaGestao, `${ctx}: foco não voltou ao botão QR da mesa (${focoFinal})`);
  check(erros.length === 0, `${ctx}: erros JS: ${erros.join(' | ')}`);
  await page.close();
}

// 4b. Atendente: sem acesso à gestão (redireciona) e o servidor recusaria (42501)
{
  const { page } = await novaPagina(390, 844, { sessao: sessions.atendente });
  const antes = db.chamadas.length;
  await page.goto(`${BASE}/contas.html`, { waitUntil: 'networkidle0' });
  check(page.url().includes('login.html') && !db.chamadas.slice(antes).some(n => /qr|listar_contas/.test(n)), 'atendente não pode chegar à gestão de QR');
  const recusa = await backend('gerar_qr_code_mesa', { p_session_token: sessions.atendente.token, p_mesa_id: 'm1' });
  check(recusa.error && recusa.error.code === '42501', 'simulador deveria recusar atendente como o banco');
  await page.close();
}

await ctxG.page.close();
await ctxG2.page.close();
await browser.close();
server.close();

if (falhas.length) {
  console.error(`FALHAS (${falhas.length} de ${verificacoes} verificações):\n` + falhas.map(f => ' - ' + f).join('\n'));
  process.exit(1);
}
console.log(`Teste de QR Code em navegador OK — ${verificacoes} verificações (6 larguras, cadeia gestão → QR decodificado → celular → cardápio).`);
