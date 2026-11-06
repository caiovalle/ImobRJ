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
// Versão calc11
const f2 = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
const CAMPOS_MOEDA = new Set(['cDinheiro','cOrcamento','cValor','cFgts','cSeguros','cTarifa','cAluguel','cAmortAnual']);
const parseMoeda = v => { const d = String(v ?? '').replace(/\D/g, ''); return d ? +d : 0; };
const formatMoeda = v => { const n = Math.max(0, Math.round(+v || 0)); return n ? n.toLocaleString('pt-BR') : (v === '' ? '' : '0'); };
const valorEstado = (st, id) => CAMPOS_MOEDA.has(id) ? parseMoeda(st.campos[id]) : (parseFloat(String(st.campos[id] ?? '').replace(',', '.')) || 0);

const CALC_CAMPOS = [
  // id, rótulo, unidade, passo, ajuda
  ['cDinheiro', 'Seu dinheiro hoje', 'R$', 1000, 'Quanto você tem disponível hoje para a moradia (sem contar o FGTS). Define os caminhos comparados: se dá para comprar à vista (imóvel + ITBI + cartório), compara <b>à vista × alugar e investir esse dinheiro</b>; se não dá, compara <b>financiar × alugar e investir</b>. O que sobrar é investido.'],
  ['cOrcamento', 'Orçamento mensal para moradia', 'R$/mês', 100, 'Quanto você pode gastar por mês com parcela, manutenção ou aluguel (corrigido pela inflação ao longo do tempo). O que sobra é investido; se um gasto passar do orçamento, a diferença sai dos investimentos e a calculadora avisa. <b>Deixe vazio</b> para usar o maior gasto entre os caminhos (todos gastam o mesmo e investem a diferença).'],
  ['cValor', 'Valor do imóvel', 'R$', 1000, 'Preço de compra. O botão acima estima pela <b>mediana do R$/m²</b> do bairro (vendas dos últimos 12 meses no ITBI) × a área.'],
  ['cItbi', 'ITBI', '%', 0.1, '<b>ITBI</b>: imposto municipal pago na compra. No Rio a alíquota é 3% sobre o valor da transação, pago antes da escritura.'],
  ['cCartorio', 'Escritura e registro', '%', 0.1, 'Custos de cartório (escritura e registro no RGI). Varia com o valor; cerca de 1% é uma estimativa. No 1º imóvel financiado pelo SFH há desconto de 50% no registro.'],
  ['cValoriz', 'Valorização do imóvel', '% a.a.', 0.1, 'Quanto o imóvel sobe por ano, em R$ correntes. A sugestão é a inflação (valorização real zero). Ao lado aparece a variação histórica da mediana do bairro nos dados do ImobRJ.'],
  ['cManut', 'Manutenção', '% a.a. do valor', 0.1, 'Reformas, consertos e cotas extras de condomínio que ficam com o <b>dono</b> (quem aluga não paga). 0,5% a 1% do valor por ano é uma estimativa comum; imóveis antigos gastam mais.'],
  ['cEntrada', 'Entrada', '%', 1, 'Parte paga à vista no financiamento. O valor em reais correspondente aparece logo abaixo. Os bancos costumam financiar até 80% do valor, ou seja, entrada mínima de 20%.'],
  ['cAmortAnual', 'Amortização extra anual', 'R$/ano', 1000, 'Valor adicional pago uma vez por ano diretamente no saldo devedor. A simulação usa a opção <b>reduzir prazo</b>: mantém a lógica da prestação e quita o contrato antes, reduzindo os juros. Digite 0 para não amortizar.'],
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
  const campo = ([id, rot, un, passo, ajuda]) => { const moeda = CAMPOS_MOEDA.has(id); return `<div>
      <div class="flex items-center justify-between gap-2"><label for="${id}" class="text-xs font-semibold text-gray-600">${rot}</label>
        <button type="button" class="cHelp text-gray-400 hover:text-brand-600" data-for="${id}" aria-label="O que é ${rot}?"><i class="fa-regular fa-circle-question"></i></button></div>
      <div class="mt-1 flex items-center gap-2"><input id="${id}" type="${moeda ? 'text' : 'number'}" inputmode="${moeda ? 'numeric' : 'decimal'}" ${moeda ? 'data-money="1"' : `step="${passo}" min="0"`} class="sel w-full text-right"><span class="text-xs text-gray-500 whitespace-nowrap w-20">${un}</span></div>
      <p id="${id}Sug" class="text-[11px] text-gray-400 mt-0.5"></p>
      <p id="${id}Help" class="hidden text-xs text-gray-600 bg-[#f6f3ef] rounded-lg p-2 mt-1 leading-relaxed">${ajuda}</p></div>`; }; 
  const chk = (id, txt, on = true) => `<label class="sm:col-span-2 flex items-center gap-2 text-xs text-gray-700"><input id="${id}" type="checkbox" ${on ? 'checked' : ''} class="accent-[#ef4b3f]">${txt}</label>`;
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
      ${grupo('Seu dinheiro', ['cDinheiro', 'cFgts', 'cOrcamento'])}
    ${grupo('Imóvel e compra', ['cValor', 'cItbi', 'cCartorio', 'cValoriz', 'cManut'])}
      ${grupo('Financiamento', ['cEntrada', 'cPrazo', 'cJuros', 'cTR', 'cSeguros', 'cTarifa', 'cAmortAnual'], `<div class="sm:col-span-2"><label for="cAmortFonte" class="text-xs font-semibold text-gray-600">Origem da amortização</label><select id="cAmortFonte" class="sel w-full mt-1"><option value="renda">Renda extra anual (13º, bônus ou PLR) — recomendado</option><option value="orcamento">Parte do orçamento mensal</option><option value="carteira">Retirada dos investimentos</option></select><p id="cAmortFonteInfo" class="text-xs text-gray-500 bg-[#f6f3ef] rounded-lg p-2 mt-2 leading-relaxed"></p></div>` + chk('cFinOpc', 'Mesmo tendo o dinheiro para comprar à vista, comparar também financiando (e investindo o resto)', false))}
      <div class="card self-start"><h3 class="font-bold mb-2">Cenário de juros futuros</h3><p class="text-xs text-gray-500 mb-3">Atalhos para o rendimento dos investimentos. São cenários, não previsões; não alteram os juros do financiamento.</p><div class="flex flex-wrap gap-2"><button class="pill cPerfil" data-nom="16">Conservador · juros altos (16%)</button><button class="pill cPerfil" data-nom="13.75">Estável · Selic atual (13,75%)</button><button class="pill cPerfil" data-nom="9">Otimista · juros menores (9%)</button></div><p id="cPerfilInfo" class="text-[11px] text-gray-400 mt-2">O botão converte a taxa nominal escolhida em rendimento real acima do IPCA.</p></div>
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
    <div class="card space-y-3">
      <div class="flex flex-wrap items-center gap-2"><h3 class="font-bold mr-auto">Cenários salvos</h3>
        <input id="cenNome" maxlength="30" placeholder="Nome (ex.: Tijuca 70 m² SAC)" class="sel w-56">
        <button id="cenSalvar" class="pill on"><i class="fa-solid fa-floppy-disk mr-1"></i>Salvar cenário</button></div>
      <p class="text-xs text-gray-500">Salva todos os campos atuais neste navegador (até ${CEN_MAX}). Marque 2 a ${CMP_MAX} para comparar lado a lado; “Carregar” traz o cenário de volta para os campos.</p>
      <div id="cenLista" class="text-sm"></div>
      <div id="cenCmp"></div>
      <div class="chart-box" style="height:260px"><canvas id="cCenChart"></canvas></div>
    </div>
    <div id="cDetalhe" class="card overflow-x-auto"></div>
    <div class="card text-xs text-gray-600 space-y-2 leading-relaxed">
      <h3 class="font-bold text-sm text-ink">Como a conta é feita</h3>
      <p><b>Parte do seu dinheiro.</b> Se ele cobre imóvel + ITBI + cartório (com o FGTS), a comparação é <b>comprar à vista × alugar e investir</b> (financiar é opcional). Se não cobre, é <b>financiar × alugar e investir</b>; se não cobre nem a entrada e os custos, o financiado aparece marcado como “falta dinheiro”. O que sobrar no início é investido.</p>
      <p><b>Mesmo orçamento mensal.</b> Todo mês cada caminho tem o mesmo orçamento: o informado (corrigido pela inflação) ou, se vazio, o maior gasto entre os caminhos (parcela + seguros + manutenção, manutenção, ou aluguel). O que sobra é investido à taxa real + IPCA; se faltar, sai dos investimentos.</p>
      <p><b>À vista:</b> paga imóvel e custos e investe a sobra do orçamento depois da manutenção. <b>Financiado:</b> paga entrada (com FGTS), ITBI, cartório e tarifas; no fim desconta o saldo devedor. A amortização anual pode vir de renda extra (os outros caminhos investem o mesmo valor), do orçamento mensal ou da própria carteira. <b>Alugar:</b> investe todo o dinheiro e a sobra depois do aluguel; o FGTS continua na conta.</p>
      <p><b>CET (Custo Efetivo Total)</b>: taxa que inclui tudo o que se paga no financiamento — juros, seguros obrigatórios e tarifas. É o número certo para comparar propostas de bancos (que são obrigados a informá-lo). Aqui ele é estimado sem TR, como os bancos costumam divulgar.</p>
      <p><b>Não entram:</b> condomínio e IPTU (no Rio o inquilino costuma pagar os dois, então se anulam), mudança, amortizações extras irregulares (a amortização anual informada entra), redutores do IR sobre ganho de capital e distribuição de lucros do FGTS. O seguro é um valor fixo.</p>
      <p id="cRefs"></p>
      <p class="font-semibold">Simulação educativa, não é recomendação. Confirme taxas, CET e condições com o banco antes de decidir.</p>
    </div>`;
  $('cBairro').innerHTML = '<option value="">— escolha —</option>' + BAIRROS.map(b => `<option value="${b.nb}">${b.nome}</option>`).join('');

  const root = $('tab-calc');
  root.addEventListener('input', e => {
    if (e.target.id === 'cenNome' || e.target.classList.contains('cenSel')) return;
    if (e.target.id === 'cArea') return calcUsarMediana(true);
    if (e.target.dataset.money) e.target.value = formatMoeda(parseMoeda(e.target.value));
    if (e.target.id && (e.target.type === 'number' || e.target.dataset.money)) CALC_EDIT.add(e.target.id);
    calcSugerir(); calcRodar();                      // atualiza sugestões dependentes (aluguel ← valor, horizonte ← prazo)
  });
  root.addEventListener('change', e => { if (e.target.type === 'checkbox' && !e.target.classList.contains('cenSel')) { calcSugerir(); calcRodar(); } });
  root.addEventListener('click', e => {
    const h = e.target.closest('.cHelp'); if (h) { $(h.dataset.for + 'Help').classList.toggle('hidden'); return; }
    const sis = e.target.closest('.cSis'); if (sis) { root.querySelectorAll('.cSis').forEach(x => x.classList.toggle('on', x === sis)); calcRodar(); return; }
    const perfil = e.target.closest('.cPerfil'); if (perfil) { const ipca = cv('cIpca'), nom = +perfil.dataset.nom, real = ((1 + nom / 100) / (1 + ipca / 100) - 1) * 100; $('cRendReal').value = real.toFixed(2); CALC_EDIT.add('cRendReal'); root.querySelectorAll('.cPerfil').forEach(x => x.classList.toggle('on', x === perfil)); $('cPerfilInfo').textContent = `${perfil.textContent.trim()}: ${f2(nom)}% nominal equivale a ${f2(real)}% real com IPCA de ${f2(ipca)}%.`; calcRodar(); }
  });
  $('cBairro').onchange = () => calcUsarMediana();
  $('cAmortFonte').onchange = () => { calcAmortFonteInfo(); calcRodar(); };
  $('cenSalvar').onclick = cenSalvar;
  $('cenNome').onkeydown = e => { if (e.key === 'Enter') cenSalvar(); };
  $('cenLista').addEventListener('click', e => {
    const l = e.target.closest('.cenLoad'), d = e.target.closest('.cenDel');
    if (l) cenCarregar(+l.dataset.id); else if (d) cenApagar(+d.dataset.id);
  });
  $('cenLista').addEventListener('change', e => {
    if (!e.target.classList.contains('cenSel')) return;
    const id = +e.target.dataset.id;
    if (e.target.checked) { if (CMP_SEL.size >= CMP_MAX) { e.target.checked = false; return toast(`Compare até ${CMP_MAX} cenários.`); } CMP_SEL.add(id); } else CMP_SEL.delete(id);
    cenComparar();
  });
  $('cUsarMed').onclick = () => calcUsarMediana();
  $('cReset').onclick = () => { CALC_EDIT.clear(); $('cAlugVal').checked = true; $('cVender').checked = true; $('cFinOpc').checked = false; $('cAmortFonte').value = 'renda'; calcSugerir(); calcUsarMediana(true); calcRodar(); };
  CALC_OK = true;
}

const cv = id => { const el = $(id); if (!el) return 0; if (CAMPOS_MOEDA.has(id)) return parseMoeda(el.value); const v = parseFloat(String(el.value).replace(',', '.')); return isFinite(v) ? v : 0; };
function setSug(id, val, txt) {
  if (!CALC_EDIT.has(id)) $(id).value = CAMPOS_MOEDA.has(id) ? formatMoeda(val) : val;
  $(id + 'Sug').innerHTML = txt;
}
function calcAmortFonteInfo() {
  const fonte = $('cAmortFonte')?.value || 'renda', v = brl(cv('cAmortAnual'));
  const txt = {
    renda: `<b>Renda extra anual:</b> no mês da amortização, o financiamento usa ${v}; comprar à vista e alugar recebem e investem o <b>mesmo valor</b>. Representa 13º salário, bônus ou PLR e mantém os caminhos comparáveis. O valor é fixo (sem correção pela inflação) e conta até a quitação do financiamento.`,
    orcamento: `<b>Parte do orçamento:</b> o financiamento reserva mensalmente 1/12 de ${v} e amortiza no fim do ano; os outros caminhos investem esse mesmo valor mensal dentro do orçamento.`,
    carteira: `<b>Retirada dos investimentos:</b> o financiamento vende investimentos para amortizar; os outros caminhos mantêm suas carteiras. Use para avaliar se vale trocar liquidez por redução da dívida.`
  };
  $('cAmortFonteInfo').innerHTML = cv('cAmortAnual') > 0 ? txt[fonte] : 'Informe uma amortização anual para comparar o uso do dinheiro. A opção recomendada é “Renda extra anual”.';
}
function calcSugerir() {
  const s = calcSugestoes(), V = cv('cValor') || 600000;
  const auto = k => s.auto[k] ? ' · Banco Central' : ' · referência fixa';
  if (!$('cValor').value) $('cValor').value = formatMoeda(600000);
  setSug('cItbi', CALC_REF.itbi, 'Rio de Janeiro: 3%');
  setSug('cCartorio', CALC_REF.cartorio, 'estimativa: ~1%');
  setSug('cManut', CALC_REF.manutencao, 'estimativa: 0,5% a 1% a.a.');
  setSug('cEntrada', 20, '');
  const entValor = V * cv('cEntrada') / 100, fgEntrada = Math.min(cv('cFgts'), entValor);
  $('cEntradaSug').innerHTML = `${f2(cv('cEntrada'))}% = <b>${brl(entValor)}</b>` + (fgEntrada > 0 ? ` · FGTS cobre ${brl(fgEntrada)} · dinheiro próprio ${brl(entValor - fgEntrada)}` : ' · mínimo usual: 20%');
  setSug('cFgts', 0, 'informe se for usar');
  {
    const custo = V * (cv('cItbi') + cv('cCartorio')) / 100, fg = cv('cFgts'), E = V * cv('cEntrada') / 100;
    const needA = Math.max(0, V + custo - Math.min(fg, V)), needB = Math.max(0, E - Math.min(fg, E) + custo + cv('cTarifa'));
    setSug('cDinheiro', Math.ceil(needA / 1000) * 1000, `à vista precisa de ${brl(needA)} · financiar precisa de ${brl(needB)}`);
  }
  setSug('cOrcamento', '', 'vazio = automático');
  setSug('cPrazo', 30, 'sugestão: 30 anos (máx. 35)');
  setSug('cJuros', CALC_REF.juros, `Caixa SBPE: 10,99% a 11,49% + TR (${CALC_REF.data})`);
  setSug('cTR', s.tr, `12 meses até ${s.trAte}: ${f2(s.tr)}%${auto('tr')}`);
  setSug('cSeguros', CALC_REF.seguros, `referência: ~R$ ${CALC_REF.seguros}/mês`);
  setSug('cTarifa', CALC_REF.tarifa, 'em geral R$ 2.000 a R$ 3.500');
  setSug('cAmortAnual', 0, '0 = sem amortização extra · reduz prazo e juros');
  calcAmortFonteInfo();
  const alug = Math.round(V * CALC_REF.yieldAluguel / 100 / 12 / 50) * 50;
  setSug('cAluguel', alug, `≈ ${brl(alug)} (${f2(CALC_REF.yieldAluguel)}% a.a. do valor, FipeZAP)`);
  const acompanha = $('cAlugVal').checked;
  $('cReajAluguel').disabled = acompanha; $('cReajAluguel').classList.toggle('opacity-50', acompanha);
  setSug('cReajAluguel', s.ipca, acompanha ? 'usando a valorização do imóvel' : `IPCA 12 meses: ${f2(s.ipca)}%`);
  setSug('cRendReal', CALC_REF.rendReal, `Tesouro IPCA+ longo: ~${f2(CALC_REF.rendReal)}% · Selic atual ${f2(s.selic)}%${auto('selic')}`);
  setSug('cIR', 15, '15% (aplicações acima de 2 anos)');
  setSug('cIpca', s.ipca, `IPCA 12 meses até ${s.ipcaAte}: ${f2(s.ipca)}%${auto('ipca')}`);
  setSug('cHoriz', cv('cPrazo') || 30, 'sugestão: igual ao prazo');
  setSug('cCorret', CALC_REF.corretagem, 'estimativa: 5% a 6%');
  setSug('cIRGanho', 0, '0% (isenções comuns) ou 15%');
  const vender = $('cVender').checked;
  for (const id of ['cCorret', 'cIRGanho']) { $(id).disabled = !vender; $(id).classList.toggle('opacity-50', !vender); }
  $('cRefs').innerHTML = `<b>Referências das sugestões:</b> IPCA ${f2(s.ipca)}% em 12 meses até ${s.ipcaAte} (IBGE); TR ${f2(s.tr)}% em 12 meses até ${s.trAte} e meta Selic atual ${f2(s.selic)}% (Banco Central${s.auto.selic ? ', atualizados automaticamente' : ''}); ${CALC_REF.jurosFaixa}; ITBI 3% (Prefeitura do Rio); aluguel ${f2(CALC_REF.yieldAluguel)}% a.a. do valor (FipeZAP, média nacional); Tesouro IPCA+ de longo prazo ~IPCA + ${f2(CALC_REF.rendReal)}% (${CALC_REF.data}). Corretagem, cartório e manutenção são estimativas.`;
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
  $('cValor').value = formatMoeda(Math.round(info.m2 * cv('cArea') / 1000) * 1000); CALC_EDIT.delete('cValor'); CALC_EDIT.delete('cAluguel');
  calcSugerir(); calcRodar();
}

// ---------- Motor da simulação (mensal) ----------
const aMes = a => Math.pow(1 + a / 100, 1 / 12) - 1;   // taxa anual efetiva → mensal
function financiamento(F, n, jurosAA, trAA, sis, seguro, extraAnual = 0) {
  const i = jurosAA / 100 / 12, tr = aMes(trAA), parc = [], baseParc = [], extras = [], saldoFim = [];
  let s = F, sv = F, juros = 0, amortExtra = 0, meses = 0;    // sv = saldo virtual sem amortizações extras
  for (let k = 0; k < n; k++) {
    if (s <= 0.01) { parc.push(0); baseParc.push(0); extras.push(0); saldoFim.push(0); continue; }
    const rest = n - k;
    s *= 1 + tr; sv *= 1 + tr;
    // Prestação programada do contrato sem extras; o saldo real menor transforma mais da mesma prestação em amortização e reduz o prazo.
    const jv = sv * i;
    const av = Math.min(sv, sis === 'sac' ? sv / rest : (i ? sv * i / (1 - Math.pow(1 + i, -rest)) : sv / rest) - jv);
    const prestBase = jv + av;
    const j = s * i, amort = Math.min(s, Math.max(0, prestBase - j));
    s -= amort; sv -= av; juros += j;
    let extra = 0;
    if ((k + 1) % 12 === 0 && extraAnual > 0 && s > 0.01) { extra = Math.min(s, extraAnual); s -= extra; amortExtra += extra; }
    baseParc.push(j + amort + seguro); extras.push(extra); parc.push(j + amort + seguro + extra); saldoFim.push(Math.max(s, 0)); meses = k + 1;
  }
  return { parc, baseParc, extras, saldoFim, juros, amortExtra, meses };
}
function cetAA(F, tarifa, parc) {          // TIR mensal (bisseção) → anual
  const vp = r => { let v = F - tarifa, d = 1; for (const p of parc) { d /= 1 + r; v -= p * d; } return v; };
  let lo = 0, hi = 0.1; if (vp(lo) < 0 === vp(hi) < 0) return null;
  for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2; (vp(m) > 0) === (vp(lo) > 0) ? lo = m : hi = m; }
  return (Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100;
}
// p: parâmetros; leve = true pula CET, série e detalhes (usado na sensibilidade)
// p.dinheiro: dinheiro próprio hoje (null = o suficiente para comprar à vista); p.orc: orçamento mensal (0 = automático); p.finOpc: com o dinheiro todo, comparar também financiando
function calcSimular(p, leve = false) {
  const n = Math.round(p.prazo * 12), H = Math.max(1, Math.round(p.horiz * 12));
  const E = p.V * p.entrada / 100, custo = p.V * (p.itbi + p.cartorio) / 100, K = p.V + custo;
  const fgts = Math.max(0, p.fgts), fgA = Math.min(fgts, p.V), fgB = Math.min(fgts, E);
  const fgAmort = Math.min(fgts - fgB, p.V - E);            // FGTS que sobra da entrada abate o valor financiado
  const F = p.V - E - fgAmort, temFin = F > 1;
  const seg = temFin ? p.seguros : 0, tarifa = temFin ? p.tarifa : 0;   // sem financiamento, sem seguros nem tarifas
  const needA = K - fgA, needB = E - fgB + custo + tarifa;  // dinheiro próprio necessário em cada caminho
  const dinheiro = p.dinheiro == null ? needA : Math.max(0, p.dinheiro);
  const viavelA = dinheiro >= needA - 1, viavelB = dinheiro >= needB - 1;
  // quais caminhos se aplicam: com o dinheiro todo → à vista × alugar (+ financiado, se pedir); sem → financiado × alugar
  const mostra = viavelA ? ['a', ...(p.finOpc && temFin ? ['b'] : []), 'c'] : ['b', 'c'];
  const validos = mostra.filter(k => k !== 'b' || viavelB);
  const fin = financiamento(Math.max(F, 0), n, p.juros, p.tr, p.sis, seg, p.amortAnual);
  const reserva = Array(n).fill(0);
  for (let fim = 11; fim < n; fim += 12) { const ex = fin.extras[fim] || 0; for (let k = Math.max(0, fim - 11); k <= fim; k++) reserva[k] = ex / 12; }
  let carteiraFalta = 0, alternativoAmort = 0;
  const rI = aMes(((1 + p.ipca / 100) * (1 + p.rendReal / 100) - 1) * 100), rV = aMes(p.valoriz), rP = aMes(p.ipca);
  const rF = aMes(((1 + p.tr / 100) * 1.03 - 1) * 100);     // FGTS: TR + 3% a.a.
  const reaj = p.alugVal ? p.valoriz : p.reajAluguel;
  const inv = v0 => ({ s: v0, ap: v0 });
  const A = { inv: inv(Math.max(0, dinheiro - needA)), fg: fgts - fgA }, B = { inv: inv(Math.max(0, dinheiro - needB)), fg: fgts - fgB - fgAmort }, C = { inv: inv(dinheiro), fg: fgts };
  const est = { a: { n: 0, max: 0 }, b: { n: 0, max: 0 }, c: { n: 0, max: 0 } };   // meses em que o gasto passa do orçamento
  const serie = { a: [], b: [], c: [], anos: [] };
  let aluguel = p.aluguel, totAlug = 0, totManut = 0, imovel = p.V, orc0 = null;
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
  for (let m = 0; m < H; m++) {
    if (m > 0 && m % 12 === 0) aluguel *= 1 + reaj / 100;
    const pfBase = m < n ? fin.baseParc[m] : 0, extra = m < n ? fin.extras[m] : 0, manut = imovel * p.manut / 100 / 12;
    const reservaMes = p.amortFonte === 'orcamento' && m < n ? reserva[m] : 0;
    const out = { a: manut, b: pfBase + manut + reservaMes, c: aluguel };
    // Renda extra é dinheiro adicional comum aos caminhos: o financiado amortiza; à vista e aluguel investem o mesmo valor.
    const rendaExtra = p.amortFonte === 'renda' ? extra : 0;
    const orcBase = p.orc > 0 ? p.orc * Math.pow(1 + rP, m) : Math.max(...mostra.map(k => out[k]));
    const orc = orcBase + rendaExtra;
    if (m === 0) orc0 = orcBase;
    for (const x of [A, B, C]) { x.inv.s *= 1 + rI; x.fg *= 1 + rF; }
    for (const [k, X] of [['a', A], ['b', B], ['c', C]]) {
      // No financiado, a renda extra paga a amortização; nos outros caminhos ela sobra e é investida.
      const pagaExtra = k === 'b' && p.amortFonte === 'renda' ? extra : 0;
      const d = orc - out[k] - pagaExtra; X.inv.s += d; X.inv.ap += d;
      if (d < -1) { est[k].n++; est[k].max = Math.max(est[k].max, -d / Math.pow(1 + rP, m)); }
    }
    if (extra > 0 && p.amortFonte === 'renda') alternativoAmort += extra;
    if (reservaMes > 0 && p.amortFonte === 'orcamento') alternativoAmort += reservaMes;
    if (extra > 0 && p.amortFonte === 'carteira') {
      const antes = B.inv.s, depois = antes - extra;
      if (antes > 0) B.inv.ap *= Math.max(0, depois) / antes;
      B.inv.s = depois; carteiraFalta += Math.max(0, -depois); alternativoAmort += extra;
    }
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
  const melhor = validos.reduce((m, k) => res[k].hoje > res[m].hoje ? k : m, validos[0]);
  if (leve) return { res, mostra, validos, melhor };
  const cet = temFin ? cetAA(F, tarifa, financiamento(F, n, p.juros, 0, p.sis, seg, p.amortAnual).parc) : null;
  return { res, mostra, validos, melhor, viavelA, viavelB, needA, needB, dinheiro, est, orc0, serie, fin, cet, K, custo, F: Math.max(F, 0), fgAmort, temFin, n, nReal: fin.meses, H,
           totAlug, totManut, aluguelFinal: aluguel, carteiraFalta, alternativoAmort, faltaB: Math.max(0, needB - dinheiro), faltaA: Math.max(0, needA - dinheiro),
           pagoFin: fin.parc.slice(0, Math.min(fin.meses, H)).reduce((s, x) => s + x, 0), rendNom: ((1 + p.ipca / 100) * (1 + p.rendReal / 100) - 1) * 100 };
}

// ---------- Sensibilidade ----------
// > 0: comprar (melhor caminho de compra viável) ganha de alugar; null se não há compra viável
const vantagemCompra = p => { const r = calcSimular(p, true), cs = r.validos.filter(k => k !== 'c'); return cs.length ? Math.max(...cs.map(k => r.res[k].hoje)) - r.res.c.hoje : null; };
function pontoVirada(p, campo, lo, hi) {        // valor do campo em que comprar e alugar empatam (null se não inverte no intervalo)
  const f = x => vantagemCompra({ ...p, [campo]: x });
  let a = lo, b = hi, fa = f(a), fb = f(b);
  if (fa > 0 === fb > 0) return null;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2, fm = f(m); if (fm > 0 === fa > 0) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
}
function calcSensibilidade(p, r0) {
  if (vantagemCompra(p) == null) { $('cSens').innerHTML = '<h3 class="font-bold mb-1">Sensibilidade</h3><p class="text-sm text-gray-500">Não há caminho de compra viável com o dinheiro informado; a sensibilidade aparece quando houver.</p>'; return; }
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
    const k = calcSimular({ ...p, rendReal: rr, valoriz: ((1 + p.ipca / 100) * (1 + vr / 100) - 1) * 100 }, true).melhor;
    const atual = Math.abs(rr - p.rendReal) < 1e-9 && Math.abs(vr - Math.round(valReal)) < 1e-9;
    return `<td class="text-center text-[11px] font-semibold text-white py-1.5 ${atual ? 'outline outline-2 outline-offset-[-3px] outline-white' : ''}" style="background:${cores[k]}">${nomes[k]}</td>`;
  };
  $('cSens').innerHTML = `<h3 class="font-bold mb-1">Sensibilidade: o que inverteria o resultado?</h3>
    <p class="text-xs text-gray-500 mb-3">Mudando uma premissa por vez (as demais como estão acima), onde ${r0.validos.includes('a') ? '“comprar à vista”' : '“comprar financiado”'}${r0.validos.includes('a') && r0.validos.includes('b') ? ' (ou financiado, o melhor dos dois)' : ''} e “alugar e investir” empatam.</p>
    <ul class="text-sm space-y-1.5 list-disc pl-5 mb-4">
      ${linha('Rendimento real dos investimentos', 'rendReal', -2, 15)}
      ${linha('Valorização do imóvel (nominal)', 'valoriz', p.ipca - 6, p.ipca + 12)}
      ${linha('Aluguel (% do valor do imóvel por ano)', 'aluguel', p.V * 0.01 / 12, p.V * 0.15 / 12, yld)}
    </ul>
    <div class="overflow-x-auto"><table class="text-xs min-w-[460px]"><thead><tr><th class="text-left pr-2 font-normal text-gray-500">Rend. real ↓ · Valorização real →</th>${reais.map(v => `<th class="px-1 font-semibold">${v > 0 ? '+' : ''}${v}%</th>`).join('')}</tr></thead><tbody>
      ${rends.map(rr => `<tr><th class="text-left pr-2 font-semibold">${pc(rr)}</th>${reais.map(vr => cel(rr, vr)).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="text-[11px] text-gray-500 mt-2">Cada célula mostra o caminho com maior patrimônio (entre os que se aplicam ao seu dinheiro). Valorização real = acima do IPCA (0% = imóvel acompanha a inflação). ${Math.abs(valReal - Math.round(valReal)) < 0.05 ? 'A célula com contorno é a premissa atual.' : `Premissa atual: valorização real de ${pc(valReal)}.`}</p>`;
}

// monta os parâmetros a partir de um estado { campos: {id: valor}, chk: {id: bool}, sis }
function calcParams(st) {
  const g = id => valorEstado(st, id);
  return { V: g('cValor'), entrada: Math.min(g('cEntrada'), 100), fgts: g('cFgts'), prazo: Math.max(1, Math.min(g('cPrazo'), 35)), juros: g('cJuros'), tr: g('cTR'),
    seguros: g('cSeguros'), amortAnual: g('cAmortAnual'), itbi: g('cItbi'), cartorio: g('cCartorio'), tarifa: g('cTarifa'), manut: g('cManut'), aluguel: g('cAluguel'), reajAluguel: g('cReajAluguel'),
    alugVal: !!st.chk.cAlugVal, valoriz: g('cValoriz'), rendReal: g('cRendReal'), ir: g('cIR'), ipca: g('cIpca'),
    horiz: Math.max(1, Math.min(g('cHoriz'), 40)), vender: !!st.chk.cVender, corret: g('cCorret'), irGanho: g('cIRGanho'), sis: st.sis || 'sac',
    dinheiro: st.campos.cDinheiro == null || st.campos.cDinheiro === '' ? null : g('cDinheiro'),   // vazio/antigo = o suficiente para comprar à vista
    orc: g('cOrcamento'), finOpc: st.chk.cFinOpc == null ? true : !!st.chk.cFinOpc, amortFonte: st.amortFonte || 'renda' };
}
// estado atual da tela
function calcEstado() {
  const campos = {}; for (const [id] of CALC_CAMPOS) campos[id] = $(id).value;
  return { campos, chk: { cAlugVal: $('cAlugVal').checked, cVender: $('cVender').checked, cFinOpc: $('cFinOpc').checked }, sis: document.querySelector('.cSis.on')?.dataset.s || 'sac',
           bairro: $('cBairro').value, bairroNome: $('cBairro').selectedOptions[0]?.textContent || '', area: $('cArea').value, amortFonte: $('cAmortFonte').value };
}

// ---------- Cenários salvos (no navegador, localStorage) ----------
const CEN_K = 'imobrj_cenarios', CEN_MAX = 10, CMP_MAX = 4;
let cenMem = [];
const getCen = () => { try { return JSON.parse(localStorage.getItem(CEN_K)) || []; } catch (e) { return cenMem; } };
const setCen = l => { cenMem = l; try { localStorage.setItem(CEN_K, JSON.stringify(l)); } catch (e) {} };
let CMP_SEL = new Set();
function cenSalvar() {
  const l = getCen(), st = calcEstado();
  let nome = $('cenNome').value.trim() || `Cenário ${l.length + 1}`;
  if (l.length >= CEN_MAX) return toast(`Máximo de ${CEN_MAX} cenários. Apague algum antes de salvar.`);
  const i = l.findIndex(c => c.nome.toLowerCase() === nome.toLowerCase());
  const novo = { id: Date.now(), nome, criado: new Date().toLocaleDateString('pt-BR'), ...st };
  if (i >= 0) { if (!confirm(`Já existe “${nome}”. Substituir?`)) return; novo.id = l[i].id; l[i] = novo; } else l.push(novo);
  setCen(l); CMP_SEL.add(novo.id); $('cenNome').value = ''; cenRender();
}
function cenCarregar(id) {
  const c = getCen().find(x => x.id === id); if (!c) return;
  for (const [k, v] of Object.entries(c.campos)) { if ($(k)) { $(k).value = CAMPOS_MOEDA.has(k) ? formatMoeda(parseMoeda(v)) : v; CALC_EDIT.add(k); } }
  $('cAlugVal').checked = !!c.chk.cAlugVal; $('cVender').checked = !!c.chk.cVender; $('cFinOpc').checked = c.chk.cFinOpc == null ? true : !!c.chk.cFinOpc;
  if (c.campos.cDinheiro == null) CALC_EDIT.delete('cDinheiro');
  document.querySelectorAll('.cSis').forEach(x => x.classList.toggle('on', x.dataset.s === c.sis));
  if (c.bairro != null) $('cBairro').value = c.bairro; if (c.area) $('cArea').value = c.area; $('cAmortFonte').value = c.amortFonte || 'renda'; calcAmortFonteInfo();
  calcSugerir(); calcRodar(); toast(`“${c.nome}” carregado nos campos.`);
  $('tab-calc').scrollIntoView({ behavior: 'smooth' });
}
function cenApagar(id) {
  const c = getCen().find(x => x.id === id); if (!c || !confirm(`Apagar “${c.nome}”?`)) return;
  setCen(getCen().filter(x => x.id !== id)); CMP_SEL.delete(id); cenRender();
}
function cenRender() {
  const l = getCen();
  for (const id of [...CMP_SEL]) if (!l.some(c => c.id === id)) CMP_SEL.delete(id);
  if (!CMP_SEL.size) l.slice(-CMP_MAX).forEach(c => CMP_SEL.add(c.id));
  $('cenLista').innerHTML = l.length ? l.map(c => `<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 border-b last:border-0">
      <input type="checkbox" class="cenSel accent-[#ef4b3f]" data-id="${c.id}" ${CMP_SEL.has(c.id) ? 'checked' : ''} aria-label="Comparar ${c.nome}">
      <span class="font-semibold">${c.nome}</span><span class="text-xs text-gray-500 truncate">${c.bairroNome && c.bairro ? c.bairroNome + ' · ' : ''}${brl(valorEstado(c, 'cValor'))} · ${c.criado}</span>
      <button class="cenLoad ml-auto text-xs text-brand-600 hover:underline whitespace-nowrap" data-id="${c.id}"><i class="fa-solid fa-upload mr-1"></i>Carregar</button>
      <button class="cenDel text-xs text-gray-400 hover:text-red-600" data-id="${c.id}" aria-label="Apagar ${c.nome}"><i class="fa-solid fa-trash"></i></button></div>`).join('')
    : '<p class="text-xs text-gray-500">Nenhum cenário salvo. Preencha os campos e clique em “Salvar cenário”.</p>';
  cenComparar();
}
function cenComparar() {
  const sel = getCen().filter(c => CMP_SEL.has(c.id)).slice(0, CMP_MAX), box = $('cenCmp');
  if (sel.length < 2) { box.innerHTML = '<p class="text-xs text-gray-500">Marque 2 a ' + CMP_MAX + ' cenários para comparar.</p>'; charts.cCenChart?.destroy(); return; }
  const rs = sel.map(c => { const p = calcParams(c); return { c, p, r: calcSimular(p) }; });
  const nomes = { a: 'À vista', b: 'Financiado', c: 'Alugar e investir' };
  const val = (x, k) => !x.r.mostra.includes(k) ? '<span class="text-gray-400">não se aplica</span>' : brl(x.r.res[k].hoje) + (x.r.validos.includes(k) ? '' : ' <span class="text-red-600 text-xs">(falta dinheiro)</span>');
  const pc = v => f2(Math.round(v * 100) / 100) + '%';
  // linhas de premissas: só destaca as que mudam entre cenários
  const prem = [
    ['Bairro', x => x.c.bairro ? x.c.bairroNome : '—'], ['Seu dinheiro', x => brl(x.r.dinheiro)], ['Orçamento mensal', x => x.p.orc > 0 ? brl(x.p.orc) : 'automático'], ['Valor do imóvel', x => brl(x.p.V)], ['Entrada', x => pc(x.p.entrada)], ['FGTS usado', x => brl(x.p.fgts)],
    ['Prazo contratual', x => x.p.prazo + ' anos'], ['Amortização extra anual', x => brl(x.p.amortAnual)], ['Origem da amortização', x => ({renda:'renda extra',orcamento:'orçamento mensal',carteira:'investimentos'}[x.p.amortFonte])], ['Sistema', x => x.p.sis.toUpperCase()], ['Juros', x => 'TR + ' + pc(x.p.juros)], ['TR', x => pc(x.p.tr)],
    ['Seguros', x => brl(x.p.seguros) + '/mês'], ['Aluguel inicial', x => brl(x.p.aluguel)], ['Reajuste do aluguel', x => x.p.alugVal ? 'valorização' : pc(x.p.reajAluguel)],
    ['Valorização', x => pc(x.p.valoriz)], ['Manutenção', x => pc(x.p.manut)], ['Rendimento real', x => pc(x.p.rendReal)], ['IPCA', x => pc(x.p.ipca)],
    ['Horizonte', x => x.p.horiz + ' anos'], ['Venda no fim', x => x.p.vender ? `sim (${pc(x.p.corret)} + IR ${pc(x.p.irGanho)})` : 'não'],
    ['ITBI + cartório', x => pc(x.p.itbi + x.p.cartorio)], ['Tarifas', x => brl(x.p.tarifa)], ['IR investimentos', x => pc(x.p.ir)]
  ];
  const linhaPrem = ([rot, f]) => { const v = rs.map(f), muda = new Set(v).size > 1;
    return `<tr class="border-b ${muda ? 'bg-amber-50' : 'text-gray-500'}"><td class="py-1.5 pr-3 ${muda ? 'font-semibold' : ''}">${rot}</td>${v.map(x => `<td class="text-right px-2">${x}</td>`).join('')}</tr>`; };
  const linhaRes = (rot, f, negrito) => `<tr class="border-b"><td class="py-1.5 pr-3 ${negrito ? 'font-bold' : ''}">${rot}</td>${rs.map(x => `<td class="text-right px-2 ${negrito ? 'font-bold' : ''}">${f(x)}</td>`).join('')}</tr>`;
  const mudou = prem.filter(([, f]) => new Set(rs.map(f)).size > 1);
  box.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-sm min-w-[520px]">
    <thead><tr class="border-b"><th class="text-left py-2"></th>${rs.map(x => `<th class="text-right px-2">${x.c.nome}</th>`).join('')}</tr></thead><tbody>
    <tr><td colspan="${rs.length + 1}" class="pt-3 pb-1 text-xs font-bold uppercase text-gray-500">Resultado (valores de hoje)</td></tr>
    ${linhaRes('Melhor opção', x => { const k = x.r.melhor; return `<span class="rounded-full px-2 py-0.5 text-white text-xs" style="background:${{ a: '#1e3a5f', b: '#ef4b3f', c: '#14b8a6' }[k]}">${nomes[k]}</span>`; })}
    ${linhaRes('Comprar à vista', x => val(x, 'a'))}
    ${linhaRes('Comprar financiado', x => val(x, 'b'))}
    ${linhaRes('Alugar e investir', x => val(x, 'c'))}
    ${linhaRes('Seu dinheiro hoje', x => brl(x.r.dinheiro))}
    ${linhaRes('1ª parcela (com seguros)', x => x.r.mostra.includes('b') && x.r.temFin ? brl(x.r.fin.parc[0]) : '—')}
    ${linhaRes('Renda mínima (parcela ≤ 30%)', x => x.r.mostra.includes('b') && x.r.temFin ? brl(x.r.fin.parc[0] / 0.3) : '—')}
    ${linhaRes('Juros sobre o valor financiado', x => x.r.mostra.includes('b') && x.r.temFin ? brl(x.r.fin.juros) : '—')}
    ${linhaRes('CET estimado', x => !x.r.mostra.includes('b') || x.r.cet == null ? '—' : x.r.cet.toFixed(1).replace('.', ',') + '% a.a.')}
    <tr><td colspan="${rs.length + 1}" class="pt-4 pb-1 text-xs font-bold uppercase text-gray-500">Premissas <span class="normal-case font-normal">(em amarelo, o que muda)</span></td></tr>
    ${prem.map(linhaPrem).join('')}
    </tbody></table></div>
    <p class="text-xs text-gray-500 mt-2">${mudou.length ? 'Diferenças entre os cenários: ' + mudou.map(m => m[0].toLowerCase()).join(', ') + '.' : 'Os cenários têm as mesmas premissas.'} Comparar o patrimônio entre cenários com <b>valores de imóvel ou dinheiro inicial diferentes</b> não indica qual é “melhor”: compare principalmente a melhor opção dentro de cada um.</p>`;
  const cores = ['#1e3a5f', '#ef4b3f', '#14b8a6', '#f59e0b'];
  mk('cCenChart', { type: 'bar', data: { labels: ['À vista', 'Financiado', 'Alugar e investir'],
      datasets: rs.map((x, i) => ({ label: x.c.nome, data: ['a', 'b', 'c'].map(k => x.r.validos.includes(k) ? x.r.res[k].hoje : null), backgroundColor: cores[i], borderRadius: 6 })) },
    options: { scales: { y: yBRL }, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${brl(c.parsed.y)}` } } } } });
}

const CEN_INFO = { a: ['Comprar à vista', '#1e3a5f', 'fa-sack-dollar'], b: ['Comprar financiado', '#ef4b3f', 'fa-building-columns'], c: ['Alugar e investir', '#14b8a6', 'fa-key'] };

function calcRodar() {
  if (!CALC_OK) return;
  const p = calcParams(calcEstado());
  if (p.V <= 0) { $('cResumo').innerHTML = '<div class="card text-gray-500">Informe o valor do imóvel.</div>'; return; }
  const r = calcSimular(p), R = r.res, f1 = v => v.toFixed(1).replace('.', ',');
  const cen = r.mostra.map(k => [k, ...CEN_INFO[k]]), validos = cen.filter(c => r.validos.includes(c[0]));
  const ord = [...validos].sort((x, y) => R[y[0]].hoje - R[x[0]].hoje), melhor = ord[0], segundo = ord[1];
  const dif = segundo ? (R[melhor[0]].hoje / R[segundo[0]].hoje - 1) * 100 : 0;
  const inviavel = k => !r.validos.includes(k);
  const card = ([k, nome, cor, ic]) => `<div class="card ${k === melhor[0] ? 'ring-2' : ''} ${inviavel(k) ? 'opacity-60' : ''}" style="${k === melhor[0] ? `--tw-ring-color:${cor}` : ''}">
      <div class="text-xs text-gray-500 mb-1"><i class="fa-solid ${ic} mr-1" style="color:${cor}"></i>${nome}${k === melhor[0] ? ' <span class="ml-1 rounded-full px-2 py-0.5 text-white text-[10px]" style="background:' + cor + '">melhor</span>' : ''}${inviavel(k) ? ' <span class="ml-1 rounded-full px-2 py-0.5 bg-red-600 text-white text-[10px]">falta dinheiro</span>' : ''}</div>
      <div class="text-2xl font-bold">${brl(R[k].hoje)}</div><div class="text-xs text-gray-500">em valores de hoje · ${brl(R[k].nom)} nominal</div></div>`;
  const aviso = (cls, t) => `<p class="text-xs ${cls} mt-1">${t}</p>`;
  const av = [];
  if (r.viavelA) av.push(aviso('text-gray-600', `Com ${brl(r.dinheiro)} você consegue comprar à vista (precisa de ${brl(r.needA)}${p.fgts > 0 ? ', já usando o FGTS' : ''}). A comparação principal é <b>comprar à vista × continuar no aluguel e investir esse dinheiro</b>.` +
    (p.finOpc ? '' : ' Para ver também o financiamento, marque a opção em “Financiamento”.')));
  else av.push(aviso('text-gray-600', `Com ${brl(r.dinheiro)} não dá para comprar à vista (faltam ${brl(r.faltaA)}). A comparação é <b>financiar × alugar e investir o mesmo dinheiro</b>.`));
  if (!r.viavelB && r.mostra.includes('b')) av.push(aviso('text-red-600 font-semibold', `Para financiar faltam ${brl(r.faltaB)}: entrada, ITBI, cartório e tarifas (menos FGTS) somam ${brl(r.needB)}. O resultado do financiado é só ilustrativo.`));
  if (r.mostra.includes('b') && p.entrada < 20 && r.temFin) av.push(aviso('text-amber-700', 'A maioria dos bancos financia no máximo 80% do valor (entrada mínima de 20%).'));
  if (r.viavelA && p.finOpc && r.cet != null) {
    const liqInv = r.rendNom * (1 - p.ir / 100), custoFin = r.cet + p.tr;
    av.push(aviso('text-gray-600', `Financiar tendo o dinheiro só compensa se o investimento render mais que o financiamento custa: rendimento líquido de IR ≈ ${f1(liqInv)}% a.a. × CET + TR ≈ ${f1(custoFin)}% a.a. ${liqInv > custoFin ? '(aqui o investimento rende mais)' : '(aqui o financiamento custa mais)'}.`));
  }
  if (r.mostra.includes('b') && r.fgAmort > 0) av.push(aviso('text-gray-500', `O FGTS acima da entrada (${brl(r.fgAmort)}) foi usado para reduzir o valor financiado.`));
  if (p.amortAnual > 0 && r.mostra.includes('b')) {
    const msg = p.amortFonte === 'renda' ? `A amortização vem de renda extra anual: o financiado amortiza e os demais caminhos investem os mesmos ${brl(r.alternativoAmort)} ao longo do período.`
      : p.amortFonte === 'orcamento' ? `A amortização é formada dentro do orçamento: o financiado reserva mensalmente e os demais caminhos investem o equivalente (${brl(r.alternativoAmort)} no período).`
      : `A amortização sai da carteira do financiado; à vista e aluguel mantêm seus investimentos. Foram retirados ${brl(r.alternativoAmort)} ao longo do período.`;
    av.push(aviso('text-gray-600', msg));
    if (p.amortFonte === 'carteira' && r.carteiraFalta > 0) av.push(aviso('text-red-600 font-semibold', `A carteira do financiado ficou insuficiente em ${brl(r.carteiraFalta)} em algum momento; esse cenário exigiria outra fonte de dinheiro.`));
  }
  const orcTxt = p.orc > 0 ? `orçamento informado de ${brl(p.orc)}/mês (corrigido pela inflação)` : `orçamento automático de ${brl(r.orc0)}/mês no 1º mês (o maior gasto entre os caminhos)`;
  for (const [k, nome] of cen) if (r.est[k].n) av.push(aviso('text-amber-700', `${nome}: em ${num(r.est[k].n)} meses o gasto passa do orçamento (até ${brl(r.est[k].max)}/mês a mais, em valores de hoje); a diferença sai dos investimentos.`));
  $('cResumo').innerHTML = `<div class="card border-2" style="border-color:${melhor[2]}"><p class="text-base"><b>${melhor[1]}</b> deixa o maior patrimônio após <b>${num(p.horiz)} anos</b>${segundo ? `: ${f1(dif)}% acima de “${segundo[1].toLowerCase()}”` : ''}, com as premissas acima.${segundo && dif < 5 ? ' A diferença é pequena: pequenas mudanças nas premissas podem inverter o resultado (veja a sensibilidade).' : ''}</p>
      ${av.join('')}<p class="text-[11px] text-gray-400 mt-1">Todo mês, cada caminho tem o mesmo ${orcTxt}; o que sobra é investido.</p></div>
    <div class="grid sm:grid-cols-${cen.length} gap-4">${cen.map(card).join('')}</div>`;
  mk('cCalcChart', { type: 'line', data: { labels: r.serie.anos.map(a => a + 'a'), datasets: cen.map(([k, nome, cor]) => lineDs(nome + (inviavel(k) ? ' (falta dinheiro)' : ''), r.serie[k], cor, { borderWidth: 2.5, borderDash: inviavel(k) ? [6, 4] : undefined })) },
    options: { scales: { y: yBRL }, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${brl(c.parsed.y)}` } } } } });
  calcSensibilidade(p, r);
  const tem = k => r.mostra.includes(k), cols = r.mostra;
  const lin = (rot, v) => `<tr class="border-b last:border-0"><td class="py-2 text-gray-600">${rot}</td>${cols.map(k => `<td class="text-right">${v[k] ?? '—'}</td>`).join('')}</tr>`;
  const B = (k, x) => tem(k) ? x : undefined;
  const nP = r.nReal, ult = r.fin.parc[Math.max(0, nP - 1)], nomeCurto = { a: 'À vista', b: 'Financiado', c: 'Alugar' };
  $('cDetalhe').innerHTML = `<h3 class="font-bold mb-3">Detalhes</h3><table class="w-full text-sm min-w-[480px]"><thead class="text-left text-gray-500 border-b"><tr><th class="py-2"></th>${cols.map(k => `<th class="text-right">${nomeCurto[k]}</th>`).join('')}</tr></thead><tbody>
    ${lin('Seu dinheiro hoje (igual em todos)', { a: brl(r.dinheiro), b: brl(r.dinheiro), c: brl(r.dinheiro) })}
    ${lin('Gasto inicial (imóvel/entrada + custos − FGTS)', { a: brl(r.needA), b: brl(r.needB) })}
    ${lin('Sobra investida no início', { a: brl(Math.max(0, r.dinheiro - r.needA)), b: brl(Math.max(0, r.dinheiro - r.needB)), c: brl(r.dinheiro) })}
    ${tem('b') ? lin('Valor financiado', { b: brl(r.F) }) : ''}
    ${lin('1ª parcela (com seguros) / aluguel inicial', { b: brl(r.fin.parc[0]), c: brl(p.aluguel) })}
    ${lin(`Última parcela (mês ${nP}) / aluguel no fim`, { b: brl(ult), c: brl(r.aluguelFinal) })}
    ${tem('b') ? lin('Juros sobre o valor financiado (até a quitação)', { b: `${brl(r.fin.juros)} (${r.F > 0 ? f2(r.fin.juros / r.F * 100) : '0'}% do principal)` }) : ''}
    ${tem('b') && p.amortAnual > 0 ? lin('Amortização extra total / prazo efetivo', { b: `${brl(r.fin.amortExtra)} · ${r.nReal} meses` }) : ''}
    ${tem('b') && p.amortAnual > 0 ? lin('Uso alternativo do mesmo valor', { a: p.amortFonte === 'carteira' ? 'mantém os investimentos' : `investe ${brl(r.alternativoAmort)}`, b: p.amortFonte === 'renda' ? 'renda extra → dívida' : p.amortFonte === 'orcamento' ? 'reserva mensal → dívida' : 'retira da carteira → dívida', c: p.amortFonte === 'carteira' ? 'mantém os investimentos' : `investe ${brl(r.alternativoAmort)}` }) : ''}
    ${tem('b') ? lin('CET estimado (sem TR)', { b: r.cet == null ? '—' : f1(r.cet) + '% a.a.' }) : ''}
    ${lin(`Pago em parcelas / aluguel em ${num(p.horiz)} anos`, { b: brl(r.pagoFin), c: brl(r.totAlug) })}
    ${lin(`Manutenção em ${num(p.horiz)} anos`, { a: brl(r.totManut), b: brl(r.totManut) })}
    ${lin('Imóvel no fim (valorizado)', { a: brl(R.a.imovel), b: brl(R.b.imovel) })}
    ${p.vender ? lin('Imóvel no fim, líquido de corretagem e IR', { a: brl(R.a.vl), b: brl(R.b.vl) }) : ''}
    ${tem('b') ? lin('Saldo devedor no fim', { b: brl(R.b.saldo) }) : ''}
    ${lin(`Investimentos no fim (líquidos de IR; rendimento ${f1(r.rendNom)}% a.a. nominal)`, { a: brl(R.a.inv), b: brl(R.b.inv), c: brl(R.c.inv) })}
    ${p.fgts > 0 ? lin('FGTS que ficou na conta', { a: brl(R.a.fg), b: brl(R.b.fg), c: brl(R.c.fg) }) : ''}
    ${lin('<b>Patrimônio no fim (nominal)</b>', { a: '<b>' + brl(R.a.nom) + '</b>', b: '<b>' + brl(R.b.nom) + '</b>', c: '<b>' + brl(R.c.nom) + '</b>' })}
    ${lin('<b>Em valores de hoje</b>', { a: '<b>' + brl(R.a.hoje) + '</b>', b: '<b>' + brl(R.b.hoje) + '</b>', c: '<b>' + brl(R.c.hoje) + '</b>' })}
    </tbody></table>
    ${tem('b') ? `<p class="text-xs text-gray-500 mt-3">A parcela inclui seguros e taxa de administração e é corrigida pela TR projetada. O banco exige que a 1ª parcela caiba em até 30% da renda bruta familiar: para ${brl(r.fin.parc[0])}, renda mínima de cerca de ${brl(r.fin.parc[0] / 0.3)}.</p>` : ''}`;
}

function renderCalc() {
  if (!CALC_OK) {
    calcMontar();
    if (S.lvl !== 'cidade' && S.nb) $('cBairro').value = S.nb;   // puxa o bairro selecionado no site
    calcSugerir(); calcUsarMediana(true); cenRender();
  } else {
    if (S.lvl !== 'cidade' && S.nb && !$('cBairro').value) $('cBairro').value = S.nb;
    calcSugerir();   // índices podem ter chegado depois
  }
  calcRodar();
}
