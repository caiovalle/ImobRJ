// ImobRJ — aba "Comprar ou alugar": à vista × financiado × alugar e investir.  (versão calc5)
// Usa do app.js: $, brl, num, mk, lineDs, yBRL, S, BAIRROS, MED, MED_MIN, medOf, IDX, fator, ymLabel.
// Simulação educativa, mês a mês. Não é recomendação.

// ---------- Referências de mercado (ÚNICO lugar para atualizar à mão) ----------
// IPCA, TR e Selic vêm do indices.json (scripts/atualizar_indices.py); os valores abaixo só entram se ele não carregar.
const CALC_REF = {
  data: 'nov/2026',
  // automáticos (reserva)
  ipca: 4.58, ipcaAte: 'set/2026',        // IPCA 12 meses (IBGE)
  tr: 1.96, trAte: 'nov/2026',            // TR acumulada 12 meses (BCB, SGS 7811)
  selic: 13.75, selicData: '04/11/2026',  // meta Selic (Copom)
  // manuais (dependem de banco ou mercado)
  juros: 11.0, jurosFaixa: 'Caixa SBPE (SFH): TR + 10,99% a 11,49% a.a.; acima de R$ 2,25 milhões (SFI): TR + 11,80% a 12%',
  seguros: 210,        // MIP + DFI + taxa de administração, R$/mês (referência de simulador)
  itbi: 3,             // ITBI no município do Rio
  cartorio: 1,         // escritura + registro (estimativa)
  tarifa: 3000,        // avaliação + contrato (faixa usual R$ 2.000 a 3.500)
  yieldAluguel: 6.14,  // rentabilidade do aluguel residencial, % a.a. do valor (FipeZAP, ago/2026, média nacional)
  rendReal: 7.4,       // Tesouro IPCA+ de longo prazo (2045/2050): ~IPCA + 7,4% a.a.
  corretagem: 6,       // comissão de venda (estimativa usual; negociável)
  manutencao: 0.5      // manutenção e reformas, % a.a. do valor do imóvel (estimativa)
};
const f2 = n => (Math.round(n * 100) / 100).toString().replace('.', ',');

const CALC_CAMPOS = [
  // id, rótulo, unidade, passo, ajuda
  ['cValor', 'Valor do imóvel', 'R$', 1000, 'Preço de compra. O botão acima estima pela <b>mediana do R$/m²</b> do bairro (vendas dos últimos 12 meses no ITBI) × a área.'],
  ['cItbi', 'ITBI', '%', 0.1, '<b>ITBI</b>: imposto municipal pago na compra. No Rio a alíquota é 3% sobre o valor da transação, pago antes da escritura.'],
  ['cCartorio', 'Escritura e registro', '%', 0.1, 'Custos de cartório (escritura e registro no RGI). Varia com o valor; cerca de 1% é uma estimativa. No 1º imóvel financiado pelo SFH há desconto de 50% no registro.'],
  ['cValoriz', 'Valorização do imóvel', '% a.a.', 0.1, 'Quanto o imóvel sobe por ano, em R$ correntes. A sugestão é a inflação (valorização real zero). Ao lado aparece a variação histórica da mediana do bairro nos dados do ImobRJ.'],
  ['cManut', 'Manutenção', '% a.a. do valor', 0.1, 'Reformas, consertos e cotas extras de condomínio que ficam com o <b>dono</b> (quem aluga não paga). 0,5% a 1% do valor por ano é uma estimativa comum; imóveis antigos gastam mais.'],
  ['cEntrada', 'Entrada', '%', 1, 'Parte paga à vista no financiamento. Os bancos costumam financiar até 80% do valor, ou seja, entrada mínima de 20%.'],
  ['cFgts', 'FGTS usado', 'R$', 1000, '<b>FGTS</b> que você pode usar na compra (entrada ou valor à vista), se tiver direito. Se não usar, ele fica na conta rendendo TR + 3% a.a. (mais a distribuição de lucros, que não entra aqui).'],
  ['cPrazo', 'Prazo do financiamento', 'anos', 1, 'Até 35 anos (420 meses) nos principais bancos. Prazo maior reduz a parcela, mas aumenta o total de juros.'],
  ['cJuros', 'Juros do financiamento', '% a.a. + TR', 0.01, 'Taxa nominal anual do contrato, somada à TR. Referência: ' + CALC_REF.jurosFaixa + ' (' + CALC_REF.data + ').'],
  ['cTR', 'TR projetada', '% a.a.', 0.01, '<b>TR (Taxa Referencial)</b>: índice do Banco Central que corrige o saldo devedor nos contratos “TR + juros”, a poupança e o FGTS. Ficou zerada entre 2017 e 2021 e voltou a subir com a Selic alta. Quanto maior a TR, mais o saldo devedor cresce.'],
  ['cSeguros', 'Seguros + taxa de administração', 'R$/mês', 10, '<b>MIP</b> (morte e invalidez permanente) e <b>DFI</b> (danos físicos ao imóvel) são obrigatórios no financiamento, além da taxa mensal de administração. Variam com idade e valor; a simulação usa um valor fixo.'],
  ['cTarifa', 'Tarifas do banco', 'R$', 100, 'Avaliação do imóvel e emissão do contrato, cobradas só no financiamento. Em geral entre R$ 2.000 e R$ 3.500.'],
  ['cAluguel', 'Aluguel inicial', 'R$/mês', 50, 'Aluguel de um imóvel equivalente. A sugestão usa a rentabilidade média do aluguel do FipeZAP (' + f2(CALC_REF.yieldAluguel) + '% do valor por ano, <b>média nacional</b>). Compare com anúncios do bairro.'],
  ['cReajAluguel', 'Reajuste do aluguel', '% a.a.', 0.1, 'Correção anual do contrato (hoje quase sempre IPCA). Na prática, na renovação o aluguel tende a acompanhar o preço do imóvel; por isso a opção ao lado vem marcada.'],
  ['cRendReal', 'Rendimento real dos investimentos', '% a.a. acima do IPCA', 0.1, '<b>Custo de oportunidade</b>: quanto o dinheiro que não foi para o imóvel renderia <b>acima da inflação</b>. Usamos taxa real porque a Selic de hoje não se mantém por 20–30 anos. Referência: Tesouro IPCA+ de longo prazo paga hoje cerca de IPCA + ' + f2(CALC_REF.rendReal) + '% a.a., nível alto para o histórico — teste valores menores na sensibilidade.'],
  ['cIR', 'IR sobre o rendimento', '%', 0.5, 'Imposto de Renda sobre o ganho nominal da renda fixa: 15% para aplicações acima de 2 anos, cobrado no resgate. LCI/LCA e poupança são isentas.'],
  ['cIpca', 'Inflação esperada (IPCA)', '% a.a.', 0.1, 'Usada para converter o resultado em <b>valores de hoje</b>, compor o rendimento nominal (IPCA + taxa real) e sugerir a valorização.'],
  ['cHoriz', 'Comparar após', 'anos', 1, 'Momento em que comparamos o patrimônio dos três cenários. Pode ser menor que o prazo do financiamento (o saldo devedor é descontado).'],
  ['cCorret', 'Custo de venda (corretagem)', '% do valor', 0.5, 'Para comparar patrimônio com patrimônio, o imóvel é contado como se fosse vendido no fim: desconta a comissão de corretagem (estimativa usual de 5% a 6%, negociável). Desmarque a opção abaixo para contar o imóvel pelo valor cheio (quem não pretende vender).'],
  ['cIRGanho', 'IR sobre ganho de capital do imóvel', '%', 1, 'Na venda, o lucro paga 15% de IR, mas há <b>isenções e redutores</b> comuns: único imóvel até R$ 440 mil, compra de outro residencial em 180 dias e fatores de redução por tempo de posse. Por isso a sugestão é 0%; use 15% se nenhuma isenção se aplicar (é uma aproximação, sem os redutores).']
];

let CALC_OK = false, CALC_EDIT = new Set();   // campos que o usuário mexeu (não sobrescrever com sugestões)

// IPCA, CDI, TR e Selic: do indices.json quando houver; senão, CALC_REF
function calcSugestoes() {
  const s = { ipca: CALC_REF.ipca, ipcaAte: CALC_REF.ipcaAte, tr: CALC_REF.tr, trAte: CALC_REF.trAte, selic: CALC_REF.selic, selicData: CALC_REF.selicData, auto: {} };
  const fim = IDX?.fim;
  if (fim?.ipca != null) { const f = fator('ipca', fim.ipca - 12, fim.ipca); if (f) { s.ipca = +((f - 1) * 100).toFixed(2); s.ipcaAte = ymLabel(fim.ipca); s.auto.ipca = 1; } }
  if (IDX?.tr && fim?.tr != null) {               // TR do 1º dia: acumula os 12 últimos meses (inclusive o último)
    let f = 1, ok = true; for (let t = fim.tr - 11; t <= fim.tr; t++) { const v = IDX.tr.get(t); if (v == null) { ok = false; break; } f *= 1 + v / 100; }
    if (ok) { s.tr = +((f - 1) * 100).toFixed(2); s.trAte = ymLabel(fim.tr); s.auto.tr = 1; }
  }
  if (IDX?.selic?.valor != null) { s.selic = +IDX.selic.valor; s.selicData = IDX.selic.data; s.auto.selic = 1; }
  return s;
}

// mediana do R$/m² residencial do bairro nos últimos 12 meses com dados e variação histórica anual (1ºs 12 meses → últimos 12)
function calcBairroInfo(nb) {
  if (!MED || !nb) return null;
  const gs = MED.filter(g => g.nb === nb && g.tipo === 'Residencial'); if (!gs.length) return null;
  let t0 = Infinity, t1 = -Infinity; for (const g of gs) { if (g.t < t0) t0 = g.t; if (g.t > t1) t1 = g.t; }
  const fim = medOf(gs.filter(g => g.t > t1 - 12)), ini = medOf(gs.filter(g => g.t < t0 + 12));
  const anos = (t1 - t0 - 11) / 12;
  return { m2: fim?.m2 ?? null, n: fim?.n ?? 0, ate: ymLabel(t1), desde: ymLabel(t0),
           cagr: fim && ini && anos >= 3 ? ((fim.m2 / ini.m2) ** (1 / anos) - 1) * 100 : null };
}

function calcMontar() {
  const campo = ([id, rot, un, passo, ajuda]) => `<div>
      <div class="flex items-center justify-between gap-2"><label for="${id}" class="text-xs font-semibold text-gray-600">${rot}</label>
        <button type="button" class="cHelp text-gray-400 hover:text-brand-600" data-for="${id}" aria-label="O que é ${rot}?"><i class="fa-regular fa-circle-question"></i></button></div>
      <div class="mt-1 flex items-center gap-2"><input id="${id}" type="number" inputmode="decimal" step="${passo}" min="0" class="sel w-full text-right"><span class="text-xs text-gray-500 whitespace-nowrap w-20">${un}</span></div>
      <p id="${id}Sug" class="text-[11px] text-gray-400 mt-0.5"></p>
      <p id="${id}Help" class="hidden text-xs text-gray-600 bg-[#f6f3ef] rounded-lg p-2 mt-1 leading-relaxed">${ajuda}</p></div>`;
  const chk = (id, txt) => `<label class="sm:col-span-2 flex items-center gap-2 text-xs text-gray-700"><input id="${id}" type="checkbox" checked class="accent-[#ef4b3f]">${txt}</label>`;
  const grupo = (tit, ids, extra = '') => `<div class="card"><h3 class="font-bold mb-3">${tit}</h3><div class="grid sm:grid-cols-2 gap-4">${CALC_CAMPOS.filter(c => ids.includes(c[0])).map(campo).join('')}${extra}</div></div>`;
  $('tab-calc').innerHTML = `
    <div>
      <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight">Comprar ou alugar?</h2>
      <p class="text-gray-600 mt-2 max-w-3xl">Compara o patrimônio ao final do período em três caminhos: <b>comprar à vista</b>, <b>comprar financiado</b> e <b>alugar e investir</b> a diferença. Todos os campos são editáveis; as sugestões são referências de mercado. Toque em <i class="fa-regular fa-circle-question"></i> para entender cada item.</p>
    </div>
    <div class="card flex flex-wrap items-end gap-3 text-sm">
      <div><label class="text-xs font-semibold text-gray-600">Bairro</label><select id="cBairro" class="sel block mt-1 min-w-[12rem]"></select></div>
      <div><label class="text-xs font-semibold text-gray-600">Área</label><div class="flex items-center gap-2 mt-1"><input id="cArea" type="number" min="10" step="1" value="70" class="sel w-24 text-right"><span class="text-xs text-gray-500">m²</span></div></div>
      <button id="cUsarMed" class="pill on"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Estimar valor pela mediana</button>
      <p id="cMedInfo" class="text-xs text-gray-500 basis-full"></p>
    </div>
    <div class="grid lg:grid-cols-2 gap-6">
      ${grupo('Imóvel e compra', ['cValor', 'cItbi', 'cCartorio', 'cValoriz', 'cManut'])}
      ${grupo('Financiamento', ['cEntrada', 'cFgts', 'cPrazo', 'cJuros', 'cTR', 'cSeguros', 'cTarifa'])}
      ${grupo('Aluguel', ['cAluguel', 'cReajAluguel'], chk('cAlugVal', 'Aluguel acompanha a valorização do imóvel (recomendado)'))}
      ${grupo('Investimento', ['cRendReal', 'cIR', 'cIpca'])}
      ${grupo('Comparação', ['cHoriz', 'cCorret', 'cIRGanho'], chk('cVender', 'Contar o imóvel como se fosse vendido no fim (desconta corretagem e IR)'))}
      <div class="card flex flex-wrap items-center gap-3 text-sm self-start"><span class="font-semibold">Sistema de amortização:</span>
        <button class="pill cSis on" data-s="sac">SAC</button><button class="pill cSis" data-s="price">Price</button>
        <button type="button" class="cHelp text-gray-400 hover:text-brand-600" data-for="cSis" aria-label="SAC ou Price?"><i class="fa-regular fa-circle-question"></i></button>
        <button id="cReset" class="ml-auto text-xs text-brand-600 hover:underline"><i class="fa-solid fa-rotate-left mr-1"></i>Voltar às sugestões</button>
        <p id="cSisHelp" class="hidden basis-full text-xs text-gray-600 bg-[#f6f3ef] rounded-lg p-2 leading-relaxed"><b>SAC</b>: a amortização é igual todo mês, então a parcela começa mais alta e cai com o tempo; paga menos juros no total. <b>Price</b>: parcela fixa (antes da TR), começa menor que no SAC, mas o saldo cai mais devagar e o total de juros é maior.</p>
      </div>
    </div>
    <div id="cResumo" class="space-y-4"></div>
    <div class="card"><h3 class="font-bold mb-1">Patrimônio ao longo do tempo</h3><p class="text-xs text-gray-500 mb-3">Imóvel (valorizado, menos custos de venda se marcado) − saldo devedor + investimentos líquidos de IR + FGTS, em valores de hoje.</p><div class="chart-box"><canvas id="cCalcChart"></canvas></div></div>
    <div id="cSens" class="card"></div>
    <div id="cDetalhe" class="card overflow-x-auto"></div>
    <div class="card text-xs text-gray-600 space-y-2 leading-relaxed">
      <h3 class="font-bold text-sm text-ink">Como a conta é feita</h3>
      <p><b>Mesmo dinheiro nos três cenários.</b> Todos começam com o dinheiro necessário para comprar à vista (imóvel + ITBI + cartório, usando o FGTS informado). A cada mês, todos têm o mesmo orçamento: o maior gasto entre os cenários (parcela + seguros + manutenção, manutenção sozinha, ou aluguel). O que sobra em cada cenário é investido à taxa real informada + IPCA.</p>
      <p><b>À vista:</b> compra no início e investe o orçamento menos a manutenção. <b>Financiado:</b> paga entrada (com FGTS), ITBI, cartório e tarifas; investe o restante do dinheiro inicial e a sobra mensal; no fim desconta o saldo devedor. <b>Alugar:</b> investe todo o dinheiro inicial e a sobra depois do aluguel; o FGTS continua na conta.</p>
      <p><b>CET (Custo Efetivo Total)</b>: taxa que inclui tudo o que se paga no financiamento — juros, seguros obrigatórios e tarifas. É o número certo para comparar propostas de bancos (que são obrigados a informá-lo). Aqui ele é estimado sem TR, como os bancos costumam divulgar.</p>
      <p><b>Não entram:</b> condomínio e IPTU (no Rio o inquilino costuma pagar os dois, então se anulam), mudança, amortizações extras, redutores do IR sobre ganho de capital e distribuição de lucros do FGTS. O seguro é um valor fixo.</p>
      <p id="cRefs"></p>
      <p class="font-semibold">Simulação educativa, não é recomendação. Confirme taxas, CET e condições com o banco antes de decidir.</p>
    </div>`;
  $('cBairro').innerHTML = '<option value="">— escolha —</option>' + BAIRROS.map(b => `<option value="${b.nb}">${b.nome}</option>`).join('');

  const root = $('tab-calc');
  root.addEventListener('input', e => {
    if (e.target.id === 'cArea') return calcUsarMediana(true);
    if (e.target.type === 'number') CALC_EDIT.add(e.target.id);
    calcSugerir(); calcRodar();                      // atualiza sugestões dependentes (aluguel ← valor, horizonte ← prazo)
  });
  root.addEventListener('change', e => { if (e.target.type === 'checkbox') { calcSugerir(); calcRodar(); } });
  root.addEventListener('click', e => {
    const h = e.target.closest('.cHelp'); if (h) { $(h.dataset.for + 'Help').classList.toggle('hidden'); return; }
    const s = e.target.closest('.cSis'); if (s) { root.querySelectorAll('.cSis').forEach(x => x.classList.toggle('on', x === s)); calcRodar(); }
  });
  $('cBairro').onchange = () => calcUsarMediana();
  $('cUsarMed').onclick = () => calcUsarMediana();
  $('cReset').onclick = () => { CALC_EDIT.clear(); $('cAlugVal').checked = true; $('cVender').checked = true; calcSugerir(); calcUsarMediana(true); calcRodar(); };
  CALC_OK = true;
}

const cv = id => { const v = parseFloat($(id).value); return isFinite(v) ? v : 0; };
function setSug(id, val, txt) {
  if (!CALC_EDIT.has(id)) $(id).value = val;
  $(id + 'Sug').innerHTML = txt;
}
function calcSugerir() {
  const s = calcSugestoes(), V = cv('cValor') || 600000;
  const auto = k => s.auto[k] ? ' · Banco Central' : ' · referência fixa';
  if (!$('cValor').value) $('cValor').value = 600000;
  setSug('cItbi', CALC_REF.itbi, 'Rio de Janeiro: 3%');
  setSug('cCartorio', CALC_REF.cartorio, 'estimativa: ~1%');
  setSug('cManut', CALC_REF.manutencao, 'estimativa: 0,5% a 1% a.a.');
  setSug('cEntrada', 20, 'sugestão: 20% (mínimo usual)');
  setSug('cFgts', 0, 'informe se for usar');
  setSug('cPrazo', 30, 'sugestão: 30 anos (máx. 35)');
  setSug('cJuros', CALC_REF.juros, `Caixa SBPE: 10,99% a 11,49% + TR (${CALC_REF.data})`);
  setSug('cTR', s.tr, `12 meses até ${s.trAte}: ${f2(s.tr)}%${auto('tr')}`);
  setSug('cSeguros', CALC_REF.seguros, `referência: ~R$ ${CALC_REF.seguros}/mês`);
  setSug('cTarifa', CALC_REF.tarifa, 'em geral R$ 2.000 a R$ 3.500');
  const alug = Math.round(V * CALC_REF.yieldAluguel / 100 / 12 / 50) * 50;
  setSug('cAluguel', alug, `≈ ${brl(alug)} (${f2(CALC_REF.yieldAluguel)}% a.a. do valor, FipeZAP)`);
  const acompanha = $('cAlugVal').checked;
  $('cReajAluguel').disabled = acompanha; $('cReajAluguel').classList.toggle('opacity-50', acompanha);
  setSug('cReajAluguel', s.ipca, acompanha ? 'usando a valorização do imóvel' : `IPCA 12 meses: ${f2(s.ipca)}%`);
  setSug('cRendReal', CALC_REF.rendReal, `Tesouro IPCA+ longo: ~${f2(CALC_REF.rendReal)}% · Selic hoje ${f2(s.selic)}% (${s.selicData})${auto('selic')}`);
  setSug('cIR', 15, '15% (aplicações acima de 2 anos)');
  setSug('cIpca', s.ipca, `IPCA 12 meses até ${s.ipcaAte}: ${f2(s.ipca)}%${auto('ipca')}`);
  setSug('cHoriz', cv('cPrazo') || 30, 'sugestão: igual ao prazo');
  setSug('cCorret', CALC_REF.corretagem, 'estimativa: 5% a 6%');
  setSug('cIRGanho', 0, '0% (isenções comuns) ou 15%');
  const vender = $('cVender').checked;
  for (const id of ['cCorret', 'cIRGanho']) { $(id).disabled = !vender; $(id).classList.toggle('opacity-50', !vender); }
  $('cRefs').innerHTML = `<b>Referências das sugestões:</b> IPCA ${f2(s.ipca)}% em 12 meses até ${s.ipcaAte} (IBGE); TR ${f2(s.tr)}% em 12 meses até ${s.trAte} e meta Selic ${f2(s.selic)}% em ${s.selicData} (Banco Central${s.auto.selic ? ', atualizados automaticamente' : ''}); ${CALC_REF.jurosFaixa}; ITBI 3% (Prefeitura do Rio); aluguel ${f2(CALC_REF.yieldAluguel)}% a.a. do valor (FipeZAP, média nacional); Tesouro IPCA+ de longo prazo ~IPCA + ${f2(CALC_REF.rendReal)}% (${CALC_REF.data}). Corretagem, cartório e manutenção são estimativas.`;
  calcInfoBairro();
}
function calcInfoBairro() {
  const nb = $('cBairro').value, info = calcBairroInfo(nb), s = calcSugestoes(), f = n => n.toFixed(1).replace('.', ',');
  if (!MED) $('cMedInfo').textContent = 'Medianas ainda carregando (ou medianas.json não encontrado).';
  else if (!nb) $('cMedInfo').textContent = 'Escolha um bairro para estimar o valor pela mediana do R$/m².';
  else if (!info?.m2) $('cMedInfo').textContent = `Poucas vendas residenciais recentes neste bairro (mín. ${MED_MIN}).`;
  else $('cMedInfo').innerHTML = `Mediana residencial do bairro: <b>${brl(info.m2)}/m²</b> (${num(info.n)} vendas nos 12 meses até ${info.ate}).` +
    (info.cagr != null ? ` Variação histórica: <b>${f(info.cagr)}% a.a.</b> desde ${info.desde} (nominal).` : '');
  setSug('cValoriz', s.ipca, `sugestão: inflação (${f2(s.ipca)}%)` + (info?.cagr != null ? ` · histórico do bairro: ${f(info.cagr)}% a.a.` : ''));
}
function calcUsarMediana(quieto) {
  const info = calcBairroInfo($('cBairro').value);
  if (!info?.m2) { if (!quieto) calcInfoBairro(); return; }
  $('cValor').value = Math.round(info.m2 * cv('cArea') / 1000) * 1000; CALC_EDIT.delete('cValor'); CALC_EDIT.delete('cAluguel');
  calcSugerir(); calcRodar();
}

// ---------- Motor da simulação (mensal) ----------
const aMes = a => Math.pow(1 + a / 100, 1 / 12) - 1;   // taxa anual efetiva → mensal
function financiamento(F, n, jurosAA, trAA, sis, seguro) {
  const i = jurosAA / 100 / 12, tr = aMes(trAA), parc = [], saldoFim = [];   // juros nominais a.a. ÷ 12 (padrão dos contratos)
  let s = F, juros = 0;
  for (let k = 0; k < n; k++) {
    s *= 1 + tr;
    const j = s * i, rest = n - k;
    const amort = sis === 'sac' ? s / rest : (i ? s * i / (1 - Math.pow(1 + i, -rest)) : s / rest) - j;
    parc.push(j + amort + seguro); juros += j; s -= amort; saldoFim.push(Math.max(s, 0));
  }
  return { parc, saldoFim, juros };
}
function cetAA(F, tarifa, parc) {          // TIR mensal (bisseção) → anual
  const vp = r => { let v = F - tarifa, d = 1; for (const p of parc) { d /= 1 + r; v -= p * d; } return v; };
  let lo = 0, hi = 0.1; if (vp(lo) < 0 === vp(hi) < 0) return null;
  for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2; (vp(m) > 0) === (vp(lo) > 0) ? lo = m : hi = m; }
  return (Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100;
}
// p: parâmetros; leve = true pula CET, série e detalhes (usado na sensibilidade)
function calcSimular(p, leve = false) {
  const n = Math.round(p.prazo * 12), H = Math.max(1, Math.round(p.horiz * 12));
  const E = p.V * p.entrada / 100, F = p.V - E, custo = p.V * (p.itbi + p.cartorio) / 100, K = p.V + custo;
  const fgts = Math.max(0, p.fgts), fgA = Math.min(fgts, p.V), fgB = Math.min(fgts, E);
  const caixa = K - fgA;                                    // dinheiro próprio inicial (igual nos três cenários)
  const fin = financiamento(F, n, p.juros, p.tr, p.sis, p.seguros);
  const rI = aMes(((1 + p.ipca / 100) * (1 + p.rendReal / 100) - 1) * 100), rV = aMes(p.valoriz), rP = aMes(p.ipca);
  const rF = aMes(((1 + p.tr / 100) * 1.03 - 1) * 100);     // FGTS: TR + 3% a.a.
  const reaj = p.alugVal ? p.valoriz : p.reajAluguel;
  const inv = v0 => ({ s: v0, ap: v0 });
  const needB = E - fgB + custo + p.tarifa;
  const A = { inv: inv(0), fg: fgts - fgA }, B = { inv: inv(Math.max(0, caixa - needB)), fg: fgts - fgB }, C = { inv: inv(caixa), fg: fgts };
  const serie = { a: [], b: [], c: [], anos: [] };
  let aluguel = p.aluguel, totAlug = 0, totManut = 0, imovel = p.V;
  const liq = x => x.s - Math.max(0, x.s - x.ap) * p.ir / 100;   // IR só sobre o ganho, no resgate
  const venda = v => {                                             // valor líquido do imóvel se vendido
    if (!p.vender) return v;
    const bruto = v * (1 - p.corret / 100);
    return bruto - Math.max(0, bruto - K) * p.irGanho / 100;
  };
  const patr = (m, imv) => {
    const saldo = m < n ? fin.saldoFim[m] : 0, vl = venda(imv);
    return { a: vl + liq(A.inv) + A.fg, b: vl - saldo + liq(B.inv) + B.fg, c: liq(C.inv) + C.fg, saldo, vl };
  };
  let ult = null;
  for (let m = 0; m < H; m++) {
    if (m > 0 && m % 12 === 0) aluguel *= 1 + reaj / 100;
    const pf = m < n ? fin.parc[m] : 0, manut = imovel * p.manut / 100 / 12;
    const outA = manut, outB = pf + manut, outC = aluguel, orc = Math.max(outA, outB, outC);
    for (const x of [A, B, C]) { x.inv.s *= 1 + rI; x.fg *= 1 + rF; }
    A.inv.s += orc - outA; A.inv.ap += orc - outA;
    B.inv.s += orc - outB; B.inv.ap += orc - outB;
    C.inv.s += orc - outC; C.inv.ap += orc - outC;
    totAlug += aluguel; totManut += manut; imovel *= 1 + rV;
    if (!leve && ((m + 1) % 12 === 0 || m === H - 1)) {
      const d = Math.pow(1 + rP, m + 1), q = patr(m, imovel);
      serie.anos.push(((m + 1) / 12).toFixed((m + 1) % 12 ? 1 : 0));
      serie.a.push(q.a / d); serie.b.push(q.b / d); serie.c.push(q.c / d);
    }
  }
  const defl = Math.pow(1 + rP, H), q = patr(H - 1, imovel);
  const res = {
    a: { nom: q.a, imovel, vl: q.vl, inv: liq(A.inv), fg: A.fg },
    b: { nom: q.b, imovel, vl: q.vl, saldo: q.saldo, inv: liq(B.inv), fg: B.fg },
    c: { nom: q.c, inv: liq(C.inv), fg: C.fg }
  };
  for (const k of 'abc') res[k].hoje = res[k].nom / defl;
  if (leve) return { res };
  const cet = cetAA(F, p.tarifa, financiamento(F, n, p.juros, 0, p.sis, p.seguros).parc);
  return { res, serie, fin, cet, K, custo, F, n, H, totAlug, totManut, aluguelFinal: aluguel, caixa, needB, faltaB: Math.max(0, needB - caixa),
           pagoFin: fin.parc.slice(0, Math.min(n, H)).reduce((s, x) => s + x, 0), rendNom: ((1 + p.ipca / 100) * (1 + p.rendReal / 100) - 1) * 100 };
}

// ---------- Sensibilidade ----------
const vantagemCompra = p => { const r = calcSimular(p, true).res; return Math.max(r.a.hoje, r.b.hoje) - r.c.hoje; };   // > 0: comprar ganha
function pontoVirada(p, campo, lo, hi) {        // valor do campo em que comprar e alugar empatam (null se não inverte no intervalo)
  const f = x => vantagemCompra({ ...p, [campo]: x });
  let a = lo, b = hi, fa = f(a), fb = f(b);
  if (fa > 0 === fb > 0) return null;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2, fm = f(m); if (fm > 0 === fa > 0) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
}
function calcSensibilidade(p, R) {
  const pc = v => f2(Math.round(v * 10) / 10) + '%';
  // campo: parâmetro do modelo; v: ponto de virada nesse parâmetro; mostra: converte para a unidade exibida
  const linha = (rot, campo, lo, hi, mostra = x => x) => {
    const v = pontoVirada(p, campo, lo, hi), atual = mostra(p[campo]);
    if (v == null) return `<li><b>${rot}</b> (hoje ${pc(atual)}): o resultado <b>não se inverte</b> entre ${pc(mostra(lo))} e ${pc(mostra(hi))}.</li>`;
    const acimaCompra = vantagemCompra({ ...p, [campo]: v + (hi - lo) * 0.01 }) > 0;
    return `<li><b>${rot}</b> (hoje ${pc(atual)}): empata em <b>${pc(mostra(v))}</b>; acima disso, <b>${acimaCompra ? 'comprar' : 'alugar'}</b> ganha.</li>`;
  };
  const yld = x => x * 12 / p.V * 100;
  // grade: rendimento real × valorização real
  const reais = [-2, -1, 0, 1, 2, 3], rends = [p.rendReal - 3, p.rendReal - 2, p.rendReal - 1, p.rendReal, p.rendReal + 1, p.rendReal + 2].filter(x => x >= -1);
  const cores = { a: '#1e3a5f', b: '#ef4b3f', c: '#14b8a6' }, nomes = { a: 'À vista', b: 'Financ.', c: 'Alugar' };
  const valReal = ((1 + p.valoriz / 100) / (1 + p.ipca / 100) - 1) * 100;
  const cel = (rr, vr) => {
    const r = calcSimular({ ...p, rendReal: rr, valoriz: ((1 + p.ipca / 100) * (1 + vr / 100) - 1) * 100 }, true).res;
    const k = 'abc'.split('').reduce((m, x) => r[x].hoje > r[m].hoje ? x : m, 'a');
    const atual = Math.abs(rr - p.rendReal) < 1e-9 && Math.abs(vr - Math.round(valReal)) < 1e-9;
    return `<td class="text-center text-[11px] font-semibold text-white py-1.5 ${atual ? 'outline outline-2 outline-offset-[-3px] outline-white' : ''}" style="background:${cores[k]}">${nomes[k]}</td>`;
  };
  $('cSens').innerHTML = `<h3 class="font-bold mb-1">Sensibilidade: o que inverteria o resultado?</h3>
    <p class="text-xs text-gray-500 mb-3">Mudando uma premissa por vez (as demais como estão acima), onde “comprar” (melhor entre à vista e financiado) e “alugar e investir” empatam.</p>
    <ul class="text-sm space-y-1.5 list-disc pl-5 mb-4">
      ${linha('Rendimento real dos investimentos', 'rendReal', -2, 15)}
      ${linha('Valorização do imóvel (nominal)', 'valoriz', p.ipca - 6, p.ipca + 12)}
      ${linha('Aluguel (% do valor do imóvel por ano)', 'aluguel', p.V * 0.01 / 12, p.V * 0.15 / 12, yld)}
    </ul>
    <div class="overflow-x-auto"><table class="text-xs min-w-[460px]"><thead><tr><th class="text-left pr-2 font-normal text-gray-500">Rend. real ↓ · Valorização real →</th>${reais.map(v => `<th class="px-1 font-semibold">${v > 0 ? '+' : ''}${v}%</th>`).join('')}</tr></thead><tbody>
      ${rends.map(rr => `<tr><th class="text-left pr-2 font-semibold">${pc(rr)}</th>${reais.map(vr => cel(rr, vr)).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="text-[11px] text-gray-500 mt-2">Cada célula mostra o cenário com maior patrimônio. Valorização real = acima do IPCA (0% = imóvel acompanha a inflação). ${Math.abs(valReal - Math.round(valReal)) < 0.05 ? 'A célula com contorno é a premissa atual.' : `Premissa atual: valorização real de ${pc(valReal)}.`}</p>`;
}

function calcRodar() {
  if (!CALC_OK) return;
  const p = { V: cv('cValor'), entrada: Math.min(cv('cEntrada'), 100), fgts: cv('cFgts'), prazo: Math.max(1, Math.min(cv('cPrazo'), 35)), juros: cv('cJuros'), tr: cv('cTR'),
    seguros: cv('cSeguros'), itbi: cv('cItbi'), cartorio: cv('cCartorio'), tarifa: cv('cTarifa'), manut: cv('cManut'), aluguel: cv('cAluguel'), reajAluguel: cv('cReajAluguel'),
    alugVal: $('cAlugVal').checked, valoriz: cv('cValoriz'), rendReal: parseFloat($('cRendReal').value) || 0, ir: cv('cIR'), ipca: cv('cIpca'),
    horiz: Math.max(1, Math.min(cv('cHoriz'), 40)), vender: $('cVender').checked, corret: cv('cCorret'), irGanho: cv('cIRGanho'),
    sis: document.querySelector('.cSis.on')?.dataset.s || 'sac' };
  if (p.V <= 0) { $('cResumo').innerHTML = '<div class="card text-gray-500">Informe o valor do imóvel.</div>'; return; }
  const r = calcSimular(p), R = r.res, f1 = v => v.toFixed(1).replace('.', ',');
  const cen = [['a', 'Comprar à vista', '#1e3a5f', 'fa-sack-dollar'], ['b', 'Comprar financiado', '#ef4b3f', 'fa-building-columns'], ['c', 'Alugar e investir', '#14b8a6', 'fa-key']];
  const ord = [...cen].sort((x, y) => R[y[0]].hoje - R[x[0]].hoje), melhor = ord[0], segundo = ord[1];
  const dif = (R[melhor[0]].hoje / R[segundo[0]].hoje - 1) * 100;
  const card = ([k, nome, cor, ic]) => `<div class="card ${k === melhor[0] ? 'ring-2' : ''}" style="${k === melhor[0] ? `--tw-ring-color:${cor}` : ''}">
      <div class="text-xs text-gray-500 mb-1"><i class="fa-solid ${ic} mr-1" style="color:${cor}"></i>${nome}${k === melhor[0] ? ' <span class="ml-1 rounded-full px-2 py-0.5 text-white text-[10px]" style="background:' + cor + '">melhor</span>' : ''}</div>
      <div class="text-2xl font-bold">${brl(R[k].hoje)}</div><div class="text-xs text-gray-500">em valores de hoje · ${brl(R[k].nom)} nominal</div></div>`;
  $('cResumo').innerHTML = `<div class="card border-2" style="border-color:${melhor[2]}"><p class="text-base"><b>${melhor[1]}</b> deixa o maior patrimônio após <b>${num(p.horiz)} anos</b>: ${f1(dif)}% acima de “${segundo[1].toLowerCase()}”, com as premissas acima.${dif < 5 ? ' A diferença é pequena: pequenas mudanças nas premissas podem inverter o resultado (veja a sensibilidade).' : ''}</p>
      ${r.faltaB > 0 ? `<p class="text-xs text-red-600 mt-1">Atenção: com esse FGTS, o financiamento exige ${brl(r.faltaB)} a mais de dinheiro próprio do que o considerado.</p>` : ''}</div>
    <div class="grid sm:grid-cols-3 gap-4">${cen.map(card).join('')}</div>`;
  mk('cCalcChart', { type: 'line', data: { labels: r.serie.anos.map(a => a + 'a'), datasets: cen.map(([k, nome, cor]) => lineDs(nome, r.serie[k], cor, { borderWidth: 2.5 })) },
    options: { scales: { y: yBRL }, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${brl(c.parsed.y)}` } } } } });
  calcSensibilidade(p, R);
  const lin = (rot, a, b, c) => `<tr class="border-b last:border-0"><td class="py-2 text-gray-600">${rot}</td><td class="text-right">${a}</td><td class="text-right">${b}</td><td class="text-right">${c}</td></tr>`;
  const nP = r.n, ult = r.fin.parc[nP - 1];
  $('cDetalhe').innerHTML = `<h3 class="font-bold mb-3">Detalhes</h3><table class="w-full text-sm min-w-[560px]"><thead class="text-left text-gray-500 border-b"><tr><th class="py-2"></th><th class="text-right">À vista</th><th class="text-right">Financiado</th><th class="text-right">Alugar</th></tr></thead><tbody>
    ${lin('Dinheiro próprio inicial (igual nos três)', brl(r.caixa), brl(r.caixa), brl(r.caixa))}
    ${lin('Gasto inicial (imóvel/entrada + custos − FGTS)', brl(r.caixa), brl(r.needB), '—')}
    ${lin('Valor financiado', '—', brl(r.F), '—')}
    ${lin('1ª parcela (com seguros) / aluguel inicial', '—', brl(r.fin.parc[0]), brl(p.aluguel))}
    ${lin(`Última parcela (mês ${nP}) / aluguel no fim`, '—', brl(ult), brl(r.aluguelFinal))}
    ${lin('Total de juros do financiamento (contrato inteiro)', '—', brl(r.fin.juros), '—')}
    ${lin('CET estimado (sem TR)', '—', r.cet == null ? '—' : f1(r.cet) + '% a.a.', '—')}
    ${lin(`Pago em parcelas / aluguel em ${num(p.horiz)} anos`, '—', brl(r.pagoFin), brl(r.totAlug))}
    ${lin(`Manutenção em ${num(p.horiz)} anos`, brl(r.totManut), brl(r.totManut), '—')}
    ${lin('Imóvel no fim (valorizado)', brl(R.a.imovel), brl(R.b.imovel), '—')}
    ${p.vender ? lin('Imóvel no fim, líquido de corretagem e IR', brl(R.a.vl), brl(R.b.vl), '—') : ''}
    ${lin('Saldo devedor no fim', '—', brl(R.b.saldo), '—')}
    ${lin(`Investimentos no fim (líquidos de IR; rendimento ${f1(r.rendNom)}% a.a. nominal)`, brl(R.a.inv), brl(R.b.inv), brl(R.c.inv))}
    ${p.fgts > 0 ? lin('FGTS que ficou na conta', brl(R.a.fg), brl(R.b.fg), brl(R.c.fg)) : ''}
    ${lin('<b>Patrimônio no fim (nominal)</b>', '<b>' + brl(R.a.nom) + '</b>', '<b>' + brl(R.b.nom) + '</b>', '<b>' + brl(R.c.nom) + '</b>')}
    ${lin('<b>Em valores de hoje</b>', '<b>' + brl(R.a.hoje) + '</b>', '<b>' + brl(R.b.hoje) + '</b>', '<b>' + brl(R.c.hoje) + '</b>')}
    </tbody></table>
    <p class="text-xs text-gray-500 mt-3">A parcela inclui seguros e taxa de administração e é corrigida pela TR projetada. O banco exige que a 1ª parcela caiba em até 30% da renda bruta familiar: para ${brl(r.fin.parc[0])}, renda mínima de cerca de ${brl(r.fin.parc[0] / 0.3)}.</p>`;
}

function renderCalc() {
  if (!CALC_OK) {
    calcMontar();
    if (S.lvl !== 'cidade' && S.nb) $('cBairro').value = S.nb;   // puxa o bairro selecionado no site
    calcSugerir(); calcUsarMediana(true);
  } else {
    if (S.lvl !== 'cidade' && S.nb && !$('cBairro').value) $('cBairro').value = S.nb;
    calcSugerir();   // índices podem ter chegado depois
  }
  calcRodar();
}
