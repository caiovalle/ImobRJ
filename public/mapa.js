// Sub-aba "Mapa" (id mapa): bairros do Rio pintados pela mediana do R$/m² dos últimos 12 meses.
// Usa helpers e estado do app.js ($, brl, num, pct, MED, MB, F, S, BAIRROS, medOf, ymLabel, selecionar, irParaAba).
// Limites dos bairros: public/bairros.geojson (camada "Limite de Bairros" do IPP/Data.Rio, simplificada; ver README).
// A biblioteca Leaflet e o bairros.geojson só são baixados quando alguém abre o mapa.
const MAPA = { map: null, camada: null, geo: null, st: '', dados: new Map(), cortes: [] };
const MAPA_MIN = 10;   // mínimo de vendas em 12 meses para pintar o bairro (com menos, a mediana oscila demais)
// do mais barato (areia) ao mais caro (terracota escuro), na paleta do site
const MAPA_CORES = ['#f4e4c9', '#ecc99c', '#e2a877', '#d4845a', '#c0623f', '#a3421f', '#6e2812'];
const MAPA_LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const mapaEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mapaCarregarScript(src) {
  return new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = erro; document.head.appendChild(s); });
}
async function mapaCarregar() {
  if (MAPA.st) return; MAPA.st = 'carregando';
  try {
    if (!window.L) {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = MAPA_LEAFLET + 'leaflet.css'; document.head.appendChild(css);
      await mapaCarregarScript(MAPA_LEAFLET + 'leaflet.js');
    }
    const r = await fetch('bairros.geojson'); if (!r.ok) throw new Error(r.status);
    MAPA.geo = await r.json(); MAPA.st = 'ok';
  } catch (e) { MAPA.st = 'erro'; }
  if (TAB === 'mapa') render();
}

// mediana do R$/m² de cada bairro nos 12 meses que terminam no último mês com dados (respeita Residencial/Comercial, tipo de imóvel e "Até")
function mapaCalcular() {
  MAPA.dados = new Map(); MAPA.cortes = []; MAPA.janela = null; MAPA.cidade = null;
  if (!MB.length) return;
  let fim = -Infinity; for (const g of MB) if (g.t > fim) fim = g.t;
  const ini = fim - 11, porNb = new Map(), todos = [];
  for (const g of MB) if (g.t >= ini) { todos.push(g); (porNb.get(g.nb) || porNb.set(g.nb, []).get(g.nb)).push(g); }
  MAPA.janela = [ini, fim]; MAPA.cidade = medOf(todos);
  for (const [nb, gs] of porNb) { const m = medOf(gs); if (m) MAPA.dados.set(nb, m); }
  // faixas de cor por quantis (cada cor com mais ou menos o mesmo número de bairros), arredondadas para centenas
  const vs = [...MAPA.dados.values()].filter(m => m.n >= MAPA_MIN).map(m => m.m2).sort((a, b) => a - b);
  if (vs.length < MAPA_CORES.length) { MAPA.cortes = vs.length ? [Math.round(vs[0] / 100) * 100] : []; return; }
  const k = MAPA_CORES.length, c = [];
  for (let i = 1; i < k; i++) { const v = Math.round(vs[Math.floor(vs.length * i / k)] / 100) * 100; if (!c.length || v > c[c.length - 1]) c.push(v); }
  MAPA.cortes = c;
}
const mapaClasse = v => { let i = 0; while (i < MAPA.cortes.length && v >= MAPA.cortes[i]) i++; return Math.min(i, MAPA_CORES.length - 1); };
const mapaInfo = nb => { const m = MAPA.dados.get(nb); return m && m.n >= MAPA_MIN ? m : null; };

function mapaEstilo(f) {
  const nb = f.properties.nb, m = mapaInfo(nb), sel = S.lvl !== 'cidade' && S.nb === nb;
  return m ? { fillColor: MAPA_CORES[mapaClasse(m.m2)], fillOpacity: .85, color: sel ? '#1f4d3a' : '#fffbf4', weight: sel ? 3.5 : 1, dashArray: null }
    : { fillColor: '#cdbba2', fillOpacity: .25, color: sel ? '#1f4d3a' : '#a8977f', weight: sel ? 3.5 : .8, dashArray: sel ? null : '3 3' };
}
function mapaTexto(f) {
  const p = f.properties, m = MAPA.dados.get(p.nb), ok = m && m.n >= MAPA_MIN, c = MAPA.cidade?.m2;
  const linha2 = ok ? `<span class="text-base font-semibold">${brl(m.m2)}/m²</span><br>${num(m.n)} vendas em 12 meses` + (c ? ` · <span class="${m.m2 >= c ? 'text-brand-600' : 'text-emerald-700'}">${pct((m.m2 / c - 1) * 100)} vs. cidade</span>` : '')
    : m ? `Poucas vendas em 12 meses (${num(m.n)}): sem preço no mapa` : 'Sem vendas registradas nestes 12 meses com os filtros atuais';
  return `<b>${mapaEsc(p.nome)}</b><br>${linha2}`;
}
function mapaAbrirBairro(nb) {
  const b = BAIRROS.find(x => x.nb === nb); if (!b) return;
  selecionar({ lvl: 'bairro', nb: b.nb, label: 'Bairro ' + b.nome }); irParaAba('overview');
}

function mapaCriar() {
  const L = window.L, el = $('mapaBox');
  const map = L.map(el, { scrollWheelZoom: false, zoomSnap: .25, minZoom: 8, attributionControl: true });
  map.createPane('rotulos'); map.getPane('rotulos').style.zIndex = 450; map.getPane('rotulos').style.pointerEvents = 'none';
  const cartoAttr = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> · Bairros: IPP/Data.Rio';
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 18, attribution: cartoAttr }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 18, pane: 'rotulos' }).addTo(map);
  const temHover = window.matchMedia?.('(hover: hover)').matches;
  MAPA.camada = L.geoJSON(MAPA.geo, {
    style: mapaEstilo,
    onEachFeature: (f, lyr) => {
      if (temHover) lyr.bindTooltip(() => mapaTexto(f), { sticky: true, direction: 'top', offset: [0, -8], className: 'mapa-tip' });
      lyr.on('mouseover', () => { lyr.setStyle({ weight: 3, color: '#2a211a' }); lyr.bringToFront(); });
      lyr.on('mouseout', () => MAPA.camada.resetStyle(lyr));
      lyr.on('click', e => {
        const tem = BAIRROS.some(b => b.nb === f.properties.nb);
        L.popup({ maxWidth: 260, className: 'mapa-pop' }).setLatLng(e.latlng).setContent(mapaTexto(f) +
          (tem ? `<br><button type="button" class="mapa-ver mt-2 bg-verde-500 hover:bg-verde-700 text-[#fffbf4] font-semibold text-xs px-3 py-1.5 rounded" data-nb="${mapaEsc(f.properties.nb)}">Ver o bairro <i class="fa-solid fa-arrow-right ml-1"></i></button>` : '')).openOn(map);
      });
    }
  }).addTo(map);
  el.addEventListener('click', e => { const b = e.target.closest('.mapa-ver'); if (b) { map.closePopup(); mapaAbrirBairro(b.dataset.nb); } });
  el.addEventListener('click', () => map.scrollWheelZoom.enable(), { once: true });   // roda do mouse só depois do 1º clique (não "prende" a rolagem da página)
  MAPA.map = map; mapaEnquadrar();
  // ao voltar para a aba (ou girar o celular) o quadro muda de tamanho: reajusta e reenquadra a cidade
  if (window.ResizeObserver) { let largura = el.clientWidth; new ResizeObserver(() => { const w = el.clientWidth; if (w === largura) return; largura = w; if (!w) return; map.invalidateSize(); mapaEnquadrar(); }).observe(el); }
}
function mapaEnquadrar() { MAPA.map.fitBounds(MAPA.camada.getBounds(), { padding: [8, 8] }); }

function mapaLegenda() {
  const c = MAPA.cortes, faixa = i => i === 0 ? `até ${num(c[0])}` : i >= c.length ? `${num(c[c.length - 1])} ou mais` : `${num(c[i - 1])} a ${num(c[i])}`;
  const n = c.length + 1;
  return `<div class="flex flex-wrap gap-x-3 gap-y-1.5 items-center text-xs text-gray-600"><span class="font-semibold text-ink mr-1">R$/m²</span>` +
    Array.from({ length: n }, (_, i) => `<span class="inline-flex items-center gap-1"><span class="inline-block w-4 h-3 rounded-sm border border-black/10" style="background:${MAPA_CORES[Math.round(i * (MAPA_CORES.length - 1) / Math.max(n - 1, 1))]}"></span>${faixa(i)}</span>`).join('') +
    `<span class="inline-flex items-center gap-1"><span class="inline-block w-4 h-3 rounded-sm border border-dashed border-[#a8977f] bg-[#cdbba2]/30"></span>sem dados ou menos de ${MAPA_MIN} vendas</span></div>`;
}

function renderMapa() {
  const info = $('mapaInfo');
  if (MAPA.st !== 'ok') {
    $('mapaLegenda').innerHTML = '';
    info.innerHTML = MAPA.st === 'erro' ? '<span class="text-amber-700">Não foi possível carregar o mapa. Verifique a internet e recarregue a página.</span>' : '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Carregando o mapa…';
    mapaCarregar(); return;
  }
  if (!MED) { info.innerHTML = AREAS_ST === 'erro' ? '<span class="text-amber-700">Não foi possível carregar as medianas (areas.json).</span>' : '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Calculando as medianas por bairro…'; $('mapaLegenda').innerHTML = ''; return; }
  mapaCalcular();
  if (!MAPA.map) mapaCriar(); else { MAPA.map.invalidateSize(); MAPA.camada.setStyle(mapaEstilo); }
  const filtro = [F.tipo || 'Todos os tipos', F.tip].filter(Boolean).join(' · ');
  const nPint = [...MAPA.dados.values()].filter(m => m.n >= MAPA_MIN).length;
  info.innerHTML = MAPA.janela ? `Mediana do R$/m² das vendas de <b>${ymLabel(MAPA.janela[0])} a ${ymLabel(MAPA.janela[1])}</b> · ${mapaEsc(filtro)} · cidade: <b>${brl(MAPA.cidade?.m2)}/m²</b> · ${nPint} bairros com preço`
    : 'Sem vendas para os filtros atuais.';
  $('mapaLegenda').innerHTML = MAPA.janela ? mapaLegenda() : '';
}
