# ImobRJ — Dashboard de transações imobiliárias do Rio

Dashboard estático (HTML + JS, sem build) com as transações de **ITBI da Prefeitura do Rio**, comparação com IPCA e CDI
(Banco Central), aba de tendência e calculadora **comprar × alugar**. Publicado no **GitHub Pages**:
https://imobrj.github.io/

```
C:\Projetos\ITBI Git\
├─ ImobRJ\                        <- este repositório (branch main)
│  ├─ public\                     <- site publicado
│  │  ├─ index.html, app.js, calc.js, transacoes.js, anuncios.js, combo.js, mapa.js
│  │  ├─ bairros.geojson          <- contornos dos bairros para a sub-aba Mapa (IPP/Data.Rio, simplificados)
│  │  ├─ dados.json, meta.json    <- agregados por rua/mês (gerar_dados_agregados.py)
│  │  ├─ indices.json             <- IPCA, CDI, TR e Selic (atualizar_indices.py)
│  │  ├─ areas.json               <- área e R$/m² de cada venda: faixas de metragem e medianas (gerar_areas.py)
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

## Atualizações automáticas (robôs do GitHub Actions)
- **Índices (IPCA, CDI, TR, Selic):** `.github/workflows/indices.yml` roda sozinho todo dia 12 e publica o site
  se algo mudou. Para rodar na hora: *Actions → Atualizar índices → Run workflow*.
- **ITBI:** o site da Fazenda bloqueia downloads automáticos, então a planilha nova precisa ser baixada por você.
  Depois disso o robô `.github/workflows/itbi.yml` faz todo o resto:
  1. Baixe no navegador a planilha nova (normalmente só a "2025 em diante" muda).
  2. No GitHub, abra **Releases → planilhas → Edit** (ícone de lápis).
  3. Apague o `.xlsx` antigo do mesmo período (ícone de lixeira), arraste o novo e clique **Update release**.
  4. Em 1 minuto o robô aparece em *Actions → Atualizar ITBI*. Ele roda os 4 scripts abaixo e publica o site.
     O relatório de qualidade fica no resumo da execução. Se não começar, use *Run workflow* nessa mesma tela.
  - Configuração inicial (uma vez só): *Releases → Draft a new release*, tag `planilhas`, título "Planilhas da Fazenda",
    anexe os 3 `.xlsx` e clique **Publish release**.
  - Os anexos da Release são públicos (o repositório é público). São os mesmos dados que a Prefeitura publica.
  - Os robôs fazem commits na `main`. Antes de mexer no site pelo VS Code, clique em *Sync/Pull* para trazer essas mudanças.

## Atualizando os dados no seu computador (alternativa manual)
Fonte: planilhas da Fazenda do Rio (2011–2018, 2019–2024, 2025 em diante), uma linha por transação:
https://fazenda.prefeitura.rio/itbi-valores-medios-por-m2-de-transacoes-imobiliarias-por-trecho-de-logradouro/

Coloque os `.xlsx` em `C:\Projetos\ITBI Git\planilhas_sefaz` e rode, no terminal aberto na pasta `ImobRJ`, nesta ordem:
```bash
pip install openpyxl                      # só na primeira vez
python scripts/processar_itbi.py          # xlsx -> planilhas_sefaz\saida\itbi_limpo.csv + relatorio_qualidade.txt
python scripts/gerar_dados_agregados.py   # -> public/dados.json e meta.json
python scripts/gerar_transacoes_site.py   # -> public/transacoes/*.json e public/areas.json (faixas de metragem)
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
- **Mapa (Preços → Mapa):** pinta cada bairro pela mediana do R$/m² dos últimos 12 meses (mín. 10 vendas), calculada no navegador
  a partir do `areas.json`. O `mapa.js` só baixa a biblioteca Leaflet (cdnjs) e o `bairros.geojson` quando alguém abre o mapa.
  O `bairros.geojson` veio da camada "Limite de Bairros" do IPP/Data.Rio (166 bairros, nov/2026), convertida para lat/long e
  simplificada com o mapshaper (`-proj wgs84 -simplify 5% keep-shapes -clean`, precisão 0,0001°). Cada bairro tem `nome` (oficial) e
  `nb` (o nome sem acento usado nos dados do ITBI; "Brás de Pina" → `braz de pina` e "Osvaldo Cruz" → `oswaldo cruz`).
  Só precisa ser refeito se a Prefeitura criar ou mudar bairros.
- A primeira planilha da Fazenda começa em **2011-07**; o último mês publicado costuma atrasar.
- Bairro e cidade usam a **mediana** do R$/m²; rua usa média ponderada (poucas vendas). As medianas vêm do `areas.json`; enquanto ele carrega (ou se faltar), o site mostra médias.
- Se `indices.json` não existir, o site tenta ler o Banco Central direto do navegador; se falhar, os recursos de IPCA/CDI ficam desativados.
- Ao mudar `app.js` ou `calc.js`, suba o `?v=` deles no `index.html` para furar o cache do navegador.
- Calculadora e estimativas são educativas: não são recomendação nem avaliação profissional.
