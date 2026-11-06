# ImobRJ — Dashboard de transações imobiliárias do Rio

Dashboard estático (HTML + JS) com dados de ITBI da Prefeitura do Rio, comparação com IPCA e CDI
(Banco Central) e aba de metodologia. O Netlify republica o site a cada `push` no GitHub.

> **Status da atualização automática:** pausada. O servidor da Prefeitura respondeu `count = 0` ao
> workflow (causa não identificada). Por enquanto os dados são atualizados manualmente
> (ver "Atualizando os dados"). O workflow pode ser desativado em *Actions → Atualizar dados → ⋯ → Disable workflow*.

```
imobrj/
├─ public/                      <- site publicado no Netlify
│  ├─ index.html, app.js
│  ├─ dados.json                <- transações ITBI (gerado por atualizar_dados.py)
│  ├─ meta.json                 <- data da atualização (aparece no topo do site)
│  └─ indices.json              <- IPCA e CDI mensais (gerado por atualizar_indices.py)
├─ scripts/atualizar_dados.py   <- baixa do Data.Rio e converte (só biblioteca padrão)
├─ scripts/atualizar_indices.py <- baixa IPCA e CDI do Banco Central (só biblioteca padrão)
├─ .vscode/settings.json        <- Commit no VS Code já envia ao GitHub
├─ .github/workflows/atualizar-dados.yml   <- agenda semanal + botão manual
└─ netlify.toml
```

## Fluxo
`Data.Rio (API ArcGIS)` → **GitHub Actions** (toda segunda, 06h de Brasília) → commit do `dados.json` → **Netlify** republica sozinho.
Se os dados não mudaram, nada é commitado.

## Colocando no ar

1. **Crie um repositório vazio** no GitHub (ex.: `imobrj`) e envie esta pasta:
   ```bash
   cd imobrj
   git init -b main
   git add .
   git commit -m "ImobRJ: versão inicial"
   git remote add origin https://github.com/SEU_USUARIO/imobrj.git
   git push -u origin main
   ```
2. **Netlify** → *Add new site* → *Import an existing project* → GitHub → escolha o repositório.
   O `netlify.toml` já define: pasta publicada `public`, sem comando de build. Clique em *Deploy*.
3. **Permissão do robô** (GitHub): *Settings → Actions → General → Workflow permissions →
   Read and write permissions* → Save.
4. **Primeiro teste**: aba *Actions* → *Atualizar dados do Data.Rio* → *Run workflow*.
   - "Sem mudanças nos dados" = tudo certo, já está atualizado.
   - Se houver dados novos, o robô faz o commit e o Netlify publica em 1–2 minutos.

## Trabalhando pelo VS Code
1. Clonar o repositório uma vez: `Ctrl+Shift+P` → *Git: Clone* → *Clone from GitHub* → `imobrj`.
2. Editar e salvar (`Ctrl+S`).
3. Ícone *Source Control* (barra lateral) → escrever uma mensagem → botão **Commit**. A configuração em
   `.vscode/settings.json` faz o *push* para o GitHub logo em seguida; o Netlify publica em 1–2 minutos.

## Atualizando os dados
```bash
python scripts/atualizar_indices.py               # IPCA e CDI (Banco Central) -> public/indices.json
python scripts/atualizar_dados.py --csv ITBI.csv  # ITBI a partir de um CSV baixado do Data.Rio
```
Depois, *Commit* no VS Code. Se `indices.json` não existir, o site tenta ler o Banco Central direto
do navegador (não verificado em produção); se também falhar, os recursos de IPCA/CDI ficam desativados.

## Base de transações por imóvel (aba "Transações")
Fonte: planilhas da Fazenda do Rio (uma linha por transação). A base completa, com apartamento, **nunca vai para o GitHub**
(o `.gitignore` bloqueia `*.xlsx`, `itbi_limpo.csv` e a pasta `saida/`). Só os arquivos por bairro vão para `public/transacoes/`.
```bash
pip install openpyxl
python scripts/processar_itbi.py          # lê as planilhas em C:\Projetos\ITBI Git\planilhas_sefaz e gera saida\itbi_limpo.csv + relatorio_qualidade.txt
python scripts/gerar_transacoes_site.py   # lê saida\itbi_limpo.csv e gera public/transacoes/
```
Pastas esperadas: projeto em `C:\Projetos\ITBI Git\ImobRJ` e planilhas em `C:\Projetos\ITBI Git\planilhas_sefaz` (fora do projeto, portanto fora do Git).
Rode os comandos com o terminal do VS Code aberto na pasta `ImobRJ`. Depois, *Commit* no VS Code. Leia `relatorio_qualidade.txt` antes de publicar.

## Rodando localmente
```bash
python scripts/atualizar_dados.py                 # baixa a versão mais recente
python scripts/atualizar_dados.py --csv ITBI.csv  # ou gera a partir de um CSV já baixado
cd public && python -m http.server 8000           # abra http://localhost:8000
```

## Detalhes úteis
- **Fonte:** camada 8 do serviço `Fazenda/ITBI` (Prefeitura do Rio / IPP), a mesma do dataset
  *ITBI – Transações por Logradouro e Mês* no Data.Rio. Ela atualiza mensalmente.
- **Regras de limpeza** (constantes no topo do script): só *Compra e Venda*, a partir de 2018,
  R$/m² entre 500 e 200.000 (descarta erros de digitação da base). Ajuste `ANO_MIN`, `M2_MIN`, `M2_MAX` se quiser.
- **Último mês:** desde junho/2026 a Prefeitura publica a tabela sem o mês mais recente (limpeza da base bruta).
- **Segurança:** o script aborta sem alterar nada se baixar menos de 99% dos registros ou
  se o resultado tiver menos de 90% do arquivo atual.
- O GitHub pode pausar agendamentos de repositórios sem atividade por 60 dias; se isso ocorrer,
  reative na aba *Actions*.
