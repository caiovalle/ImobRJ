# ImobRJ — Handoff do projeto

## 1. Objetivo
Dashboard web de transações de compra e venda de imóveis no município do Rio de Janeiro, com dados oficiais de ITBI
(Prefeitura do Rio / Data.Rio). Site estático hospedado no Netlify, com dados atualizados automaticamente via GitHub Actions.
Idioma do usuário e da interface: português do Brasil. O usuário é leigo em Git/terminal: explicar passos pelo navegador, com cliques exatos.

## 2. Arquitetura
`Data.Rio (API ArcGIS)` → **GitHub Actions** (segunda 09:00 UTC + botão manual) → commit de `public/dados.json` → **Netlify** (deploy automático no push, publica a pasta `public/`).

```
imobrj/
├─ public/                         site publicado
│  ├─ index.html                   layout (Tailwind CDN, Chart.js 4.4.1, Font Awesome)
│  ├─ app.js                       toda a lógica
│  ├─ dados.json                   ~10,8 MB, 53.535 registros (gerado pelo script)
│  └─ meta.json                    {atualizado_em, registros, ultimo_periodo, fonte}
├─ scripts/atualizar_indices.py     baixa IPCA (SGS 433) e CDI (SGS 4391) do Banco Central → public/indices.json
├─ .vscode/settings.json           git.postCommitCommand=push (Commit no VS Code envia ao GitHub)
├─ scripts/atualizar_dados.py      baixa do Data.Rio e converte (só biblioteca padrão; --csv, --url, --saida)
├─ .github/workflows/atualizar-dados.yml
├─ netlify.toml                    publish="public", sem build, headers de cache
├─ .gitignore, README.md, HANDOFF.md
```

## 3. Dados
- **Fonte:** camada 8 de `https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Fazenda/ITBI/MapServer/8/query` (MaxRecordCount 2000; suporta paginação por `resultOffset`).
  Página do dataset: `https://www.data.rio/datasets/5e4dda4d33f44b1eb9246559b281d1b8_8/about`. Atualização mensal; desde jun/2026 a tabela omite o mês mais recente.
- **Campos brutos (com acento):** objectid, logradouro, bairro, total_transações, uso, principais_tipologias, média_área_construída, média_valor_imóvel, principal_transação_mercado, ano_transação, mês_transação (+ outros).
- **Esquema do `dados.json`:** `{id, bairro, logradouro, area, valor, valor_m2, transacoes, tipo, tipologia, ano, mes}`.
- **Regras de conversão (validadas: reproduzem 53.535/53.535 registros do arquivo original do usuário):**
  só `COMPRA E VENDA`; ano ≥ 2018; `uso` "NAO RESIDENCIAL" → "Comercial", senão "Residencial"; textos em `.title()`;
  area = média_área_construída (1 casa); valor = média_valor_imóvel (2 casas); valor_m2 = valor/area (2 casas);
  descarta área/valor vazios ou R$/m² fora de [500; 200.000] (o limite superior é estimado: o dado só prova que está entre 142 mil e 379 mil).
- Logradouros vêm abreviados e sem acento (Avn, Etr, Prc, Trv, Visc De…). `normRua()` no app.js expande abreviações e ignora preposições para casar com o ViaCEP.

## 4. Front-end (`public/app.js`)
Visual moderno inspirado em QuintoAndar/Loft/FipeZap (hero coral com busca grande, pílulas, cartões arredondados). Funções principais:
- **Busca:** CEP (máscara + ViaCEP `viacep.com.br/ws/{cep}/json/` → casa rua/bairro na base), autocomplete de bairro/rua com teclado (↑↓ Enter Esc) e seleção por `mousedown`, atalhos de bairros populares, selects em cascata Bairro→Rua, chips de histórico. Após escolher uma rua, busca os CEPs dela no ViaCEP.
- **Abas:** Visão geral (KPIs, preço/m² no tempo, tipologias, ranking top 10 por preço ou volume, transações por ano) · Comparador (local vs bairro vs cidade + 2º bairro, escala absoluta ou base 100, tabela e aviso "X% acima/abaixo da cidade") · Tendência (regressão linear, média móvel 3, projeção 12 meses, R², sazonalidade) · Histórico (localStorage, 30 itens, com filtros).
- **Filtros globais:** tipo (pílulas), tipologia, período, agrupamento mensal/trimestral (rua → trimestral automático).
- Médias são ponderadas por `transacoes`. Estado global: `S` (escopo: cidade/bairro/rua), `F` (filtros), `B` (linhas filtradas).
- Carrega `dados.json` via fetch; se falhar (file://), mostra seletor manual. Carimbo "dados até Mês/Ano · atualizado em" vem de `meta.json`.

## 4b. Atualizações recentes (nov/2026)
- **Atualização automática do ITBI: pausada por decisão do usuário.** O log real do GitHub mostrou `{"count": 0}` com a estrutura da tabela presente (servidor responde, sem linhas). Causa não confirmada; teste sugerido: abrir no navegador brasileiro `.../Fazenda/ITBI/MapServer/8/query?where=1%3D1&returnCountOnly=true&f=json`.
- **IPCA e CDI:** `scripts/atualizar_indices.py` → `public/indices.json` (`{gerado_em, fonte, series:{ipca,cdi:{codigo_sgs,nome,unidade,instituicao,dados:{"AAAA-MM":valor}}}}`). Se o arquivo faltar, o app tenta a API do BCB direto do navegador; se falhar, desativa os controles. **Testado só com servidor simulado (valores sintéticos); a API real do BCB não foi acessada pelo ambiente do Claude.** Códigos confirmados em fontes públicas; formato de data da série 4391 não verificado (o script usa só mês/ano).
- **Comparador:** caixas IPCA/CDI (base 100 ancorada no 1º período do local em foco), escala "valores de hoje (IPCA)", tabelas "Últimos 12 meses" e "Período completo" (janelas de 12 meses; índices alinhados ao ponto médio). KPI "Variação real 12m" na Visão geral.
- **Aba "Dados e metodologia"** (`#tab-method`): fontes, tratamento, cálculos, limitações, roadmap. Preenchida em parte via `renderMethodAuto()`.
- **Fatos de metodologia a lembrar:** o ITBI vem agregado (média por logradouro/mês), sem mediana/percentis, quartos, vagas ou coordenadas; `Média_Valor_Imóvel` vs `Média_Valor_Transação` precisa ser confirmado no dicionário do dataset.
- Teste ao mexer no front: Tailwind gerado via `npx tailwindcss` (v3.4.17) + Chart.js do npm interceptados no Playwright.

## 5. Estado atual
**Pronto e testado (Playwright headless com Chart.js/Tailwind simulados):** busca, cascata, teclado, filtros, abas, histórico, carimbo; conversão CSV→JSON; paginação contra servidor ArcGIS simulado.

**Em aberto — bloqueio atual:** a 1ª execução real do workflow no GitHub falhou:
```
Data.Rio informa 0 registros; baixando…
ERRO: só 0 registros válidos (antes: 53,535). Mantendo o arquivo atual.
```
A API respondeu `count = 0` ao pedido do runner. Causa desconhecida (não foi possível consultar a API real a partir do ambiente do Claude: só abre URLs vindas de buscas). Hipóteses: filtro do servidor por User-Agent/IP estrangeiro (runner GitHub nos EUA), parâmetros de consulta, ou mudança no serviço. As proteções do script funcionaram (o `dados.json` atual não foi sobrescrito).

**Correção já feita nesta versão do script (ainda NÃO está no GitHub do usuário):** cabeçalhos de navegador (User-Agent + Referer), contagem tentada com 2 cláusulas `where`, download que não depende da contagem, e diagnóstico que imprime a resposta bruta do servidor quando vem vazia. Testado só com servidor simulado (modos ok, count=0 e vazio).

## 6. Próximos passos
1. No GitHub: abrir `scripts/atualizar_dados.py` → ícone de lápis → selecionar tudo → colar a versão nova → Commit. Depois Actions → *Atualizar dados do Data.Rio* → Run workflow, e pedir ao usuário o log.
2. Se continuar vazio: ler a "resposta do servidor" do log e investigar. Alternativas: testar a URL de download do Hub (`/api/download/v1/items/5e4dda4d33f44b1eb9246559b281d1b8/csv?layers=8`, não verificada), ou o serviço público do ArcGIS Online dessa camada; se for bloqueio de IP estrangeiro, rodar o script localmente (IP brasileiro) com `--csv` e subir o `dados.json`, ou usar runner próprio.
3. Confirmar o deploy no Netlify (Publish directory = `public`) e o site no ar; marcar *Settings → Actions → General → Workflow permissions → Read and write*.
4. Opcional: validar o limite superior de R$/m² (200.000) e checar se o site mostra o carimbo.

## 7. Estado do usuário
Já feito: conta GitHub, repositório `imobrj` com os arquivos enviados pelo navegador (upload manual), arquivo `.github/workflows/atualizar-dados.yml` criado no site do GitHub. Já rodou o workflow uma vez (falhou como acima). Netlify: não confirmado se já foi conectado.

## 8. Restrições do ambiente do Claude
- Sandbox sem internet geral (só pypi/npm/github etc.); `web_fetch` só abre URLs vindas de buscas ou do usuário.
- Para testar o front: Playwright disponível; interceptar CDNs (Chart.js, Tailwind) e servir `public/` com `python -m http.server`.
- Ao mexer no front, manter os IDs do HTML usados no app.js e preservar os testes de busca (digitar, clicar, teclado, selects).

## 9. Sugestão de instruções para o Projeto no Claude
> Você é o desenvolvedor do ImobRJ (dashboard de ITBI do Rio). Leia HANDOFF.md antes de qualquer tarefa. Responda em português do Brasil.
> O usuário é iniciante em Git: dê passos pelo navegador (GitHub/Netlify), com nomes exatos de botões, uma etapa por vez.
> Mantenha o site estático (HTML + JS puro) e o script Python só com biblioteca padrão. Não sobrescreva `dados.json` se o download vier incompleto.
> Nunca afirme que algo foi testado contra a API real se só foi testado com simulação. Ao alterar arquivos, entregue-os completos e diga qual substituir no GitHub.
