/* ImobRJ — Inteligência do Mercado Imobiliário do Rio de Janeiro
   Licença de Dados: CC BY 4.0 (Prefeitura do Rio / Secretaria de Fazenda)
   Desenvolvido com JS puro + Chart.js + Tailwind CSS
*/

// ==========================================
// 1. ESTADO GLOBAL DA APLICAÇÃO
// ==========================================
const S = {
  bairros: [],          // Lista de bairros ordenados
  ruasPorBairro: {},    // { "COPACABANA": ["RUA BARATA RIBEIRO", ...] }
  dadosBrutos: [],      // Registros do dados.json
  indices: null,        // Registros de IPCA/CDI
  filtrados: [],        // Registros após aplicar o filtro atual
  escopo: 'cidade',     // 'cidade' | 'bairro' | 'rua'
  bairroAtual: '',
  ruaAtual: ''
};

const F = {
  de: '2018-01',
  ate: '',
  tipo: 'todos',        // 'todos' | 'Residencial' | 'Comercial'
  tipologia: 'todas'    // 'todas' | 'Apartamento' | 'Casa' | etc.
};

// Instâncias dos gráficos para destroy/re-render
let chartEvolucao = null;
let chartComparativo = null;
let chartDistribuicao = null;

// ==========================================
// 2. HELPER COMBOBOX REUTILIZÁVEL (Item 5)
// ==========================================
class ImobCombobox {
  constructor({ containerId, inputId, dropdownId, placeholder, onSelect }) {
    this.container = document.getElementById(containerId);
    this.input = document.getElementById(inputId);
    this.dropdown = document.getElementById(dropdownId);
    this.onSelect = onSelect;
    this.options = [];
    this.selectedIndex = -1;

    if (!this.container || !this.input || !this.dropdown) return;
    this.init();
  }

  init() {
    this.input.addEventListener('input', () => this.filterOptions());
    this.input.addEventListener('focus', () => this.show());
    
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.hide();
      }
    });

    this.input.addEventListener('keydown', (e) => {
      const items = this.dropdown.querySelectorAll('.combo-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.highlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.highlight(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
          items[this.selectedIndex].click();
        }
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  setOptions(options) {
    this.options = options;
  }

  setValue(val) {
    if (this.input) this.input.value = val || '';
  }

  getValue() {
    return this.input ? this.input.value.trim() : '';
  }

  highlight(items) {
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add('bg-blue-50', 'text-blue-700', 'font-semibold');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('bg-blue-50', 'text-blue-700', 'font-semibold');
      }
    });
  }

  filterOptions() {
    const q = strip(this.input.value);
    const matches = this.options.filter(opt => strip(opt.label || opt).includes(q));
    this.renderDropdown(matches.slice(0, 80));
  }

  show() {
    this.filterOptions();
    this.dropdown.classList.remove('hidden');
  }

  hide() {
    this.dropdown.classList.add('hidden');
    this.selectedIndex = -1;
  }

  renderDropdown(list) {
    this.dropdown.innerHTML = '';
    this.selectedIndex = -1;

    if (!list.length) {
      this.dropdown.innerHTML = '<div class="p-3 text-sm text-gray-500">Nenhum resultado encontrado</div>';
      this.dropdown.classList.remove('hidden');
      return;
    }

    list.forEach(item => {
      const val = typeof item === 'string' ? item : item.value;
      const lbl = typeof item === 'string' ? item : item.label;

      const div = document.createElement('div');
      div.className = 'combo-item px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors';
      div.textContent = lbl;
      div.addEventListener('click', () => {
        this.input.value = lbl;
        this.hide();
        if (this.onSelect) this.onSelect(val, lbl);
      });
      this.dropdown.appendChild(div);
    });

    this.dropdown.classList.remove('hidden');
  }
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

// Normalizador para logradouros
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

// ==========================================
// 4. INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupFiltrosEventos();
  await carregarDados();
  await carregarIndices();
  inicializarComboboxes();
  aplicarFiltros();
});

function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = tab.getAttribute('href').replace('#', '');
      
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tabs.forEach(t => t.classList.remove('border-blue-600', 'text-blue-600', 'font-semibold'));
      
      const elTarget = document.getElementById(target);
      if (elTarget) elTarget.classList.remove('hidden');
      tab.classList.add('border-blue-600', 'text-blue-600', 'font-semibold');

      // Se mudar para transações, aciona sync se o módulo transações.js existir
      if (target === 'tab-tx' && typeof window.syncTransacoesComEscopo === 'function') {
        window.syncTransacoesComEscopo(S.bairroAtual, S.ruaAtual);
      }
    });
  });
}

async function carregarDados() {
  try {
    const res = await fetch('dados.json');
    if (!res.ok) throw new Error('Falha ao carregar dados.json');
    S.dadosBrutos = await res.json();

    // Mapeia Bairros e Ruas
    const bairroSet = new Set();
    const ruasMap = {};

    S.dadosBrutos.forEach(item => {
      bairroSet.add(item.bairro);
      if (!ruasMap[item.bairro]) ruasMap[item.bairro] = new Set();
      ruasMap[item.bairro].add(item.logradouro);
    });

    S.bairros = Array.from(bairroSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    Object.keys(ruasMap).forEach(b => {
      S.ruasPorBairro[b] = Array.from(ruasMap[b]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    });

  } catch (err) {
    console.error('Erro ao inicializar dados:', err);
  }
}

async function carregarIndices() {
  try {
    const res = await fetch('indices.json');
    if (res.ok) {
      S.indices = await res.json();
    }
  } catch (err) {
    console.warn('Índices econômicos não disponíveis localmente:', err);
  }
}

// ==========================================
// 5. INICIALIZAÇÃO DE COMBOBOXES (Item 5)
// ==========================================
let comboBairro = null;
let comboRua = null;

function inicializarComboboxes() {
  comboBairro = new ImobCombobox({
    containerId: 'box-combo-bairro',
    inputId: 'input-combo-bairro',
    dropdownId: 'drop-combo-bairro',
    onSelect: (val) => {
      S.bairroAtual = val;
      S.ruaAtual = '';
      if (comboRua) {
        comboRua.setValue('');
        comboRua.setOptions(S.ruasPorBairro[val] || []);
      }
      S.escopo = val ? 'bairro' : 'cidade';
      aplicarFiltros();
    }
  });

  comboRua = new ImobCombobox({
    containerId: 'box-combo-rua',
    inputId: 'input-combo-rua',
    dropdownId: 'drop-combo-rua',
    onSelect: (val) => {
      S.ruaAtual = val;
      S.escopo = val ? 'rua' : (S.bairroAtual ? 'bairro' : 'cidade');
      aplicarFiltros();
    }
  });

  if (comboBairro) {
    comboBairro.setOptions(S.bairros);
  }
}

function setupFiltrosEventos() {
  const fDe = document.getElementById('filtro-de');
  const fAte = document.getElementById('filtro-ate');
  const fTipo = document.getElementById('filtro-tipo');

  if (fDe) fDe.addEventListener('change', (e) => { F.de = e.target.value; aplicarFiltros(); });
  if (fAte) fAte.addEventListener('change', (e) => { F.ate = e.target.value; aplicarFiltros(); });
  if (fTipo) fTipo.addEventListener('change', (e) => { F.tipo = e.target.value; aplicarFiltros(); });
}

// ==========================================
// 6. MOTOR DE FILTRAGEM E CÁLCULOS
// ==========================================
function aplicarFiltros() {
  S.filtrados = S.dadosBrutos.filter(item => {
    // Escopo
    if (S.bairroAtual && item.bairro !== S.bairroAtual) return false;
    if (S.ruaAtual && item.logradouro !== S.ruaAtual) return false;

    // Período YYYY-MM
    const periodo = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
    if (F.de && periodo < F.de) return false;
    if (F.ate && periodo > F.ate) return false;

    // Tipo
    if (F.tipo !== 'todos' && item.tipo !== F.tipo) return false;

    return true;
  });

  renderKPIs();
  renderGraficos();
}

// ==========================================
// 7. RENDERIZAÇÃO DE KPIS (Itens 3 e 4)
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

  const elM2 = document.getElementById('kpi-valor-m2');
  const elImovel = document.getElementById('kpi-valor-imovel');
  const elTx = document.getElementById('kpi-transacoes');
  const elVarReal = document.getElementById('kpi-var-real');

  if (elM2) elM2.textContent = fmtMoeda(mediaValorM2);
  if (elImovel) elImovel.textContent = fmtMoeda(mediaValorImovel);
  if (elTx) elTx.textContent = fmtNumero(totalTx);

  // Cálculo da variação real ajustada pela janela selecionada (F.de a F.ate)
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

  // Variação nominal estimada dos imóveis filtrados no primeiro vs último mês
  const grupos = {};
  S.filtrados.forEach(d => {
    const k = `${d.ano}-${String(d.mes).padStart(2, '0')}`;
    if (!grupos[k]) grupos[k] = { somaM2: 0, tx: 0 };
    grupos[k].somaM2 += d.valor_m2 * d.transacoes;
    grupos[k].tx += d.transacoes;
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

// ==========================================
// 8. RENDERIZAÇÃO DE GRÁFICOS (Item 1)
// ==========================================
// Configuração padrão de interatividade otimizada para Desktop e Celular
const INTERACTION_CONFIG = {
  interaction: {
    mode: 'index',
    intersect: false
  },
  elements: {
    point: {
      radius: 3,
      hoverRadius: 7,
      hitRadius: 16 // Amplia a área de toque/clique no mouse e celular
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
  const ctx = document.getElementById('chart-evolucao');
  if (!ctx) return;

  const porMes = {};
  S.filtrados.forEach(item => {
    const k = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
    if (!porMes[k]) porMes[k] = { somaM2: 0, tx: 0 };
    porMes[k].somaM2 += item.valor_m2 * item.transacoes;
    porMes[k].tx += item.transacoes;
  });

  const labels = Object.keys(porMes).sort();
  const dataValues = labels.map(k => Math.round(porMes[k].somaM2 / porMes[k].tx));

  if (chartEvolucao) chartEvolucao.destroy();

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
        pointHitRadius: 16
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...INTERACTION_CONFIG,
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
  const ctx = document.getElementById('chart-comparativo');
  if (!ctx || !S.indices) return;

  const porMes = {};
  S.filtrados.forEach(item => {
    const k = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
    if (!porMes[k]) porMes[k] = { somaM2: 0, tx: 0 };
    porMes[k].somaM2 += item.valor_m2 * item.transacoes;
    porMes[k].tx += item.transacoes;
  });

  const labels = Object.keys(porMes).sort();
  if (!labels.length) return;

  const baseM2 = porMes[labels[0]].somaM2 / porMes[labels[0]].tx;

  const ipcaDados = S.indices.series?.ipca?.dados || {};
  const cdiDados = S.indices.series?.cdi?.dados || {};

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

  if (chartComparativo) chartComparativo.destroy();

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
      ...INTERACTION_CONFIG,
      scales: {
        y: {
          title: { display: true, text: 'Evolução Acumulada (Base 100)' }
        }
      }
    }
  });
}