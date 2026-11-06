# HANDOFF — ImobRJ (estado após calc v11) e próximo passo

> Documento para continuar o desenvolvimento em uma nova conversa.
> **Fonte da verdade = os arquivos do repositório do Caio**, não o ambiente do assistente (ele é apagado entre sessões).
> Repositório: `https://github.com/caiovalle/ImobRJ` · Site: `https://caiovalle.github.io/ImobRJ/`

---

## 0. Como começar a próxima sessão (leia primeiro)

1. **Peça ao Caio para anexar os 3 arquivos que estão hoje em `public\`**: `index.html`, `app.js` e `calc.js`.
   Não mexa no que não foi anexado: o `app.js` de uma sessão antiga **não** tem a mediana nem a navegação por `#aba`, e editá-lo desfaria recursos que já funcionam.
2. **Confirme qual `calc.js` ele tem instalado.** Última versão entregue: **v11** (`calc.js?v=calc11`). A última versão que ele confirmou ter na máquina foi a **v9**. Se o `index.html` dele mostrar `calc.js?v=calc9`, instale primeiro o `imobrj_calc11.zip` (só `calc.js` + `index.html`) ou peça o arquivo atual e trabalhe sobre ele.
   Conferir: `Select-String -Path public\index.html -Pattern 'calc.js\?v='`
3. Não precisa anexar `dados.json`, `medianas.json`, `indices.json` nem `public\transacoes\`.
4. Faça as mudanças da **seção 5** (próximo passo), teste e entregue **arquivos completos** em um ZIP (o Caio não consegue baixar `.html` entregue como link).

---

## 1. Preferências do Caio (como trabalhar com ele)

- Fala **português**; pede inglês profissional só para e-mails de trabalho.
- É beginner-to-intermediate em JS/Git: **dê passo a passo explícito** (onde clicar, qual arquivo, qual comando), **um comando por vez** no terminal.
- Quer **arquivos completos e prontos** (ZIP com a estrutura `public\...` / `scripts\...`), não trechos soltos.
- **Antes de mudanças grandes, discute a proposta**; quando ele diz "aplicar/faça tudo", implemente direto.
- Gosta de respostas **concisas e focadas no escopo pedido**. Não inventar números: tudo que vem de fonte externa deve ser citado ou marcado como estimativa.
- **Seja honesto sobre o que foi testado.** Os testes feitos pelo assistente foram em dados sintéticos e/ou numa página que imita o site; nunca no site real. Diga isso ao entregar.
- Ciclo de teste dele: extrai o ZIP em `C:\Projetos\ITBI Git\ImobRJ\`, roda `cd public` + `python -m http.server 8000`, abre `http://localhost:8000/#calc` e usa **Ctrl+F5**. Se não mudar: janela anônima ou "Esvaziar cache e recarregar forçado" (F12 → Network → Disable cache).
- Publicação: `git add .` → `git commit -m "..."` → `git push`. O workflow publica sozinho quando algo em `public/` muda.

---

## 2. Visão geral do projeto

Dashboard estático (HTML + JS, sem build) sobre transações de **ITBI da Prefeitura do Rio**, com calculadora **comprar × alugar**. Hospedado no **GitHub Pages**.

- Fonte dos dados: planilhas da Fazenda do Rio (2011–2018, 2019–2024, 2025 em diante), uma linha por transação.
  `https://fazenda.prefeitura.rio/itbi-valores-medios-por-m2-de-transacoes-imobiliarias-por-trecho-de-logradouro/`
- Front: **Tailwind via CDN** + **Chart.js via CDN** + Font Awesome.
- Estrutura de pastas **igual nos dois PCs** do Caio:

```
C:\Projetos\ITBI Git\
├─ ImobRJ\                 <- clone do GitHub (branch main)
│  ├─ public\              <- site publicado
│  │  ├─ index.html, app.js, calc.js, transacoes.js, combo.js
│  │  ├─ dados.json, meta.json, indices.json, medianas.json
│  │  └─ transacoes\       <- um JSON por bairro + index.json
│  ├─ scripts\
│  └─ .github\workflows\pages.yml
└─ planilhas_sefaz\        <- os 3 .xlsx (FORA do repositório)
   └─ saida\               <- itbi_limpo.csv e relatorio_qualidade.txt (NÃO vão ao GitHub)
```

- Os scripts calculam as pastas a partir da própria localização (`Path(__file__)`); **não existe `caminhos.py`** e não é necessário.

### Publicação (GitHub Pages)
- O site é publicado **só pelo GitHub Pages**; o robô `atualizar-dados.yml` foi removido.
- `pages.yml` usa `peaceiris/actions-gh-pages@v4` publicando `./public` na branch **`gh-pages`** (`force_orphan: true`). Em Settings → Pages, a fonte é **Deploy from a branch → gh-pages / (root)**.
- A abordagem "GitHub Actions + deploy-pages" ficou presa em `deployment_queued`/timeout e foi abandonada.
- O site só republica quando algo muda em `public/` (ou no próprio `pages.yml`); senão, rodar manualmente em Actions → Run workflow.

---

## 3. Pipeline de dados (rodar nesta ordem quando houver planilhas novas)

| # | Comando (na pasta `ImobRJ`) | O que faz | Resultado da última execução do Caio |
|---|---|---|---|
| 1 | `python scripts/processar_itbi.py` | Junta e limpa os `.xlsx` → `planilhas_sefaz\saida\itbi_limpo.csv` + `relatorio_qualidade.txt` | 619.984 linhas lidas, nenhuma apagada; R$/m² bate com a fonte (0 divergências) |
| 2 | `python scripts/gerar_dados_agregados.py` | Gera `public/dados.json`, `meta.json` **e `medianas.json`** | 273.707 linhas agregadas, 161 bairros, 10.427 logradouros, 10,6 MB, 2011-07 a 2026-09; medianas: 62.075 grupos, 593.940 valores, 2,6 MB |
| 3 | `python scripts/gerar_transacoes_site.py` | Gera `public/transacoes/*.json` | 600.014 publicadas em 161 bairros (29,3 MB); maior: Barra da Tijuca (57.495) |
| 4 | `python scripts/atualizar_indices.py` | IPCA (SGS 433), CDI (4391), **TR (7811)** e **meta Selic (432, só o último valor)** → `public/indices.json` | IPCA até 2026-09, CDI até 2026-10, TR até 2026-11, Selic 13,75% |

Notas:
- Primeira planilha da Fazenda começa em **2011-07**; o último mês publicado costuma atrasar.
- `nomes.py` agora aplica preposições em minúsculo ("Barra da Tijuca", "Recreio dos Bandeirantes").
- Correção feita na linha da Selic em `atualizar_indices.py`: `ult = baixar(args.base.format(codigo=SELIC["codigo"]) + "/ultimos/1?formato=json")[-1]` (a versão anterior gerava URL 404).
- A série da Selic do Banco Central traz a **data do próximo Copom** (aparecia como data futura). A calculadora mostra só "Selic atual".
- `scripts/atualizar_dados.py` é da base antiga do Data.Rio (só ≥ 2018) e **sobrescreveria o `dados.json`**. Foi recomendado `git rm scripts/atualizar_dados.py`. **Confirmar se o Caio já apagou.**
- `README.md` reescrito com o fluxo acima (GitHub Pages + pipeline das planilhas).

---

## 4. Estado do front-end (o que existe hoje)

### 4.1 Versões e cache
- `index.html` carrega: `app.js?v=calc5`, `calc.js?v=calc11` (na v11), e `transacoes.js`, `combo.js` sem versão.
- Ao mudar `app.js`, **atualize o `?v=` dele também** (hoje ficou em `calc5`) e o de `calc.js`, para furar o cache do navegador/celular.

### 4.2 `app.js` (dashboard) — pontos relevantes
- Navegação por abas com **`#hash`** (`overview, compare, trend, tx, calc, history, method`): funções `ABAS`, `abaDoEndereco`, `marcarAba`, `irParaConteudo`, `irParaAba`. Troca de aba rola até `#conteudo` (início do conteúdo), não ao topo; menu fixo; banner reduzido; `history.scrollRestoration='manual'`.
  **Pendente de confirmação do Caio no celular**: se tocar nas abas ainda volta ao banner. (Versão `abas v2` adicionou `min-height` ao `#conteudo` e `requestAnimationFrame` duplo.)
- **Mediana**: `loadMedianas()` lê `medianas.json`; `MED` (grupos: `nb, tipologia, tipo, ano, t, v[], passo`), `MB` (grupos após filtros), `medScope()`, `usaMediana()`, `medOf(grupos)` (mín. `MED_MIN = 5` vendas), `agg(rows, md)`, `series(rows, axis, md)`, `var12(rows, lastT, md)`, `janelaIdx(rows, md)`.
  Regra: **bairro e cidade = mediana; rua = média ponderada** (poucas vendas). Sem `medianas.json`, o site cai para médias.
- Índices: `IDX = { ipca: Map, cdi: Map, tr?: Map, selic?: {valor,data}, fim: {...}, ini, origem }`; `fator('ipca'|'cdi', t0, t1)`; `ymLabel(t)`; `ANO0 = 2010` (t = meses desde jan/2010).
- **Aba Tendência**: `renderTrend(sc)` → `regress()` (regressão linear), `movAvg()`, elementos `#trendKpis` (4 cards: **Direção, Variação anual estimada, Projeção p/ <período>, Confiança (R²)**), canvases `#cTrend` (preço real + média móvel + tendência + projeção) e `#cSaz` (sazonalidade). Cálculos-chave: `annual = reg.slope * perYear() / fitLast * 100`; `proj = line[last + H]`; direção "Alta" se `annual > 2`, "Queda" se `< -2`, senão "Estável". Hoje **não há explicação nos cards** e **não há campo de metragem**.
- Utilidades: `$`, `brl`, `num`, `pct`, `pctColor`, `mk(id, cfg)` (Chart.js), `lineDs`, `yBRL`, `toast`, `strip`.
- Histórico em `localStorage` (`imobrj_hist`).

### 4.3 `calc.js` (aba "Comprar ou alugar") — v11
Ordem dos grupos na tela: **Seu dinheiro** (dinheiro hoje, FGTS, orçamento mensal) · **Imóvel e compra** (valor, ITBI, cartório, valorização, manutenção) · **Financiamento** (entrada %, prazo, juros, TR, seguros, tarifas, amortização anual + origem + opção "comparar também financiando") · **Aluguel** (aluguel inicial, reajuste, "acompanha a valorização") · **Investimento** (rendimento real, IR, IPCA) + **perfis de juros** · **Comparação** (horizonte, corretagem, IR ganho de capital, "contar como vendido") · SAC/Price · Resumo · gráfico · **Sensibilidade** · **Cenários salvos** · Detalhes · "Como a conta é feita".

Funções principais: `calcSugestoes`, `calcBairroInfo`, `calcMontar`, `cv`, `setSug`, `calcSugerir`, `calcInfoBairro`, `calcUsarMediana`, `aMes`, `financiamento`, `cetAA`, **`calcSimular(p, leve)`**, `vantagemCompra`, `pontoVirada`, **`calcSensibilidade(p, r0)`**, `calcParams(st)`, `calcEstado`, cenários (`cenSalvar/Carregar/Apagar/Render/Comparar`, `localStorage` chave `imobrj_cenarios`), `calcAmortFonteInfo` (v11), `calcRodar`, `renderCalc`. Constantes: `CALC_REF` (referências manuais, **único lugar para atualizá-las**), `CALC_CAMPOS`, `CAMPOS_MOEDA`, `parseMoeda`, `formatMoeda`, `valorEstado`, `CALC_EDIT` (campos que o usuário mexeu: sugestões não sobrescrevem).

Decisões de modelagem já tomadas (não desfazer sem combinar):
- **Parte do dinheiro que a pessoa tem** (`p.dinheiro`; `null` = "o suficiente para comprar à vista"):
  - cobre imóvel + ITBI + cartório (com FGTS) → compara **à vista × alugar e investir**; financiado só aparece com a opção `cFinOpc`;
  - não cobre → **financiado × alugar**; se não cobre nem a entrada e custos → financiado marcado "falta dinheiro" e fora da escolha do melhor.
  - Conjuntos: `mostra` (caminhos exibidos) e `validos` (viáveis); `melhor` só entre os válidos.
- **Mesmo orçamento mensal para todos os caminhos**: o informado (corrigido pelo IPCA) ou, se vazio, o maior gasto entre os caminhos mostrados. Sobra é investida; falta sai dos investimentos (com aviso).
- **Rendimento em taxa real** (acima do IPCA), não Selic fixa por 30 anos. Sugestão 7,4% (Tesouro IPCA+ longo, ≈ nível alto: testar 5–6% na sensibilidade). Perfis de juros (**conservador 16%, estável 13,75%, otimista 9% nominal**) só convertem para taxa real e preenchem `cRendReal`; **não** alteram o juro do financiamento.
- Imóvel contado **vendido no fim** (corretagem 6% + IR ganho de capital, sugestão 0% por isenções) — com caixa de seleção para desligar.
- **Aluguel acompanha a valorização** (padrão). **Manutenção** só nos cenários de compra. **FGTS**: paga a entrada; sobra abate o financiado; no aluguel fica na conta (TR + 3% a.a.).
- **Juros do financiamento** são calculados **sobre o saldo devedor** (não sobre o contrato inteiro); o detalhe mostra "juros sobre o valor financiado (até a quitação)" e o % do principal.
- **Amortização anual**: três origens — **renda extra anual** (padrão: o financiado amortiza e à vista/aluguel **investem o mesmo valor**), **parte do orçamento mensal** (reserva 1/12 por mês) e **retirada dos investimentos** (com aviso se a carteira não cobre). Reduz prazo. Simplificações: valor fixo (sem inflação) e reserva mensal sem rendimento.
- Campos monetários têm **máscara de milhar sem centavos** (`1.234.567`); a entrada mostra "20% = R$ 120.000 · FGTS cobre … · dinheiro próprio …".
- Sensibilidade: pontos de virada para rendimento real, valorização e aluguel (% do valor/ano) + **matriz rendimento real (linhas) × valorização real (colunas)**; hoje 6 colunas (`-2…+3%`) × até 6 linhas (`rendReal-3 … rendReal+2`, `≥ -1`).
- Cenários salvos (até 10; compara 2–4): guardam todos os campos, sistema, bairro, área, caixas marcadas e origem da amortização; cenários antigos assumem "renda extra anual".

### 4.4 Referências de mercado (estavam fixas em `CALC_REF`, nov/2026)
Selic 13,75% (automática via `indices.json`); TR 12m ≈ 2% (automática); IPCA 12m (automático; reserva 4,58%); juros Caixa SBPE: TR + 10,99% a 11,49% (SFI: 11,80% a 12%); seguros ≈ R$ 210/mês; ITBI Rio 3%; cartório ≈ 1%; tarifas ≈ R$ 3.000; aluguel ≈ 6,14% a.a. do valor (FipeZAP, **média nacional**, não do Rio); Tesouro IPCA+ longo ≈ IPCA + 7,4%; corretagem 6%; manutenção 0,5% a.a. **Confirmar/atualizar datas ao mexer.**

---

## 5. PRÓXIMO PASSO — pedido do Caio (texto original, sem edição)

> mudança: quando colocar o valor de seu dinheiro hoje e fgts ja calcular a % de entrada automaticamente
> ao incluir o valor do aluguel, calcular automaticamente a % do valor de venda do imovel
> adicionar no resumos dos calculos uma linha que mostra o caso de ao final de 30 anos a mesma casa a vista seja comprada
> na aba tendencia, coloque explicaçoes para cada card
> na aba tendencia card variaçao anual, explique se é acima do inflaçao ou nao
> na aba tendencia inclua a opçao de escolher metragem do imovel como na aba calculadora
> no card de sensibilidade colocar opçao para expandir a matrix para mais valores

Arquivos a editar: `calc.js` (itens 1, 2, 3, 7), `app.js` (itens 4, 5, 6), `index.html` (se houver HTML novo na aba Tendência e para subir os `?v=`). Entregar `index.html` + `app.js` + `calc.js` completos em um ZIP, com `?v=calc12` (ou próximo) em `app.js` **e** `calc.js`.

### Item 1 — Entrada (%) calculada a partir de "Seu dinheiro hoje" + FGTS
- Fórmula (financiamento): `entrada R$ = dinheiro + FGTS − (ITBI + cartório) − tarifas`; `entrada % = entrada R$ ÷ valor do imóvel`, limitada a 0–100%.
  Exemplo: imóvel R$ 600.000, dinheiro R$ 200.000, FGTS R$ 50.000, ITBI 3% + cartório 1% (R$ 24.000), tarifa R$ 3.000 → entrada R$ 223.000 = **37,17%**. Confere com `needB = E − min(FGTS,E) + custo + tarifa = 200.000`.
- Disparar ao editar `cDinheiro` ou `cFgts` (e também ao mudar valor do imóvel, ITBI, cartório ou tarifa). Gravar em `#cEntrada` **sem** marcá-lo em `CALC_EDIT`; se o Caio digitar a entrada à mão, passa a **manual** (parar de sobrescrever) e oferecer "voltar ao automático" (pode ser o botão "Voltar às sugestões").
- Cuidado com a circularidade: hoje a **sugestão** de `cDinheiro` usa `needA` (valor para comprar à vista). Só aplicar a entrada automática quando `dinheiro < needA` (caminho do financiamento); se o dinheiro já cobre à vista, manter 20% (ou o que o usuário pôs) para não virar 100%.
- Mostrar o resultado no texto de apoio: "entrada calculada: X% = R$ Y (dinheiro R$ A + FGTS R$ B − custos R$ C)". Manter aviso de entrada < 20% (limite de financiamento de 80%).
- Cenários salvos: o modo (automático/manual) deve ir junto no estado.

### Item 2 — Aluguel → % do valor do imóvel
- Ao editar `cAluguel`, mostrar abaixo do campo: `% ao mês = aluguel ÷ valor` e `% ao ano = aluguel × 12 ÷ valor`.
  Exemplo: R$ 3.050 sobre R$ 600.000 = **0,51% a.m. = 6,10% a.a.**
- Comparar com a referência `CALC_REF.yieldAluguel` (6,14%, média nacional): "abaixo/acima da média nacional".
- Opcional, recomendado: permitir digitar o **% a.a.** e converter para R$ (campo bidirecional); manter o aluguel sugerido (`Math.round(V × yield / 12 / 50) × 50`) até o usuário mexer.
- `calcSensibilidade` já usa "aluguel como % do valor/ano" (`yld`), então a unidade fica consistente.

### Item 3 — Linha no resumo: "alugar, investir e comprar a mesma casa à vista no fim"
- No `calcRodar`/resumo (e, se couber, na tabela de Detalhes e na comparação de cenários), acrescentar uma linha:
  **"Se você alugar e investir por N anos e comprar a mesma casa à vista no fim"** (N = `Comparar após`, ex. 30).
- Cálculo (no horizonte H): `preço do imóvel em H = res.a.imovel` (valorizado) · `custos de compra = preço × (ITBI% + cartório%)` · `patrimônio do inquilino = res.c.nom` (já líquido de IR) · **`sobra = res.c.nom − preço × (1 + ITBI% + cartório%)`** (ou falta, se negativo). Mostrar também **em valores de hoje** (÷ `defl`).
- Texto sugerido: "Ao final de 30 anos, o patrimônio de quem alugou (R$ X) compra a mesma casa à vista (R$ Y + R$ Z de ITBI/cartório) e **sobram R$ W**" — ou "**faltam R$ W**".
- Não aplicar corretagem na compra; avisar que o preço usa a **valorização informada**. Implementar em `calcSimular` como campos novos do retorno (ex.: `compraFinal: { preco, custos, sobra, sobraHoje }`) para a comparação de cenários e os testes reusarem.

### Item 4 — Aba Tendência: explicação em cada card
- Padrão: ícone ⓘ que **alterna** um texto de ajuda por clique (igual ao `cHelp` da calculadora; **não** só `hover`, para funcionar no celular).
- Cards a explicar (linguagem simples, curta):
  - **Direção**: leitura da inclinação da linha de tendência do R$/m² (bairro/cidade: mediana; rua: média). "Alta" se > +2% a.a., "Queda" se < −2% a.a., senão "Estável".
  - **Variação anual estimada**: quanto a linha de tendência sobe por ano em relação ao valor atual (aproximação linear, em R$ correntes; ver item 5).
  - **Projeção p/ <período>**: onde a linha de tendência estaria daqui a ~12 meses; é extrapolação estatística, **não** previsão nem avaliação profissional.
  - **Confiança (R²)**: quanto da variação dos preços a linha explica; perto de 100% = tendência clara; baixo = série oscilante, desconfie da projeção.
- Também explicar os **dois gráficos** (`#cTrend`: o que são "R$/m² real", média móvel, tendência linear e projeção — "real" aqui significa dado observado, não descontado da inflação; `#cSaz`: média de transações por mês do ano).

### Item 5 — Variação anual: acima ou abaixo da inflação?
- Calcular **variação real**: `real = (1 + nominal) ÷ (1 + IPCA) − 1`, onde `nominal = annual` (já existe em `renderTrend`).
- IPCA a usar: recomendado o **IPCA anualizado na mesma janela da série analisada** (do 1º ao último período com dado), via `fator('ipca', t0, t1)` → `IPCA a.a. = fator^(12/meses) − 1`; mostrar também o IPCA dos últimos 12 meses como referência. Se `IDX` não carregou, exibir só o nominal com a nota "índice indisponível".
- Mostrar no card, com cor: "**+6,2% a.a.** nominal · IPCA 4,6% a.a. · **+1,5% acima da inflação**" (verde) ou "**−0,8% abaixo da inflação**" (vermelho); "em linha com a inflação" quando |real| < 0,5 p.p.
- Frase explicativa no ⓘ: variação real = o quanto o preço subiu **acima** (ou abaixo) do custo de vida; positiva = ganho de poder de compra.

### Item 6 — Aba Tendência: escolher a metragem do imóvel
- Campo **Área (m²)** (padrão 70, mesmo estilo da aba Calculadora), **compartilhado** com a calculadora (ex.: `localStorage` `imobrj_area` ou variável global) para as duas abas não divergirem.
- Usar a área para mostrar **valores em R$ do imóvel**: valor estimado hoje (`fitLast × área`) e **projeção em R$** (`proj × área`), mantendo também o R$/m². Opcional: alternância no gráfico "R$/m² | R$ do imóvel de X m²" (multiplicar as séries).
- Aviso: R$/m² mediano do bairro × área é uma **estimativa de referência**, não uma avaliação (padrão do imóvel, andar e conservação mudam o preço).
- Vale rodar só para escopos com mediana disponível; para rua, indicar que é média.

### Item 7 — Sensibilidade: expandir a matriz
- Botão **"Expandir matriz"** / **"Recolher"** no card `#cSens` (estado em variável, preservado ao recalcular).
- Compacta (atual): valorização real `−2…+3%` × rendimento `rendReal−3…+2` (≥ −1).
- Expandida: valorização real **`−4…+6%`** (passo 1; opcional passo 0,5) × rendimento real **`−1…+12%`** (ou `rendReal ± 6`); mostrar o contorno da célula **mais próxima** da premissa atual (hoje o contorno só aparece se a valorização real arredondar para inteiro).
- Mobile: `overflow-x-auto`, **primeira coluna fixa** (`sticky left-0`), células ≥ 44 px. Desempenho: ~12×11 chamadas de `calcSimular(leve)`; aceitável, mas medir e, se preciso, calcular só ao expandir.
- Manter a legenda das cores (À vista / Financ. / Alugar) e o texto explicando que valorização real = acima do IPCA.

### Critérios de aceite / testes sugeridos
1. Entrada automática: exemplo do item 1 → 37,17%; editar a entrada à mão desliga o automático; voltar às sugestões religa.
2. Aluguel: R$ 3.050 em R$ 600.000 → 0,51% a.m. / 6,10% a.a.
3. Resumo: com `Comparar após = 30`, a linha "comprar à vista no fim" aparece com sobra/falta; conferir que `sobra = res.c.nom − preço×(1+ITBI+cartório)`.
4. Tendência: os 4 cards + 2 gráficos têm explicação que abre e fecha no clique (testar no modo celular, F12 → Ctrl+Shift+M).
5. Variação anual: com IPCA carregado, mostra nominal, IPCA e diferença real, com cor; sem IPCA, mostra só nominal.
6. Metragem: mudar a área atualiza valor estimado e projeção; a mesma área aparece na calculadora.
7. Sensibilidade: expandir/recolher funciona; premissa atual destacada; rolagem horizontal no celular.
8. **Regressão**: cenários salvos antigos carregam; perfis de juros, amortização (3 origens), máscara de milhar, mediana e navegação por `#aba` continuam funcionando; sem erros no Console (F12).
9. Subir `?v=` de `app.js` e `calc.js` no `index.html`.

---

## 6. Pontos de atenção e pendências conhecidas

- **Nunca testado no site real**: toda validação do assistente foi com dados sintéticos/mock. Peça ao Caio um print do Console (F12) se algo falhar.
- Confirmar no celular: troca de abas **não volta mais ao banner**; calculadora legível numa coluna só.
- Efeito conhecido do orçamento **automático**: marcar "comparar também financiando" muda o orçamento (vira a parcela) e portanto os números de à vista e aluguel; para comparar de forma estável, preencher o **Orçamento mensal**.
- Premissas que mais pesam no resultado: **rendimento real** e **aluguel (% do valor)**. A rentabilidade de 6,14% é média nacional; conferir com anúncios do Rio.
- `scripts/atualizar_dados.py` já não existe no repositório; `README.md` atualizado.
- Tailwind por CDN (aviso de não-produção) e `dados.json` de 10,6 MB: possíveis otimizações futuras.
- Backlog já discutido: tratar a **nova divisão de bairros** (Barra Olímpica, Jabour, Lapa, Ilha de Guaratiba aparecem só em 2026, o que pode gerar queda falsa de volume nos bairros de origem em 2026); explicar o card "Variação real no período" na Visão geral; cenários salvos só existem no navegador (não sincronizam entre PC e celular).
- Aviso padrão da calculadora (manter): **simulação educativa, não é recomendação**; confirmar taxas, CET e condições com o banco.
