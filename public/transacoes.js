// Aba "Vendas por imóvel" (id tx): consulta por unidade (rua, número, complemento) a partir de transacoes/index.json e transacoes/<bairro>.json.
// Usa helpers do app.js ($, brl, num, strip, normRua, MESES, S, BAIRROS). Os arquivos são gerados por scripts/gerar_transacoes_site.py.
const TX = { idx: null, erro: null, cache: new Map(), cur: null, f: {}, pagina: 0, escopo: null, pronto: false };
const TX_POR_PAGINA = 50;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const quantil = (arr, q) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y), p = (a.length - 1) * q, i = Math.floor(p); return a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * (p - Math.floor(p)); };

async function txCarregarIndice() {
  if (TX.idx || TX.erro) return;
  try { const r = await fetch('transacoes/index.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); TX.idx = await r.json(); }
  catch (e) { TX.erro = e; }
}
async function txCarregarBairro(arquivo) {
  if (!TX.cache.has(arquivo)) {
    const r = await fetch('transacoes/' + arquivo); if (!r.ok) throw new Error(r.status);
    const d = await r.json(); d.linhas = d.linhas.map(l => ({ ano: l[0], mes: l[1], rua: l[2], numero: l[3], compl: l[4], tip: l[5], com: l[6], area: l[7], valor: l[8], fl: l[9], t: l[0] * 12 + l[1] }));
    TX.cache.set(arquivo, d);
  }
  return TX.cache.get(arquivo);
}

async function renderTx() {
  const box = $('txConteudo');
  await txCarregarIndice();
  if (!TX.idx) {
    $('txControles').classList.add('hidden'); box.innerHTML = `<div class="card text-sm text-gray-600">A base de transações por imóvel ainda não foi publicada neste site.
      Gere os arquivos com <code>scripts/gerar_transacoes_site.py</code> (instruções no README) e publique a pasta <code>public/transacoes</code>.</div>`;
    return;
  }
  $('txControles').classList.remove('hidden');
  if (!TX.pronto) txMontarControles();
  // acompanha o local escolhido na busca principal (uma vez por mudança)
  const chaveEscopo = S.lvl + '|' + S.nb + '|' + S.nl;
  if (TX.escopo !== chaveEscopo) {
    TX.escopo = chaveEscopo;
    const b = S.lvl !== 'cidade' ? TX.idx.bairros.find(x => x.nb === S.nb) : null;
    if (b) { $('txBairro').value = b.arquivo; await txTrocarBairro(S.lvl === 'rua' ? S.nl : null); return; }
  }
  if (!$('txBairro').value) { TX.cur = null; box.innerHTML = '<div class="card text-sm text-gray-600">Escolha um bairro para ver as transações registradas.</div>'; $('txKpis').innerHTML = ''; return; }
  txAtualizar();
}

function txMontarControles() {
  const i = TX.idx, anos = []; for (let a = i.ano_min; a <= i.ano_max; a++) anos.push(a);
  $('txBairro').innerHTML = '<option value="">Escolha um bairro…</option>' + i.bairros.map(b => `<option value="${esc(b.arquivo)}">${esc(b.nome)} (${num(b.n)})</option>`).join('');
  $('txDe').innerHTML = $('txAte').innerHTML = anos.map(a => `<option>${a}</option>`).join('');
  $('txDe').value = anos[0]; $('txAte').value = anos.at(-1);
  $('txBairro').onchange = () => {   // o bairro escolhido aqui passa a valer para o site todo
    const b = TX.idx.bairros.find(x => x.arquivo === $('txBairro').value);
    if (b) { localDeAba(b.nb); TX.escopo = S.lvl + '|' + S.nb + '|' + S.nl; }
    txTrocarBairro(null);
  };
  ['txRua', 'txTip', 'txDe', 'txAte', 'txVmin', 'txVmax', 'txAmin', 'txAmax', 'txBusca', 'txPredio', 'txOrdem'].forEach(id =>
    $(id).addEventListener(id === 'txBusca' || /min|max/.test(id) ? 'input' : 'change', () => { TX.pagina = 0; txAtualizar(); }));
  $('txArea').addEventListener('input', () => {        // metragem ± 5 m² → preenche área mín. e máx. (apagar a metragem limpa os dois)
    const c = +$('txArea').value.replace(',', '.');
    if ($('txArea').value.trim() === '') { $('txAmin').value = $('txAmax').value = ''; TX.pagina = 0; return txAtualizar(); }
    if (!(c >= 10)) return;
    const [lo, hi] = faixaDe(c); $('txAmin').value = lo; $('txAmax').value = hi; TX.pagina = 0; txAtualizar();
  });
  ['txAmin', 'txAmax'].forEach(id => $(id).addEventListener('input', () => { $('txArea').value = ''; }));   // mexeu à mão: a metragem deixa de valer
  $('txDe').addEventListener('change', () => { if (+$('txAte').value < +$('txDe').value) { $('txAte').value = $('txDe').value; txAtualizar(); } });
  $('txAte').addEventListener('change', () => { if (+$('txDe').value > +$('txAte').value) { $('txDe').value = $('txAte').value; txAtualizar(); } });
  $('txPrev').onclick = () => { TX.pagina = Math.max(0, TX.pagina - 1); txAtualizar(true); };
  $('txNext').onclick = () => { TX.pagina++; txAtualizar(true); };
  $('txConteudo').addEventListener('click', e => {      // clicar num prédio filtra por ele
    const tr = e.target.closest('tr[data-rua]'); if (!tr) return;
    $('txRua').value = tr.dataset.rua; $('txBusca').value = tr.dataset.num; $('txPredio').checked = false; TX.pagina = 0; txAtualizar();
  });
  TX.pronto = true;
}

async function txTrocarBairro(nlRua) {
  const arq = $('txBairro').value; TX.pagina = 0;
  $('txBusca').value = ''; $('txVmin').value = $('txVmax').value = $('txAmin').value = $('txAmax').value = $('txArea').value = ''; $('txTip').value = ''; $('txPredio').checked = false;
  if (!arq) { TX.cur = null; return renderTx(); }
  $('txConteudo').innerHTML = '<div class="card text-sm text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Carregando transações do bairro…</div>';
  try { TX.cur = await txCarregarBairro(arq); }
  catch (e) { TX.cur = null; $('txConteudo').innerHTML = '<div class="card text-sm text-red-600">Não foi possível carregar este bairro. Tente novamente.</div>'; return; }
  const d = TX.cur;
  $('txRua').innerHTML = '<option value="">Todas as ruas</option>' + d.ruas.map((r, i) => [i, pretty(r)]).sort((a, b) => a[1].localeCompare(b[1])).map(([i, r]) => `<option value="${i}">${esc(r)}</option>`).join('');
  $('txTip').innerHTML = '<option value="">Todos os tipos</option>' + d.tipologias.map((t, i) => `<option value="${i}">${esc(t)}</option>`).join('');
  if (nlRua) { const i = d.ruas.findIndex(r => normRua(r) === nlRua); if (i >= 0) $('txRua').value = i; }
  txAtualizar();
}

function txFiltrar() {
  const d = TX.cur, v = id => $(id).value, n = id => v(id) === '' ? null : +v(id).replace(/\./g, '').replace(',', '.');
  const rua = v('txRua'), tip = v('txTip'), de = +v('txDe'), ate = +v('txAte'), q = strip(v('txBusca')),
    vmin = n('txVmin'), vmax = n('txVmax'), amin = n('txAmin'), amax = n('txAmax');
  return d.linhas.filter(l => (rua === '' || l.rua === +rua) && (tip === '' || l.tip === +tip) && l.ano >= de && l.ano <= ate
    && (vmin == null || l.valor >= vmin) && (vmax == null || l.valor <= vmax) && (amin == null || l.area >= amin) && (amax == null || l.area <= amax)
    && (!q || strip(l.numero + ' ' + l.compl).includes(q)));
}

function txAtualizar(soPagina) {
  const d = TX.cur; if (!d) return;
  const rows = txFiltrar(), ok = rows.filter(l => !l.fl);            // estatísticas só com vendas integrais e R$/m² dentro da faixa
  const m2 = ok.map(l => l.valor / l.area), val = ok.map(l => l.valor);
  const k = (t, v, sub = '') => `<div class="card"><div class="text-xs text-gray-500">${t}</div><div class="text-xl font-extrabold mt-1">${v}</div><div class="text-xs text-gray-400 mt-0.5">${sub}</div></div>`;
  const poucos = ok.length < 10;
  $('txKpis').innerHTML = k('Transações encontradas', num(rows.length), `${num(ok.length)} usadas nas estatísticas`) +
    k('Mediana do R$/m²', ok.length ? brl(quantil(m2, .5)) : '—', poucos ? 'amostra pequena: use com cautela' : 'vendas integrais') +
    k('Faixa típica do R$/m²', ok.length ? `${brl(quantil(m2, .25))} – ${brl(quantil(m2, .75))}` : '—', 'percentis 25 e 75') +
    k('Mediana do valor declarado', ok.length ? brl(quantil(val, .5)) : '—', '') +
    k('Período', rows.length ? `${txMes(minmax(rows, l => l.t)[0])} a ${txMes(minmax(rows, l => l.t)[1])}` : '—', '');
  const predio = $('txPredio').checked;
  const ordem = $('txOrdem').value;
  let linhas, cab, corpo;
  if (predio) {
    const g = new Map();
    for (const l of rows) { if (l.numero === '0' || l.numero === '') continue; const key = l.rua + '|' + l.numero; (g.get(key) || g.set(key, []).get(key)).push(l); }
    linhas = [...g.values()].map(a => { const o = a.filter(l => !l.fl); return { rua: a[0].rua, numero: a[0].numero, n: a.length, de: minmax(a, l => l.t)[0], ate: minmax(a, l => l.t)[1], m2: o.length ? quantil(o.map(l => l.valor / l.area), .5) : null, valor: o.length ? quantil(o.map(l => l.valor), .5) : null }; });
    linhas.sort((a, b) => b.n - a.n || d.ruas[a.rua].localeCompare(d.ruas[b.rua]));
    cab = ['Logradouro', 'Nº', 'Vendas', 'Período', 'Mediana R$/m²', 'Mediana valor'];
    corpo = l => `<tr class="border-b last:border-0 hover:bg-gray-50 cursor-pointer" data-rua="${l.rua}" data-num="${esc(l.numero)}"><td class="py-2 pr-3">${esc(pretty(d.ruas[l.rua]))}</td><td>${esc(l.numero)}</td><td>${l.n}</td><td>${txMes(l.de)}–${txMes(l.ate)}</td><td>${brl(l.m2)}</td><td>${brl(l.valor)}</td></tr>`;
  } else {
    linhas = rows;
    const cmp = { data: (a, b) => b.t - a.t, valor: (a, b) => b.valor - a.valor, m2: (a, b) => b.valor / b.area - a.valor / a.area }[ordem];
    linhas.sort((a, b) => cmp(a, b) || d.ruas[a.rua].localeCompare(d.ruas[b.rua]) || a.numero.localeCompare(b.numero, undefined, { numeric: true }));
    cab = ['Data', 'Logradouro', 'Nº', 'Complemento', 'Tipo', 'Área (m²)', 'Valor declarado', 'R$/m²', 'Obs.'];
    corpo = l => `<tr class="border-b last:border-0"><td class="py-2 pr-3 whitespace-nowrap">${MESES[l.mes - 1]}/${l.ano}</td><td class="pr-3">${esc(pretty(d.ruas[l.rua]))}</td><td class="pr-3">${l.numero === '0' || l.numero === '' ? 's/n' : esc(l.numero)}</td>
      <td class="pr-3 text-xs">${esc(l.compl) || '—'}</td><td class="pr-3">${esc(d.tipologias[l.tip])}${l.com ? ' (comercial)' : ''}</td><td>${num(l.area)}</td><td>${brl(l.valor)}</td>
      <td>${l.fl & 1 ? '—' : brl(l.valor / l.area)}</td><td class="text-xs text-amber-700">${l.fl & 1 ? 'venda parcial' : l.fl & 2 ? 'R$/m² atípico' : ''}</td></tr>`;
  }
  const paginas = Math.max(1, Math.ceil(linhas.length / TX_POR_PAGINA)); TX.pagina = Math.min(TX.pagina, paginas - 1);
  const fatia = linhas.slice(TX.pagina * TX_POR_PAGINA, (TX.pagina + 1) * TX_POR_PAGINA);
  $('txConteudo').innerHTML = `<div class="card overflow-x-auto">
    <p class="text-xs text-gray-500 mb-3">${predio ? `${num(linhas.length)} prédios (rua + número). Clique numa linha para ver as vendas dele.` : `${num(linhas.length)} transações.`}</p>
    <table class="w-full text-sm min-w-[720px]"><thead class="text-left text-gray-500 border-b"><tr>${cab.map(c => `<th class="py-2 pr-3">${c}</th>`).join('')}</tr></thead>
    <tbody>${fatia.map(corpo).join('') || `<tr><td colspan="${cab.length}" class="py-6 text-center text-gray-400">Nenhuma transação com esses filtros.</td></tr>`}</tbody></table></div>`;
  $('txPagina').classList.toggle('hidden', paginas <= 1);
  $('txPageInfo').textContent = `Página ${TX.pagina + 1} de ${paginas}`;
  $('txPrev').disabled = TX.pagina === 0; $('txNext').disabled = TX.pagina >= paginas - 1;
  $('txOrdemBox').classList.toggle('hidden', predio);
  if (soPagina) $('txKpis').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
const txMes = t => `${MESES[(t % 12) - 1 < 0 ? 11 : (t % 12) - 1]}/${Math.floor((t - 1) / 12)}`;
