# ImobRJ — Dashboard de transações imobiliárias do Rio

Dashboard estático (HTML + JS, sem build) com as transações de **ITBI da Prefeitura do Rio**, comparação com IPCA e CDI
(Banco Central), aba de tendência e calculadora **comprar × alugar**. Publicado no **GitHub Pages**:
https://caiovalle.github.io/ImobRJ/

```
C:\Projetos\ITBI Git\
├─ ImobRJ\                        <- este repositório (branch main)
│  ├─ public\                     <- site publicado
│  │  ├─ index.html, app.js, calc.js, transacoes.js, anuncios.js, combo.js
│  │  ├─ dados.json, meta.json    <- agregados por rua/mês (gerar_dados_agregados.py)
│  │  ├─ medianas.json            <- medianas de R$/m² por bairro (gerar_dados_agregados.py)
│  │  ├─ indices.json             <- IPCA, CDI, TR e Selic (atualizar_indices.py)
│  │  └─ transacoes\              <- um JSON por bairro + index.json (gerar_transacoes_site.py)
│  ├─ scripts\
│  ├─ .vscode\settings.json       <- Commit no VS Code já envia ao GitHub
│  └─ .github\workflows\pages.yml <- publica public\ no GitHub Pages
└─ planilhas_sefaz\               <- planilhas .xlsx da Fazenda (FORA do repositório)
   └─ saida\                      <- itbi_limpo.csv e relatorio_qualidade.txt (não vão ao GitHub)
```

## Publicação (GitHub Pages)
O workflow `.github/workflows/pages.yml` publica a pasta `public/` sempre que um `push` na branch `main`
altera algo em `public/`. Para publicar sem mudar arquivos: *Actions → Publicar site no GitHub Pages → Run workflow*.

Fluxo do dia a dia:
```bash
git add .
git commit -m "descrição da mudança"
git push
```
Ou pelo VS Code: ícone *Source Control* → mensagem → **Commit** (o `.vscode/settings.json` já faz o *push*).
O site atualiza em 1–2 minutos. Se o navegador mostrar a versão antiga, use **Ctrl+F5** ou uma janela anônima.

## Atualizando os dados (quando houver planilhas novas)
Fonte: planilhas da Fazenda do Rio (2011–2018, 2019–2024, 2025 em diante), uma linha por transação:
https://fazenda.prefeitura.rio/itbi-valores-medios-por-m2-de-transacoes-imobiliarias-por-trecho-de-logradouro/

Coloque os `.xlsx` em `C:\Projetos\ITBI Git\planilhas_sefaz` e rode, no terminal aberto na pasta `ImobRJ`, nesta ordem:
```bash
pip install openpyxl                      # só na primeira vez
python scripts/processar_itbi.py          # xlsx -> planilhas_sefaz\saida\itbi_limpo.csv + relatorio_qualidade.txt
python scripts/gerar_dados_agregados.py   # -> public/dados.json, meta.json e medianas.json
python scripts/gerar_transacoes_site.py   # -> public/transacoes/*.json
python scripts/atualizar_indices.py       # IPCA, CDI, TR e meta Selic (Banco Central) -> public/indices.json
```
Leia o `relatorio_qualidade.txt` antes de publicar. A base completa nunca vai para o GitHub
(o `.gitignore` bloqueia `*.xlsx`, `itbi_limpo.csv` e a pasta `saida/`).
Os scripts encontram as pastas a partir da própria localização; só usam a biblioteca padrão, exceto `processar_itbi.py` (`openpyxl`).

## Rodando localmente
```bash
cd public
python -m http.server 8000                # abra http://localhost:8000 (ou http://localhost:8000/#calc)
```

## Detalhes úteis
- A primeira planilha da Fazenda começa em **2011-07**; o último mês publicado costuma atrasar.
- Bairro e cidade usam a **mediana** do R$/m²; rua usa média ponderada (poucas vendas). Sem `medianas.json`, o site cai para médias.
- Se `indices.json` não existir, o site tenta ler o Banco Central direto do navegador; se falhar, os recursos de IPCA/CDI ficam desativados.
- Ao mudar `app.js` ou `calc.js`, suba o `?v=` deles no `index.html` para furar o cache do navegador.
- Calculadora e estimativas são educativas: não são recomendação nem avaliação profissional.
