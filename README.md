# ImobRJ — Dashboard de transações imobiliárias do Rio

Dashboard estático (HTML + JS) com dados de ITBI da Prefeitura do Rio. Os dados são atualizados
automaticamente pelo GitHub Actions e o Netlify republica o site a cada atualização.

```
imobrj/
├─ public/                      <- site publicado no Netlify
│  ├─ index.html, app.js
│  ├─ dados.json                <- gerado automaticamente
│  └─ meta.json                 <- data da atualização (aparece no topo do site)
├─ scripts/atualizar_dados.py   <- baixa do Data.Rio e converte (só biblioteca padrão)
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
