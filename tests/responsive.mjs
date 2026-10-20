// tests/responsive.mjs — Teste de responsividade e acessibilidade em navegador real.
//
// Abre as páginas reais em Chromium headless (via puppeteer-core) com o Supabase
// SIMULADO (fixtures no contrato das RPCs) e fontes servidas de node_modules.
// Para cada página × largura (320/360/390/768/1024/1440) × tema (claro/escuro):
//   1. confirma que a página carregou os dados (sem redirecionamento, sem erro JS);
//      só então
//   2. verifica layout: sem rolagem horizontal do documento, cabeçalho sem
//      transbordar, navegação (hambúrguer na gestão / barra inferior na mesa),
//      tabelas com rolagem interna e ações visíveis, alvos de toque ≥ 44px,
//      foco visível, modais (foco, Tab preso, Esc, retorno do foco).
//   3. a 320 px, repete cada página SEM a fonte de ícones (rede lenta) e exige
//      ausência de rolagem horizontal.
//
// Contraste: só é FALHA na barra inferior e no menu aberto (componentes novos);
// no restante é AVISO — paleta mantida por decisão do projeto (backlog v2.5).
//
// Uso:
//   npm install
//   CHROME_PATH=/caminho/do/chrome npm run test:responsive
//
// Variáveis de ambiente:
//   CHROME_PATH       (obrigatória) executável do Chrome/Chromium.
//   CHROME_ARGS       argumentos extras, separados por espaço (ex.: "--no-sandbox").
//   RESPONSIVE_OUT    pasta do relatório (padrão: <tmpdir>/neoorder-responsive).
//   RESPONSIVE_ONLY   filtra cenários por id, separados por vírgula (ex.: "cardapio,contas").
//   RESPONSIVE_SHOTS  "0" desativa capturas de tela.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fixture, sessions } from './fixtures/responsive-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const CHROME_PATH = process.env.CHROME_PATH;
if (!CHROME_PATH) {
  console.error('ERRO: defina CHROME_PATH com o executável do Chrome/Chromium.\n' +
    '  Ex.: CHROME_PATH="$(which chromium)" npm run test:responsive\n' +
    '  Veja a seção "Teste de responsividade" do README.md.');
  process.exit(1);
}
if (!fs.existsSync(CHROME_PATH)) {
  console.error(`ERRO: CHROME_PATH não existe: ${CHROME_PATH}`);
  process.exit(1);
}

let puppeteer;
try {
  puppeteer = (await import('puppeteer-core')).default;
} catch (e) {
  console.error('ERRO: puppeteer-core não instalado. Rode "npm install" (devDependencies).');
  process.exit(1);
}

function resolvePkg(name) {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch (e) {
    console.error(`ERRO: pacote de fonte "${name}" não instalado. Rode "npm install".`);
    process.exit(1);
  }
}
const FONT_DIRS = {
  poppins: resolvePkg('@fontsource/poppins'),
  symbols: resolvePkg('material-symbols'),
  fa: resolvePkg('@fortawesome/fontawesome-free')
};

const OUT = path.resolve(process.env.RESPONSIVE_OUT || path.join(os.tmpdir(), 'neoorder-responsive'));
const SHOTS = process.env.RESPONSIVE_SHOTS !== '0';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

const WIDTHS = [[320, 568], [360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
const THEMES = ['light', 'dark'];

// Cenários: página, sessão, critério de carga e modais (abertos pelo gatilho VISÍVEL)
const SCENARIOS = [
  { id: 'index', file: 'index.html', kind: 'landing', session: null,
    loaded: { '.carousel-slide': 4, '#menu-grid .card-dish': 8 } },
  { id: 'index-mesa', file: 'index.html', kind: 'landing', session: 'mesa',
    loaded: { '#menu-grid .card-dish': 8 }, fab: true,
    modals: [{ name: 'Chamado (landing)', trigger: '#btnCallStaffGlobal', modal: '#callStaffGlobalModal' }] },
  { id: 'login', file: 'login.html', kind: 'public', session: null,
    loaded: { '.segmented-control .tab-btn': 3 } },
  // Link de QR Code com token malformado: painel de erro no lugar do formulário
  // (o token sai da URL ao carregar, por isso a URL esperada é login.html).
  { id: 'login-qr-erro', file: 'login.html?qr=invalido', expectUrl: 'login.html', kind: 'public', session: null,
    loaded: { '#qrLoginPanel:not([hidden]) #btnQrUsePassword': 1 } },
  { id: 'cardapio', file: 'cardapio.html', kind: 'mesa', session: 'mesa',
    loaded: { '#dishesGrid .card-dish': 8, '#dishesGrid [data-add]': 6 },
    modals: [
      { name: 'Carrinho', pre: ['#dishesGrid [data-add]', 3], trigger: { mobile: '#bottomNavCart', desktop: '#btnToggleCart' },
        modal: '#cartModal', expect: ['#cartItemsContainer .cart-item', 3] },
      { name: 'Pedidos', trigger: { mobile: '#bottomNavHistory', desktop: '#btnOpenHistory' },
        modal: '#historyModal', expect: ['#historyOrdersContainer .history-order', 3] },
      { name: 'Chamar', trigger: { mobile: '#bottomNavCall', desktop: '#btnCallStaff' },
        modal: '#callStaffModal', selectOther: '#callSelectReason' }
    ] },
  { id: 'atendimento', file: 'atendimento.html', kind: 'admin', session: 'gerente',
    loaded: { '#callsContainer .call-card': 3, '.order-card': 6 },
    modals: [{ name: 'Cancelar pedido', trigger: '#colReceived [data-cancel]', modal: '#cancelModal' }] },
  { id: 'atendimento-atendente', file: 'atendimento.html', kind: 'admin', session: 'atendente',
    loaded: { '.order-card': 6 }, onlyWidths: [320, 1024] },
  { id: 'estoque', file: 'estoque.html', kind: 'admin', session: 'gerente',
    loaded: { '#ingredientsTableBody tr': 27, '#dishesTableBody tr': 8 },
    tables: ['#ingredientsTableBody'],
    modals: [
      { name: 'Novo prato (3 insumos)', trigger: '#btnNewDish', modal: '#dishModal', post: ['#btnAddRecipeRow', 3] },
      { name: 'Novo insumo', trigger: '#btnNewIngredient', modal: '#ingredientModal' }
    ] },
  { id: 'estoque-pratos', file: 'estoque.html', kind: 'admin', session: 'gerente',
    loaded: { '#dishesTableBody tr': 8 }, pre: '#tabViewPratos', tables: ['#dishesTableBody'] },
  { id: 'contas', file: 'contas.html', kind: 'admin', session: 'gerente',
    loaded: { '#accountsTableBody tr': 9 }, tables: ['#accountsTableBody'],
    modals: [
      { name: 'Nova conta', trigger: '#btnNewAccount', modal: '#accountModal' },
      { name: 'QR Code da mesa', trigger: '[data-qr]', modal: '#qrModal' }
    ] },
  { id: 'faturamento', file: 'faturamento.html', kind: 'admin', session: 'gerente',
    loaded: { '#topDishesTableBody tr': 6, '#salesLogTableBody tr': 12 }, tables: ['#salesLogTableBody'] }
];

const ONLY = (process.env.RESPONSIVE_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Servidor estático + respostas simuladas para CDNs externas
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json' };
const FONT_ROUTES = Object.entries(FONT_DIRS).map(([k, dir]) => [`/__fonts/${k}/`, dir]);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(u.pathname);
  let base = ROOT;
  let rel = pathname;
  for (const [prefix, dir] of FONT_ROUTES) {
    if (pathname.startsWith(prefix)) { base = dir; rel = pathname.slice(prefix.length); }
  }
  const file = path.resolve(base, '.' + path.sep + rel);
  if (!file.startsWith(base + path.sep) && file !== base) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

function poppinsFile(weight) {
  const f = path.join(FONT_DIRS.poppins, 'files', `poppins-latin-${weight}-normal.woff2`);
  return fs.existsSync(f) ? weight : 400;
}
const poppinsCss = [300, 400, 500, 600, 700].map(w =>
  `@font-face{font-family:'Poppins';font-style:normal;font-weight:${w};font-display:block;` +
  `src:url(${BASE}/__fonts/poppins/files/poppins-latin-${poppinsFile(w)}-normal.woff2) format('woff2');}`).join('\n');
const symbolsCss = `@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:100 700;font-display:block;` +
  `src:url(${BASE}/__fonts/symbols/material-symbols-outlined.woff2) format('woff2');}
.material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;font-size:24px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;-webkit-font-feature-settings:'liga';-webkit-font-smoothing:antialiased;}`;
const faCss = fs.readFileSync(path.join(FONT_DIRS.fa, 'css', 'all.min.css'), 'utf8')
  .replace(/\.\.\/webfonts\//g, `${BASE}/__fonts/fa/webfonts/`);
const fakeSupabase = `window.supabase={createClient(){return{
  rpc:(n,p)=>new Promise(r=>setTimeout(()=>r({data:(n in window.__FIX)?window.__FIX[n]:null,error:null}),15)),
  channel(){return{on(){return this},subscribe(){return this}}}}}};`;

// ---------------------------------------------------------------------------
// Medições executadas no navegador
// ---------------------------------------------------------------------------

function inspectPage() {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const visible = el => {
    if (!el.isConnected) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.display === 'none' || s.visibility === 'hidden' || r.width === 0 || r.height === 0) return false;
    const ov = el.closest('.modal-overlay');
    return !ov || getComputedStyle(ov).display !== 'none';
  };
  const desc = el => {
    let d = el.tagName.toLowerCase();
    if (el.id) d += '#' + el.id;
    else if (el.classList.length) d += '.' + [...el.classList].slice(0, 2).join('.');
    const t = (el.getAttribute('aria-label') || el.title || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    return t ? `${d} "${t}"` : d;
  };
  const clippingAncestor = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return p;
    }
    return null;
  };
  const srOnly = el => !!el.closest('.sr-only, .label-sm-hidden') ||
    (getComputedStyle(el).position === 'absolute' && el.getBoundingClientRect().width <= 1);

  // 1. Transbordo horizontal do documento
  const docOverflow = document.documentElement.scrollWidth - vw;
  const offenders = [];
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el) || srOnly(el) || getComputedStyle(el).position === 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      if (clippingAncestor(el)) return;
      const p = el.parentElement;
      const pr = p.getBoundingClientRect();
      if (p !== document.body && (pr.right > vw + 1 || pr.left < -1) && !clippingAncestor(p)) return;
      offenders.push(`${desc(el)} (left=${Math.round(r.left)} right=${Math.round(r.right)})`);
    }
  });

  // 2. Conteúdo cortado sem rolagem (overflow: hidden)
  const clipped = [];
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el) || srOnly(el)) return;
    const s = getComputedStyle(el);
    if (s.textOverflow === 'ellipsis' || el.matches('p, .card-dish-desc, .carousel-container, .carousel-slide, .dish-thumb, img')) return;
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2) {
      clipped.push(`${desc(el)} (oculta ${el.scrollWidth - el.clientWidth}px)`);
    }
  });

  // 3. Cabeçalho
  const header = document.querySelector('.header');
  const hc = header && header.querySelector('.header-container');
  let headerInfo = null;
  if (header && hc) {
    const hr = header.getBoundingClientRect();
    const logo = header.querySelector('.logo-brand');
    const lr = logo ? logo.getBoundingClientRect() : null;
    const outside = [...header.querySelectorAll('a, button')]
      .filter(el => visible(el) && !el.closest('.nav-panel.is-open'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1 || r.bottom > hr.bottom + 1 || r.top < hr.top - 1; })
      .map(desc);
    headerInfo = { height: Math.round(hr.height), logoVisible: !!lr && lr.left >= -1 && lr.right <= vw + 1 && lr.width > 0, outside };
  }

  // 4. Alvos de toque < 44×44
  const small = [];
  document.querySelectorAll('a[href], button, input:not([type=hidden]):not([type=file]), select, textarea, [role=button], [tabindex="0"]').forEach(el => {
    if (!visible(el) || srOnly(el)) return;
    if (el.matches('.table-container')) return;
    if (el.closest('.footer') && el.matches('a')) return; // links de texto do rodapé (WCAG 2.5.8: inline)
    let r = el.getBoundingClientRect();
    if (el.matches('input[type=checkbox], input[type=radio]')) {
      const label = el.closest('label');
      if (label) r = label.getBoundingClientRect();
    }
    if (r.width < 43.5 || r.height < 43.5) small.push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  });

  // 4b. Texto que transborda o próprio botão/aba, e botões do cabeçalho com rótulo quebrado em 2 linhas
  const overflowText = [];
  document.querySelectorAll('button, a.btn, .tab-btn, .user-chip').forEach(el => {
    if (!visible(el) || srOnly(el)) return;
    if (getComputedStyle(el).textOverflow === 'ellipsis') return;
    if (el.scrollWidth > el.clientWidth + 1) overflowText.push(`texto transborda: ${desc(el)} (${el.scrollWidth}/${el.clientWidth}px)`);
  });
  document.querySelectorAll('.header .btn').forEach(el => {
    if (!visible(el) || el.closest('.nav-panel.is-open, .header--landing')) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const label = [...el.children].find(c => !c.classList.contains('material-symbols-outlined') && c.textContent.trim());
    if (label && label.getBoundingClientRect().height > lh * 1.5) overflowText.push(`rótulo quebrado em 2 linhas no cabeçalho: ${desc(el)}`);
  });

  // 5. Contraste de texto (WCAG 2.x)
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const bgOf = el => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let bg = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return bg;
  };
  const contrast = [];
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el) || srOnly(el)) return;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    const s = getComputedStyle(el);
    if (/Material Symbols|Font Awesome/i.test(s.fontFamily)) return;
    if (el.closest('[disabled], .unavailable')) return; // desabilitado é isento (WCAG)
    if (el.closest('.carousel-slide') && !el.closest('.carousel-slide.active')) return;
    const bg = bgOf(el);
    const fg = blend(parse(s.color), bg);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(s.fontSize);
    const need = (size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700)) ? 3 : 4.5;
    if (ratio < need) {
      // Estrito: estilos próprios dos componentes novos (barra inferior, painel do menu).
      // Botões .btn já existentes mantêm a paleta atual (pendência registrada no backlog).
      const inNew = !!el.closest('.bottom-nav, .nav-panel.is-open');
      const legacyBtn = inNew && !!el.closest('.btn');
      contrast.push({ el: `${desc(el)} ${ratio.toFixed(2)}:1 (mín ${need})${legacyBtn ? ' [botão existente no menu]' : ''}`, strict: inNew && !legacyBtn });
    }
  });

  // 6. Navegação
  const toggle = document.getElementById('btnNavToggle');
  const panel = document.getElementById('navPanel');
  const links = [...document.querySelectorAll('.nav-link')].map(a => {
    const r = a.getBoundingClientRect();
    return { text: a.textContent.trim(), visible: visible(a), inView: r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1 };
  });
  const nav = {
    toggleVisible: !!toggle && visible(toggle),
    panelOpen: !!panel && panel.classList.contains('is-open'),
    links
  };

  // 7. Barra inferior da mesa
  const bn = document.querySelector('.bottom-nav');
  let bottomNav = null;
  if (bn) {
    const r = bn.getBoundingClientRect();
    bottomNav = {
      visible: visible(bn),
      top: r.top, height: r.height, bottom: r.bottom,
      items: [...bn.querySelectorAll('.bottom-nav-item')].map(i => {
        const ir = i.getBoundingClientRect();
        return { label: (i.lastElementChild ? i.lastElementChild.textContent : '').trim(), w: Math.round(ir.width), h: Math.round(ir.height), inView: ir.left >= -1 && ir.right <= vw + 1 && ir.bottom <= vh + 1 };
      }),
      headerActionsVisible: [...document.querySelectorAll('.mesa-header-action')].filter(visible).length,
      headerActionsOutside: [...document.querySelectorAll('.mesa-header-action')].filter(visible)
        .filter(el => { const er = el.getBoundingClientRect(); return er.right > vw + 1 || er.left < -1; }).length
    };
  }

  // 8. Tabelas
  const tables = [...document.querySelectorAll('.table-container')].filter(visible).map(c => {
    const cr = c.getBoundingClientRect();
    const actions = [...c.querySelectorAll('td.cell-actions')];
    const hiddenActions = actions.filter(td => {
      const r = td.getBoundingClientRect();
      return r.left < cr.left - 1 || r.right > cr.right + 1;
    }).length;
    const smallActions = [...c.querySelectorAll('td.cell-actions button')].filter(b => {
      const r = b.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5;
    }).length;
    return {
      label: c.getAttribute('aria-label') || desc(c),
      overflowX: getComputedStyle(c).overflowX,
      scrollW: c.scrollWidth, clientW: c.clientWidth,
      focusable: c.getAttribute('tabindex') === '0',
      rows: c.querySelectorAll('tbody tr').length,
      actions: actions.length, hiddenActions, smallActions,
      headerVisible: [...c.querySelectorAll('th')].every(th => th.getBoundingClientRect().height > 0)
    };
  });

  return { vw, vh, docOverflow, offenders: offenders.slice(0, 10), clipped: [...new Set(clipped)].slice(0, 10), overflowText: [...new Set(overflowText)], header: headerInfo, small: [...new Set(small)], contrast, nav, bottomNav, tables };
}

// Depois de rolar até o fim: algo fica sob um elemento fixo (barra inferior / FAB)?
function coveredAtEnd(fixedSel) {
  const fixed = document.querySelector(fixedSel);
  if (!fixed || getComputedStyle(fixed).display === 'none') return null;
  window.scrollTo(0, document.documentElement.scrollHeight);
  const fr = fixed.getBoundingClientRect();
  const hits = [];
  document.querySelectorAll('main a, main button, main input, main select, main .card-dish, .footer p').forEach(el => {
    if (fixed.contains(el)) return;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.display === 'none' || s.visibility === 'hidden' || r.width === 0 || r.height === 0) return;
    if (el.closest('.modal-overlay')) return;
    const overlapX = Math.min(r.right, fr.right) - Math.max(r.left, fr.left);
    const overlapY = Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top);
    if (overlapX > 1 && overlapY > 1) hits.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : ''}`);
  });
  window.scrollTo(0, 0);
  return [...new Set(hits)];
}

function inspectModal(sel) {
  const ov = document.querySelector(sel);
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const card = ov.querySelector('.modal-card');
  const r = card.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const buttons = [...card.querySelectorAll('button')].filter(b => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0);
  const smallBtns = buttons.filter(b => { const br = b.getBoundingClientRect(); return br.width < 43.5 || br.height < 43.5; })
    .map(b => `${b.getAttribute('aria-label') || b.textContent.trim().slice(0, 20)} ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`);
  // Último botão alcançável rolando dentro do cartão
  const last = buttons[buttons.length - 1];
  let lastReachable = true;
  if (last) {
    last.scrollIntoView({ block: 'nearest' });
    const lr = last.getBoundingClientRect();
    lastReachable = lr.top >= 0 && lr.bottom <= vh + 1 && lr.left >= -1 && lr.right <= vw + 1;
    card.scrollTop = 0;
  }
  const outside = [...card.querySelectorAll('button, input, select, textarea, .cart-item-total')]
    .filter(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0)
    .filter(el => { const er = el.getBoundingClientRect(); return er.right > r.right + 1 || er.left < r.left - 1; })
    .map(el => el.id || el.getAttribute('aria-label') || el.className);
  // Controles visíveis do modal precisam receber o toque (nada por cima: toasts, barra, FAB)
  const blocked = [...card.querySelectorAll('button, input, select, textarea')]
    .filter(el => getComputedStyle(el).display !== 'none' && el.type !== 'hidden')
    .map(el => {
      const er = el.getBoundingClientRect();
      // Só o que está na área visível do cartão (o resto é alcançável rolando o cartão)
      if (er.width === 0 || er.top < Math.max(0, r.top) || er.bottom > Math.min(vh, r.bottom)) return null;
      const hit = document.elementFromPoint(er.left + er.width / 2, er.top + er.height / 2);
      const label = hit && hit.closest('label');
      if (!hit || el.contains(hit) || (label && label.control === el)) return null;
      const by = hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : hit.className ? '.' + String(hit.className).split(' ')[0] : '');
      return `${el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20)} (sob ${by})`;
    })
    .filter(Boolean);
  // A barra inferior não pode ficar por cima do modal
  let bottomNavOnTop = false;
  const bn = document.querySelector('.bottom-nav');
  if (bn && getComputedStyle(bn).display !== 'none') {
    const br = bn.getBoundingClientRect();
    const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
    bottomNavOnTop = !!hit && bn.contains(hit);
  }
  return {
    open: true,
    rect: `${Math.round(r.width)}×${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)} (vw=${vw}, vh=${vh})`,
    insideViewport: r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1,
    hOverflow: card.scrollWidth > card.clientWidth + 1,
    lastReachable, outside, smallBtns, bottomNavOnTop, blocked,
    role: card.getAttribute('role'), ariaModal: card.getAttribute('aria-modal'),
    labelled: !!(card.getAttribute('aria-labelledby') && document.getElementById(card.getAttribute('aria-labelledby'))),
    focusInside: ov.contains(document.activeElement),
    bodyLocked: document.body.classList.contains('modal-open')
  };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

const extraArgs = (process.env.CHROME_ARGS || '').split(/\s+/).filter(Boolean);
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--disable-dev-shm-usage', '--font-render-hinting=none', '--disable-gpu', ...extraArgs]
});

const results = [];
const failures = [];
const warnings = {};
const fail = (ctx, msg) => failures.push(`${ctx}: ${msg}`);
const warn = (ctx, msg) => { warnings[msg] = warnings[msg] || new Set(); warnings[msg].add(ctx); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openPage(sc, [w, h], theme, { noIconFont = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 1024 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); // estabiliza transições
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (u.startsWith(BASE)) return req.continue();
    if (u.includes('fonts.googleapis.com') && u.includes('Material+Symbols')) {
      // noIconFont: simula rede lenta — a classe existe, mas a fonte ainda não chegou
      return req.respond({ status: 200, contentType: 'text/css', body: noIconFont ? symbolsCss.replace(/@font-face\{[^}]*\}/, '') : symbolsCss });
    }
    if (u.includes('fonts.googleapis.com')) return req.respond({ status: 200, contentType: 'text/css', body: poppinsCss });
    if (u.includes('font-awesome') || u.includes('fontawesome')) return req.respond({ status: 200, contentType: 'text/css', body: faCss });
    if (u.includes('supabase')) return req.respond({ status: 200, contentType: 'application/javascript', body: fakeSupabase });
    return req.abort();
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  await page.evaluateOnNewDocument((fix, sess, theme) => {
    window.__FIX = fix;
    try {
      localStorage.setItem('theme', theme);
      sessionStorage.removeItem('neoorder_session');
      if (sess) sessionStorage.setItem('neoorder_session', JSON.stringify(sess));
    } catch (e) { /* ignore */ }
    window.confirm = () => false;
    window.alert = () => {};
  }, fixture, sc.session ? sessions[sc.session] : null, theme);
  await page.goto(`${BASE}/${sc.file}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}

async function checkLoad(page, sc, errors, ctx) {
  const problems = [];
  const url = page.url();
  if (!url.includes(sc.expectUrl || sc.file)) problems.push(`redirecionou para ${url.replace(BASE, '')} (sessão/auth simulada falhou)`);
  const loaded = {};
  for (const [sel, n] of Object.entries(sc.loaded)) {
    try { await page.waitForFunction((s, n) => document.querySelectorAll(s).length >= n, { timeout: 6000 }, sel, n); } catch (e) { /* medido abaixo */ }
    const count = await page.$$eval(sel, l => l.length);
    loaded[sel] = `${count}/${n}`;
    if (count < n) problems.push(`dados não carregados: ${sel} ${count}/${n}`);
  }
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
  if (!ctx.endsWith(theme)) problems.push(`tema esperado não aplicado (atual: ${theme})`);
  errors.forEach(e => problems.push(`erro JS: ${e}`));
  return { loaded, problems };
}

async function tabFocusAudit(page, ctx) {
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); });
  const issues = new Set();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1;
      const ring = el.matches('.input-field') && s.boxShadow && s.boxShadow !== 'none';
      const r = el.getBoundingClientRect();
      let covered = false;
      const bn = document.querySelector('.bottom-nav');
      if (bn && getComputedStyle(bn).display !== 'none' && !bn.contains(el)) {
        const br = bn.getBoundingClientRect();
        covered = r.top >= br.top - 1 && r.bottom <= br.bottom + 1 && r.height > 0;
      }
      const d = el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : '');
      return { d, visibleIndicator: outline || ring, covered, inView: r.bottom > 0 && r.top < innerHeight };
    });
    if (!info) continue;
    if (!info.visibleIndicator) issues.add(`foco sem indicador visível: ${info.d}`);
    if (info.covered) issues.add(`elemento focado escondido sob a barra inferior: ${info.d}`);
  }
  issues.forEach(m => fail(ctx, m));
}

async function checkAdminNav(page, m, ctx) {
  if (m.vw < 1024) {
    if (!m.nav.toggleVisible) fail(ctx, 'botão Menu (hambúrguer) não está visível abaixo de 1024px');
    if (m.nav.links.some(l => l.visible)) fail(ctx, 'links da gestão visíveis com o menu fechado (menu duplicado)');
    await page.click('#btnNavToggle');
    await sleep(120);
    const open = await page.evaluate(inspectPage);
    const panel = await page.evaluate(() => {
      const p = document.getElementById('navPanel');
      const r = p.getBoundingClientRect();
      const s = getComputedStyle(p);
      return { bottom: r.bottom, scrolls: ['auto', 'scroll'].includes(s.overflowY), expanded: document.getElementById('btnNavToggle').getAttribute('aria-expanded') };
    });
    if (panel.expanded !== 'true') fail(ctx, 'aria-expanded não mudou para true ao abrir o menu');
    const notVisible = open.nav.links.filter(l => !l.visible).map(l => l.text);
    if (notVisible.length && ctx.includes('atendente') === false) fail(ctx, `menu aberto sem os links: ${notVisible.join(', ')}`);
    if (panel.bottom > open.vh + 1 && !panel.scrolls) fail(ctx, 'menu aberto passa da altura da tela sem rolagem');
    const offscreen = open.nav.links.filter(l => l.visible && !l.inView && !panel.scrolls).map(l => l.text);
    if (offscreen.length) fail(ctx, `links do menu fora da tela: ${offscreen.join(', ')}`);
    open.contrast.filter(c => c.strict).forEach(c => fail(ctx, `contraste insuficiente no menu aberto: ${c.el}`));
    open.contrast.filter(c => !c.strict && c.el.includes('[botão existente no menu]')).forEach(c => warn(ctx, `contraste (pendência de paleta): ${c.el}`));
    if (open.small.length) open.small.forEach(s => fail(ctx, `alvo de toque < 44px no menu aberto: ${s}`));
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'shots', `${ctx.replace(/[^\w-]+/g, '_')}-menu.png`) });
    await page.keyboard.press('Escape');
    await sleep(60);
    const after = await page.evaluate(() => ({
      open: document.getElementById('navPanel').classList.contains('is-open'),
      focus: document.activeElement && document.activeElement.id
    }));
    if (after.open) fail(ctx, 'Esc não fechou o menu');
    if (after.focus !== 'btnNavToggle') fail(ctx, `foco não voltou ao botão Menu (está em ${after.focus})`);
  } else {
    if (m.nav.toggleVisible) fail(ctx, 'botão Menu visível em ≥ 1024px (deveria manter a navegação atual)');
    const hidden = m.nav.links.filter(l => l.visible && !l.inView).map(l => l.text);
    if (hidden.length) fail(ctx, `links da navegação fora da tela: ${hidden.join(', ')}`);
    if (m.vw >= 1280 && m.header && m.header.height > 72) fail(ctx, `cabeçalho da gestão deveria caber em uma linha a partir de 1280px (altura ${m.header.height}px)`);
    const required = ctx.includes('atendente') ? 1 : 4;
    if (m.nav.links.filter(l => l.visible).length < required) fail(ctx, 'links da navegação ausentes em ≥ 1024px');
  }
}

async function checkMesa(page, m, ctx) {
  const bn = m.bottomNav;
  if (!bn) { fail(ctx, 'barra inferior inexistente'); return; }
  if (m.vw <= 767) {
    if (!bn.visible) fail(ctx, 'barra inferior não aparece em ≤ 767px');
    const labels = bn.items.map(i => i.label).join(',');
    if (labels !== 'Cardápio,Carrinho,Pedidos,Chamar') fail(ctx, `rótulos da barra inferior: ${labels}`);
    bn.items.filter(i => i.w < 44 || i.h < 44).forEach(i => fail(ctx, `item da barra inferior < 44px: ${i.label} ${i.w}×${i.h}`));
    bn.items.filter(i => !i.inView).forEach(i => fail(ctx, `item da barra inferior fora da tela: ${i.label}`));
    if (bn.headerActionsVisible) fail(ctx, `ações duplicadas no cabeçalho com a barra inferior visível (${bn.headerActionsVisible})`);
    m.contrast.filter(c => c.strict).forEach(c => fail(ctx, `contraste insuficiente na barra inferior: ${c.el}`));
    const covered = await page.evaluate(coveredAtEnd, '.bottom-nav');
    if (covered && covered.length) fail(ctx, `conteúdo coberto pela barra inferior ao fim da página: ${covered.join(', ')}`);
  } else {
    if (bn.visible) fail(ctx, 'barra inferior visível em ≥ 768px');
    if (bn.headerActionsVisible !== 3) fail(ctx, `ações do cabeçalho ausentes em ≥ 768px (${bn.headerActionsVisible}/3)`);
    if (bn.headerActionsOutside) fail(ctx, 'ações do cabeçalho fora da tela');
  }
}

function checkTables(sc, m, ctx) {
  const relevant = m.tables.filter(t => t.rows > 0);
  if (!relevant.length) { fail(ctx, 'nenhuma tabela visível'); return; }
  relevant.forEach(t => {
    if (!['auto', 'scroll'].includes(t.overflowX)) fail(ctx, `${t.label}: contêiner sem rolagem horizontal (overflow-x: ${t.overflowX})`);
    if (!t.focusable) fail(ctx, `${t.label}: contêiner rolável não é focável pelo teclado`);
    if (!t.headerVisible) fail(ctx, `${t.label}: cabeçalho da tabela invisível`);
    if (t.hiddenActions) fail(ctx, `${t.label}: ${t.hiddenActions} célula(s) de ações fora da área visível`);
    if (t.smallActions) fail(ctx, `${t.label}: ${t.smallActions} botão(ões) de ação < 44px`);
    if (m.vw < 600 && t.label.includes('role') && t.scrollW <= t.clientW) warn(ctx, `${t.label}: esperada rolagem interna abaixo de 600px`);
  });
}

async function checkModals(page, sc, m, ctx) {
  for (const md of sc.modals || []) {
    const mctx = `${ctx} › ${md.name}`;
    await page.evaluate(() => { window.scrollTo(0, 0); });
    if (md.pre) {
      const btns = await page.$$(md.pre[0]);
      for (const b of btns.slice(0, md.pre[1])) await b.evaluate(x => x.click());
    }
    const trigger = typeof md.trigger === 'string' ? md.trigger : (m.vw <= 767 ? md.trigger.mobile : md.trigger.desktop);
    const triggerOk = await page.$eval(trigger, el => {
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && r.width > 0;
    }).catch(() => false);
    if (!triggerOk) { fail(mctx, `gatilho ${trigger} não está visível`); continue; }
    await page.focus(trigger);
    await page.click(trigger);
    await sleep(250);
    if (md.post) for (let i = 0; i < md.post[1]; i++) await page.$eval(md.post[0], b => b.click());
    if (md.selectOther) await page.select(md.selectOther, 'Outro');
    if (md.expect) {
      try { await page.waitForFunction((s, n) => document.querySelectorAll(s).length >= n, { timeout: 4000 }, md.expect[0], md.expect[1]); } catch (e) { /* medido abaixo */ }
      const n = await page.$$eval(md.expect[0], l => l.length);
      if (n < md.expect[1]) { fail(mctx, `conteúdo do modal não carregou (${n}/${md.expect[1]})`); }
    }
    const mm = await page.evaluate(inspectModal, md.modal);
    if (!mm.open) { fail(mctx, 'modal não abriu'); continue; }
    if (mm.role !== 'dialog' || mm.ariaModal !== 'true' || !mm.labelled) fail(mctx, 'sem role="dialog"/aria-modal/título');
    if (!mm.insideViewport) fail(mctx, `cartão fora da tela: ${mm.rect}`);
    if (mm.hOverflow) fail(mctx, 'conteúdo do modal transborda na horizontal');
    if (!mm.lastReachable) fail(mctx, 'último botão do modal inalcançável');
    if (mm.outside.length) fail(mctx, `elementos cortados no modal: ${mm.outside.slice(0, 4).join(', ')}`);
    if (mm.smallBtns.length) fail(mctx, `botões < 44px: ${mm.smallBtns.slice(0, 4).join(', ')}`);
    if (mm.bottomNavOnTop) fail(mctx, 'barra inferior por cima do modal');
    if (mm.blocked.length) fail(mctx, `controles cobertos por outro elemento (não recebem toque): ${mm.blocked.slice(0, 4).join(', ')}`);
    if (!mm.focusInside) fail(mctx, 'foco não entrou no modal');
    if (!mm.bodyLocked) fail(mctx, 'rolagem do fundo não foi travada (body.modal-open)');
    let leaked = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      if (!(await page.evaluate(s => document.querySelector(s).contains(document.activeElement), md.modal))) { leaked = true; break; }
    }
    if (leaked) fail(mctx, 'Tab sai do modal (foco não está preso)');
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'shots', `${mctx.replace(/[^\w-]+/g, '_')}.png`) });
    await page.keyboard.press('Escape');
    await sleep(80);
    const after = await page.evaluate((s, t) => ({
      closed: getComputedStyle(document.querySelector(s)).display === 'none',
      focusBack: document.activeElement === document.querySelector(t),
      unlocked: !document.body.classList.contains('modal-open')
    }), md.modal, trigger);
    if (!after.closed) { fail(mctx, 'Esc não fechou o modal'); await page.evaluate(s => { document.querySelector(s).style.display = 'none'; }, md.modal); }
    else {
      if (!after.focusBack) fail(mctx, 'foco não voltou ao gatilho após fechar');
      if (!after.unlocked) fail(mctx, 'body continuou travado após fechar');
    }
  }
}

async function checkLanding(page, sc, m, ctx) {
  const overlap = await page.evaluate(() => {
    const slide = document.querySelector('.carousel-slide.active');
    if (!slide) return [];
    const ctrls = [...document.querySelectorAll('.carousel-btn, .carousel-indicators')].filter(e => getComputedStyle(e).display !== 'none');
    const ctas = [...slide.querySelectorAll('a, button, h1, h2, h3, p')];
    const hits = [];
    ctrls.forEach(c => {
      const cr = c.getBoundingClientRect();
      ctas.forEach(t => {
        const tr = t.getBoundingClientRect();
        if (Math.min(cr.right, tr.right) - Math.max(cr.left, tr.left) > 1 && Math.min(cr.bottom, tr.bottom) - Math.max(cr.top, tr.top) > 1) {
          hits.push(`${c.className.split(' ')[0]} × ${t.tagName.toLowerCase()} "${t.textContent.trim().slice(0, 24)}"`);
        }
      });
    });
    return hits;
  });
  overlap.forEach(h => fail(ctx, `controle do carrossel sobrepõe conteúdo: ${h}`));
  if (sc.fab) {
    const fab = await page.evaluate(() => {
      const f = document.getElementById('btnCallStaffGlobal');
      const r = f.getBoundingClientRect();
      return { visible: getComputedStyle(f).display !== 'none', inView: r.left >= 0 && r.right <= document.documentElement.clientWidth && r.bottom <= innerHeight, w: r.width, h: r.height };
    });
    if (!fab.visible) fail(ctx, 'FAB "Chamar" não aparece para a mesa');
    if (!fab.inView) fail(ctx, 'FAB cortado fora da tela');
    const covered = await page.evaluate(coveredAtEnd, '#btnCallStaffGlobal');
    if (covered && covered.length) fail(ctx, `conteúdo coberto pelo FAB ao fim da página: ${covered.join(', ')}`);
  }
}

const started = Date.now();
let combos = 0;
for (const sc of SCENARIOS) {
  if (ONLY.length && !ONLY.includes(sc.id)) continue;
  for (const wh of WIDTHS) {
    if (sc.onlyWidths && !sc.onlyWidths.includes(wh[0])) continue;
    for (const theme of THEMES) {
      combos++;
      const ctx = `${sc.id} @${wh[0]} ${theme}`;
      const { page, errors } = await openPage(sc, wh, theme);
      const record = { scenario: sc.id, width: wh[0], height: wh[1], theme };
      try {
        // 1) Carga primeiro — sem dados não há auditoria de layout
        const load = await checkLoad(page, sc, errors, ctx);
        record.loaded = load.loaded;
        if (load.problems.length) {
          load.problems.forEach(p => fail(ctx, p));
          record.skippedLayout = true;
          results.push(record);
          continue;
        }
        if (sc.pre) { await page.click(sc.pre); await sleep(150); }

        // 2) Layout
        const m = await page.evaluate(inspectPage);
        record.metrics = m;
        if (m.docOverflow > 0) fail(ctx, `rolagem horizontal da página: ${m.docOverflow}px (${m.offenders.slice(0, 3).join('; ')})`);
        m.clipped.forEach(c => fail(ctx, `conteúdo cortado sem rolagem: ${c}`));
        m.overflowText.forEach(c => fail(ctx, c));
        if (m.header) {
          if (!m.header.logoVisible) fail(ctx, 'logo cortado no cabeçalho');
          m.header.outside.forEach(o => fail(ctx, `item fora do cabeçalho/tela: ${o}`));
        }
        m.small.forEach(s => fail(ctx, `alvo de toque < 44px: ${s}`));
        m.contrast.filter(c => !c.strict).forEach(c => warn(ctx, `contraste (pendência de paleta): ${c.el}`));
        m.contrast.filter(c => c.strict).forEach(c => fail(ctx, `contraste insuficiente em componente novo: ${c.el}`));

        if (sc.kind === 'admin') await checkAdminNav(page, m, ctx);
        if (sc.kind === 'mesa') await checkMesa(page, m, ctx);
        if (sc.kind === 'landing') await checkLanding(page, sc, m, ctx);
        if (sc.tables) checkTables(sc, m, ctx);

        if (SHOTS) {
          const base = path.join(OUT, 'shots', `${sc.id}-${wh[0]}-${theme}`);
          await page.screenshot({ path: `${base}.png` });
          await page.screenshot({ path: `${base}-full.png`, fullPage: true });
        }

        if (theme === 'light') await tabFocusAudit(page, ctx);
        await checkModals(page, sc, m, ctx);
        results.push(record);
      } catch (err) {
        fail(ctx, `exceção no teste: ${err.message}`);
        results.push(record);
      } finally {
        await page.close();
        process.stdout.write(failures.length ? 'x' : '.');
      }
    }
  }
}

// Rede lenta: fonte de ícones ainda não carregada. As ligaduras ("dark_mode",
// "table_restaurant"...) viram texto; o layout não pode gerar rolagem horizontal.
for (const sc of SCENARIOS) {
  if (ONLY.length && !ONLY.includes(sc.id)) continue;
  const ctx = `${sc.id} @320 sem fonte de ícones light`;
  let page;
  try {
    const opened = await openPage(sc, [320, 568], 'light', { noIconFont: true });
    page = opened.page;
    const { problems } = await checkLoad(page, sc, opened.errors, ctx);
    problems.forEach(p => fail(ctx, p));
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 0) fail(ctx, `rolagem horizontal de ${ov}px enquanto a fonte de ícones carrega`);
  } catch (err) {
    fail(ctx, `exceção no teste: ${err.message}`);
  } finally {
    if (page) await page.close();
    process.stdout.write(failures.length ? 'x' : '.');
  }
}

await browser.close();
server.close();

const warnList = Object.entries(warnings).map(([msg, ctxs]) => ({ msg, count: ctxs.size, examples: [...ctxs].slice(0, 3) }));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ combos, failures, warnings: warnList, results }, null, 1));

const secs = Math.round((Date.now() - started) / 1000);
console.log(`\n\nTeste de responsividade: ${combos} combinações (página × largura × tema) em ${secs}s`);
console.log(`Relatório: ${path.join(OUT, 'results.json')}${SHOTS ? ` | capturas: ${path.join(OUT, 'shots')}` : ''}`);
if (warnList.length) {
  console.log(`\nAvisos (não reprovam): ${warnList.length} tipos`);
  warnList.slice(0, 15).forEach(w => console.log(`  - ${w.msg} [${w.count}×, ex.: ${w.examples[0]}]`));
  if (warnList.length > 15) console.log(`  … e mais ${warnList.length - 15} (ver results.json)`);
}
if (failures.length) {
  console.error(`\nFALHAS (${failures.length}):`);
  failures.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
}
console.log('\nOK — nenhuma falha.');
