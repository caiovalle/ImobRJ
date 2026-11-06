/* ImobRJ — Inteligência do Mercado Imobiliário do Rio de Janeiro
   Licença de Dados: CC BY 4.0 (Prefeitura do Rio / Secretaria de Fazenda)
   Desenvolvido com JS puro + Chart.js + Tailwind CSS
*/

// ==========================================
// 1. ESTADO GLOBAL DA APLICAÇÃO
// ==========================================
const S = {
  raw: [],              // Registros brutos do dados.json
  dadosBrutos: [],      // Alias para compatibilidade
  meta: null,           // Conteúdo do meta.json
  indices: null,        // Registros de IPCA/CDI
  bairros: [],          // Lista de bairros ordenados
  ruasPorBairro: {},    // Map: { "COPACABANA": ["RUA BARATA RIBEIRO", ...] }
  filtrados: [],        // Registros filtrados ativos
  escopo: 'cidade',     // 'cidade' | 'bairro' | 'rua'
  bairroAtual: '',
  ruaAtual: ''
};

const F = {
  de: '2018-01',
  ate: '',
  tipo: 'todos',        // 'todos' | 'Residencial' | 'Comercial'
  tipologia: 'todas'
};

// Instâncias ativas do Chart.js
let chartEvolucao = null;
let chartComparativo = null;

// ==========================================
// 2. HELPER COMBOBOX REUTILIZÁVEL (Busca por qualquer palavra)
// ==========================================
function enhanceSelectToCombobox(selectEl, placeholderText) {
  if (!selectEl) return null;

  // Evita duplicar o combobox caso já tenha sido envelopado
  if (selectEl.dataset.comboInit === 'true') {
    if (selectEl._syncComboboxOptions) selectEl._syncComboboxOptions();
    return;
  }
  selectEl.dataset.comboInit = 'true';

  // Esconde o select original
  selectEl.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'relative w-full imob-combo-container';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = selectEl.className || 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
  input.placeholder = placeholderText || selectEl.options[0]?.text || 'Selecione ou digite...';
  input.autocomplete = 'off';

  const dropdown = document.createElement('div');
  dropdown.className = 'absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-xl hidden';

  wrapper.appendChild(input);
  wrapper.appendChild(dropdown);
  selectEl.parentNode.insertBefore(wrapper, selectEl);

  let selectedIndex = -1;

  function getOptions() {
    const opts = [];
    for (let i = 0; i < selectEl.options.length; i++) {
      const opt = selectEl.options[i];
      opts.push({ value: opt.value, text: opt.text });
    }
    return opts;
  }

  function syncInputValue() {
    const selectedOpt = selectEl.options[selectEl.selectedIndex];
    input.value = (selectedOpt && selectedOpt.value !== '') ? selectedOpt.text : '';
  }

  function filterAndRender() {
    const q = strip(input.value);
    const allOpts = getOptions();
    
    // Filtra por QUALQUER palavra digitada (com strip de acentos e case insensitive)
    const matches = allOpts.filter(o => !q || strip(o.text).includes(q));

    dropdown.innerHTML = '';
    selectedIndex = -1;

    if (!matches.length) {
      dropdown.innerHTML = '<div class="p-3 text-xs text-gray-500">Nenhum resultado encontrado</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    matches.slice(0, 80).forEach((item) => {
      const div = document.createElement('div');
      div.className = 'combo-item px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors';
      if (item.value === selectEl.value) {
        div.classList.add('bg-blue-50', 'text-blue-700', 'font-semibold');
      }
      div.textContent = item.text;
      div.addEventListener('click', () => {
        selectEl.value = item.value;
        syncInputValue();
        dropdown.classList.add('hidden');
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
      dropdown.appendChild(div);
    });

    dropdown.classList.remove('hidden');
  }

  input.addEventListener('focus', () => {
    input.select();
    filterAndRender();
  });

  input.addEventListener('input', () => filterAndRender());

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      dropdown.classList.add('hidden');
      syncInputValue();
    }
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.combo-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      highlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      highlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].click();
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
      syncInputValue();
    }
  });

  function highlight(items) {
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('bg-blue-100', 'text-blue-800');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('bg-blue-100', 'text-blue-800');
      }
    });
  }

  selectEl._syncComboboxOptions = () => {
    syncInputValue();
  };

  syncInputValue();
}

// ==========================================
// 3. UTILITÁRIOS E FORMATAÇÃO
// ==========================================
function strip(str) {
  if (!str) return '';
  return str.toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function fmtMoeda(val) {
  if (val === null || val === undefined || isNaN(val)) return 'N/D';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtNumero(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return val.toLocaleString('pt-BR');
}

function fmtPct(val) {
  if (val === null || val === undefined || isNaN(val)) return 'N/D';
  const sinal = val > 0 ? '+' : '';
  return `${sinal}${(val * 100).toFixed(1)}%`;
}

function normRua(rua) {
  if (!rua) return '';
  return rua.toUpperCase()
    .replace(/^AVN\b|^AVENIDA\b/g, 'AV')
    .replace(/^ETR\b|^ESTRADA\b/g, 'ESTR')
    .replace(/^PRC\b|^PRACA\b/g, 'PÇA')
    .replace(/^R\b|^RUA\b/g, 'RUA')
    .replace(/\s+/g, ' ')
    .trim();
}

// Desativa o spinner de loading e mostra a aplicação
function esconderLoading() {
  const elLoading = document.getElementById('loading') || document.getElementById('loader');
  const elApp = document.getElementById('app') || document.getElementById('main-app');

  if (elLoading) {
    elLoading.classList.add('hidden');
    elLoading.style.display = 'none';
  }
  if (elApp) {
    elApp.classList.remove('hidden');
    elApp.style.display = '';
  }
}

// ==========================================
// 4. INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    setupTabs();
    setupFiltrosEventos();
    
    // Executa o carregamento dos arquivos em paralelo
    await Promise.allSettled([
      carregarDados(),
      carregarIndices(),
      carregarMeta()
    ]);

    populaSelectBairros();
    inicializarComboboxes();
    renderMethodAuto();
    aplicarFiltros();
  } catch (err) {
    console.error('Erro ao inicializar ImobRJ:', err);
  } finally {
    // Garantia absoluta de desativar a tela de "Carregando dados"
    esconderLoading();
  }
});

function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab, a[href^="#tab-"]');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = tab.getAttribute('href').replace('#', '');
      
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tabs.forEach(t => t.classList.remove('border-blue-600', 'text-blue-600', 'font-semibold'));
      
      const elTarget = document.getElementById(targetId);
      if (elTarget) elTarget.classList.remove('hidden');
      tab.classList.add('border-blue-600', 'text-blue-600', 'font-semibold');

      // Sincroniza escopo caso mude para a aba Transações por Imóvel
      if (targetId === 'tab-tx' && typeof window.syncTransacoesComEscopo === 'function') {
        window.syncTransacoesComEscopo(S.bairroAtual, S.ruaAtual);
      }
    });
  });
}

async function carregarDados() {
  try {
    const res = await fetch('dados.json');
    if (!res.ok) throw new Error('Erro na resposta de dados.json');
    S.raw = await res.json();
    S.dadosBrutos = S.raw;

    const bairroSet = new Set();
    const ruasMap = {};

    S.raw.forEach(item => {
      if (item.bairro) {
        bairroSet.add(item.bairro);
        if (!ruasMap[item.bairro]) ruasMap[item.bairro] = new Set();
        if (item.logradouro) ruasMap[item.bairro].add(item.logradouro);
      }
    });

    S.bairros = Array.from(bairroSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    Object.keys(ruasMap).forEach(b => {
      S.ruasPorBairro[b] = Array.from(ruasMap[b]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    });
  } catch (err) {
    console.error('Falha ao carregar dados.json:', err);
  }
}

async function carregarIndices() {
  try {
    const res = await fetch('indices.json');
    if (res.ok) S.indices = await res.json();
  } catch (err) {
    console.warn('Índices econômicos (indices.json) indisponíveis:', err);
  }
}

async function carregarMeta() {
  try {
    const res = await fetch('meta.json');
    if (res.ok) {
      S.meta = await res.json();
      const elMeta = document.getElementById('metaInfo');
      if (elMeta && S.meta.atualizado_em) {
        elMeta.textContent = `Atualizado em ${S.meta.atualizado_em} (${fmtNumero(S.meta.registros)} registros)`;
      }
    }
  } catch (err) {
    console.warn('meta.json indisponível:', err);
  }
}

function populaSelectBairros() {
  const selBairro = document.getElementById('selBairro') || document.getElementById('filtro-bairro');
  if (!selBairro) return;

  selBairro.innerHTML = '<option value="">Todos os Bairros (Cidade do Rio)</option>';
  S.bairros.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    selBairro.appendChild(opt);
  });
}

function populaSelectRuas(bairro) {
  const selRua = document.getElementById('selRua') || document.getElementById('filtro-rua');
  if (!selRua) return;

  selRua.innerHTML = '<option value="">Todas as Ruas / Logradouros</option>';
  if (bairro && S.ruasPorBairro[bairro]) {
    S.ruasPorBairro[bairro].forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      selRua.appendChild(opt);
    });
  }

  if (selRua._syncComboboxOptions) selRua._syncComboboxOptions();
}

function inicializarComboboxes() {
  const selBairro = document.getElementById('selBairro') || document.getElementById('filtro-bairro');
  const selRua = document.getElementById('selRua') || document.getElementById('filtro-rua');
  const cmpExtra = document.getElementById('cmpExtra');

  if (selBairro) enhanceSelectToCombobox(selBairro, 'Buscar bairro...');
  if (selRua) enhanceSelectToCombobox(selRua, 'Buscar rua/logradouro...');
  if (cmpExtra) enhanceSelectToCombobox(cmpExtra, 'Comparar com outro bairro...');
}

function setupFiltrosEventos() {
  const selBairro = document.getElementById('selBairro') || document.getElementById('filtro-bairro');
  const selRua = document.getElementById('selRua') || document.getElementById('filtro-rua');
  const fDe = document.getElementById('filtro-de') || document.getElementById('fDe');
  const fAte = document.getElementById('filtro-ate') || document.getElementById('fAte');
  const fTipo = document.getElementById('filtro-tipo') || document.getElementById('fTipo');

  if (selBairro) {
    selBairro.addEventListener('change', (e) => {
      S.bairroAtual = e.target.value;
      S.ruaAtual = '';
      populaSelectRuas(S.bairroAtual);
      S.escopo = S.bairroAtual ? 'bairro' : 'cidade';
      aplicarFiltros();
    });
  }

  if (selRua) {
    selRua.addEventListener('change', (e) => {
      S.ruaAtual = e.target.value;
      S.escopo = S.ruaAtual ? 'rua' : (S.bairroAtual ? 'bairro' : 'cidade');
      aplicarFiltros();
    });
  }

  if (fDe) fDe.addEventListener('change', (e) => { F.de = e.target.value; aplicarFiltros(); });
  if (fAte) fAte.addEventListener('change', (e) => { F.ate = e.target.value; aplicarFiltros(); });
  if (fTipo) fTipo.addEventListener('change', (e) => { F.tipo = e.target.value; aplicarFiltros(); });
}

// ==========================================
// 5. MOTOR DE FILTRAGEM E CÁLCULOS
// ==========================================
function aplicarFiltros() {
  const deVal = (document.getElementById('filtro-de') || document.getElementById('fDe'))?.value || F.de;
  const ateVal = (document.getElementById('filtro-ate') || document.getElementById('fAte'))?.value || F.ate;
  const tipoVal = (document.getElementById('filtro-tipo') || document.getElementById('fTipo'))?.value || F.tipo;

  F.de = deVal;
  F.ate = ateVal;
  F.tipo = tipoVal;

  S.filtrados = S.dadosBrutos.filter(item => {
    if (S.bairroAtual && strip(item.bairro) !== strip(S.bairroAtual)) return false;
    if (S.ruaAtual && strip(item.logradouro) !== strip(S.ruaAtual)) return false;

    const periodo = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
    if (F.de && periodo < F.de) return false;
    if (F.ate && periodo > F.ate) return false;

    if (F.tipo !== 'todos' && item.tipo !== F.tipo) return false;

    return true;
  });

  renderKPIs();
  renderGraficos();
}

// ==========================================
// 6. RENDERIZAÇÃO DE KPIS E METODOLOGIA
// ==========================================
function renderKPIs() {
  let totalTx = 0;
  let somaValorM2Ponderado = 0;
  let somaValorImovelPonderado = 0;

  S.filtrados.forEach(item => {
    const tx = item.transacoes || 1;
    totalTx += tx;
    somaValorM2Ponderado += (item.valor_m2 || 0) * tx;
    somaValorImovelPonderado += (item.valor || 0) * tx;
  });

  const mediaValorM2 = totalTx > 0 ? somaValorM2Ponderado / totalTx : 0;
  const mediaValorImovel = totalTx > 0 ? somaValorImovelPonderado / totalTx : 0;

  const elM2 = document.getElementById('kpi-valor-m2') || document.getElementById('kpiM2');
  const elImovel = document.getElementById('kpi-valor-imovel') || document.getElementById('kpiValor');
  const elTx = document.getElementById('kpi-transacoes') || document.getElementById('kpiTx');
  const elVarReal = document.getElementById('kpi-var-real') || document.getElementById('kpiVarReal');

  if (elM2) elM2.textContent = fmtMoeda(mediaValorM2);
  if (elImovel) elImovel.textContent = fmtMoeda(mediaValorImovel);
  if (elTx) elTx.textContent = fmtNumero(totalTx);

  if (elVarReal) {
    const varInfo = calcularVariacaoAcumuladaPeriodo(F.de, F.ate);
    if (varInfo) {
      elVarReal.innerHTML = `
        <span class="${varInfo.varReal >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">
          ${fmtPct(varInfo.varReal)}
        </span>
        <span class="text-xs text-gray-500 block mt-1" title="IPCA: ${fmtPct(varInfo.ipca)} | CDI: ${fmtPct(varInfo.cdi)}">
          vs IPCA no período (${varInfo.rotulo})
        </span>
      `;
    } else {
      elVarReal.textContent = 'N/D';
    }
  }
}

function calcularVariacaoAcumuladaPeriodo(de, ate) {
  if (!S.indices || !S.indices.series) return null;

  const ipcaDados = S.indices.series.ipca?.dados || {};
  const cdiDados = S.indices.series.cdi?.dados || {};

  const chaves = Object.keys(ipcaDados).sort();
  if (!chaves.length) return null;

  const inicio = de || chaves[0];
  const fim = ate || chaves[chaves.length - 1];

  let fatorIpca = 1.0;
  let fatorCdi = 1.0;
  let count = 0;

  chaves.forEach(k => {
    if (k >= inicio && k <= fim) {
      if (ipcaDados[k] !== undefined) fatorIpca *= (1 + ipcaDados[k] / 100);
      if (cdiDados[k] !== undefined) fatorCdi *= (1 + cdiDados[k] / 100);
      count++;
    }
  });

  if (count === 0) return null;

  const grupos = {};
  S.filtrados.forEach(d => {
    const k = `${d.ano}-${String(d.mes).padStart(2, '0')}`;
    if (!grupos[k]) grupos[k] = { somaM2: 0, tx: 0 };
    grupos[k].somaM2 += d.valor_m2 * (d.transacoes || 1);
    grupos[k].tx += (d.transacoes || 1);
  });

  const mesesComDados = Object.keys(grupos).sort();
  if (mesesComDados.length < 2) return null;

  const mIni = grupos[mesesComDados[0]];
  const mFim = grupos[mesesComDados[mesesComDados.length - 1]];

  const valIni = mIni.somaM2 / mIni.tx;
  const valFim = mFim.somaM2 / mFim.tx;

  const varNominal = (valFim - valIni) / valIni;
  const acumuladoIpca = fatorIpca - 1;
  const acumuladoCdi = fatorCdi - 1;

  const varReal = ((1 + varNominal) / (1 + acumuladoIpca)) - 1;

  return {
    varNominal,
    ipca: acumuladoIpca,
    cdi: acumuladoCdi,
    varReal,
    rotulo: `${mesesComDados[0]} a ${mesesComDados[mesesComDados.length - 1]}`
  };
}

function renderMethodAuto() {
  const mItbi = document.getElementById('mItbi');
  const mIpca = document.getElementById('mIpca');
  const mCdi = document.getElementById('mCdi');

  if (mItbi && S.dadosBrutos.length) {
    mItbi.textContent = `Base agregada oficial da Secretaria Municipal de Fazenda do Rio de Janeiro via Data.Rio (${fmtNumero(S.dadosBrutos.length)} registros processados).`;
  }
  if (mIpca && S.indices?.series?.ipca) {
    mIpca.textContent = `Índice de Preços ao Consumidor Amplo (IBGE, série SGS 433 do Banco Central).`;
  }
  if (mCdi && S.indices?.series?.cdi) {
    mCdi.textContent = `Taxa CDI acumulada mensal (B3, série SGS 4391 do Banco Central).`;
  }
}

// ==========================================
// 7. RENDERIZAÇÃO DE GRÁFICOS (Interatividade + Hitbox Otimizados)
// ==========================================
const CHART_INTERACTION = {
  interaction: {
    mode: 'index',
    intersect: false
  },
  elements: {
    point: {
      radius: 3,
      hoverRadius: 7,
      hitRadius: 16
    },
    line: {
      tension: 0.2
    }
  },
  plugins: {
    tooltip: {
      position: 'nearest'
    }
  }
};

function renderGraficos() {
  renderGraficoEvolucao();
  renderGraficoComparativo();
}

function renderGraficoEvolucao() {
  const ctx = document.getElementById('chart-evolucao') || document.getElementById('chartEvolucao');
  if (!ctx) return;

  const porMes = {};
  S.filtrados.forEach(item => {
    const k = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
    if (!porMes[k]) porMes[k] = { somaM2: 0, tx: 0 };
    porMes[k].somaM2 += item.valor_m2 * (item.transacoes || 1);
    porMes[k].tx += (item.transacoes || 1);
  });

  const labels = Object.keys(porMes).sort();
  const dataValues = labels.map(k => Math.round(porMes[k].somaM2 / porMes[k].tx));

  if (chartEvolucao) {
    chartEvolucao.destroy();
    chartEvolucao = null;
  }

  chartEvolucao = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Preço Médio R$/m²',
        data: dataValues,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        fill: true,
        borderWidth: 2,
        pointHitRadius: 16
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...CHART_INTERACTION,
      scales: {
        y: {
          ticks: {
            callback: (val) => 'R$ ' + val.toLocaleString('pt-BR')
          }
        }
      }
    }
  });
}

function renderGraficoComparativo() {
  const ctx = document.getElementById('chart-comparativo') || document.getElementById('chartComparativo');
  if (!ctx) return;

  const porMes = {};
  S.filtrados.forEach(item => {
    const k = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
    if (!porMes[k]) porMes[k] = { somaM2: 0, tx: 0 };
    porMes[k].somaM2 += item.valor_m2 * (item.transacoes || 1);
    porMes[k].tx += (item.transacoes || 1);
  });

  const labels = Object.keys(porMes).sort();
  if (!labels.length) {
    if (chartComparativo) {
      chartComparativo.destroy();
      chartComparativo = null;
    }
    return;
  }

  const baseM2 = porMes[labels[0]].somaM2 / porMes[labels[0]].tx;

  const ipcaDados = S.indices?.series?.ipca?.dados || {};
  const cdiDados = S.indices?.series?.cdi?.dados || {};

  let accIpca = 100;
  let accCdi = 100;

  const serieImovel = [];
  const serieIpca = [];
  const serieCdi = [];

  labels.forEach((k, idx) => {
    const valM2 = porMes[k].somaM2 / porMes[k].tx;
    serieImovel.push(Number(((valM2 / baseM2) * 100).toFixed(2)));

    if (idx > 0) {
      if (ipcaDados[k] !== undefined) accIpca *= (1 + ipcaDados[k] / 100);
      if (cdiDados[k] !== undefined) accCdi *= (1 + cdiDados[k] / 100);
    }
    serieIpca.push(Number(accIpca.toFixed(2)));
    serieCdi.push(Number(accCdi.toFixed(2)));
  });

  if (chartComparativo) {
    chartComparativo.destroy();
    chartComparativo = null;
  }

  chartComparativo = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Imóveis (Base 100)',
          data: serieImovel,
          borderColor: '#2563eb',
          borderWidth: 2,
          pointHitRadius: 16
        },
        {
          label: 'IPCA (Base 100)',
          data: serieIpca,
          borderColor: '#dc2626',
          borderDash: [5, 5],
          borderWidth: 2,
          pointHitRadius: 16
        },
        {
          label: 'CDI (Base 100)',
          data: serieCdi,
          borderColor: '#16a34a',
          borderDash: [3, 3],
          borderWidth: 2,
          pointHitRadius: 16
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...CHART_INTERACTION,
      scales: {
        y: {
          title: { display: true, text: 'Evolução Acumulada (Base 100)' }
        }
      }
    }
  });
}