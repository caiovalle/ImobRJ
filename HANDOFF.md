# ImobRJ — Handoff para a próxima IA (atualizado em 05/11/2026)

## 0. Como trabalhar com este usuário
- Português do Brasil. Usuário **leigo em Git/terminal**, no **Windows** com **VS Code**. Dê passos curtos, com nomes exatos de botões/comandos, uma etapa por vez.
- Pastas locais: projeto em `C:\Projetos\ITBI Git\ImobRJ` (clonado do GitHub) e planilhas da Fazenda em `C:\Projetos\ITBI Git\planilhas_sefaz` (fora do repositório; `saida\itbi_limpo.csv` fica ali). Os scripts `processar_itbi.py` e `gerar_transacoes_site.py` assumem essas pastas por padrão (sem argumento). Os caminhos têm espaço: use aspas. Python instalado e funcionando (`python scripts/...` roda).
- **Nunca afirme que algo foi testado contra uma API real se só foi testado com simulação.** O sandbox do Claude não acessa `api.bcb.gov.br` nem `pgeo3.rio.rj.gov.br`; `web_fetch` só abre URLs que vieram de busca/usuário (a página da Fazenda do Rio foi recusada por isso).
- Ao alterar arquivos, entregue-os completos (ou zip só com os alterados) e diga onde substituir.
- Mantenha o site estático (HTML + JS puro) e scripts Python só com biblioteca padrão.

## 1. Objetivo e diretrizes do produto (resumo das diretrizes originais do usuário)
Plataforma gratuita de inteligência do mercado imobiliário do **estado do RJ** (hoje: município do Rio), para compradores, vendedores, investidores e profissionais. Prioridades: dados reais e verificáveis, transparência sobre origem/limitações, visualizações claras, acesso gratuito.
Regras que valem sempre:
- **Nunca inventar** transações, preços, fontes, APIs ou campos. Dados demonstrativos só se rotulados como exemplo.
- Separar sempre: (a) transações registradas, (b) preços anunciados, (c) estimativas calculadas pelo sistema.
- Estatística: preferir **mediana/percentis** à média; sempre mostrar tamanho da amostra; não tirar conclusões fortes com poucas observações; preço/m² só com valor e área confiáveis.
- Estimativa de valor nunca se apresenta como laudo/avaliação profissional.
- LGPD: não expor dado pessoal/identificável desnecessário.
- Registrar origem, data de importação e permitir rastrear; sinalizar divergências entre fontes em vez de escolher uma.
- Fases do roteiro: 1 MVP (feito) · 2 mapa/análise geográfica · 3 avaliação por comparáveis · 4 inteligência (liquidez, valorização, relatórios).
- Princípio central: confiabilidade > quantidade de gráficos.

## 2. Arquitetura
`Data.Rio / Fazenda → arquivos locais → commit pelo VS Code → GitHub → Netlify (publica `public/`)`. **Deploy confirmado funcionando** (usuário disse "deu certo").
```
imobrj/
├─ public/                       site publicado
│  ├─ index.html                 layout (Tailwind CDN 3.4.17, Chart.js 4.4.1, Font Awesome)
│  ├─ app.js                     toda a lógica do front
│  ├─ dados.json                 ~10,8 MB, 53.535 registros (ITBI agregado por rua/mês)
│  ├─ meta.json                  {atualizado_em, registros, ultimo_periodo, fonte}
│  └─ indices.json               IPCA e CDI mensais (gerado por atualizar_indices.py)
├─ scripts/atualizar_dados.py    ITBI Data.Rio → dados.json (--csv, --url, --saida)
├─ scripts/atualizar_indices.py  Banco Central (SGS) → indices.json
├─ .vscode/settings.json         git.postCommitCommand=push (Commit no VS Code já envia ao GitHub)
├─ .github/workflows/atualizar-dados.yml   agendamento semanal (FALHA; ver §5)
├─ public/transacoes.js            aba Transações (módulo separado do app.js)
├─ public/combo.js                 dropdowns com busca por qualquer palavra
├─ scripts/gerar_dados_agregados.py  itbi_limpo.csv → public/dados.json (formato 2) + meta.json
├─ scripts/nomes.py, nomes_bairros.json  nomes de bairro com acento
├─ public/transacoes/              index.json + um JSON por bairro (gerado; ainda não publicado)
├─ scripts/processar_itbi.py       xlsx → itbi_limpo.csv (local)
├─ scripts/gerar_transacoes_site.py  itbi_limpo.csv → public/transacoes/
├─ netlify.toml  (publish="public", sem build)   ·  README.md  ·  HANDOFF.md
```

## 3. Dados
### 3.1 ITBI agregado (Data.Rio) — base atual do site
- Camada 8 de `https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Fazenda/ITBI/MapServer/8/query`. Dataset: `https://www.data.rio/datasets/5e4dda4d33f44b1eb9246559b281d1b8_8/about` (Prefeitura do Rio / Secretaria de Fazenda; licença CC BY 4.0 declarada em datasets irmãos). Atualização mensal; **desde jun/2026 a tabela omite o mês mais recente**. Também **omite logradouros com uma única transação no ano**.
- **Cada registro é a MÉDIA de um logradouro num mês** (com `total_transações`). Não há mediana, percentis, quartos, vagas nem coordenadas.
- Campos brutos: objectid, cl, logradouro, codbairro, bairro, total_transações, uso, principais_tipologias, média_percentual_transferido, média_área_construída, média_valor_transação, média_valor_imóvel, principal_transação_mercado, ano_transação, mês_transação, cd_utilizacao…
- Esquema do `dados.json`: `{id, bairro, logradouro, area, valor, valor_m2, transacoes, tipo, tipologia, ano, mes}`.
- Conversão (reproduz 53.535/53.535 do arquivo original): só `COMPRA E VENDA`; ano ≥ 2018; uso "NAO RESIDENCIAL" → Comercial, senão Residencial; `.title()`; descarta área/valor vazios e R$/m² fora de [500; 200.000] (**limite superior é estimativa**: dado só prova que está entre 142 mil e 379 mil).
- **Pendência de qualidade:** o app usa `média_valor_imóvel`; existe também `média_valor_transação`. Segundo a descrição do dataset, "valor do imóvel" = valor da transação ÷ percentual transacionado. Confirmar e documentar.
- Atualização automática **pausada**: no runner do GitHub a API respondeu `{"count": 0}` (estrutura da tabela presente, zero linhas). Causa não confirmada (tabela vazia na origem vs. bloqueio silencioso de IP estrangeiro). Teste pendente no navegador brasileiro: `.../Fazenda/ITBI/MapServer/8/query?where=1%3D1&returnCountOnly=true&f=json`. Alternativa funcional: baixar CSV pelo navegador e rodar `python scripts/atualizar_dados.py --csv arquivo.csv`.

### 3.2 IPCA e CDI (oficiais, Banco Central/SGS)
- IPCA = série **433** (IBGE, % a.m.); CDI acumulado no mês = série **4391** (B3, % a.m.). API `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados?formato=json&dataInicial=dd/mm/aaaa&dataFinal=dd/mm/aaaa`.
- **Rodou com dados reais no PC do usuário:** IPCA 2018-01→2026-09 (105 meses), CDI 2018-01→2026-11 (107 meses). O CDI de nov/2026 é **mês parcial**; o script foi corrigido para descartar o mês em andamento (`atualizar_indices.py` entregue ao usuário em separado). **Não sei se ele já substituiu o arquivo e rodou de novo** — verificar se `indices.json` termina em 2026-10 para o CDI.
- Estrutura: `{gerado_em, fonte, series:{ipca,cdi:{codigo_sgs,nome,unidade,instituicao,dados:{"AAAA-MM":valor}}}}`.

### 3.3 ITBI por transação (Fazenda do Rio) — IMPLEMENTADO (nov/2026), ainda não rodado nos arquivos completos
- 3 planilhas xlsx do site da Fazenda (2011–2018, 2019–2024, 2025 em diante; ~83 mil linhas só em 2025–ago/2026). Uma linha por transação. Colunas (20): ano, mes, ano_texto, mes_texto, regiao_fiscal, CD_BAIRRO, cl (código do logradouro), trecho, cod_tipologia, id_utilizacao, numero, COMPLEMENTO, bairro, logradouro, ds_imovel_tipologia, descricao (RESIDENCIAL/NAO RESIDENCIAL/TERRITORIAL), parte_transferida, vl_declarado, area, valor_m2.
- **Diferenças entre arquivos (confirmadas nas amostras):** 2011–2018 e 2019–2024 usam `nm_bairro_norm` (bairro) e `valor_transacoes` (valor) e `DESCRICAO` em maiúsculas; logradouro por extenso e com acento ("Estrada Cabuçu de Baixo") vs. 2025 abreviado/sem acento ("ETR CABUCU DE BAIXO"); `parte_transferida` "100.00" vs "100,00". `cl` e `cd_bairro` são estáveis entre períodos (usar como chave); valor ÷ área = valor_m2 da fonte em 100% das linhas das amostras.
- **Armadilhas:** textos vêm com escapes `_xNNNN_` (hex Unicode; `_x0031_`=dígito 1, `_x002C_`=vírgula, não só `_x0020_`); área em m² inteiros (arredondada); complemento é texto livre sem padrão; tipologia nem sempre bate com o complemento (CASA com "APT"); lançamentos populares geram várias unidades iguais no mesmo prédio/mês; **não há campo de tipo de transação** (compra e venda vs. outras) nem dia da venda; a base começa em jul/2011.
- **Pipeline:** `scripts/processar_itbi.py "<pasta com os xlsx>"` → `<pasta>/saida/itbi_limpo.csv` (base completa, COM complemento, só local, ignorada pelo git) + `relatorio_qualidade.txt`. Não apaga linhas: marca `aviso_*`; padroniza logradouro por `cl` (nome do período mais recente); completa bairro vazio por (cl, trecho). Depois `scripts/gerar_transacoes_site.py "<...>/itbi_limpo.csv"` → `public/transacoes/index.json` + um JSON por bairro (formato compacto; terrenos, inválidos e duplicados ficam fora; parcial e R$/m² fora da faixa entram marcados).
- **Decisão do usuário (LGPD):** publicar o **apartamento (complemento) no site**. Eu havia recomendado publicar só rua+número; o usuário escolheu o contrário. O site é estático: tudo que aparece é baixável por qualquer pessoa, e o que for commitado fica no histórico do Git.
- **Status:** testado só com ~900 linhas reais de amostra (299 por arquivo, primeiras linhas de cada planilha: zona oeste, região fiscal A/B). **Tamanho real dos arquivos por bairro desconhecido**: o gerador avisa se algum passar de 8 MB; nesse caso dividir por período. O relatório de qualidade completo ainda não foi visto.

## 4. Front-end (`public/app.js`)
Visual inspirado em QuintoAndar/Loft/FipeZap. Estado global: `S` (escopo cidade/bairro/rua), `F` (filtros), `B` (linhas filtradas), `IDX` (índices). Médias ponderadas por `transacoes`. Mês `t = (ano−2018)*12 + mes − 1`.
- **Busca:** CEP (ViaCEP, serviço de terceiros, só para achar rua/bairro), autocomplete, selects em cascata, atalhos, histórico (localStorage). `normRua()` expande abreviações da fonte (Avn, Etr, Prc…).
- **Abas:** Visão geral · Comparador · Tendência · **Transações** (nova, por imóvel) · Histórico · **Dados e metodologia**.
- **Aba Transações** (`transacoes.js`, `#tab-tx`): carrega `transacoes/index.json` e o JSON do bairro escolhido; filtros (rua, tipo, período, valor, área, busca por nº/apartamento), ordenação, paginação de 50, "agrupar por prédio" (clique filtra o prédio), KPIs com **mediana e percentis 25/75** só de vendas integrais e R$/m² dentro da faixa. Sincroniza com o local da busca principal (casa bairro por `strip(nome)`). Se `transacoes/index.json` não existir, mostra aviso. Independente do `dados.json`: as demais abas não mudaram.
- **Comparador (novo):** caixas IPCA e CDI (linhas tracejadas em base 100 ancoradas no 1º período do local em foco; força escala base 100); escala "R$/m² em valores de hoje (IPCA)"; tabelas "Últimos 12 meses" e "Período completo" (janelas de 12 meses; índices alinhados ao ponto médio das janelas: 12m usa `fator('ipca', lastT−17, lastT−5)`; período completo usa `fator(t0+6, t1−5)`; mínimo 36 meses). Variação real = (1+nominal)/(1+IPCA) − 1.
- **Visão geral:** KPI extra "Variação real 12m (descont. IPCA)" quando há `IDX`.
- `loadIndices()`: tenta `indices.json`; senão API do BCB direto do navegador (**CORS não verificado**); senão desativa os controles com aviso.
- **Aba metodologia:** fontes, tratamento, cálculos, limitações e roadmap; trechos dinâmicos via `renderMethodAuto()` (IDs `mItbi`, `mIpca`, `mCdi`). Ao mexer, mantenha os IDs do HTML usados no JS.
- Mantenha também os testes de busca (digitar, clicar, teclado, selects).

## 5. Estado e pendências
Feito e confirmado pelo usuário: VS Code clonado e ligado ao GitHub; commit/push; **deploy no Netlify funcionando**; `indices.json` gerado com dados reais.
Pendente / a verificar:
1. O workflow semanal do GitHub continua falhando toda segunda; recomendei **Actions → Atualizar dados → ⋯ → Disable workflow** (não sei se o usuário fez).
2. Confirmar que o `atualizar_indices.py` corrigido (descarta mês parcial) foi aplicado e o `indices.json` regenerado/commitado.
3. Verificar visualmente no site publicado a aba Comparador com os índices reais (só testei com valores sintéticos de teste; cálculo conferido à mão em Python).
4. Rodar `processar_itbi.py` nas planilhas completas, ler `relatorio_qualidade.txt`, gerar `public/transacoes/`, conferir tamanhos e publicar (§3.3). Depois: avaliar migrar Visão geral/Comparador/Tendência para a base por imóvel (permitiria mediana e série desde 2011; exigiria `indices.json` desde 2011).
5. Qualidade de dados (da diretriz): duplicados, padronização de bairros, validar limite de R$/m², confirmar `valor_imóvel` vs `valor_transação`.
6. Fase 2 (mapa): a base não tem coordenadas; definir geolocalização (limites oficiais de bairros ou geocodificação) e checar termos de uso. Fase 3 (estimativa): só viável de verdade com dados por unidade (§3.3).
7. Opcional: mostrar mediana/percentis e nº de amostra quando houver dados individuais; relatórios exportáveis.

## 5b. Alterações de 06/11/2026 (v2) — implementadas e testadas com dados de TESTE; falta rodar com os dados reais
Pedidos do usuário (todos atendidos no código):
1. **Hover dos gráficos:** `mk()` aplica `interaction {mode:'index', intersect:false}` a gráficos de linha/barra (barra horizontal: `nearest` no eixo y) + `pointHitRadius:16`. Medido: a 60 px da linha, versão antiga = 0 elementos ativos, nova = 1.
2. **Visão geral desde 2011:** `ANO0 = 2010` (mês t=0 = jan/2010) substitui o 2018 fixo em app.js; novo `scripts/gerar_dados_agregados.py` gera `public/dados.json` (**formato 2**, colunas compactas) + `meta.json` (`origem:"fazenda_por_imovel"`) a partir do `itbi_limpo.csv`. O app aceita o formato antigo (lista de objetos) e o novo (`expandir()`). `atualizar_indices.py` agora começa em 2010 e consulta a API em janelas de até 9 anos. **Efeito colateral importante:** a base por imóvel não tem tipo de transação (sem filtro "compra e venda") e é mais completa que a do Data.Rio, então os números das 3 abas mudam; a aba de metodologia descreve a fonte conforme `meta.json`.
3. **IPCA/CDI seguem a janela do usuário (De/Até):** `janelaIdx(rows)` compara a média dos primeiros w meses com a dos últimos w (w = min(12, ⌊L/3⌋); mínimo 6 meses de dados) e acumula IPCA/CDI entre os pontos médios (`ceil`). Substituiu o KPI "Variação real 12m" e as tabelas "Últimos 12 meses"/"Período completo" por uma tabela única "no período selecionado". Conferido contra cálculo independente em Python (diferença zero).
4. **CDI em frase flutuante:** o KPI "Variação real no período (descont. IPCA)" mostra tooltip (hover/foco) com período, IPCA, CDI e "imóvel X% acima/abaixo do CDI".
5. **Dropdowns com busca por qualquer palavra:** `public/combo.js` transforma `selBairro, selRua, cmpExtra, txBairro, txRua, txTip` em combobox (o `<select>` fica oculto como fonte da verdade: `.value`, `.disabled`, innerHTML e evento `change` continuam funcionando). Casa todas as palavras em qualquer ordem, sem acento, e também a forma expandida da rua (`normRua`: "estrada" acha "Etr …"). Teclado ↑↓ Enter Esc, até 150 itens por vez.
Outros: nomes de bairro com acento preservados via `scripts/nomes_bairros.json` (156 bairros, extraído do dados.json do Data.Rio; os demais ficam em Title Case sem acento) e módulo `scripts/nomes.py`; corrigido `Math.max(...lista)` (estoura a pilha com centenas de milhares de linhas) com `minmax()`; `.card{min-width:0}` corrige gráfico que não encolhia ao estreitar a janela.
Testes (sandbox): E2E Playwright com dados sintéticos de 2011–2026; carga com 350 mil linhas agregadas: abre em ~2 s, interações 0,2–0,5 s no desktop de teste (celular não medido; heap ~120 MB).
**Pendências:**
- Rodar no PC do usuário, em ordem: `atualizar_indices.py` (índices desde 2010), `gerar_dados_agregados.py` (dados.json formato 2), `gerar_transacoes_site.py` (nomes com acento) e commit. Ver tamanho/linhas impressos; comparar números antes/depois nas 3 abas.
- `relatorio_qualidade.txt` completo ainda NÃO foi visto.
- Tamanho real do `dados.json` novo desconhecido (o script avisa se > 25 MB).
- Desativar workflow semanal do GitHub; checar visual com índices reais; medir no celular.
- `atualizar_dados.py` (Data.Rio) e o workflow ficam como legado.

## 6. Como testar mudanças no front (sandbox do Claude)
Playwright (Python) disponível. Servir `public/` com `python -m http.server`; interceptar CDNs: Chart.js via `npm i chart.js@4.4.1` (`node_modules/chart.js/dist/chart.umd.js`), CSS do Tailwind gerado com `npx tailwindcss@3.4.17 -c tw.config.js` (cores `brand`/`ink` do `index.html`) e injetado no lugar do script do CDN (sem ele a classe `.hidden` não existe e o loader não some). Simular BCB/Data.Rio com servidor local de **valores sintéticos, usados só em teste, nunca no projeto**. Rotas de `viacep` podem ser abortadas.

## 7. Sugestão de instruções para o Projeto no Claude
> Você é o desenvolvedor do ImobRJ (dashboard de ITBI do Rio). Leia HANDOFF.md antes de qualquer tarefa. Responda em português do Brasil.
> O usuário é iniciante em Git e usa Windows + VS Code: dê passos com nomes exatos de botões e comandos, uma etapa por vez.
> Mantenha o site estático (HTML + JS puro) e os scripts Python só com biblioteca padrão. Nunca sobrescreva dados se o download vier incompleto.
> Nunca invente dados, fontes ou campos. Nunca afirme que algo foi testado contra a API real se só foi testado com simulação. Ao alterar arquivos, entregue-os completos e diga qual substituir.
