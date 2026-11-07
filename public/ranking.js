// Sub-aba "Rankings" (id ranking): bairros que mais subiram e caíram, bairros mais caros/baratos e ruas mais caras.
// Lê public/rankings.json (gerado por scripts/gerar_rankings.py junto com os dados do ITBI); também usado pelo mapa (modo "Valorização").
// Usa helpers e estado do app.js ($, brl, num, pct, pctColor, pretty, normRua, BAIRROS, RUAS, MESES, selecionar, irParaAba, toast).
const RK = { st: '', j: null, grupo: 'residencial', ordem: 'caros', bairroRuas: '' };
const RK_MIN_VAR = 50;     // vendas mínimas em CADA período para entrar em "subiram/caíram" (menos que isso oscila demais)
const RK_MIN_PRECO = 30;   // vendas mínimas nos 12 meses para entrar em "mais caros/baratos"
const RK_MIN_RUA = 15;     // vendas mínimas da rua nos 12 meses (e ao menos 3 prédios diferentes)
const RK_TOP = 10;
const rkEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rkMes = ym => { const [a, m] = ym.split('-'); return `${MESES[+m - 1].toLowerCase()}/${a}`; };
const rkJanela = j => `${rkMes(j.janela[0])} a ${rkMes(j.janela[1])}`;
const rkAnterior = j => `${rkMes(j.anterior[0])} a ${rkMes(j.anterior[1])}`;

// carrega uma vez; quem chama (ranking ou mapa) é redesenhado quando chegar
function rkCarregar() {
  if (RK.st) return RK.p; RK.st = 'carregando';
  RK.p = fetch('rankings.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => { RK.j = j; RK.st = 'ok'; }).catch(() => { RK.st = 'erro'; })
    .finally(() => { if (TAB === 'ranking' || TAB === 'mapa') render(); });
  return RK.p;
}
// listas prontas do grupo (residencial ou apartamento)
function rkBairros(grupo) {
  const g = RK.j?.grupos?.[grupo]; if (!g) return [];
  return g.bairros.map(([nb, nome, m2, n, predios, m2a, na]) => ({ nb, nome, m2, n, predios, m2a, na, v: m2 && m2a ? (m2 / m2a - 1) * 100 : null }));
}
function rkRuas(grupo) {
  const g = RK.j?.grupos?.[grupo]; if (!g) return [];
  return g.ruas.map(([rua, nb, m2, n, predios]) => {
    const nl = normRua(rua), r = RUAS.find(x => x.nb === nb && x.nl === nl), b = BAIRROS.find(x => x.nb === nb);
    return { rua: r?.nome || pretty(rua), nl: r ? nl : null, nb, bairro: b?.nome || nb, m2, n, predios };
  });
}

function rkLinha(i, principal, detalhe, valor, cls, attrs) {
  return `<li><button type="button" class="rk-ir w-full text-left flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-[#f3ebdf]" ${attrs}>
    <span class="w-6 text-right text-sm font-semibold text-gray-400">${i}</span>
    <span class="flex-1 min-w-0"><span class="block font-semibold truncate">${principal}</span><span class="block text-xs text-gray-500 truncate">${detalhe}</span></span>
    <span class="text-sm font-bold whitespace-nowrap ${cls}">${valor}</span></button></li>`;
}
function rkCard(id, titulo, sub, itens, extra = '') {
  return `<div class="card"><div class="flex items-start justify-between gap-3 mb-1"><h3 class="font-bold">${titulo}</h3>
      <button type="button" class="rk-copiar text-xs font-semibold text-brand-600 hover:underline whitespace-nowrap" data-rk="${id}"><i class="fa-regular fa-copy mr-1"></i>Copiar</button></div>
    <p class="text-xs text-gray-500 mb-2">${sub}</p>${extra}
    ${itens.length ? `<ol class="divide-y divide-[#efe4d3]">${itens.join('')}</ol>` : '<p class="text-sm text-gray-500 py-4">Sem bairros ou ruas com vendas suficientes.</p>'}</div>`;
}

function renderRanking() {
  const box = $('tab-ranking');
  if (RK.st !== 'ok') {
    box.innerHTML = `<div class="card text-sm text-gray-600">${RK.st === 'erro' ? '<span class="text-amber-700">Não foi possível carregar os rankings (rankings.json). Verifique a internet e recarregue a página.</span>' : '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Carregando os rankings…'}</div>`;
    rkCarregar(); return;
  }
  const j = RK.j, g = RK.grupo, txtG = g === 'apartamento' ? 'apartamentos' : 'imóveis residenciais';
  const bs = rkBairros(g), comVar = bs.filter(b => b.v != null && b.n >= RK_MIN_VAR && b.na >= RK_MIN_VAR);
  const sobe = [...comVar].sort((a, b) => b.v - a.v).slice(0, RK_TOP), cai = [...comVar].sort((a, b) => a.v - b.v).slice(0, RK_TOP);
  const preco = bs.filter(b => b.n >= RK_MIN_PRECO).sort((a, b) => RK.ordem === 'caros' ? b.m2 - a.m2 : a.m2 - b.m2).slice(0, RK_TOP);
  const todasRuas = rkRuas(g).filter(r => r.n >= RK_MIN_RUA);
  const ruas = (RK.bairroRuas ? todasRuas.filter(r => r.nb === RK.bairroRuas) : todasRuas).slice(0, RK.bairroRuas ? RK_TOP : 15);
  const bairrosComRua = [...new Set(todasRuas.map(r => r.nb))].map(nb => todasRuas.find(r => r.nb === nb)).sort((a, b) => a.bairro.localeCompare(b.bairro));

  const linhaVar = (b, i) => rkLinha(i + 1, rkEsc(b.nome), `${brl(b.m2a)} → ${brl(b.m2)}/m² · ${num(b.n)} vendas`, pct(b.v), pctColor(b.v), `data-nb="${rkEsc(b.nb)}"`);
  // para "Copiar": texto simples, pronto para colar numa rede social ou mensagem
  RK.textos = {
    sobe: [`Bairros do Rio onde o m² mais subiu (${txtG}, ${rkJanela(j)} vs. 12 meses antes):`, ...sobe.map((b, i) => `${i + 1}. ${b.nome}: ${pct(b.v)} (${brl(b.m2)}/m²)`)],
    cai: [`Bairros do Rio onde o m² mais caiu (${txtG}, ${rkJanela(j)} vs. 12 meses antes):`, ...cai.map((b, i) => `${i + 1}. ${b.nome}: ${pct(b.v)} (${brl(b.m2)}/m²)`)],
    preco: [`Bairros do Rio com o m² mais ${RK.ordem === 'caros' ? 'caro' : 'barato'} (${txtG}, ${rkJanela(j)}):`, ...preco.map((b, i) => `${i + 1}. ${b.nome}: ${brl(b.m2)}/m²`)],
    ruas: [`Ruas ${RK.bairroRuas ? 'de ' + (bairrosComRua.find(r => r.nb === RK.bairroRuas)?.bairro || '') : 'do Rio'} com o m² mais caro (${txtG}, ${rkJanela(j)}):`, ...ruas.map((r, i) => `${i + 1}. ${r.rua}${RK.bairroRuas ? '' : ' (' + r.bairro + ')'}: ${brl(r.m2)}/m²`)],
  };

  box.innerHTML = `
    <div class="card">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div><h2 class="text-2xl sm:text-3xl">Rankings do mercado</h2>
          <p class="text-sm text-gray-600 mt-1">Vendas de ${txtG} registradas no ITBI de <b>${rkJanela(j)}</b>, comparadas com ${rkAnterior(j)}.</p></div>
        <div class="flex gap-2"><button type="button" class="pill rk-grupo ${g === 'residencial' ? 'on' : ''}" data-g="residencial">Todos os residenciais</button><button type="button" class="pill rk-grupo ${g === 'apartamento' ? 'on' : ''}" data-g="apartamento">Só apartamentos</button></div>
      </div>
    </div>
    <div class="grid lg:grid-cols-2 gap-6">
      ${rkCard('sobe', '<i class="fa-solid fa-arrow-trend-up text-emerald-600 mr-1"></i>Bairros onde o m² mais subiu', `Variação da mediana do R$/m² em 12 meses · bairros com ${RK_MIN_VAR}+ vendas em cada período`, sobe.map(linhaVar))}
      ${rkCard('cai', '<i class="fa-solid fa-arrow-trend-down text-red-600 mr-1"></i>Bairros onde o m² mais caiu', `Variação da mediana do R$/m² em 12 meses · bairros com ${RK_MIN_VAR}+ vendas em cada período`, cai.map(linhaVar))}
      ${rkCard('preco', `Bairros com o m² mais ${RK.ordem === 'caros' ? 'caro' : 'barato'}`, `Mediana do R$/m² em 12 meses · bairros com ${RK_MIN_PRECO}+ vendas`,
        preco.map((b, i) => rkLinha(i + 1, rkEsc(b.nome), `${num(b.n)} vendas`, `${brl(b.m2)}/m²`, '', `data-nb="${rkEsc(b.nb)}"`)),
        `<div class="flex gap-2 mb-2"><button type="button" class="pill rk-ordem ${RK.ordem === 'caros' ? 'on' : ''}" data-o="caros">Mais caros</button><button type="button" class="pill rk-ordem ${RK.ordem === 'baratos' ? 'on' : ''}" data-o="baratos">Mais baratos</button></div>`)}
      ${rkCard('ruas', 'Ruas com o m² mais caro', `Mediana do R$/m² em 12 meses · ruas com ${RK_MIN_RUA}+ vendas em 3 prédios ou mais`,
        ruas.map((r, i) => rkLinha(i + 1, rkEsc(r.rua), `${RK.bairroRuas ? '' : rkEsc(r.bairro) + ' · '}${num(r.n)} vendas em ${num(r.predios)} prédios`, `${brl(r.m2)}/m²`, '', `data-nb="${rkEsc(r.nb)}"${r.nl ? ` data-nl="${rkEsc(r.nl)}"` : ''}`)),
        `<label class="block text-xs text-gray-500 mb-2">Onde<br><select id="rkBairroRuas" class="sel text-ink mt-1 w-full sm:w-auto"><option value="">Cidade toda</option>${bairrosComRua.map(r => `<option value="${rkEsc(r.nb)}" ${r.nb === RK.bairroRuas ? 'selected' : ''}>${rkEsc(r.bairro)}</option>`).join('')}</select></label>`)}
    </div>
    <p class="text-[11px] text-gray-500 leading-relaxed">Só vendas integrais de ${txtG}, com o R$/m² dentro da faixa usada no resto do site. <b>Prédio novo:</b> quando um lançamento é entregue, muitas unidades do mesmo prédio são vendidas no mesmo ano e mudam a mediana do bairro sem que os preços tenham mudado. Para isso não aparecer como valorização, cada prédio conta no máximo ${j.max_predio} vendas por período. Por isso estes números podem ser um pouco diferentes dos da sub-aba Resumo. Variação de preço registrado não é avaliação: mudanças no tipo de imóvel vendido também mexem na mediana. Toque num bairro ou rua para ver os detalhes.</p>`;
}

// eventos (uma vez; a aba é redesenhada por innerHTML)
document.addEventListener('click', e => {
  if (!e.target.closest('#tab-ranking')) return;
  const gr = e.target.closest('.rk-grupo'); if (gr) { RK.grupo = gr.dataset.g; return renderRanking(); }
  const or = e.target.closest('.rk-ordem'); if (or) { RK.ordem = or.dataset.o; return renderRanking(); }
  const cp = e.target.closest('.rk-copiar');
  if (cp) {
    const t = [...(RK.textos?.[cp.dataset.rk] || []), '', 'Fonte: ImobRJ (imobrj.github.io), com dados do ITBI da Prefeitura do Rio.'].join('\n');
    (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast('Lista copiada. É só colar onde quiser.'), () => toast('Não foi possível copiar neste navegador.'));
    return;
  }
  const ir = e.target.closest('.rk-ir');
  if (ir) {
    const b = BAIRROS.find(x => x.nb === ir.dataset.nb); if (!b) return;
    const r = ir.dataset.nl && RUAS.find(x => x.nb === b.nb && x.nl === ir.dataset.nl);
    selecionar(r ? { lvl: 'rua', nb: r.nb, nl: r.nl, label: `${r.nome} · ${r.bairro}` } : { lvl: 'bairro', nb: b.nb, label: 'Bairro ' + b.nome });
    irParaAba('overview');
  }
});
document.addEventListener('change', e => { if (e.target.id === 'rkBairroRuas') { RK.bairroRuas = e.target.value; renderRanking(); } });
