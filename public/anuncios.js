// ImobRJ — aba "Avaliar anúncio" (id anuncios): lê o que dá do LINK do anúncio (sem acessar o portal), pede o que falta,
// compara com as vendas do ITBI (prédio, rua, faixa de área, bairro), preenche a calculadora e salva para comparar.
// Usa do app.js: $, brl, num, strip, normRua, pretty, toast, areaSet, irParaAba, MESES.
// Usa do transacoes.js: TX, esc, quantil, txCarregarIndice, txCarregarBairro. Do calc.js: CALC_REF, formatMoeda, parseMoeda, CALC_EDIT.

const AN = { pronto: false, lidos: new Set(), editId: null, d: null, dArq: null, arq: null, url: '', portal: '', seq: 0, ult: null };
const AN_K = 'imobrj_anuncios';
let anMem = [];
const anGet = () => { try { return JSON.parse(localStorage.getItem(AN_K)) || []; } catch (e) { return anMem; } };
const anSet = l => { anMem = l; try { localStorage.setItem(AN_K, JSON.stringify(l)); } catch (e) {} };

const AN_TIPOS = [   // [valor, rótulo, tipologia do ITBI usada na comparação, palavras no link]
  ['apartamento', 'Apartamento', 'Apartamento', ['apartamento', 'apartamentos', 'apto']],
  ['cobertura', 'Cobertura', 'Apartamento', ['cobertura']],
  ['kitnet', 'Kitnet / studio / loft', 'Apartamento', ['kitnet', 'kitnete', 'conjugado', 'studio', 'estudio', 'loft', 'flat']],
  ['casa', 'Casa', 'Casa', ['casa', 'casas', 'sobrado']],
  ['sala', 'Sala comercial', 'Sala', ['sala', 'salas', 'conjunto']],
  ['loja', 'Loja', 'Loja', ['loja', 'lojas', 'ponto']]
];
// nomes que os portais usam e que diferem do nome do bairro no ITBI
const AN_ALIAS = { 'freguesia': 'freguesia-jacarepagua', 'recreio': 'recreio-dos-bandeirantes', 'sulacap': 'jardim-sulacap',
  'freguesia-ilha-do-governador': 'freguesia-ilha' };
const AN_PORTAIS = [['zapimoveis', 'Zap'], ['vivareal', 'VivaReal'], ['quintoandar', 'QuintoAndar'], ['olx', 'OLX'], ['imovelweb', 'Imovelweb']];
const AN_CAMPOS = ['anOp', 'anTipo', 'anBairro', 'anArea', 'anQuartos', 'anPreco', 'anCond', 'anIptu', 'anRua', 'anNum'];

// ---------- Leitura do link (só o texto do endereço; o portal não é acessado) ----------
function anLerLink(txt) {
  const bruto = String(txt || '').trim(); let url = null;
  try { url = new URL(/^https?:\/\//i.test(bruto) ? bruto : 'https://' + bruto); if (!/\./.test(url.hostname) || /\s/.test(bruto)) url = null; } catch (e) { url = null; }
  const host = url ? url.hostname.toLowerCase() : '';
  const portal = (AN_PORTAIS.find(([k]) => host.includes(k)) || [null, url ? host.replace(/^www\./, '') : ''])[1];
  let corpo = url ? decodeURIComponent(url.pathname) : bruto;
  const slug = '-' + strip(corpo.replace(/[\/_.,]+/g, ' ')).replace(/\s+/g, '-') + '-';
  const tok = slug.split('-').filter(Boolean);
  const r = { portal, url: url ? url.href.split('?')[0] : '' };
  // operação
  if (/-(aluguel|alugar|locacao|aluga)-/.test(slug)) r.op = 'aluguel';
  else if (/-(venda|comprar|compra|vende)-/.test(slug)) r.op = 'venda';
  // tipo
  for (const [v, , , pal] of AN_TIPOS) if (pal.some(p => tok.includes(p))) { r.tipo = v; break; }
  // quartos e área
  let m = slug.match(/-(\d{1,2})-(quartos?|dormitorios?|qts?|qtos?)-/); if (m) r.quartos = +m[1];
  m = slug.match(/-(\d{2,5})-?(m2|metros?)-/) || slug.match(/-(\d{2,5})m-/); if (m) r.area = +m[1];
  // preço: VivaReal põe "venda-RS350000" no link; em texto colado, "R$ 450.000"
  m = slug.match(/-rs-?(\d{3,9})-/) || (!url && bruto.match(/R\$\s*([\d.]{3,})/i)); if (m) r.preco = +String(m[1]).replace(/\D/g, '');
  // bairro: compara com os nomes dos bairros do ITBI; prefere o que vem logo antes de "zona-…" ou "rio-de-janeiro"
  const bairros = (TX.idx?.bairros || []).map(b => ({ b, s: b.arquivo.replace(/\.json$/, '') }));
  const cand = [];
  const testa = (s, b) => { let i = slug.indexOf('-' + s + '-'); while (i >= 0) { cand.push({ b, i, fim: i + s.length + 1, len: s.length }); i = slug.indexOf('-' + s + '-', i + 1); } };
  for (const x of bairros) testa(x.s, x.b);
  for (const [al, alvo] of Object.entries(AN_ALIAS)) { const b = bairros.find(x => x.s === alvo); if (b) testa(al, b.b); }
  if (cand.length) {
    const ancora = c => /^-(zona|rio-de-janeiro|rj-)/.test(slug.slice(c.fim)) ? 1 : 0;
    cand.sort((a, b) => ancora(b) - ancora(a) || b.len - a.len || a.i - b.i);
    r.arquivo = cand[0].b.arquivo;
  }
  return r;
}

// ---------- Montagem da aba ----------
function anMontar() {
  const opt = (v, t) => `<option value="${v}">${t}</option>`;
  const campo = (id, rot, html, cls = '') => `<div class="${cls}"><label for="${id}" class="text-xs font-semibold text-gray-600">${rot}</label><div class="mt-1">${html}</div><p id="${id}Tag" class="text-[11px] mt-0.5 min-h-[1rem]"></p></div>`;
  const din = (id, ph = '') => `<div class="flex items-center gap-2"><span class="text-xs text-gray-500">R$</span><input id="${id}" type="text" inputmode="numeric" data-money="1" placeholder="${ph}" class="sel w-full text-right"></div>`;
  $('tab-anuncios').innerHTML = `
    <div>
      <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight">Avaliar anúncio</h2>
      <p class="text-gray-600 mt-2 max-w-3xl">Cole o link de um anúncio do Zap, VivaReal, QuintoAndar ou OLX. O ImobRJ lê o que está escrito no próprio link (tipo, quartos, bairro, área e às vezes o preço), você completa o resto e ele compara com as <b>vendas registradas no ITBI</b> do prédio, da rua e do bairro.</p>
    </div>
    <div class="card">
      <label for="anLink" class="text-xs font-semibold text-gray-600">Link do anúncio</label>
      <div class="mt-1 flex flex-col sm:flex-row gap-2">
        <input id="anLink" type="url" autocomplete="off" placeholder="https://www.zapimoveis.com.br/imovel/…" class="sel w-full">
        <button id="anLer" class="bg-verde-500 hover:bg-verde-700 text-white font-semibold px-5 py-2 rounded whitespace-nowrap"><i class="fa-solid fa-link mr-1"></i>Ler link</button>
        <button id="anNovo" class="pill whitespace-nowrap"><i class="fa-solid fa-eraser mr-1"></i>Limpar</button>
      </div>
      <p id="anLinkInfo" class="text-xs text-gray-500 mt-2">O site não abre a página do portal: usa só o texto do link. Sem link? Preencha os campos abaixo direto.</p>
    </div>
    <div class="card">
      <h3 class="font-bold mb-3">Dados do anúncio</h3>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1">
        ${campo('anOp', 'Anúncio de', `<select id="anOp" class="sel w-full">${opt('venda', 'Venda')}${opt('aluguel', 'Aluguel')}</select>`)}
        ${campo('anTipo', 'Tipo', `<select id="anTipo" class="sel w-full">${AN_TIPOS.map(t => opt(t[0], t[1])).join('')}</select>`)}
        ${campo('anBairro', 'Bairro *', `<select id="anBairro" data-w="100%" class="sel w-full"><option value="">Carregando…</option></select>`)}
        ${campo('anArea', 'Área *', `<div class="flex items-center gap-2"><input id="anArea" type="number" inputmode="numeric" min="10" step="1" class="sel w-full text-right"><span class="text-xs text-gray-500">m²</span></div>`)}
        ${campo('anPreco', '<span id="anPrecoRot">Preço pedido *</span>', din('anPreco'))}
        ${campo('anCond', 'Condomínio (por mês)', din('anCond', 'opcional'))}
        ${campo('anIptu', 'IPTU', `<div class="flex items-center gap-2">${din('anIptu', 'opcional')}<select id="anIptuPer" class="sel text-xs">${opt('ano', 'por ano')}${opt('mes', 'por mês')}</select></div>`)}
        ${campo('anQuartos', 'Quartos', `<input id="anQuartos" type="number" inputmode="numeric" min="0" step="1" class="sel w-full text-right">`)}
        ${campo('anRua', 'Rua (se o anúncio mostrar)', `<input id="anRua" list="anRuas" autocomplete="off" placeholder="comece a digitar…" class="sel w-full"><datalist id="anRuas"></datalist>`, 'sm:col-span-2 lg:col-span-3')}
        ${campo('anNum', 'Número', `<input id="anNum" type="text" inputmode="numeric" placeholder="opcional" class="sel w-full">`)}
      </div>
      <p class="text-xs text-gray-500 mt-1"><span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1"></span>lido do link · <span class="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mx-1"></span>falta preencher (* obrigatório para comparar)</p>
    </div>
    <div id="anResultado"></div>
    <div class="card overflow-x-auto">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3"><h3 class="font-bold">Anúncios salvos</h3><span class="text-xs text-gray-500">Ficam só neste navegador.</span></div>
      <div id="anLista"></div>
    </div>
    <p class="text-xs text-gray-500">O preço do anúncio é o valor <b>pedido</b>; o ITBI registra o valor <b>declarado na venda</b>, que costuma ser menor. Use a comparação como referência, não como avaliação profissional.</p>`;

  const root = $('tab-anuncios');
  root.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'anLink') return;
    if (el.dataset.money) el.value = formatMoeda(parseMoeda(el.value)) === '0' ? '' : formatMoeda(parseMoeda(el.value));
    if (AN_CAMPOS.includes(el.id)) AN.lidos.delete(el.id);
    anAgendar();
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'anBairro') { AN.lidos.delete('anBairro'); return anTrocarBairro(); }
    if (['anOp', 'anTipo', 'anIptuPer'].includes(e.target.id)) { AN.lidos.delete(e.target.id); anAgendar(); } });
  $('anLer').onclick = () => anAplicarLink($('anLink').value);
  $('anLink').addEventListener('keydown', e => { if (e.key === 'Enter') anAplicarLink($('anLink').value); });
  $('anLink').addEventListener('paste', () => setTimeout(() => anAplicarLink($('anLink').value), 0));
  $('anNovo').onclick = () => { anLimpar(); $('anLink').focus(); };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-an]'); if (!b) return;
    const id = +b.dataset.id, acao = b.dataset.an;
    if (acao === 'simular') anSimular(AN.ult);
    else if (acao === 'salvar') anSalvar();
    else if (acao === 'sim-salvo') { const a = anGet().find(x => x.id === id); if (a) anSimular(a); }
    else if (acao === 'abrir') anAbrirSalvo(id);
    else if (acao === 'apagar') { anSet(anGet().filter(x => x.id !== id)); if (AN.editId === id) AN.editId = null; anRenderLista(); anAgendar(); }
  });
  if (window.comboMelhorar) comboMelhorar($('anBairro'));
  AN.pronto = true;
}

async function renderAnuncios() {
  if (!AN.pronto) anMontar();
  await txCarregarIndice();
  if (!TX.idx) { $('anResultado').innerHTML = '<div class="card text-sm text-red-600">A base de transações não carregou; sem ela não há com o que comparar.</div>'; return; }
  const sel = $('anBairro');
  if (sel.options.length <= 1) {
    sel.innerHTML = '<option value="">Escolha…</option>' + TX.idx.bairros.map(b => `<option value="${esc(b.arquivo)}">${esc(b.nome)}</option>`).join('');
    if (AN.arq) sel.value = AN.arq;
  }
  // local escolhido no site: preenche o bairro se o formulário ainda não tem um (ou se o local mudou em outra aba)
  if (S.lvl !== 'cidade' && S.nb !== AN.nbSite) {
    AN.nbSite = S.nb; const b = TX.idx.bairros.find(x => x.nb === S.nb);
    if (b && b.arquivo !== sel.value && !AN.editId) { sel.value = b.arquivo; await anTrocarBairro(); }
  }
  anMarcar(); anRenderLista(); anAvaliar();
}

function anLimpar() {
  AN.lidos.clear(); AN.editId = null; AN.url = ''; AN.portal = '';
  $('anLink').value = ''; $('anOp').value = 'venda'; $('anTipo').value = 'apartamento'; $('anIptuPer').value = 'ano';
  for (const id of ['anArea', 'anQuartos', 'anPreco', 'anCond', 'anIptu', 'anRua', 'anNum']) $(id).value = '';
  $('anBairro').value = ''; AN.arq = null; AN.d = null; AN.dArq = null; $('anRuas').innerHTML = '';
  $('anLinkInfo').textContent = 'O site não abre a página do portal: usa só o texto do link. Sem link? Preencha os campos abaixo direto.';
  anMarcar(); anAvaliar();
}

async function anAplicarLink(txt) {
  if (!String(txt || '').trim()) return;
  await txCarregarIndice();
  const r = anLerLink(txt);
  anLimpar(); $('anLink').value = txt.trim();
  AN.url = r.url; AN.portal = r.portal;
  const set = (id, v) => { if (v == null || v === '') return; $(id).value = id === 'anPreco' ? formatMoeda(v) : v; AN.lidos.add(id); };
  set('anOp', r.op); set('anTipo', r.tipo); set('anArea', r.area); set('anQuartos', r.quartos); set('anPreco', r.preco);
  if (r.arquivo) { $('anBairro').value = r.arquivo; AN.lidos.add('anBairro'); }
  const lidos = { anOp: 'operação', anTipo: 'tipo', anBairro: 'bairro', anArea: 'área', anQuartos: 'quartos', anPreco: 'preço' };
  const achou = Object.keys(lidos).filter(k => AN.lidos.has(k)).map(k => lidos[k]);
  const falta = ['anBairro', 'anArea', 'anPreco'].filter(k => !AN.lidos.has(k)).map(k => lidos[k]);
  $('anLinkInfo').innerHTML = (r.portal ? `<b>${esc(r.portal)}</b> · ` : '') + (achou.length ? `Lido do link: ${achou.join(', ')}.` : 'Não deu para ler nada deste link.') +
    (falta.length ? ` <span class="text-amber-700">Complete: ${falta.join(', ')}${falta.includes('preço') ? ' (está na página do anúncio)' : ''}.</span>` : '');
  await anTrocarBairro();
  const foco = ['anBairro', 'anArea', 'anPreco'].find(k => !$(k).value || (k === 'anPreco' && !parseMoeda($(k).value)));
  if (foco) $(foco).focus();
}

async function anTrocarBairro() {
  const arq = $('anBairro').value; AN.arq = arq || null; AN.d = null; AN.dArq = null; $('anRuas').innerHTML = '';
  const bs = arq && TX.idx?.bairros.find(x => x.arquivo === arq); if (bs) { localDeAba(bs.nb); AN.nbSite = S.nb; }   // vale para o site todo
  anAgendar();
  if (!arq) return;
  try { const d = await txCarregarBairro(arq); if ($('anBairro').value !== arq) return; AN.d = d; AN.dArq = arq;
    $('anRuas').innerHTML = d.ruas.filter(Boolean).map(r => `<option value="${esc(pretty(r))}">`).join(''); }
  catch (e) { AN.d = null; }
  anAgendar();
}

function anMarcar() {
  const obrig = ['anBairro', 'anArea', 'anPreco'];
  for (const id of AN_CAMPOS) {
    const el = $(id), tag = $(id + 'Tag'); if (!el || !tag) continue;
    const alvo = el.dataset.combo ? el.nextElementSibling?.querySelector('input') || el : el;   // seletor com busca: o anel vai no campo visível
    const vazio = !el.value || (el.dataset.money && !parseMoeda(el.value));
    const lido = AN.lidos.has(id), falta = obrig.includes(id) && vazio;
    alvo.classList.toggle('ring-2', lido || falta); alvo.classList.toggle('ring-emerald-400', lido); alvo.classList.toggle('ring-amber-400', !lido && falta);
    tag.className = 'text-[11px] mt-0.5 min-h-[1rem] ' + (lido ? 'text-emerald-700' : 'text-amber-700');
    tag.textContent = lido ? 'lido do link' : falta ? 'falta preencher' : '';
  }
  const alug = $('anOp').value === 'aluguel';
  $('anPrecoRot').textContent = alug ? 'Aluguel pedido (por mês) *' : 'Preço pedido *';
}

// ---------- Leitura do formulário e comparação ----------
function anForm() {
  const iptu = parseMoeda($('anIptu').value), b = TX.idx?.bairros.find(x => x.arquivo === $('anBairro').value);
  return { op: $('anOp').value, tipo: $('anTipo').value, arquivo: b?.arquivo || '', bairro: b?.nome || '', nb: b?.nb || '',
    area: +$('anArea').value || 0, quartos: $('anQuartos').value === '' ? null : +$('anQuartos').value,
    preco: parseMoeda($('anPreco').value), cond: parseMoeda($('anCond').value), iptuMes: $('anIptuPer').value === 'ano' ? iptu / 12 : iptu,
    iptu, iptuPer: $('anIptuPer').value, rua: $('anRua').value.trim(), numero: $('anNum').value.trim(), url: AN.url, portal: AN.portal };
}

function anStats(ls, de, ate) {
  if (!ls.length) return { n: 0 };
  const m2 = ls.map(l => l.valor / l.area);
  return { n: ls.length, med: quantil(m2, .5), p25: quantil(m2, .25), p75: quantil(m2, .75), de, ate };
}
// camadas do mais próximo ao mais amplo; a "referência" é a mais próxima com vendas suficientes
function anCamadas(d, a) {
  const tipNome = (AN_TIPOS.find(t => t[0] === a.tipo) || AN_TIPOS[0])[2], ti = d.tipologias.indexOf(tipNome);
  const base = d.linhas.filter(l => !l.fl && l.area > 0 && (ti >= 0 ? l.tip === ti : !l.com));
  let tMax = 0; for (const l of d.linhas) if (l.t > tMax) tMax = l.t;
  const desde = m => tMax - m, nr = a.rua ? normRua(a.rua) : '';
  let ri = -1;
  if (nr) { ri = d.ruas.findIndex(r => normRua(r) === nr); if (ri < 0) ri = d.ruas.findIndex(r => { const x = normRua(r); return x && (x.includes(nr) || nr.includes(x)) && Math.min(x.length, nr.length) >= 8; }); }
  const numero = a.numero.replace(/\D/g, '');
  const per = m => [desde(m) + 1, tMax];
  const C = [];
  if (ri >= 0 && numero) { const [de, ate] = per(36); C.push({ k: 'predio', nome: `Mesmo prédio (${pretty(d.ruas[ri])}, ${numero})`, min: 3, ...anStats(base.filter(l => l.rua === ri && l.numero.replace(/\D/g, '') === numero && l.t >= de), de, ate) }); }
  if (ri >= 0) { const [de, ate] = per(24); C.push({ k: 'rua', nome: `Mesma rua (${pretty(d.ruas[ri])})`, min: 5, ...anStats(base.filter(l => l.rua === ri && l.t >= de), de, ate) }); }
  { const [de, ate] = per(24), [lo, hi] = faixaDe(a.area); C.push({ k: 'faixa', nome: `${d.bairro}, ${faixaTxt(a.area)}`, min: 8, ...anStats(base.filter(l => l.t >= de && l.area >= lo && l.area <= hi), de, ate) }); }
  { const [de, ate] = per(12); C.push({ k: 'bairro', nome: `${d.bairro} (todo o bairro)`, min: 5, ...anStats(base.filter(l => l.t >= de), de, ate) }); }
  const ref = C.find(c => c.n >= c.min) || C.filter(c => c.n).at(-1) || null;
  return { C, ref, tip: ti >= 0 ? tipNome : 'residencial', ruaAchada: ri >= 0 ? pretty(d.ruas[ri]) : null, ruaPedida: !!nr };
}

let anTimer = null;
function anAgendar() { anMarcar(); clearTimeout(anTimer); anTimer = setTimeout(anAvaliar, 150); }

const anMesTxt = t => `${MESES[((t - 1) % 12 + 12) % 12]}/${Math.floor((t - 1) / 12)}`;
const anPctTxt = v => (v > 0 ? '+' : '') + v.toFixed(0) + '%';

function anAvaliar() {
  const box = $('anResultado'); if (!box) return;
  const a = anForm(); AN.ult = null;
  const falta = [!a.arquivo && 'bairro', !(a.area >= 10) && 'área', !a.preco && (a.op === 'aluguel' ? 'aluguel' : 'preço')].filter(Boolean);
  if (falta.length) { box.innerHTML = `<div class="card text-sm text-gray-500"><i class="fa-solid fa-circle-info mr-1"></i>Para comparar com o mercado, preencha: <b>${falta.join(', ')}</b>.</div>`; return; }
  if (!AN.d || AN.dArq !== a.arquivo) { box.innerHTML = '<div class="card text-sm text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Carregando vendas do bairro…</div>'; return; }
  const cam = anCamadas(AN.d, a), ref = cam.ref;
  const alug = a.op === 'aluguel', m2 = a.preco / a.area;
  const res = { ...a, refM2: ref?.med ?? null, refNome: ref?.nome ?? '', refN: ref?.n ?? 0, refP25: ref?.p25, refP75: ref?.p75 };
  if (!ref) { box.innerHTML = `<div class="card text-sm text-gray-600">Não há vendas recentes de ${esc(cam.tip.toLowerCase())} em ${esc(a.bairro)} para comparar.</div>`; return; }
  const valorRef = ref.med * a.area, mensal = a.cond + a.iptuMes;
  let destaque, cor, texto;
  if (!alug) {
    const dif = (m2 / ref.med - 1) * 100; res.dif = dif;
    const pos = m2 > ref.p75 ? 'acima' : m2 < ref.p25 ? 'abaixo' : 'dentro';
    cor = pos === 'acima' ? 'text-red-600' : pos === 'abaixo' ? 'text-emerald-600' : 'text-gray-800';
    destaque = `${anPctTxt(dif)} <span class="text-base font-semibold text-gray-500">vs. mediana</span>`;
    texto = `O anúncio pede <b>${brl(m2)}/m²</b>. ${esc(ref.nome)}: mediana de <b>${brl(ref.med)}/m²</b> em ${num(ref.n)} venda${ref.n > 1 ? 's' : ''} (${anMesTxt(ref.de)} a ${anMesTxt(ref.ate)}).
      O preço está <b class="${cor}">${pos === 'dentro' ? 'dentro da faixa típica' : pos + ' da faixa típica'}</b> (${brl(ref.p25)} a ${brl(ref.p75)}/m², metade das vendas fica nessa faixa).
      <br>Valor de referência para ${num(a.area)} m²: <b>${brl(valorRef)}</b> (faixa ${brl(ref.p25 * a.area)} a ${brl(ref.p75 * a.area)}).
      <br>Para comprar, conte com ITBI (${f2(CALC_REF.itbi)}%) e cartório (~${f2(CALC_REF.cartorio)}%): cerca de <b>${brl(a.preco * (1 + (CALC_REF.itbi + CALC_REF.cartorio) / 100))}</b> no total.`;
  } else {
    const y = a.preco * 12 / valorRef * 100, refY = CALC_REF.yieldAluguel; res.yield = y; res.valorRef = valorRef;
    cor = y > refY * 1.15 ? 'text-red-600' : y < refY * 0.85 ? 'text-emerald-600' : 'text-gray-800';
    destaque = `${y.toFixed(1).replace('.', ',')}% <span class="text-base font-semibold text-gray-500">ao ano do valor do imóvel</span>`;
    texto = `O imóvel vale cerca de <b>${brl(valorRef)}</b> pelas vendas do ITBI (${esc(ref.nome)}: ${brl(ref.med)}/m², ${num(ref.n)} venda${ref.n > 1 ? 's' : ''}). O aluguel pedido de ${brl(a.preco)}/mês equivale a <b>${y.toFixed(1).replace('.', ',')}% ao ano</b> desse valor; a referência é ${f2(refY)}% ao ano (média <b>nacional</b> do FipeZAP, ${CALC_REF.data}; não é um número do Rio nem do bairro).
      ${y > refY * 1.15 ? 'O aluguel pedido está <b class="text-red-600">acima</b> dessa referência para o preço do imóvel: comprar tende a compensar mais.' : y < refY * 0.85 ? 'O aluguel pedido está <b class="text-emerald-600">abaixo</b> dessa referência para o preço do imóvel: alugar tende a compensar.' : 'O aluguel pedido está <b>perto</b> dessa referência.'} Confira com outros anúncios de aluguel parecidos no bairro.`;
  }
  AN.ult = res;
  const linhas = cam.C.map(c => `<tr class="border-b last:border-0 ${c === ref ? 'bg-[#f3ebdf] font-semibold' : ''}"><td class="py-2 pr-3">${esc(c.nome)}${c === ref ? ' <span class="text-[11px] text-brand-600">referência</span>' : ''}</td>
    <td class="pr-3">${num(c.n)}${c.n && c.n < c.min ? ' <span class="text-[11px] text-amber-700">poucas</span>' : ''}</td><td class="pr-3">${c.n ? brl(c.med) : '—'}</td><td class="pr-3 whitespace-nowrap">${c.n ? brl(c.p25) + ' – ' + brl(c.p75) : '—'}</td>
    <td>${c.n && !alug ? `<span class="${m2 > c.p75 ? 'text-red-600' : m2 < c.p25 ? 'text-emerald-600' : ''}">${anPctTxt((m2 / c.med - 1) * 100)}</span>` : '—'}</td></tr>`).join('');
  const salvoTxt = AN.editId ? 'Atualizar salvo' : 'Salvar para comparar';
  box.innerHTML = `<div class="card space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div><div class="text-xs text-gray-500">${alug ? 'Rentabilidade do aluguel' : 'Preço do anúncio vs. vendas'}</div><div class="text-3xl font-extrabold ${cor}">${destaque}</div></div>
      <div class="flex flex-wrap gap-2">
        <button data-an="simular" class="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 rounded text-sm"><i class="fa-solid fa-calculator mr-1"></i>Simular comprar x alugar</button>
        <button data-an="salvar" class="pill"><i class="fa-regular fa-bookmark mr-1"></i>${salvoTxt}</button>
      </div>
    </div>
    <p class="text-sm text-gray-700 leading-relaxed">${texto}${mensal > 0 ? `<br>Condomínio + IPTU: <b>${brl(mensal)}/mês</b>${alug ? ` · total com aluguel: <b>${brl(a.preco + mensal)}/mês</b>` : ''}.` : ''}</p>
    ${cam.ruaPedida && !cam.ruaAchada ? `<p class="text-xs text-amber-700">Não achei “${esc(a.rua)}” entre as ruas com vendas em ${esc(a.bairro)}. Escolha uma das sugestões do campo Rua.</p>` : ''}
    <div class="overflow-x-auto"><table class="w-full text-sm min-w-[560px]"><thead class="text-left text-gray-500 border-b"><tr><th class="py-2 pr-3">Comparado com (${esc(cam.tip.toLowerCase())})</th><th class="pr-3">Vendas</th><th class="pr-3">Mediana R$/m²</th><th class="pr-3">Faixa típica</th><th>Anúncio</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <p class="text-[11px] text-gray-400">Prédio: últimos 36 meses · rua e faixa de área (área do anúncio ± 5 m²): 24 meses · bairro: 12 meses. Faixa típica = metade central das vendas (percentis 25 a 75). Só vendas integrais.</p>
  </div>`;
}

// ---------- Preencher a calculadora ----------
function anSimular(a) {
  if (!a || !a.area || !a.preco) return;
  areaSet(a.area);
  irParaAba('calc');
  if (!$('cBairro')) return;
  if (a.nb && [...$('cBairro').options].some(o => o.value === a.nb)) $('cBairro').value = a.nb;
  $('cArea').value = Math.round(a.area);
  if (a.op === 'aluguel') {
    calcUsarMediana(true);
    const v = a.valorRef ?? (a.refM2 ? a.refM2 * a.area : null);
    if (v) { $('cValor').value = formatMoeda(Math.round(v / 1000) * 1000); CALC_EDIT.add('cValor'); }
    $('cAluguel').value = formatMoeda(a.preco); CALC_EDIT.add('cAluguel');
  } else {
    $('cValor').value = formatMoeda(a.preco); CALC_EDIT.add('cValor'); CALC_EDIT.delete('cAluguel');
  }
  calcSugerir(); calcRodar();
  toast(a.op === 'aluguel' ? 'Calculadora preenchida: aluguel do anúncio e valor estimado pelo ITBI.' : 'Calculadora preenchida com o preço do anúncio.');
}

// ---------- Salvar e comparar ----------
function anSalvar() {
  const a = AN.ult; if (!a) return;
  const l = anGet(), item = { ...a, id: AN.editId || Date.now(), salvoEm: new Date().toISOString().slice(0, 10) };
  const i = l.findIndex(x => x.id === item.id);
  if (i >= 0) l[i] = item; else l.unshift(item);
  anSet(l); AN.editId = item.id; anRenderLista(); anAvaliar();
  toast(i >= 0 ? 'Anúncio atualizado.' : 'Anúncio salvo. Veja a comparação abaixo.');
}
async function anAbrirSalvo(id) {
  const a = anGet().find(x => x.id === id); if (!a) return;
  anLimpar(); AN.editId = id; AN.url = a.url || ''; AN.portal = a.portal || '';
  $('anLink').value = a.url || '';
  $('anOp').value = a.op; $('anTipo').value = a.tipo; $('anBairro').value = a.arquivo; $('anArea').value = a.area;
  $('anQuartos').value = a.quartos ?? ''; $('anPreco').value = formatMoeda(a.preco); $('anCond').value = a.cond ? formatMoeda(a.cond) : '';
  $('anIptu').value = a.iptu ? formatMoeda(a.iptu) : ''; $('anIptuPer').value = a.iptuPer || 'ano'; $('anRua').value = a.rua || ''; $('anNum').value = a.numero || '';
  $('anLinkInfo').textContent = 'Editando um anúncio salvo. Ajuste os campos e clique em “Atualizar salvo”.';
  await anTrocarBairro();
  $('tab-anuncios').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function anRenderLista() {
  const l = anGet(), box = $('anLista'); if (!box) return;
  if (!l.length) { box.innerHTML = '<p class="text-sm text-gray-500">Nenhum anúncio salvo ainda. Avalie um anúncio e clique em “Salvar para comparar”.</p>'; return; }
  const vendas = l.filter(a => a.op !== 'aluguel' && a.dif != null), melhor = vendas.length > 1 ? Math.min(...vendas.map(a => a.dif)) : null;
  const tipoNome = v => (AN_TIPOS.find(t => t[0] === v) || [, v])[1];
  const linha = a => {
    const alug = a.op === 'aluguel', mensal = (a.cond || 0) + (a.iptuMes || 0);
    const titulo = `${tipoNome(a.tipo)}${a.quartos != null ? `, ${a.quartos} qto${a.quartos === 1 ? '' : 's'}` : ''} · ${esc(a.bairro)}`;
    const vs = alug ? (a.yield != null ? `${a.yield.toFixed(1).replace('.', ',')}% a.a.` : '—') : (a.dif != null ? `<span class="${a.dif > 0 ? 'text-red-600' : 'text-emerald-600'}">${anPctTxt(a.dif)}</span>${a.dif === melhor ? ' <span class="text-[11px] text-emerald-700">melhor</span>' : ''}` : '—');
    return `<tr class="border-b last:border-0 ${a.id === AN.editId ? 'bg-[#f3ebdf]' : ''}">
      <td class="py-2 pr-3"><div class="font-semibold">${titulo}</div><div class="text-xs text-gray-500">${esc(a.rua || 'rua não informada')}${a.numero ? ', ' + esc(a.numero) : ''}${a.url ? ` · <a href="${esc(a.url)}" target="_blank" rel="noopener" class="text-brand-600 hover:underline">${esc(a.portal || 'link')} <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>` : ''}</div></td>
      <td class="pr-3 whitespace-nowrap">${alug ? 'Aluguel' : 'Venda'}</td>
      <td class="pr-3 whitespace-nowrap">${brl(a.preco)}${alug ? '/mês' : ''}</td>
      <td class="pr-3">${num(a.area)} m²</td>
      <td class="pr-3 whitespace-nowrap">${alug ? '—' : brl(a.preco / a.area)}</td>
      <td class="pr-3 whitespace-nowrap">${a.refM2 ? brl(a.refM2) : '—'}<div class="text-[11px] text-gray-400">${a.refN ? num(a.refN) + ' vendas' : ''}</div></td>
      <td class="pr-3 whitespace-nowrap">${vs}</td>
      <td class="pr-3 whitespace-nowrap">${mensal ? brl(mensal) : '—'}</td>
      <td class="whitespace-nowrap text-right">
        <button data-an="sim-salvo" data-id="${a.id}" class="text-brand-600 hover:underline text-xs mr-2" title="Simular comprar x alugar"><i class="fa-solid fa-calculator mr-0.5"></i>Simular</button>
        <button data-an="abrir" data-id="${a.id}" class="text-gray-600 hover:underline text-xs mr-2"><i class="fa-solid fa-pen mr-0.5"></i>Editar</button>
        <button data-an="apagar" data-id="${a.id}" class="text-red-600 hover:underline text-xs" aria-label="Remover"><i class="fa-solid fa-trash"></i></button></td></tr>`;
  };
  box.innerHTML = `<table class="w-full text-sm min-w-[900px]"><thead class="text-left text-gray-500 border-b"><tr>
    <th class="py-2 pr-3">Anúncio</th><th class="pr-3">Tipo</th><th class="pr-3">Preço</th><th class="pr-3">Área</th><th class="pr-3">R$/m²</th><th class="pr-3">Mercado R$/m²</th><th class="pr-3">vs. mercado</th><th class="pr-3">Cond. + IPTU</th><th></th></tr></thead>
    <tbody>${l.map(linha).join('')}</tbody></table>
    <p class="text-[11px] text-gray-400 mt-2">“vs. mercado”: diferença do R$/m² pedido para a mediana das vendas usada como referência; em aluguel, rentabilidade bruta anual sobre o valor estimado.</p>`;
}
