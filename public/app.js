/* ImobRJ – lógica do dashboard. Lê dados.json (campos: bairro, logradouro, area, valor, valor_m2, transacoes, tipo, tipologia, ano, mes) */

// ---------- Utilidades ----------
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const ABREV = { avn:'avenida', av:'avenida', etr:'estrada', est:'estrada', prc:'praca', pra:'praca', pca:'praca',
  trv:'travessa', tv:'travessa', blv:'boulevard', lrg:'largo', lgo:'largo', lad:'ladeira', srv:'servidao',
  cam:'caminho', bec:'beco', cmp:'campo', esc:'escadaria', rod:'rodovia', r:'rua', al:'alameda' };
const strip = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const TITULOS = { visc:'visconde', gen:'general', dr:'doutor', pres:'presidente', cel:'coronel', cap:'capitao', eng:'engenheiro',
  prof:'professor', min:'ministro', alm:'almirante', mal:'marechal', sen:'senador', dep:'deputado', pe:'padre', sta:'santa', sto:'santo', sao:'sao' };
const STOP = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
// normaliza endereço: sem acento, abreviações expandidas (Avn→avenida, Visc→visconde) e sem preposições
const normRua = s => { const t = strip(s).split(' '); t[0] = ABREV[t[0]] || t[0];
  return t.map((w, i) => i ? (TITULOS[w] || w) : w).filter((w, i) => !i || !STOP.has(w)).join(' '); };
const pretty = s => { const t = s.trim().split(/\s+/); const f = ABREV[strip(t[0])]; if (f) t[0] = f[0].toUpperCase() + f.slice(1); return t.join(' '); };
const $ = id => document.getElementById(id);
const brl = v => v == null ? '—' : v.toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
const num = v => v == null ? '—' : Math.round(v).toLocaleString('pt-BR');
const pct = v => { if (v == null) return '—'; const t = v.toFixed(1); return (v > 0 && t !== '0.0' ? '+' : '') + (t === '-0.0' ? '0.0' : t).replace('.', ',') + '%'; };
const pctColor = v => v == null ? 'text-gray-500' : v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-gray-500';
// área do imóvel (m²) compartilhada entre as abas Tendência e Calculadora
const AREA_K = 'imobrj_area';
const areaGet = () => { let a = NaN; try { a = +localStorage.getItem(AREA_K); } catch (e) { a = areaGet.mem; } return a >= 10 ? a : (areaGet.mem >= 10 ? areaGet.mem : 70); };
const areaSet = a => { a = +a; if (!(a >= 10)) return; areaGet.mem = a; try { localStorage.setItem(AREA_K, String(a)); } catch (e) {} };
const ANO0 = 2010;   // mês t=0 é jan/2010; a base por imóvel começa em jul/2011
const minmax = (arr, f = x => x) => { let a = Infinity, b = -Infinity; for (const x of arr) { const v = f(x); if (v < a) a = v; if (v > b) b = v; } return [a, b]; };   // seguro p/ centenas de milhares de itens (Math.max(...lista) estoura)
const COLORS = ['#ef4b3f', '#1e3a5f', '#14b8a6', '#f59e0b', '#8b5cf6', '#94a3b8'];

// ---------- Estado ----------
let ROWS = [], RUAS = [], BAIRROS = [];
let S = { lvl:'cidade', nb:null, nl:null, label:'Cidade do Rio de Janeiro' };   // escopo (local) atual
let F = { tipo:'', tip:'', de:2018, ate:2026, gran:1 };                         // filtros
let TAB = 'overview', B = [];                                                   // B = linhas após filtros
const charts = {};

// ---------- Carregamento ----------
async function init() {
  try {
    const r = await fetch('dados.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    start(expandir(await r.json()));
  } catch (e) {
    $('loadIcon').classList.add('hidden'); $('loadMsg').textContent = 'Não foi possível carregar os dados. Verifique a internet e tente de novo.';
    $('manual').classList.remove('hidden');
    $('file').onchange = ev => { const rd = new FileReader(); rd.onload = () => start(expandir(JSON.parse(rd.result))); rd.readAsText(ev.target.files[0]); };
  }
}

// dados.json: lista de objetos (formato antigo) ou {formato:2, bairros, ruas, tipologias, linhas:[[b,r,tip,comercial,ano,mes,n,area,valor],…]}
function expandir(j) {
  if (Array.isArray(j)) return j;
  if (j.formato !== 2) throw new Error('formato de dados.json desconhecido');
  return j.linhas.map((l, i) => ({ id: i + 1, bairro: j.bairros[l[0]], logradouro: j.ruas[l[1]], tipologia: j.tipologias[l[2]], tipo: l[3] ? 'Comercial' : 'Residencial',
    ano: l[4], mes: l[5], transacoes: l[6], area: l[7], valor: l[8], valor_m2: Math.round(l[8] / l[7] * 100) / 100 }));
}
let META = null;
function start(raw) {
  const cNb = new Map(), cNl = new Map();   // cache: strip/normRua por texto (evita refazer regex em centenas de milhares de linhas)
  const memo = (c, f, s) => c.get(s) ?? (c.set(s, f(s)), c.get(s));
  ROWS = raw;
  for (const r of ROWS) { r.bairro = r.bairro.trim(); r.t = (r.ano - ANO0) * 12 + r.mes - 1; r.nb = memo(cNb, strip, r.bairro); r.nl = memo(cNl, normRua, r.logradouro); r.transacoes = r.transacoes || 1; }
  // índices para autocomplete
  const rm = new Map(), bm = new Map();
  for (const r of ROWS) {
    bm.set(r.nb, { nome: r.bairro, nb: r.nb, n: (bm.get(r.nb)?.n || 0) + r.transacoes });
    const k = r.nl + '|' + r.nb;
    const o = rm.get(k) || { nome: pretty(r.logradouro), nl: r.nl, bairro: r.bairro, nb: r.nb, n: 0 };
    o.n += r.transacoes; rm.set(k, o);
  }
  BAIRROS = [...bm.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  RUAS = [...rm.values()].sort((a, b) => b.n - a.n);
  RUAS.forEach(r => r.q = r.nl + ' ' + r.nb);
  BAIRROS.forEach(b => b.q = b.nb);

  const anos = [...new Set(ROWS.map(r => r.ano))].sort();
  F.de = anos[0]; F.ate = anos.at(-1);
  $('fDe').innerHTML = $('fAte').innerHTML = anos.map(a => `<option>${a}</option>`).join('');
  $('fDe').value = F.de; $('fAte').value = F.ate;
  const tips = [...new Set(ROWS.map(r => r.tipologia))].sort();
  $('fTip').innerHTML = '<option value="">Todas</option>' + tips.map(t => `<option>${t}</option>`).join('');
  $('cmpExtra').innerHTML = '<option value="">— nenhum —</option>' + BAIRROS.map(b => `<option value="${b.nb}">${b.nome}</option>`).join('');

  fetch('meta.json', { cache: 'no-cache' }).then(r => r.json()).then(m => {   // carimbo de atualização (opcional)
    META = m; renderMethodAuto();
    const [a, mm] = m.ultimo_periodo.split('-'), [y, mo, d] = m.atualizado_em.split('-');
    $('stamp').textContent = ` · dados até ${MESES[+mm - 1]}/${a} · atualizado em ${d}/${mo}/${y}`;
  }).catch(() => {});
  $('loader').classList.add('hidden');
  $('selBairro').innerHTML = '<option value="">Bairro…</option>' + BAIRROS.map(b => `<option value="${b.nb}">${b.nome}</option>`).join('');
  const pop = [...BAIRROS].sort((a, b) => b.n - a.n).slice(0, 6);
  $('popular').innerHTML = pop.map(b => `<button class="pop bg-white/20 hover:bg-white/30 rounded-full px-3 py-1 font-semibold" data-nb="${b.nb}">${b.nome}</button>`).join('');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  bindEvents(); renderChips(); TAB = abaDoEndereco(); marcarAba(); render();
  loadIndices().finally(() => { renderMethodAuto(); if (TAB !== 'history') render(); });
  loadMedianas().then(() => { if (MED && TAB !== 'history') render(); });
  loadAreas().then(() => { if (AREAS && TAB !== 'history') render(); });
}

// ---------- Filtros / agregações ----------
const baseRows = () => ROWS.filter(r => (!F.tipo || r.tipo === F.tipo) && (!F.tip || r.tipologia === F.tip) && r.ano >= F.de && r.ano <= F.ate);
const inScope = (rows, sc = S) => sc.lvl === 'cidade' ? rows : rows.filter(r => r.nb === sc.nb && (sc.lvl === 'bairro' || r.nl === sc.nl));

// ---------- Mediana do R$/m² (medianas.json: R$/m² de cada transação, por bairro/tipologia/tipo/mês) ----------
// Bairro e cidade usam MEDIANA real; rua usa MÉDIA ponderada (poucas vendas e o arquivo não tem a rua).
// Sem medianas.json, o site continua funcionando só com médias.
let MED = null, MB = [];          // MED = todos os grupos; MB = grupos após os filtros atuais (atualizado em render)
const MED_MIN = 5;
const POUCOS = 50;                // abaixo disso, o local ganha aviso de "poucos dados"                // mínimo de transações para mostrar uma mediana
async function loadMedianas() {
  try {
    const r = await fetch('medianas.json', { cache: 'no-cache' }); if (!r.ok) return;
    const j = await r.json(), nbs = j.bairros.map(b => strip(b.trim())), passo = j.passo || 10;
    MED = j.grupos.map(g => {
      const v = new Int32Array(g.length - 5); let acc = 0;
      for (let i = 5; i < g.length; i++) { acc += g[i]; v[i - 5] = acc; }   // desfaz as diferenças (lista já vem ordenada)
      return { nb: nbs[g[0]], tipologia: j.tipologias[g[1]], tipo: g[2] ? 'Comercial' : 'Residencial', ano: g[3], t: (g[3] - ANO0) * 12 + g[4] - 1, v, passo };
    });
  } catch (e) { MED = null; }
}
const medBase = () => MED ? MED.filter(g => (!F.tipo || g.tipo === F.tipo) && (!F.tip || g.tipologia === F.tip) && g.ano >= F.de && g.ano <= F.ate) : [];
// grupos de mediana do local: cidade = todos; bairro = só o bairro; rua = null (usa média)
const medScope = (sc = S) => !MED || sc.lvl === 'rua' ? null : sc.lvl === 'cidade' ? MB : MB.filter(g => g.nb === sc.nb);
const usaMediana = (sc = S) => !!MED && sc.lvl !== 'rua';
function medOf(gs) {              // mediana de todos os valores dos grupos (null se < MED_MIN)
  let n = 0; for (const g of gs) n += g.v.length;
  if (n < MED_MIN) return null;
  if (gs.length === 1) { const v = gs[0].v; return { n, m2: (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) * gs[0].passo }; }
  const a = new Int32Array(n); let o = 0; for (const g of gs) { a.set(g.v, o); o += g.v.length; }
  a.sort(); const m = n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  return { n, m2: m * gs[0].passo };
}
const tsub = (arr, pred) => arr && arr.filter(pred);

// ---------- Faixas de metragem (areas.json: área e R$/m² de cada venda, por bairro/tipologia/tipo/mês) ----------
// Escolher uma metragem = usar as vendas na faixa metragem ± FAIXA_TOL m² (ex.: 70 m² → 65 a 75 m²).
// Cidade e bairro usam areas.json; rua usa o arquivo do bairro (transacoes/<bairro>.json, só vendas integrais).
const FAIXA_TOL = 5;
const faixaDe = c => [Math.max(0, c - FAIXA_TOL), c + FAIXA_TOL];
const faixaTxt = c => { const [lo, hi] = faixaDe(c); return `${num(lo)} a ${num(hi)} m²`; };
let AREAS = null, AREAS_ST = '';  // AREAS = grupos {nb, tipologia, tipo, ano, t, a (áreas ordenadas), v (R$/m², mesma ordem), passo}
async function loadAreas() {
  if (AREAS || AREAS_ST) return; AREAS_ST = 'carregando';
  try {
    const r = await fetch('areas.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status);
    const j = await r.json(), passo = j.passo || 10;
    AREAS = j.grupos.map(g => {
      const a = new Int32Array(g[5].length); let acc = 0; g[5].forEach((d, i) => { acc += d; a[i] = acc; });
      return { nb: j.nbs[g[0]], tipologia: j.tipologias[g[1]], tipo: g[2] ? 'Comercial' : 'Residencial', ano: g[3], t: (g[3] - ANO0) * 12 + g[4] - 1, a, v: Int32Array.from(g[6]), passo };
    });
    AREAS_ST = 'ok';
  } catch (e) { AREAS = null; AREAS_ST = 'erro'; }
}
const areasFiltro = gs => gs.filter(g => (!F.tipo || g.tipo === F.tipo) && (!F.tip || g.tipologia === F.tip) && g.ano >= F.de && g.ano <= F.ate);
// grupos do local atual; null enquanto carrega (rua: lê o arquivo do bairro e chama render() quando chegar)
const AREAS_RUA = new Map();
function areasEscopo(sc = S) {
  if (sc.lvl !== 'rua') return AREAS ? areasFiltro(sc.lvl === 'cidade' ? AREAS : AREAS.filter(g => g.nb === sc.nb)) : null;
  const k = sc.nb + '|' + sc.nl;
  if (!AREAS_RUA.has(k)) {
    AREAS_RUA.set(k, null);
    (async () => {
      await txCarregarIndice(); const b = TX.idx?.bairros.find(x => x.nb === sc.nb); if (!b) throw new Error('bairro');
      const d = await txCarregarBairro(b.arquivo), ris = new Set(d.ruas.map((r, i) => normRua(r) === sc.nl ? i : -1).filter(i => i >= 0)), m = new Map();
      for (const l of d.linhas) {
        if (l.fl || !(l.area > 0) || !ris.has(l.rua)) continue;
        const gk = l.t + '|' + l.tip + '|' + l.com;
        (m.get(gk) || m.set(gk, { nb: sc.nb, tipologia: d.tipologias[l.tip], tipo: l.com ? 'Comercial' : 'Residencial', ano: l.ano, t: (l.ano - ANO0) * 12 + l.mes - 1, ps: [], passo: 1 }).get(gk)).ps.push([l.area, l.valor / l.area]);
      }
      AREAS_RUA.set(k, [...m.values()].map(g => { g.ps.sort((x, y) => x[0] - y[0]); g.a = g.ps.map(p => p[0]); g.v = g.ps.map(p => p[1]); delete g.ps; return g; }));
    })().catch(() => AREAS_RUA.set(k, [])).finally(() => render());
  }
  const gs = AREAS_RUA.get(k); return gs ? areasFiltro(gs) : null;
}
// mediana do R$/m² das vendas com área entre lo e hi (null se nenhuma; m2 null se < min vendas)
function medFaixa(gs, lo, hi, min = MED_MIN) {
  const vals = [];
  for (const g of gs) {
    const a = g.a; let i = 0, j = a.length; while (i < j) { const h = (i + j) >> 1; if (a[h] < lo) i = h + 1; else j = h; }   // 1ª venda com área ≥ lo
    for (; i < a.length && a[i] <= hi; i++) vals.push(g.v[i] * g.passo);
  }
  const n = vals.length; if (!n) return null;
  if (n < min) return { n, m2: null };
  vals.sort((x, y) => x - y);
  return { n, m2: n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2 };
}
// R$/m² mediano da faixa por período do eixo
function seriesFaixa(gs, axis, lo, hi) {
  const gm = new Map(); for (const g of gs) { const k = key(g.t); (gm.get(k) || gm.set(k, []).get(k)).push(g); }
  return axis.map(k => gm.has(k) ? medFaixa(gm.get(k), lo, hi) : null);
}

function agg(rows, md) {        // médias ponderadas pelo nº de transações; com md (grupos de mediana), m2 = MEDIANA
  let n = 0, v = 0, m = 0, a = 0;
  for (const r of rows) { const w = r.transacoes; n += w; v += r.valor * w; m += r.valor_m2 * w; a += r.area * w; }
  if (!n) return null;
  const res = { n, valor: v / n, m2: m / n, area: a / n };
  if (md) res.m2 = medOf(md)?.m2 ?? null;
  return res;
}
const key = t => F.gran === 3 ? Math.floor(t / 3) : t;
const perYear = () => 12 / F.gran;
const keyLabel = k => F.gran === 3 ? `T${k % 4 + 1}/${String(ANO0 + Math.floor(k / 4)).slice(2)}` : `${MESES[k % 12]}/${String(ANO0 + Math.floor(k / 12)).slice(2)}`;
function makeAxis(rows) { const [a, b] = minmax(rows, r => key(r.t)); return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
function series(rows, axis, md) {   // R$/m² por período, alinhado ao eixo (null = sem dados); com md: mediana (mín. MED_MIN vendas no período)
  if (md) {
    const gm = new Map(); for (const g of md) { const k = key(g.t); (gm.get(k) || gm.set(k, []).get(k)).push(g); }
    return axis.map(k => { const r = gm.has(k) ? medOf(gm.get(k)) : null; return r && { n: r.n, m2: r.m2 }; });
  }
  const m = new Map();
  for (const r of rows) { const k = key(r.t), o = m.get(k) || { n: 0, s: 0 }; o.n += r.transacoes; o.s += r.valor_m2 * r.transacoes; m.set(k, o); }
  return axis.map(k => m.has(k) ? { n: m.get(k).n, m2: m.get(k).s / m.get(k).n } : null);
}
function var12(rows, lastT, md) {
  const p1 = r => r.t > lastT - 12, p0 = r => r.t <= lastT - 12 && r.t > lastT - 24;
  const a = agg(rows.filter(p1), tsub(md, p1)), b = agg(rows.filter(p0), tsub(md, p0));
  return a?.m2 && b?.m2 ? (a.m2 / b.m2 - 1) * 100 : null;
}
function regress(ys) {          // regressão linear simples sobre pontos não nulos
  const p = ys.map((y, i) => y == null ? null : [i, y]).filter(Boolean); if (p.length < 6) return null;
  const n = p.length, mx = p.reduce((s, q) => s + q[0], 0) / n, my = p.reduce((s, q) => s + q[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  const slope = sxy / sxx, icpt = my - slope * mx; return { slope, icpt, r2: syy ? (sxy * sxy) / (sxx * syy) : 0 };
}
function movAvg(ys, w = 3) { return ys.map((_, i) => { const s = ys.slice(Math.max(0, i - w + 1), i + 1).filter(v => v != null); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; }); }

// ---------- Índices oficiais (IPCA e CDI) ----------
// Fonte: Banco Central do Brasil (SGS) — IPCA = série 433 (IBGE), CDI acumulado no mês = série 4391 (B3).
// Lidos de indices.json (gerado por scripts/atualizar_indices.py); se o arquivo não existir, tenta a API do BCB direto do navegador.
let IDX = null;   // { ipca: Map(t → % a.m.), cdi: Map(...), fim: {ipca, cdi}, gerado_em, origem }
const SGS = { ipca: 433, cdi: 4391 };
const tOf = ym => { const [a, m] = ym.split('-'); return (+a - ANO0) * 12 + +m - 1; };
const ymLabel = t => `${MESES[t % 12]}/${ANO0 + Math.floor(t / 12)}`;
function parseIdx(j, origem) {
  const o = { gerado_em: j.gerado_em, origem, fim: {} };
  for (const nome of ['ipca', 'cdi']) {
    const m = new Map(Object.entries(j.series[nome].dados).map(([ym, v]) => [tOf(ym), +v]));
    if (m.size < 24) throw new Error('série curta: ' + nome);
    o[nome] = m; o.fim[nome] = minmax(m.keys())[1]; o.ini = Math.max(o.ini ?? -Infinity, minmax(m.keys())[0]);
  }
  if (j.series.tr?.dados) {        // opcional (usado só na calculadora)
    const m = new Map(Object.entries(j.series.tr.dados).map(([ym, v]) => [tOf(ym), +v]));
    if (m.size >= 12) { o.tr = m; o.fim.tr = minmax(m.keys())[1]; }
  }
  if (j.selic_meta?.valor != null) o.selic = j.selic_meta;   // { valor: 13.75, data: '05/11/2026' }
  return o;
}
async function loadIndices() {
  try {
    const r = await fetch('indices.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    IDX = parseIdx(await r.json(), 'arquivo'); return;
  } catch (e) { /* tenta direto no BCB */ }
  try {
    const h = new Date(), fim = `${String(h.getDate()).padStart(2, '0')}/${String(h.getMonth() + 1).padStart(2, '0')}/${h.getFullYear()}`;
    const j = { gerado_em: h.toISOString().slice(0, 10), series: {} };
    for (const [nome, cod] of Object.entries(SGS)) {
      const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cod}/dados?formato=json&dataInicial=01/01/${ANO0}&dataFinal=${fim}`);
      if (!r.ok) throw new Error(r.status);
      const dados = {}; (await r.json()).forEach(x => { const [, m, a] = x.data.split('/'); dados[`${a}-${m}`] = parseFloat(String(x.valor).replace(',', '.')); });
      j.series[nome] = { dados };
    }
    IDX = parseIdx(j, 'bcb');
  } catch (e) { IDX = null; }
}
// fator acumulado entre o mês t0 e o mês t1 (multiplica os meses t0+1 … t1); null se faltar algum mês
function fator(nome, t0, t1) {
  const m = IDX?.[nome]; if (!m || t1 < t0) return null;
  let f = 1; for (let t = t0 + 1; t <= t1; t++) { const r = m.get(t); if (r == null) return null; f *= 1 + r / 100; }
  return f;
}
const ganho = (a, b) => a == null || b == null ? null : ((1 + a / 100) / b - 1) * 100;   // (1+nominal)/fator − 1, em %
const fatorPct = f => f == null ? null : (f - 1) * 100;

// ---------- Gráficos ----------
function mk(id, cfg) {
  if (!window.Chart) { if (!mk.warned) { mk.warned = true; toast('Chart.js não carregou (verifique a internet).'); } return; }
  charts[id]?.destroy();
  const horiz = cfg.options?.indexAxis === 'y', padrao = { responsive: true, maintainAspectRatio: false };
  if (cfg.type === 'line' || cfg.type === 'bar') padrao.interaction = horiz ? { mode: 'nearest', axis: 'y', intersect: false } : { mode: 'index', intersect: false };
  cfg.options = Object.assign(padrao, cfg.options);
  charts[id] = new Chart($(id), cfg);
}
const lineDs = (label, data, color, extra = {}) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHitRadius: 16, pointHoverRadius: 4, tension: .25, spanGaps: true, ...extra });
const yBRL = { ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') } };

function render() {
  B = baseRows(); MB = medBase();
  const sc = inScope(B);
  const has = sc.length > 0;
  const solo = TAB === 'history' || TAB === 'method' || TAB === 'tx' || TAB === 'calc' || TAB === 'anuncios';   // abas que não dependem de local/filtros
  $('empty').classList.toggle('hidden', has || solo);
  const semBarra = TAB === 'method' || TAB === 'tx' || TAB === 'calc' || TAB === 'anuncios';
  $('scopeHead').classList.toggle('hidden', semBarra); $('filtersBar').classList.toggle('hidden', semBarra);
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + TAB || (!has && !solo)));
  $('scopeTitle').textContent = S.label;
  if (TAB === 'history') return renderHistory();
  if (TAB === 'method') return renderMethodAuto();
  if (TAB === 'tx') return renderTx();
  if (TAB === 'calc') return renderCalc();
  if (TAB === 'anuncios') return renderAnuncios();
  if (!has) return;
  $('scopeSub').innerHTML = `${num(sc.length)} registros · ${F.de}–${F.ate}` + (S.cep ? ` · <span class="text-brand-600 font-medium">CEP ${S.cep}</span>` : '') + (S.ceps?.length ? ' · CEPs: ' + S.ceps.map(c => `<span class="bg-brand-100 text-brand-900 rounded px-1.5 py-0.5 text-xs">${c}</span>`).join(' ') : '');
  const nTot = sc.reduce((s, r) => s + r.transacoes, 0);
  if (S.lvl !== 'cidade' && nTot < POUCOS) $('scopeSub').innerHTML += ` <span class="block mt-1 text-amber-700"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Poucos dados: só ${num(nTot)} venda${nTot === 1 ? '' : 's'} neste local e período. Os números podem oscilar muito; compare com o bairro ou amplie o período.</span>`;
  ({ overview: renderOverview, compare: renderCompare, trend: renderTrend })[TAB](sc);
}

function renderOverview(sc) {
  const md = medScope(), lastT = minmax(B, r => r.t)[1], a = agg(sc, md), v = var12(sc, lastT, md);
  const k = (icon, label, val, cls = '', sub = '') => `<div class="card"><div class="text-xs text-gray-500 mb-1"><i class="fa-solid ${icon} mr-1"></i>${label}</div><div class="text-xl font-bold ${cls}">${val}</div>${sub ? `<div class="text-xs text-gray-400 mt-0.5">${sub}</div>` : ''}</div>`;
  $('kpis').innerHTML = k('fa-handshake', 'Transações', num(a.n), '', `${F.de}–${F.ate}`) + k('fa-ruler-combined', md ? 'Preço mediano/m²' : 'Preço médio/m² (rua)', brl(a.m2), '', 'no período') +
    k('fa-sack-dollar', 'Valor médio', brl(a.valor)) + k('fa-vector-square', 'Área média', a.area.toFixed(0) + ' m²') +
    k('fa-arrow-trend-up', 'Últimos 12 meses (R$/m²)', pct(v), pctColor(v), 'vs. os 12 meses anteriores') +
    (IDX ? kpiReal(janelaIdx(sc, md)) : '');
  kpiAjuda();
  $('tPreco').textContent = md ? 'Preço mediano por m² ao longo do tempo' : 'Preço médio por m² ao longo do tempo (rua: média)';

  renderPrecoFaixas(sc, md, lastT);

  // tipologias: barras com % (mais legível que a rosca)
  const tm = {}; sc.forEach(r => tm[r.tipologia] = (tm[r.tipologia] || 0) + r.transacoes);
  let te = Object.entries(tm).sort((x, y) => y[1] - x[1]); const rest = te.slice(6).reduce((s, x) => s + x[1], 0);
  te = te.slice(0, 6); if (rest) te.push(['Outros', rest]);
  const totTip = te.reduce((s, x) => s + x[1], 0) || 1;
  mk('cTip', { type: 'bar', data: { labels: te.map(x => x[0]), datasets: [{ data: te.map(x => x[1] / totTip * 100), backgroundColor: '#1e3a5f', borderRadius: 6 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${pct1(c.parsed.x)} · ${num(te[c.dataIndex][1])} transações` } } },
      scales: { x: { ticks: { callback: v => v + '%' } } } } });

  // transações por ano: anos sem os 12 meses na base (início e fim) ficam marcados como parciais
  const am = {}; sc.forEach(r => am[r.ano] = (am[r.ano] || 0) + r.transacoes);
  const [tIni, tFim] = minmax(ROWS, r => r.t), parcial = ano => {
    const m0 = ano === ANO0 + Math.floor(tIni / 12) ? tIni % 12 + 1 : 1, m1 = ano === ANO0 + Math.floor(tFim / 12) ? tFim % 12 + 1 : 12;
    return m0 > 1 || m1 < 12 ? [m0, m1] : null; };
  const anos = Object.keys(am).map(Number), parc = anos.map(parcial);
  mk('cAno', { type: 'bar', data: { labels: anos.map((a, i) => parc[i] ? a + '*' : String(a)), datasets: [{ label: 'Transações', data: anos.map(a => am[a]), backgroundColor: parc.map(p => p ? '#a5b4c8' : '#1e3a5f'), borderRadius: 6 }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${num(c.parsed.y)} transações` + (parc[c.dataIndex] ? ` (só ${MESES[parc[c.dataIndex][0] - 1]}–${MESES[parc[c.dataIndex][1] - 1]})` : '') } } } } });
  const nParc = anos.map((a, i) => parc[i] ? `${a} (só ${MESES[parc[i][0] - 1].toLowerCase()} a ${MESES[parc[i][1] - 1].toLowerCase()})` : null).filter(Boolean);
  $('anoNota').textContent = nParc.length ? `* Ano incompleto na base: ${nParc.join('; ')}. A barra é menor por isso, não por queda nas vendas.` : '';
  renderRank();
}
function kpiAjuda() {   // explicação do cartão "descontada a inflação", aberta abaixo dos cartões (não estica a linha)
  const el = $('kpiAjuda'), on = !!(IDX && kpiReal.aberto && kpiReal.tip);
  el.classList.toggle('hidden', !on); if (on) el.innerHTML = kpiReal.tip;
}
const pct1 = v => v.toFixed(1).replace('.', ',') + '%';

// ---------- Visão geral: gráfico do R$/m² com uma linha por faixa de metragem ----------
const FX_K = 'imobrj_faixas', FX_MAX = 8;
const FX_CORES = ['#1e3a5f', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9', '#db2777', '#65a30d', '#78716c'];
let FX = (() => {
  try { const j = JSON.parse(localStorage.getItem(FX_K)); if (j && Array.isArray(j.lista)) return { todas: j.todas !== false, lista: j.lista.filter(f => f.c >= 10).slice(0, FX_MAX) }; } catch (e) {}
  return { todas: true, lista: [{ c: 50, on: true }, { c: 70, on: true }, { c: 100, on: true }, { c: 150, on: false }] };
})();
const fxSalvar = () => { try { localStorage.setItem(FX_K, JSON.stringify(FX)); } catch (e) {} };
const fxCor = i => FX_CORES[i % FX_CORES.length];
function fxAdicionar() {
  const c = Math.round(+$('fxNova').value);
  if (!(c >= 10 && c <= 5000)) return toast('Digite uma metragem entre 10 e 5.000 m².');
  const ja = FX.lista.find(f => f.c === c);
  if (ja) ja.on = true;
  else { if (FX.lista.length >= FX_MAX) return toast(`Máximo de ${FX_MAX} faixas. Remova uma (×) para adicionar outra.`); FX.lista.push({ c, on: true }); FX.lista.sort((a, b) => a.c - b.c); }
  $('fxNova').value = ''; fxSalvar(); render();
}
function renderFaixasBox() {
  const chip = (on, cor, txt, attrs, del = '') => `<span class="inline-flex items-center rounded-full border ${on ? 'bg-white border-gray-300 text-ink' : 'bg-gray-50 border-gray-200 text-gray-400'}">
    <button type="button" ${attrs} class="inline-flex items-center gap-1.5 pl-2.5 ${del ? 'pr-1' : 'pr-2.5'} py-1 font-semibold" aria-pressed="${on}">
      <span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${on ? cor : '#d1d5db'}"></span>${txt}</button>${del}</span>`;
  $('fxBox').innerHTML = `<span class="text-gray-500 mr-1">Mostrar:</span>` +
    chip(FX.todas, COLORS[0], 'Todas as metragens', 'data-fx="todas"') +
    FX.lista.map((f, i) => chip(f.on, fxCor(i), `${num(f.c)} m² <span class="font-normal text-gray-500">(${faixaTxt(f.c).replace(' m²', '')})</span>`, `data-fx="${i}"`,
      `<button type="button" class="fxDel pr-2 pl-0.5 py-1 text-gray-400 hover:text-red-600" data-i="${i}" aria-label="Remover faixa de ${num(f.c)} m²">×</button>`)).join('') +
    `<span class="inline-flex items-center gap-1"><input id="fxNova" type="number" inputmode="numeric" min="10" step="1" placeholder="m²" class="sel w-20 text-right py-1" aria-label="Nova metragem">
      <button type="button" id="fxAdd" class="rounded-full bg-brand-500 hover:bg-brand-600 text-white font-semibold px-2.5 py-1"><i class="fa-solid fa-plus mr-1"></i>Faixa</button></span>
    <span class="basis-full text-[11px] text-gray-400">Cada faixa usa as vendas com a metragem escolhida <b>± ${FAIXA_TOL} m²</b>. Toque numa faixa para mostrar ou esconder a linha.</span>`;
}
function renderPrecoFaixas(sc, md, lastT) {
  renderFaixasBox();
  const axis = makeAxis(B), labels = axis.map(keyLabel), ativas = FX.lista.map((f, i) => ({ ...f, i })).filter(f => f.on);
  const todas = FX.todas || !ativas.length, ds = [];
  if (todas) { const s = series(sc, axis, md); ds.push(lineDs(md ? 'Todas as metragens (mediana)' : 'Todas as metragens (média)', s.map(p => p?.m2 ?? null), COLORS[0],
    ativas.length ? { borderWidth: 2.5, _n: s.map(p => p?.n ?? null) } : { fill: true, backgroundColor: 'rgba(239,75,63,.10)', _n: s.map(p => p?.n ?? null) })); }
  const gs = ativas.length ? areasEscopo() : null, carregando = ativas.length && !gs && AREAS_ST !== 'erro';
  const resumo = [];
  if (gs) {
    const u12 = gs.filter(g => g.t > lastT - 12), base12 = todas ? agg(sc.filter(r => r.t > lastT - 12), tsub(md, g => g.t > lastT - 12)) : null;
    for (const f of ativas) {
      const [lo, hi] = faixaDe(f.c), s = seriesFaixa(gs, axis, lo, hi);
      ds.push(lineDs(`${num(f.c)} m² (${faixaTxt(f.c)})`, s.map(p => p?.m2 ?? null), fxCor(f.i), { _n: s.map(p => p?.n ?? null) }));
      const r12 = medFaixa(u12, lo, hi);
      resumo.push({ cor: fxCor(f.i), nome: `${num(f.c)} m² <span class="hidden sm:inline text-gray-400">(${faixaTxt(f.c)})</span>`, n: r12?.n || 0, m2: r12?.m2 ?? null, vs: r12?.m2 && base12?.m2 ? (r12.m2 / base12.m2 - 1) * 100 : null });
    }
    if (todas && base12) resumo.unshift({ cor: COLORS[0], nome: 'Todas as metragens', n: base12.n, m2: base12.m2, vs: null });
  }
  $('tPreco').textContent = (md ? 'Preço mediano por m² ao longo do tempo' : 'Preço médio por m² ao longo do tempo (rua: média)') + (ativas.length ? ', por faixa de metragem' : '');
  mk('cPreco', { type: 'line', data: { labels, datasets: ds },
    options: { plugins: { legend: { display: ds.length > 1, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
      tooltip: { callbacks: { label: c => { const n = c.dataset._n?.[c.dataIndex]; return `${c.dataset.label}: ${brl(c.parsed.y)}/m²` + (n ? ` · ${num(n)} venda${n > 1 ? 's' : ''}` : ''); } } } },
      scales: { y: yBRL } } });
  const aviso = carregando ? '<p class="text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Carregando as vendas por metragem…</p>'
    : ativas.length && AREAS_ST === 'erro' && S.lvl !== 'rua' ? '<p class="text-amber-700">Não foi possível carregar areas.json; as linhas por faixa não estão disponíveis.</p>' : '';
  $('fxResumo').innerHTML = aviso + (resumo.length ? `<div class="overflow-x-auto"><table class="w-full"><thead class="text-left text-gray-500 border-b"><tr>
      <th class="py-1.5 pr-3 font-medium">Últimos 12 meses</th><th class="pr-3 font-medium">Vendas</th><th class="pr-3 font-medium">R$/m² ${md ? 'mediano' : 'médio'}</th><th class="font-medium">vs. todas</th></tr></thead><tbody>
      ${resumo.map(r => `<tr class="border-b last:border-0"><td class="py-1.5 pr-3"><span class="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style="background:${r.cor}"></span>${r.nome}</td>
        <td class="pr-3">${num(r.n)}</td><td class="pr-3">${r.m2 == null ? `<span class="text-gray-400">${r.n ? 'poucas vendas' : 'sem vendas'}</span>` : brl(r.m2)}</td><td class="${pctColor(r.vs)}">${r.vs == null ? '—' : pct(r.vs)}</td></tr>`).join('')}</tbody></table></div>
      <p class="text-[11px] text-gray-400 mt-1">Faixas: mediana do R$/m² das vendas integrais na faixa; períodos com menos de ${MED_MIN} vendas ficam em branco no gráfico${S.lvl === 'rua' ? ' (numa rua isolada, use Agrupar: Trimestral)' : ''}.</p>` : '');
}

function renderRank() {
  const sc = inScope(B), porBairro = S.lvl === 'cidade', metric = $('rankMetric').value;
  const grp = {}; // rua dentro do bairro, ou bairro na cidade
  for (const r of sc) { const g = porBairro ? r.bairro : pretty(r.logradouro); (grp[g] ||= []).push(r); }
  const minN = porBairro ? 30 : 5;
  const mdB = porBairro && MED ? (() => { const m = new Map(); for (const g of MB) (m.get(g.nb) || m.set(g.nb, []).get(g.nb)).push(g); return m; })() : null;
  const items = Object.entries(grp).map(([name, rs]) => ({ name, ...agg(rs, mdB ? mdB.get(rs[0].nb) || [] : undefined) })).filter(x => metric === 'n' || (x.n >= minN && x.m2 != null))
    .sort((a, b) => b[metric] - a[metric]).slice(0, 10);
  $('rankTitle').textContent = `Top 10 ${porBairro ? 'bairros' : 'ruas do bairro'} por ${metric === 'm2' ? (mdB ? 'preço/m² (mediana)' : 'preço/m² (média)') : 'volume'}`;
  $('rankNota').textContent = metric === 'm2' ? `Só entram ${porBairro ? 'bairros' : 'ruas'} com ${minN} ou mais vendas no período escolhido, para evitar preços de amostras muito pequenas.` : '';
  mk('cRank', { type: 'bar', data: { labels: items.map(i => i.name), datasets: [{ data: items.map(i => metric === 'm2' ? i.m2 : i.n), backgroundColor: '#ef4b3f', borderRadius: 6 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: metric === 'm2' ? yBRL : {} } } });
}

function renderCompare(sc) {
  const lastT = minmax(B, r => r.t)[1], axis = makeAxis(B);
  const useIpca = !!IDX && $('cmpIpca').checked, useCdi = !!IDX && $('cmpCdi').checked;
  $('cmpMode').querySelector('option[value="real"]').disabled = !IDX;
  let mode = $('cmpMode').value; if (mode === 'real' && !IDX) mode = 'abs';
  if (useIpca || useCdi) mode = 'idx';                       // IPCA/CDI só fazem sentido em base 100
  $('idxNote').textContent = IDX
    ? `Índices oficiais (Banco Central/SGS): IPCA (IBGE) até ${ymLabel(IDX.fim.ipca)}; CDI (B3) até ${ymLabel(IDX.fim.cdi)}; disponíveis desde ${ymLabel(IDX.ini)}. Veja detalhes em “Dados e metodologia”.`
    : 'Índices IPCA/CDI indisponíveis. Rode scripts/atualizar_indices.py para gerar public/indices.json (instruções no README).';
  $('cmpIpca').disabled = $('cmpCdi').disabled = !IDX;

  const bairroNome = nb => BAIRROS.find(b => b.nb === nb)?.nome;
  const mercados = [{ nome: 'Cidade do RJ', rows: B, md: medScope({ lvl: 'cidade' }), cor: '#94a3b8' }];
  if (S.lvl !== 'cidade') mercados.push({ nome: 'Bairro ' + bairroNome(S.nb), rows: inScope(B, { lvl: 'bairro', nb: S.nb }), md: medScope({ lvl: 'bairro', nb: S.nb }), cor: COLORS[1] });
  if (S.lvl === 'rua') mercados.push({ nome: S.label + ' (média)', rows: sc, md: null, cor: COLORS[0] });
  const ex = $('cmpExtra').value; if (ex && !(S.lvl !== 'cidade' && S.nb === ex)) mercados.push({ nome: 'Bairro ' + bairroNome(ex), rows: inScope(B, { lvl: 'bairro', nb: ex }), md: medScope({ lvl: 'bairro', nb: ex }), cor: COLORS[2] });

  const tk = k => F.gran === 3 ? 3 * k + 1 : k;                // mês representativo de cada período do eixo
  const tRef = IDX ? Math.min(lastT, IDX.fim.ipca) : null;     // mês de referência dos "valores de hoje"
  const ds = mercados.map(m => {
    let y = series(m.rows, axis, m.md).map(p => p?.m2 ?? null);
    if (mode === 'idx') { const base = y.find(v => v != null); y = y.map(v => v == null ? null : v / base * 100); }
    if (mode === 'real') y = y.map((v, i) => { const f = v == null ? null : fator('ipca', tk(axis[i]), tRef); return f == null ? null : v * f; });
    return lineDs(m.nome, y, m.cor, { borderWidth: m.nome.startsWith(S.label) || m.nome.startsWith('Bairro') ? 2.5 : 2 });
  });
  if (useIpca || useCdi) {                                     // referências ancoradas no 1º período do local em foco
    const foco = series(S.lvl === 'cidade' ? B : sc, axis, medScope()).map(p => p?.m2 ?? null), k0 = foco.findIndex(v => v != null), t0 = tk(axis[k0]);
    const ref = (nome, rot, cor) => lineDs(rot, axis.map((k, i) => { if (i < k0) return null; const f = fator(nome, t0, tk(k)); return f == null ? null : f * 100; }), cor, { borderDash: [6, 4], borderWidth: 2.2 });
    if (useIpca) ds.push(ref('ipca', 'IPCA (inflação)', '#111827'));
    if (useCdi) ds.push(ref('cdi', 'CDI', '#d97706'));
  }
  const ytxt = mode === 'idx' ? 'Base 100 = 1º período' + (useIpca || useCdi ? ' do local em foco' : '') : mode === 'real' ? `R$/m² em valores de ${ymLabel(tRef)} (IPCA)` : null;
  mk('cCmp', { type: 'line', data: { labels: axis.map(keyLabel), datasets: ds }, options: { interaction: { mode: 'index', intersect: false },
    scales: { y: mode === 'idx' ? { title: { display: true, text: ytxt } } : { ...yBRL, title: ytxt ? { display: true, text: ytxt } : undefined } } } });

  const u12 = r => r.t > lastT - 12, cid = agg(B.filter(u12), tsub(medScope({ lvl: 'cidade' }), u12));
  $('cmpTable').innerHTML = mercados.map(m => {
    const a12 = agg(m.rows.filter(u12), tsub(m.md, u12)), v = var12(m.rows, lastT, m.md), d = a12?.m2 && cid?.m2 ? (a12.m2 / cid.m2 - 1) * 100 : null;
    return `<tr class="border-b last:border-0"><td class="py-2 font-medium"><span class="inline-block w-2.5 h-2.5 rounded-full mr-2" style="background:${m.cor}"></span>${m.nome}</td>
      <td>${brl(a12?.m2)}</td><td>${brl(a12?.valor)}</td><td>${num(a12?.n)}</td><td class="${pctColor(v)}">${pct(v)}</td><td class="${pctColor(d)}">${m.nome === 'Cidade do RJ' ? '—' : pct(d)}</td></tr>`;
  }).join('');
  renderIdxTables(mercados);

  const foco = S.lvl === 'cidade' ? null : agg(sc.filter(u12), tsub(medScope(), u12));
  const d = foco?.m2 && cid?.m2 ? (foco.m2 / cid.m2 - 1) * 100 : null;
  const qual = usaMediana() ? 'mediana' : 'média', qualCid = MED ? 'mediana' : 'média';
  $('cmpBanner').innerHTML = d == null ? '' : `<div class="card flex items-center gap-3 ${d > 0 ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}">
    <i class="fa-solid ${d > 0 ? 'fa-arrow-up' : 'fa-arrow-down'} text-xl"></i>
    <p><b>${S.label}</b> está <b>${Math.abs(d).toFixed(1).replace('.', ',')}% ${d > 0 ? 'acima' : 'abaixo'}</b> da ${qualCid} da cidade nos últimos 12 meses (${qual} ${brl(foco.m2)}/m² vs ${brl(cid.m2)}/m²).</p></div>`;
}

// ---------- Comparação com IPCA/CDI na janela escolhida pelo usuário (filtros De/Até) ----------
// Compara a média de R$/m² dos primeiros w meses com a dos últimos w meses da janela (w = 12 em janelas de 3+ anos; menor em janelas curtas)
// e acumula IPCA/CDI entre os pontos médios dessas duas faixas. Exige ao menos 6 meses de dados.
function janelaIdx(rows, md) {
  if (!IDX || !rows.length) return null;
  const [t0, t1] = minmax(rows, r => r.t), L = t1 - t0 + 1;
  if (L < 6) return { t0, t1, curta: true };
  const w = Math.min(12, Math.floor(L / 3));
  const p0 = r => r.t < t0 + w, p1 = r => r.t > t1 - w;
  const a0 = agg(rows.filter(p0), tsub(md, p0)), a1 = agg(rows.filter(p1), tsub(md, p1));
  if (!a0?.m2 || !a1?.m2) return { t0, t1, curta: true };
  const c0 = Math.ceil(t0 + (w - 1) / 2), c1 = Math.ceil(t1 - (w - 1) / 2);
  return { t0, t1, w, L, med: !!md, nominal: (a1.m2 / a0.m2 - 1) * 100, ipca: fator('ipca', c0, c1), cdi: fator('cdi', c0, c1) };
}
function kpiReal(j) {
  const card = (val, cls, sub, tip) => `<div class="card"><div class="flex items-start justify-between gap-1 text-xs text-gray-500 mb-1"><span><i class="fa-solid fa-scale-balanced mr-1"></i>No período, descontada a inflação</span>
    <button type="button" class="kHelp text-gray-400 hover:text-brand-600" aria-label="Como ler este número?"><i class="fa-regular fa-circle-question"></i></button></div>
    <div class="text-xl font-bold ${cls}">${val}</div><div class="text-xs text-gray-400 mt-0.5">${sub}</div></div>` + (kpiReal.tip = tip, '');
  if (!j || j.curta) return card('—', 'text-gray-500', 'período curto', 'Escolha um período de pelo menos 6 meses de dados para comparar com IPCA e CDI.');
  const real = ganho(j.nominal, j.ipca), vsCdi = ganho(j.nominal, j.cdi);
  if (real == null) return card('—', 'text-gray-500', `${ymLabel(j.t0)}–${ymLabel(j.t1)}`, 'Os índices (IPCA/CDI) não cobrem todo este período. Rode scripts/atualizar_indices.py para estendê-los.');
  const tip = `Quanto o R$/m² subiu <b>acima da inflação</b> (ou abaixo, se negativo) de <b>${ymLabel(j.t0)} a ${ymLabel(j.t1)}</b>, o período dos filtros “De” e “Até” (${j.med ? 'medianas' : 'médias'} de ${j.w} meses nas pontas). É diferente do cartão “Últimos 12 meses”, que olha só o último ano e não desconta a inflação.<br>Imóvel (nominal): ${pct(j.nominal)} · IPCA: ${pct(fatorPct(j.ipca))}<br>` +
    (vsCdi == null ? '' : `CDI no mesmo período: ${pct(fatorPct(j.cdi))} → o imóvel ficou ${Math.abs(vsCdi).toFixed(1).replace('.', ',')}% ${vsCdi >= 0 ? 'acima' : 'abaixo'} do CDI. `) +
    'CDI é bruto de IR; o imóvel tem custos e pode render aluguel (não incluídos).';
  return card(pct(real), pctColor(real), `${ymLabel(j.t0)}–${ymLabel(j.t1)}`, tip);
}
function renderIdxTables(mercados) {
  const box = $('idxCards'); if (!IDX) { box.innerHTML = ''; return; }
  const cel = (v, cor = true) => `<td class="${cor ? pctColor(v) : ''}">${pct(v)}</td>`;
  const bolinha = m => `<span class="inline-block w-2.5 h-2.5 rounded-full mr-2" style="background:${m.cor}"></span>`;
  const linhas = mercados.map(m => {
    const j = janelaIdx(m.rows, m.md);
    if (!j || j.curta) return `<tr class="border-b last:border-0"><td class="py-2 font-medium">${bolinha(m)}${m.nome}</td><td colspan="6" class="text-gray-400">Menos de 6 meses de dados neste período: sem comparação confiável</td></tr>`;
    return `<tr class="border-b last:border-0"><td class="py-2 font-medium">${bolinha(m)}${m.nome}</td><td class="text-xs text-gray-500">${ymLabel(j.t0)}–${ymLabel(j.t1)} (${m.md ? 'medianas' : 'médias'} de ${j.w} m)</td>
      ${cel(j.nominal)}${cel(fatorPct(j.ipca), false)}${cel(fatorPct(j.cdi), false)}${cel(ganho(j.nominal, j.ipca))}${cel(ganho(j.nominal, j.cdi))}</tr>`;
  }).join('');
  const aviso = 'Referências oficiais: IPCA (IBGE) e CDI (B3), via Banco Central. O CDI é bruto (antes de Imposto de Renda); o imóvel tem custos (ITBI, corretagem, IPTU, condomínio) e pode render aluguel, que não entram aqui. O R$/m² de cada mês mistura imóveis diferentes, então não é a valorização de um imóvel específico. Não é recomendação de investimento.';
  box.innerHTML = `<div class="card overflow-x-auto"><h3 class="font-bold">Imóvel × IPCA × CDI no período selecionado</h3>
    <p class="text-xs text-gray-500 mb-3">Acompanha os filtros “De” e “Até”. Compara a mediana (média, no caso de rua) dos primeiros com a dos últimos meses do período (12 meses em períodos de 3 anos ou mais; menos em períodos curtos, o que deixa o número mais sensível a oscilações) e acumula IPCA e CDI entre os pontos médios.</p>
    <table class="w-full text-sm min-w-[760px]"><thead class="text-left text-gray-500 border-b"><tr><th class="py-2">Mercado</th><th>Período</th><th>Imóvel (nominal)</th><th>IPCA</th><th>CDI</th><th>Imóvel real (acima do IPCA)</th><th>Imóvel vs CDI</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <p class="text-xs text-gray-500 px-1">${aviso}</p>`;
}

let TREND_UN = 'm2';                 // gráfico da tendência em 'm2' (R$/m²) ou 'imovel' (R$ do imóvel com a área escolhida)
const TREND_HELP = new Set();         // explicações abertas (continuam abertas ao redesenhar)
const TREND_AJUDA = {
  hDir: 'Leitura da inclinação da linha de tendência do R$/m² (bairro e cidade: mediana; rua: média). <b>Alta</b> se a tendência sobe mais de 2% ao ano, <b>Queda</b> se cai mais de 2% ao ano; entre os dois, <b>Estável</b>.',
  hVar: 'Quanto a linha de tendência sobe (ou cai) por ano em relação ao valor atual dela. É uma aproximação linear, em reais correntes (nominal). Comparamos com o IPCA do mesmo período: a <b>variação real</b> = (1 + nominal) ÷ (1 + IPCA) − 1 mostra o quanto o preço subiu <b>acima</b> (ou abaixo) do custo de vida; positiva = ganho de poder de compra.',
  hProj: 'Onde a linha de tendência estaria daqui a cerca de 12 meses se o ritmo do período continuar. É uma <b>extrapolação estatística</b>, não uma previsão nem uma avaliação profissional.',
  hR2: 'Quanto da variação dos preços a linha de tendência explica. Perto de 100% = tendência clara e regular; baixo = série que oscila muito: desconfie da direção e da projeção. Mede só o encaixe no passado; não é a chance de a projeção acertar.'
};
const kTrendT = k => F.gran === 3 ? 3 * k + 1 : k;   // mês representativo de cada período do eixo
// IPCA anualizado entre os meses t0 e t1 (recortado ao que o indices.json cobre); null se < 12 meses
function ipcaAA(t0, t1) {
  if (!IDX?.ipca) return null;
  const a = Math.max(t0, IDX.ini ?? t0), b = Math.min(t1, IDX.fim.ipca);
  if (b - a < 12) return null;
  const f = fator('ipca', a, b); return f == null ? null : { aa: (Math.pow(f, 12 / (b - a)) - 1) * 100, t0: a, t1: b };
}
function renderTrend(sc) {
  const area = areaGet(), [flo, fhi] = faixaDe(area);
  $('tFaixaTxt').textContent = faixaTxt(area);
  const usaFx = $('tFaixa').checked, gs = usaFx ? areasEscopo() : null;
  if (usaFx && !gs && AREAS_ST !== 'erro') {
    $('trendKpis').innerHTML = `<div class="card col-span-full text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Carregando as vendas por metragem…</div>`;
    $('tAreaInfo').innerHTML = ''; return;
  }
  const fx = usaFx && !!gs;
  const axis = makeAxis(B), s = fx ? seriesFaixa(gs, axis, flo, fhi) : series(sc, axis, medScope()), y = s.map(p => p?.m2 ?? null), reg = regress(y);
  const H = Math.round(perYear()), ext = Array.from({ length: H }, (_, i) => axis.at(-1) + i + 1), labels = [...axis, ...ext].map(keyLabel);
  const med = fx || usaMediana();
  if (+$('tArea').value !== area && document.activeElement !== $('tArea')) $('tArea').value = area;
  if (!reg) {
    $('trendKpis').innerHTML = `<div class="card col-span-full text-gray-500">Poucos períodos com dados (mín. 6) para calcular tendência${fx ? ` com vendas de ${faixaTxt(area)}` : ''}. Tente agrupar por <b>Trimestral</b>${fx ? ', desmarcar <b>“Só vendas de…”</b>' : ''} ou ampliar o intervalo/local.</div>`;
    $('tAreaInfo').innerHTML = '';
    Object.values(charts).forEach(c => c.destroy()); return;
  }
  const last = y.length - 1, line = labels.map((_, i) => reg.icpt + reg.slope * i);
  const fitLast = line[last], annual = reg.slope * perYear() / fitLast * 100, proj = line[last + H];
  const proje = labels.map((_, i) => i >= last ? line[i] : null); proje[last] = y.filter(v => v != null).at(-1) === y[last] ? y[last] : line[last];
  const dir = annual > 2 ? ['Alta', 'text-emerald-600', 'fa-arrow-trend-up'] : annual < -2 ? ['Queda', 'text-red-600', 'fa-arrow-trend-down'] : ['Estável', 'text-gray-600', 'fa-minus'];
  // inflação na mesma janela da série (1º ao último período com dado) e nos últimos 12 meses
  const iDados = y.map((v, i) => v == null ? null : i).filter(i => i != null);
  const ip = ipcaAA(kTrendT(axis[iDados[0]]), kTrendT(axis[iDados.at(-1)]));
  const ip12 = IDX?.fim?.ipca != null ? fatorPct(fator('ipca', IDX.fim.ipca - 12, IDX.fim.ipca)) : null;
  const f1 = v => v.toFixed(1).replace('.', ',');
  let varSub;
  if (ip == null) varSub = '<span class="text-gray-400">nominal · índice de inflação indisponível</span>';
  else {
    const real = ((1 + annual / 100) / (1 + ip.aa / 100) - 1) * 100;
    const txt = Math.abs(real) < 0.5 ? '<span class="text-gray-600 font-semibold">em linha com a inflação</span>'
      : `<span class="${real > 0 ? 'text-emerald-600' : 'text-red-600'} font-semibold">${pct(real)} ${real > 0 ? 'acima' : 'abaixo'} da inflação</span>`;
    varSub = `nominal · IPCA ${f1(ip.aa)}% a.a. (${ymLabel(ip.t0)}–${ymLabel(ip.t1)})${ip12 != null ? ` · 12 meses: ${f1(ip12)}%` : ''}<br>${txt}`;
  }
  const k = (id, l, v, c = '', sub = '') => `<div class="card"><div class="flex items-start justify-between gap-1 text-xs text-gray-500 mb-1"><span>${l}</span>
      <button type="button" class="tHelp text-gray-400 hover:text-brand-600" data-for="${id}" aria-label="O que é ${l}?"><i class="fa-regular fa-circle-question"></i></button></div>
      <div class="text-xl font-bold ${c}">${v}</div>${sub ? `<div class="text-[11px] text-gray-500 mt-1 leading-snug">${sub}</div>` : ''}
      <p id="${id}" class="${TREND_HELP.has(id) ? '' : 'hidden'} text-xs text-gray-600 bg-[#f6f3ef] rounded-lg p-2 mt-2 leading-relaxed">${TREND_AJUDA[id]}</p></div>`;
  const projLbl = keyLabel(ext.at(-1));
  $('trendKpis').innerHTML = k('hDir', 'Direção', `<i class="fa-solid ${dir[2]} mr-1"></i>${dir[0]}`, dir[1], `${med ? 'mediana' : 'média'} do R$/m²${fx ? ` · ${faixaTxt(area)}` : ''}`) +
    k('hVar', 'Variação anual estimada', pct(annual) + ' a.a.', pctColor(annual), varSub) +
    k('hProj', `Projeção p/ ${projLbl}`, brl(proj) + '/m²', '', `≈ ${brl(proj * area)} para ${num(area)} m²`) +
    k('hR2', 'Regularidade (R²)', (reg.r2 * 100).toFixed(0) + '%', '', reg.r2 >= 0.7 ? 'tendência clara' : reg.r2 >= 0.4 ? 'tendência moderada' : 'série oscilante');
  $('tAreaInfo').innerHTML = `Imóvel de <b>${num(area)} m²</b>: pela linha de tendência, hoje ≈ <b>${brl(fitLast * area)}</b> (${brl(fitLast)}/m²) · projeção p/ ${projLbl} ≈ <b>${brl(proj * area)}</b>` +
    (fx ? ` <span class="text-gray-500">· só vendas de ${faixaTxt(area)}</span>` : med ? ' <span class="text-gray-500">· todas as metragens</span>' : ' <span class="text-amber-700">· na rua o R$/m² é média (poucas vendas), não mediana</span>');
  const un = TREND_UN === 'imovel', mult = v => v == null ? null : un ? v * area : v;
  $('tTrendTit').textContent = un ? `Tendência e projeção do valor de um imóvel de ${num(area)} m²` : 'Tendência e projeção de preço/m²';
  const nomeSerie = (med ? 'R$/m² (mediana' : 'R$/m² (média') + (fx ? `, ${faixaTxt(area)})` : ')') + (un ? ` × ${num(area)} m²` : '');
  mk('cTrend', { type: 'line', data: { labels, datasets: [
    lineDs(nomeSerie, [...y, ...ext.map(() => null)].map(mult), COLORS[0], { pointRadius: 2 }),
    lineDs('Média móvel (3)', [...movAvg(y), ...ext.map(() => null)].map(mult), '#14b8a6', { borderWidth: 1.5 }),
    lineDs('Tendência linear', line.slice(0, last + 1).concat(ext.map(() => null)).map(mult), '#64748b', { borderDash: [4, 4], borderWidth: 1.5 }),
    lineDs('Projeção', proje.map(mult), '#f59e0b', { borderDash: [8, 4] })] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: yBRL } } });
  for (const id of ['hTrend', 'hSaz']) $(id).classList.toggle('hidden', !TREND_HELP.has(id));

  const sm = Array(12).fill(0), yrs = Array.from({ length: 12 }, () => new Set());
  sc.forEach(r => { sm[r.mes - 1] += r.transacoes; yrs[r.mes - 1].add(r.ano); });
  mk('cSaz', { type: 'bar', data: { labels: MESES, datasets: [{ label: 'Média de transações', data: sm.map((v, i) => v / (yrs[i].size || 1)), backgroundColor: '#14b8a6', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } } } });
}

// ---------- Busca, CEP (ViaCEP) e autocomplete ----------
function suggest(q) {
  const box = $('suggest'), cep = q.replace(/\D/g, '');
  if (/^\d{5}-?\d{0,3}$/.test(q.trim()) && cep.length >= 5) {
    box.innerHTML = `<div class="px-4 py-3 text-sm text-gray-600"><i class="fa-solid fa-location-dot mr-2 text-brand-600"></i>${cep.length === 8 ? 'Pressione Enter para buscar o CEP ' + cep.replace(/(\d{5})(\d{3})/, '$1-$2') : 'Continue digitando o CEP…'}</div>`;
    return box.classList.remove('hidden');
  }
  const toks = strip(q).split(' ').filter(Boolean); if (!toks.length) return box.classList.add('hidden');
  const m = list => list.filter(x => toks.every(t => x.q.includes(t)));
  const bs = m(BAIRROS).slice(0, 4), rs = m(RUAS).slice(0, 8);
  box.innerHTML = [...bs.map(b => item('fa-map', b.nome, 'Bairro', { lvl: 'bairro', nb: b.nb, label: 'Bairro ' + b.nome })),
    ...rs.map(r => item('fa-road', r.nome, r.bairro, { lvl: 'rua', nb: r.nb, nl: r.nl, label: `${r.nome} · ${r.bairro}` }))].join('') ||
    '<div class="px-4 py-3 text-sm text-gray-500">Nada encontrado.</div>';
  box.classList.remove('hidden');
}
const item = (icon, t, sub, sc) => `<button class="sug w-full text-left px-4 py-2 hover:bg-brand-50 flex items-center gap-3 text-ink" data-sc='${JSON.stringify(sc).replace(/'/g, '&#39;')}'>
  <i class="fa-solid ${icon} text-brand-600 w-4"></i><span class="flex-1 truncate">${t}</span><span class="text-xs text-gray-400">${sub}</span></button>`;

async function buscarCEP(cep) {
  cep = cep.replace(/\D/g, ''); if (cep.length !== 8) return;
  $('btnSearch').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try {
    const d = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();
    if (d.erro) return toast('CEP não encontrado.');
    if (d.uf !== 'RJ' || !/rio de janeiro/i.test(d.localidade)) return toast(`O CEP é de ${d.localidade}/${d.uf}; a base cobre apenas a cidade do Rio.`);
    const nl = normRua(d.logradouro || ''), nb = strip(d.bairro || '');
    let cand = RUAS.filter(r => r.nl === nl);
    if (!cand.length && nl) cand = RUAS.filter(r => r.nl.includes(nl) || nl.includes(r.nl));
    const exact = cand.find(r => r.nb === nb) || cand[0];           // prefere o mesmo bairro
    const cepFmt = cep.replace(/(\d{5})(\d{3})/, '$1-$2');
    if (exact) selecionar({ lvl: 'rua', nb: exact.nb, nl: exact.nl, label: `${exact.nome} · ${exact.bairro}`, cep: cepFmt });
    else if (BAIRROS.find(b => b.nb === nb)) { toast(`Rua "${d.logradouro}" sem transações na base; mostrando o bairro ${d.bairro}.`); selecionar({ lvl: 'bairro', nb, label: 'Bairro ' + BAIRROS.find(b => b.nb === nb).nome, cep: cepFmt }); }
    else toast('Endereço do CEP não encontrado na base de transações.');
  } catch (e) { toast('Falha ao consultar o ViaCEP. Verifique sua conexão.'); }
  finally { $('btnSearch').textContent = 'Buscar'; }
}

async function carregarCEPs(sc) {   // autocompleta os CEPs de uma rua escolhida
  const nome = RUAS.find(r => r.nl === sc.nl && r.nb === sc.nb)?.nome; if (!nome || nome.length < 3) return;
  try {
    const q = encodeURIComponent(nome.replace(/^(Avenida|Rua|Estrada|Praca|Travessa|Largo|Ladeira|Beco|Caminho)\s+/i, '$1 '));
    const list = await (await fetch(`https://viacep.com.br/ws/RJ/Rio%20de%20Janeiro/${q}/json/`)).json();
    if (!Array.isArray(list) || S.nl !== sc.nl) return;
    S.ceps = list.filter(x => strip(x.bairro) === sc.nb).map(x => x.cep).slice(0, 5);
    if (S.ceps.length) render();
  } catch (e) { /* ViaCEP é opcional */ }
}

function syncSelects() {
  $('selBairro').value = S.lvl === 'cidade' ? '' : S.nb;
  const rs = S.lvl === 'cidade' ? [] : RUAS.filter(r => r.nb === S.nb).sort((a, b) => a.nome.localeCompare(b.nome));
  $('selRua').innerHTML = '<option value="">' + (rs.length ? 'Todas as ruas do bairro' : 'Rua…') + '</option>' + rs.map(r => `<option value="${r.nl}">${r.nome}</option>`).join('');
  $('selRua').disabled = !rs.length; $('selRua').value = S.lvl === 'rua' ? S.nl : '';
}
function paintPills() { document.querySelectorAll('.tipo').forEach(p => p.classList.toggle('on', p.dataset.v === F.tipo)); }

function selecionar(sc, salvar = true) {
  S = { ...sc }; $('search').value = ''; $('suggest').classList.add('hidden');
  F.gran = sc.lvl === 'rua' ? 3 : 1; $('fGran').value = F.gran;   // ruas têm poucos pontos → trimestral
  if (salvar) addHistory();
  syncSelects(); render(); if (sc.lvl === 'rua' && !sc.cep) carregarCEPs(sc);
}
function toast(msg) {
  const t = document.createElement('div'); t.textContent = msg;
  t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50';
  document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
}

// ---------- Histórico (localStorage com fallback em memória) ----------
const HK = 'imobrj_hist'; let memHist = [];
const getHist = () => { try { return JSON.parse(localStorage.getItem(HK)) || []; } catch (e) { return memHist; } };
const setHist = h => { memHist = h; try { localStorage.setItem(HK, JSON.stringify(h)); } catch (e) {} };
function addHistory() {
  if (S.lvl === 'cidade') return;
  const h = getHist().filter(x => x.sc.label !== S.label);
  h.unshift({ sc: { lvl: S.lvl, nb: S.nb, nl: S.nl, label: S.label, cep: S.cep }, filtros: { ...F }, ts: Date.now() });
  setHist(h.slice(0, 30)); renderChips();
}
function renderChips() {
  $('chips').innerHTML = getHist().slice(0, 5).map((h, i) => `<button data-h="${i}" class="chip bg-black/20 hover:bg-black/30 rounded-full px-3 py-1 text-white"><i class="fa-solid fa-clock-rotate-left mr-1 opacity-70"></i>${h.sc.label}</button>`).join('');
}
function renderHistory() {
  const h = getHist();
  $('histList').innerHTML = h.length ? h.map((x, i) => `<li class="py-3 flex items-center gap-3">
    <i class="fa-solid ${x.sc.lvl === 'rua' ? 'fa-road' : 'fa-map'} text-brand-600"></i>
    <button class="chip flex-1 text-left hover:underline" data-h="${i}">${x.sc.label}${x.sc.cep ? ' <span class="text-xs text-gray-400">CEP ' + x.sc.cep + '</span>' : ''}</button>
    <span class="text-xs text-gray-400">${new Date(x.ts).toLocaleString('pt-BR')}</span>
    <button class="del text-gray-400 hover:text-red-600" data-d="${i}"><i class="fa-solid fa-trash"></i></button></li>`).join('')
    : '<li class="py-8 text-center text-gray-400">Nenhuma pesquisa ainda.</li>';
  $('scopeSub').textContent = '';
}

// ---------- Eventos ----------
function bindEvents() {
  const inp = $('search');
  inp.addEventListener('input', () => {
    if (/^[\d-]+$/.test(inp.value)) { const d = inp.value.replace(/\D/g, '').slice(0, 8); inp.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }  // máscara de CEP
    suggest(inp.value);
  });
  let act = -1;
  const sugs = () => [...$('suggest').querySelectorAll('.sug')];
  const mark = i => { const l = sugs(); l.forEach(x => x.classList.remove('act')); act = l.length ? (i + l.length) % l.length : -1; if (act >= 0) { l[act].classList.add('act'); l[act].scrollIntoView({ block: 'nearest' }); } };
  inp.addEventListener('input', () => { act = -1; });
  inp.addEventListener('focus', () => { if (inp.value) suggest(inp.value); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); mark(act + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(act - 1); }
    else if (e.key === 'Escape') $('suggest').classList.add('hidden');
    else if (e.key === 'Enter') {
      if (/^\d{5}-?\d{3}$/.test(inp.value.trim())) buscarCEP(inp.value);
      else (sugs()[act] || sugs()[0])?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    }
  });
  $('btnSearch').onclick = () => inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  $('suggest').addEventListener('mousedown', e => e.preventDefault());   // mantém o foco no input
  $('suggest').addEventListener('mousedown', e => { const b = e.target.closest('.sug'); if (b) selecionar(JSON.parse(b.dataset.sc)); });
  document.addEventListener('click', e => { if (!e.target.closest('#search, #suggest')) $('suggest').classList.add('hidden'); });
  $('btnCidade').onclick = () => { S = { lvl: 'cidade', label: 'Cidade do Rio de Janeiro' }; F.gran = 1; $('fGran').value = 1; syncSelects(); render(); };

  const bind = (id, fn) => $(id).addEventListener('change', () => { fn($(id).value); render(); });
  bind('fTip', v => F.tip = v);
  bind('fDe', v => { F.de = +v; if (F.ate < F.de) { F.ate = F.de; $('fAte').value = F.ate; } });   // De depois de Até: acompanha
  bind('fAte', v => { F.ate = +v; if (F.de > F.ate) { F.de = F.ate; $('fDe').value = F.de; } });
  bind('fGran', v => F.gran = +v); bind('cmpExtra', () => {}); bind('cmpMode', v => { if (v !== 'idx') $('cmpIpca').checked = $('cmpCdi').checked = false; });   // IPCA/CDI só existem em base 100
  $('rankMetric').onchange = renderRank;
  $('kpis').addEventListener('click', e => { if (!e.target.closest('.kHelp')) return; kpiReal.aberto = !kpiReal.aberto; kpiAjuda(); });
  $('fxBox').addEventListener('click', e => {
    const d = e.target.closest('.fxDel'); if (d) { FX.lista.splice(+d.dataset.i, 1); fxSalvar(); return render(); }
    const b = e.target.closest('[data-fx]'); if (b) { if (b.dataset.fx === 'todas') FX.todas = !FX.todas; else FX.lista[+b.dataset.fx].on = !FX.lista[+b.dataset.fx].on; fxSalvar(); return render(); }
    if (e.target.closest('#fxAdd')) fxAdicionar();
  });
  $('fxBox').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'fxNova') fxAdicionar(); });
  $('cmpIpca').addEventListener('change', () => { if ($('cmpIpca').checked) $('cmpMode').value = 'idx'; render(); });
  $('cmpCdi').addEventListener('change', () => { if ($('cmpCdi').checked) $('cmpMode').value = 'idx'; render(); });
  $('selBairro').onchange = e => { const b = BAIRROS.find(x => x.nb === e.target.value); b ? selecionar({ lvl: 'bairro', nb: b.nb, label: 'Bairro ' + b.nome }) : $('btnCidade').click(); };
  $('selRua').onchange = e => { const r = RUAS.find(x => x.nb === S.nb && x.nl === e.target.value);
    r ? selecionar({ lvl: 'rua', nb: r.nb, nl: r.nl, label: `${r.nome} · ${r.bairro}` }) : selecionar({ lvl: 'bairro', nb: S.nb, label: 'Bairro ' + BAIRROS.find(x => x.nb === S.nb).nome }); };
  $('popular').addEventListener('click', e => { const p = e.target.closest('.pop'); if (p) { const b = BAIRROS.find(x => x.nb === p.dataset.nb); selecionar({ lvl: 'bairro', nb: b.nb, label: 'Bairro ' + b.nome }); } });
  document.querySelectorAll('.tipo').forEach(p => p.onclick = () => { F.tipo = p.dataset.v; syncFilters(); render(); });

  document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => irParaAba(b.dataset.tab));
  $('logo').onclick = e => { e.preventDefault(); irParaAba('overview', true, false); window.scrollTo({ top: 0, behavior: 'smooth' }); };   // logo = início, com o banner
  window.addEventListener('popstate', () => irParaAba(abaDoEndereco(), false));   // botão "voltar" troca de aba
  document.addEventListener('click', e => {
    const c = e.target.closest('.chip'), d = e.target.closest('.del');
    if (c) { const h = getHist()[+c.dataset.h]; if (h) { if (TAB === 'history') { TAB = 'overview'; marcarAba(); history.replaceState(null, '', '#' + TAB); } selecionar(h.sc, false); irParaConteudo(); } }
    if (d) { const h = getHist(); h.splice(+d.dataset.d, 1); setHist(h); renderChips(); renderHistory(); }
  });
  $('btnClear').onclick = () => { setHist([]); renderChips(); renderHistory(); };
  // aba Tendência: área compartilhada com a calculadora, unidade do gráfico e explicações (clique, funciona no celular)
  $('tArea').value = areaGet();
  $('tArea').addEventListener('input', () => { if (+$('tArea').value >= 10) { areaSet($('tArea').value); if (TAB === 'trend') render(); } });
  $('tFaixa').addEventListener('change', () => { if (TAB === 'trend') render(); });
  $('tab-trend').addEventListener('click', e => {
    const h = e.target.closest('.tHelp');
    if (h) { const el = $(h.dataset.for); el.classList.toggle('hidden'); TREND_HELP[el.classList.contains('hidden') ? 'delete' : 'add'](h.dataset.for); return; }
    const u = e.target.closest('.tUn'); if (u) { TREND_UN = u.dataset.u; document.querySelectorAll('.tUn').forEach(x => x.classList.toggle('on', x === u)); render(); }
  });
}
function renderMethodAuto() {
  const el = id => $(id); if (!el('mItbi')) return;
  if (!renderMethodAuto.tx) renderMethodAuto.tx = fetch('transacoes/index.json').then(r => r.ok ? r.json() : null).catch(() => null);
  renderMethodAuto.tx.then(j => { if (j) el('mTx').textContent = `Neste painel: ${num(j.total)} transações, ${j.ano_min}–${j.ano_max}, ${num(j.bairros.length)} bairros.`; else el('mTx').textContent = 'Ainda não publicada.'; }).catch(() => {});
  if (ROWS.length) { const [a, b] = minmax(ROWS, r => r.t);
    el('mItbi').textContent = `Neste painel: ${num(ROWS.length)} registros, ${ymLabel(a)} a ${ymLabel(b)}, ${num(BAIRROS.length)} bairros.`; }
  for (const n of ['ipca', 'cdi']) el('m' + n[0].toUpperCase() + n.slice(1)).textContent = IDX
    ? `Neste painel: ${ymLabel(minmax(IDX[n].keys())[0])} a ${ymLabel(IDX.fim[n])}` + (IDX.origem === 'bcb' ? ' (lido direto do BCB neste acesso)' : `, baixado em ${IDX.gerado_em.split('-').reverse().join('/')}`) + '.'
    : 'Ainda não carregado (rode scripts/atualizar_indices.py).';
}

function syncFilters() { paintPills(); $('fTip').value = F.tip; $('fDe').value = F.de; $('fAte').value = F.ate; $('fGran').value = F.gran; }

// ---------- Abas: endereço próprio (#aba) e rolagem até o início do conteúdo ----------
const ABAS = ['overview', 'compare', 'trend', 'tx', 'anuncios', 'calc', 'history', 'method'];
const abaDoEndereco = () => { const a = location.hash.slice(1); return ABAS.includes(a) ? a : 'overview'; };
function marcarAba() {
  document.querySelectorAll('.tab-btn').forEach(x => {
    const on = x.dataset.tab === TAB; x.classList.toggle('active', on);
    if (on) { const nav = $('tabsNav'); nav.scrollTo({ left: x.offsetLeft - (nav.clientWidth - x.offsetWidth) / 2, behavior: 'smooth' }); }
  });
}
// leva o início do conteúdo para logo abaixo do menu fixo; espera o navegador redesenhar a aba nova antes de medir
function irParaConteudo() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = $('conteudo'), alvo = el.getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle(el).scrollMarginTop);
    if (Math.abs(window.scrollY - alvo) > 4) window.scrollTo({ top: alvo, behavior: 'smooth' });
  }));
}
function irParaAba(aba, registrar = true, rolar = true) {
  if (!ABAS.includes(aba)) aba = 'overview';
  const mudou = aba !== TAB; TAB = aba; marcarAba();
  if (registrar && mudou) history.pushState(null, '', '#' + aba);   // pushState não faz a página pular (diferente de mudar location.hash)
  render(); if (rolar) irParaConteudo();
}
init();
