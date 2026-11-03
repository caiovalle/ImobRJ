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
const pct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%';
const pctColor = v => v == null ? 'text-gray-500' : v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-gray-500';
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
    start(await r.json());
  } catch (e) {
    $('loadIcon').classList.add('hidden'); $('loadMsg').textContent = 'Arquivo dados.json não carregado.';
    $('manual').classList.remove('hidden');
    $('file').onchange = ev => { const rd = new FileReader(); rd.onload = () => start(JSON.parse(rd.result)); rd.readAsText(ev.target.files[0]); };
  }
}

function start(raw) {
  ROWS = raw.map(r => ({ ...r, bairro: r.bairro.trim(), t: (r.ano - 2018) * 12 + r.mes - 1,
    nb: strip(r.bairro), nl: normRua(r.logradouro), transacoes: r.transacoes || 1 }));
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
    const [a, mm] = m.ultimo_periodo.split('-'), [y, mo, d] = m.atualizado_em.split('-');
    $('stamp').textContent = ` · dados até ${MESES[+mm - 1]}/${a} · atualizado em ${d}/${mo}/${y}`;
  }).catch(() => {});
  $('loader').classList.add('hidden');
  $('selBairro').innerHTML = '<option value="">Bairro…</option>' + BAIRROS.map(b => `<option value="${b.nb}">${b.nome}</option>`).join('');
  const pop = [...BAIRROS].sort((a, b) => b.n - a.n).slice(0, 6);
  $('popular').innerHTML = pop.map(b => `<button class="pop bg-white/20 hover:bg-white/30 rounded-full px-3 py-1 font-semibold" data-nb="${b.nb}">${b.nome}</button>`).join('');
  bindEvents(); renderChips(); render();
}

// ---------- Filtros / agregações ----------
const baseRows = () => ROWS.filter(r => (!F.tipo || r.tipo === F.tipo) && (!F.tip || r.tipologia === F.tip) && r.ano >= F.de && r.ano <= F.ate);
const inScope = (rows, sc = S) => sc.lvl === 'cidade' ? rows : rows.filter(r => r.nb === sc.nb && (sc.lvl === 'bairro' || r.nl === sc.nl));

function agg(rows) {            // médias ponderadas pelo nº de transações
  let n = 0, v = 0, m = 0, a = 0;
  for (const r of rows) { const w = r.transacoes; n += w; v += r.valor * w; m += r.valor_m2 * w; a += r.area * w; }
  return n ? { n, valor: v / n, m2: m / n, area: a / n } : null;
}
const key = t => F.gran === 3 ? Math.floor(t / 3) : t;
const perYear = () => 12 / F.gran;
const keyLabel = k => F.gran === 3 ? `T${k % 4 + 1}/${String(2018 + Math.floor(k / 4)).slice(2)}` : `${MESES[k % 12]}/${String(2018 + Math.floor(k / 12)).slice(2)}`;
function makeAxis(rows) { const ks = rows.map(r => key(r.t)); const a = Math.min(...ks), b = Math.max(...ks); return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
function series(rows, axis) {   // R$/m² ponderado por período, alinhado ao eixo (null = sem dados)
  const m = new Map();
  for (const r of rows) { const k = key(r.t), o = m.get(k) || { n: 0, s: 0 }; o.n += r.transacoes; o.s += r.valor_m2 * r.transacoes; m.set(k, o); }
  return axis.map(k => m.has(k) ? { n: m.get(k).n, m2: m.get(k).s / m.get(k).n } : null);
}
function var12(rows, lastT) {
  const a = agg(rows.filter(r => r.t > lastT - 12)), b = agg(rows.filter(r => r.t <= lastT - 12 && r.t > lastT - 24));
  return a && b ? (a.m2 / b.m2 - 1) * 100 : null;
}
function regress(ys) {          // regressão linear simples sobre pontos não nulos
  const p = ys.map((y, i) => y == null ? null : [i, y]).filter(Boolean); if (p.length < 6) return null;
  const n = p.length, mx = p.reduce((s, q) => s + q[0], 0) / n, my = p.reduce((s, q) => s + q[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  const slope = sxy / sxx, icpt = my - slope * mx; return { slope, icpt, r2: syy ? (sxy * sxy) / (sxx * syy) : 0 };
}
function movAvg(ys, w = 3) { return ys.map((_, i) => { const s = ys.slice(Math.max(0, i - w + 1), i + 1).filter(v => v != null); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; }); }

// ---------- Gráficos ----------
function mk(id, cfg) {
  if (!window.Chart) { if (!mk.warned) { mk.warned = true; toast('Chart.js não carregou (verifique a internet).'); } return; }
  charts[id]?.destroy();
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options);
  charts[id] = new Chart($(id), cfg);
}
const lineDs = (label, data, color, extra = {}) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, tension: .25, spanGaps: true, ...extra });
const yBRL = { ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') } };

function render() {
  B = baseRows();
  const sc = inScope(B);
  const has = sc.length > 0;
  $('empty').classList.toggle('hidden', has);
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + TAB || (!has && TAB !== 'history')));
  $('scopeTitle').textContent = S.label;
  if (TAB === 'history') return renderHistory();
  if (!has) return;
  $('scopeSub').innerHTML = `${num(sc.length)} registros · ${F.de}–${F.ate}` + (S.cep ? ` · <span class="text-brand-600 font-medium">CEP ${S.cep}</span>` : '') + (S.ceps?.length ? ' · CEPs: ' + S.ceps.map(c => `<span class="bg-brand-100 text-brand-900 rounded px-1.5 py-0.5 text-xs">${c}</span>`).join(' ') : '');
  ({ overview: renderOverview, compare: renderCompare, trend: renderTrend })[TAB](sc);
}

function renderOverview(sc) {
  const lastT = Math.max(...B.map(r => r.t)), a = agg(sc), v = var12(sc, lastT);
  const k = (icon, label, val, cls = '') => `<div class="card"><div class="text-xs text-gray-500 mb-1"><i class="fa-solid ${icon} mr-1"></i>${label}</div><div class="text-xl font-bold ${cls}">${val}</div></div>`;
  $('kpis').innerHTML = k('fa-handshake', 'Transações', num(a.n)) + k('fa-ruler-combined', 'Preço médio/m²', brl(a.m2)) +
    k('fa-sack-dollar', 'Valor médio', brl(a.valor)) + k('fa-vector-square', 'Área média', a.area.toFixed(0) + ' m²') +
    k('fa-arrow-trend-up', 'Variação 12m (R$/m²)', pct(v), pctColor(v));

  const axis = makeAxis(B), s = series(sc, axis);
  mk('cPreco', { type: 'line', data: { labels: axis.map(keyLabel), datasets: [lineDs('R$/m²', s.map(p => p?.m2 ?? null), COLORS[0], { fill: true, backgroundColor: 'rgba(239,75,63,.10)' })] },
    options: { plugins: { legend: { display: false } }, scales: { y: yBRL } } });

  const tm = {}; sc.forEach(r => tm[r.tipologia] = (tm[r.tipologia] || 0) + r.transacoes);
  let te = Object.entries(tm).sort((x, y) => y[1] - x[1]); const rest = te.slice(5).reduce((s, x) => s + x[1], 0);
  te = te.slice(0, 5); if (rest) te.push(['Outros', rest]);
  mk('cTip', { type: 'doughnut', data: { labels: te.map(x => x[0]), datasets: [{ data: te.map(x => x[1]), backgroundColor: COLORS }] }, options: { plugins: { legend: { position: 'bottom' } } } });

  const am = {}; sc.forEach(r => am[r.ano] = (am[r.ano] || 0) + r.transacoes);
  mk('cAno', { type: 'bar', data: { labels: Object.keys(am), datasets: [{ label: 'Transações', data: Object.values(am), backgroundColor: '#1e3a5f', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } } } });
  renderRank();
}

function renderRank() {
  const sc = inScope(B), porBairro = S.lvl === 'cidade', metric = $('rankMetric').value;
  const grp = {}; // rua dentro do bairro, ou bairro na cidade
  for (const r of sc) { const g = porBairro ? r.bairro : pretty(r.logradouro); (grp[g] ||= []).push(r); }
  const minN = porBairro ? 30 : 5;
  const items = Object.entries(grp).map(([name, rs]) => ({ name, ...agg(rs) })).filter(x => metric === 'n' || x.n >= minN)
    .sort((a, b) => b[metric] - a[metric]).slice(0, 10);
  $('rankTitle').textContent = `Top 10 ${porBairro ? 'bairros' : 'ruas do bairro'} por ${metric === 'm2' ? 'preço/m²' : 'volume'}`;
  mk('cRank', { type: 'bar', data: { labels: items.map(i => i.name), datasets: [{ data: items.map(i => metric === 'm2' ? i.m2 : i.n), backgroundColor: '#ef4b3f', borderRadius: 6 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: metric === 'm2' ? yBRL : {} } } });
}

function renderCompare(sc) {
  const lastT = Math.max(...B.map(r => r.t)), axis = makeAxis(B), mode = $('cmpMode').value;
  const bairroNome = nb => BAIRROS.find(b => b.nb === nb)?.nome;
  const mercados = [{ nome: 'Cidade do RJ', rows: B, cor: '#94a3b8' }];
  if (S.lvl !== 'cidade') mercados.push({ nome: 'Bairro ' + bairroNome(S.nb), rows: inScope(B, { lvl: 'bairro', nb: S.nb }), cor: COLORS[1] });
  if (S.lvl === 'rua') mercados.push({ nome: S.label, rows: sc, cor: COLORS[0] });
  const ex = $('cmpExtra').value; if (ex && !(S.lvl !== 'cidade' && S.nb === ex)) mercados.push({ nome: 'Bairro ' + bairroNome(ex), rows: inScope(B, { lvl: 'bairro', nb: ex }), cor: COLORS[2] });

  const ds = mercados.map(m => {
    let y = series(m.rows, axis).map(p => p?.m2 ?? null);
    if (mode === 'idx') { const base = y.find(v => v != null); y = y.map(v => v == null ? null : v / base * 100); }
    return lineDs(m.nome, y, m.cor, { borderWidth: m.nome === S.label || m.nome.startsWith('Bairro') ? 2.5 : 2 });
  });
  mk('cCmp', { type: 'line', data: { labels: axis.map(keyLabel), datasets: ds }, options: { interaction: { mode: 'index', intersect: false }, scales: { y: mode === 'abs' ? yBRL : { title: { display: true, text: 'Base 100 = 1º período' } } } } });

  const cid = agg(B.filter(r => r.t > lastT - 12));
  $('cmpTable').innerHTML = mercados.map(m => {
    const a12 = agg(m.rows.filter(r => r.t > lastT - 12)), v = var12(m.rows, lastT), d = a12 && cid ? (a12.m2 / cid.m2 - 1) * 100 : null;
    return `<tr class="border-b last:border-0"><td class="py-2 font-medium"><span class="inline-block w-2.5 h-2.5 rounded-full mr-2" style="background:${m.cor}"></span>${m.nome}</td>
      <td>${brl(a12?.m2)}</td><td>${brl(a12?.valor)}</td><td>${num(a12?.n)}</td><td class="${pctColor(v)}">${pct(v)}</td><td class="${pctColor(d)}">${m.nome === 'Cidade do RJ' ? '—' : pct(d)}</td></tr>`;
  }).join('');

  const foco = S.lvl === 'cidade' ? null : agg(sc.filter(r => r.t > lastT - 12));
  const d = foco && cid ? (foco.m2 / cid.m2 - 1) * 100 : null;
  $('cmpBanner').innerHTML = d == null ? '' : `<div class="card flex items-center gap-3 ${d > 0 ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}">
    <i class="fa-solid ${d > 0 ? 'fa-arrow-up' : 'fa-arrow-down'} text-xl"></i>
    <p><b>${S.label}</b> está <b>${Math.abs(d).toFixed(1).replace('.', ',')}% ${d > 0 ? 'acima' : 'abaixo'}</b> da média da cidade nos últimos 12 meses (${brl(foco.m2)}/m² vs ${brl(cid.m2)}/m²).</p></div>`;
}

function renderTrend(sc) {
  const axis = makeAxis(B), s = series(sc, axis), y = s.map(p => p?.m2 ?? null), reg = regress(y);
  const H = Math.round(perYear()), ext = Array.from({ length: H }, (_, i) => axis.at(-1) + i + 1), labels = [...axis, ...ext].map(keyLabel);
  if (!reg) {
    $('trendKpis').innerHTML = `<div class="card col-span-full text-gray-500">Poucos períodos com dados (mín. 6) para calcular tendência. Tente agrupar por <b>Trimestral</b> ou ampliar o intervalo/local.</div>`;
    Object.values(charts).forEach(c => c.destroy()); return;
  }
  const last = y.length - 1, line = labels.map((_, i) => reg.icpt + reg.slope * i);
  const fitLast = line[last], annual = reg.slope * perYear() / fitLast * 100, proj = line[last + H];
  const proje = labels.map((_, i) => i >= last ? line[i] : null); proje[last] = y.filter(v => v != null).at(-1) === y[last] ? y[last] : line[last];
  const dir = annual > 2 ? ['Alta', 'text-emerald-600', 'fa-arrow-trend-up'] : annual < -2 ? ['Queda', 'text-red-600', 'fa-arrow-trend-down'] : ['Estável', 'text-gray-600', 'fa-minus'];
  const k = (l, v, c = '') => `<div class="card"><div class="text-xs text-gray-500 mb-1">${l}</div><div class="text-xl font-bold ${c}">${v}</div></div>`;
  $('trendKpis').innerHTML = k('Direção', `<i class="fa-solid ${dir[2]} mr-1"></i>${dir[0]}`, dir[1]) + k('Variação anual estimada', pct(annual), pctColor(annual)) +
    k(`Projeção p/ ${keyLabel(ext.at(-1))}`, brl(proj)) + k('Confiança (R²)', (reg.r2 * 100).toFixed(0) + '%');
  mk('cTrend', { type: 'line', data: { labels, datasets: [
    lineDs('R$/m² real', [...y, ...ext.map(() => null)], COLORS[0], { pointRadius: 2 }),
    lineDs('Média móvel (3)', [...movAvg(y), ...ext.map(() => null)], '#14b8a6', { borderWidth: 1.5 }),
    lineDs('Tendência linear', line.slice(0, last + 1).concat(ext.map(() => null)), '#64748b', { borderDash: [4, 4], borderWidth: 1.5 }),
    lineDs('Projeção', proje, '#f59e0b', { borderDash: [8, 4] })] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: yBRL } } });

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
  bind('fTipo', v => F.tipo = v); bind('fTip', v => F.tip = v); bind('fDe', v => F.de = +v); bind('fAte', v => F.ate = +v);
  bind('fGran', v => F.gran = +v); bind('cmpExtra', () => {}); bind('cmpMode', () => {});
  $('rankMetric').onchange = renderRank;
  $('selBairro').onchange = e => { const b = BAIRROS.find(x => x.nb === e.target.value); b ? selecionar({ lvl: 'bairro', nb: b.nb, label: 'Bairro ' + b.nome }) : $('btnCidade').click(); };
  $('selRua').onchange = e => { const r = RUAS.find(x => x.nb === S.nb && x.nl === e.target.value);
    r ? selecionar({ lvl: 'rua', nb: r.nb, nl: r.nl, label: `${r.nome} · ${r.bairro}` }) : selecionar({ lvl: 'bairro', nb: S.nb, label: 'Bairro ' + BAIRROS.find(x => x.nb === S.nb).nome }); };
  $('popular').addEventListener('click', e => { const p = e.target.closest('.pop'); if (p) { const b = BAIRROS.find(x => x.nb === p.dataset.nb); selecionar({ lvl: 'bairro', nb: b.nb, label: 'Bairro ' + b.nome }); } });
  document.querySelectorAll('.tipo').forEach(p => p.onclick = () => { F.tipo = p.dataset.v; syncFilters(); render(); });

  document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => {
    TAB = b.dataset.tab; document.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
  });
  document.addEventListener('click', e => {
    const c = e.target.closest('.chip'), d = e.target.closest('.del');
    if (c) { const h = getHist()[+c.dataset.h]; if (h) { Object.assign(F, h.filtros); syncFilters(); TAB = TAB === 'history' ? 'overview' : TAB; document.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x.dataset.tab === TAB)); window.scrollTo({ top: 0, behavior: 'smooth' }); selecionar(h.sc, false); } }
    if (d) { const h = getHist(); h.splice(+d.dataset.d, 1); setHist(h); renderChips(); renderHistory(); }
  });
  $('btnClear').onclick = () => { setHist([]); renderChips(); renderHistory(); };
}
function syncFilters() { paintPills(); $('fTipo').value = F.tipo; $('fTip').value = F.tip; $('fDe').value = F.de; $('fAte').value = F.ate; $('fGran').value = F.gran; }

init();
