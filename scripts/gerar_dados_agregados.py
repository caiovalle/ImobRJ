#!/usr/bin/env python3
"""
Gera public/dados.json e public/meta.json (abas Visão geral, Comparador e Tendência) a partir da base por imóvel
(itbi_limpo.csv, saída do processar_itbi.py). Cobre de 2011 em diante, em vez de só 2018.
Agregação: uma linha por (bairro, logradouro, ano, mês, tipologia, tipo) com
    n = nº de transações · área = média · valor = média · (R$/m² = valor ÷ área, calculado no site)
Entram: imóveis Residenciais e Comerciais, vendas integrais, sem duplicata, valor e área válidos e
R$/m² entre 500 e 200.000 (mesma faixa usada antes). Terrenos ficam de fora.
ATENÇÃO: a fonte por imóvel não informa o tipo de transação, então não existe filtro "compra e venda"
(a base anterior, do Data.Rio, tinha). Os números podem diferir dos da base anterior, que era menos completa.
Formato de saída (dados.json, "formato 2", colunas compactas):
    {"formato":2,"bairros":[...],"ruas":[...],"tipologias":[...],
     "linhas":[[bairro,rua,tipologia,comercial(0/1),ano,mes,n,area,valor], ...]}
As medianas do R$/m² vêm do public/areas.json (gerar_areas.py, chamado pelo gerar_transacoes_site.py);
o medianas.json antigo deixou de ser gerado porque tinha o mesmo conteúdo.
Uso (terminal do VS Code, pasta ImobRJ aberta):
    python scripts/gerar_dados_agregados.py
Sem argumento lê C:\\Projetos\\ITBI Git\\planilhas_sefaz\\saida\\itbi_limpo.csv. O dados.json anterior só é
substituído se o novo parecer completo (veja as proteções abaixo).
"""
import argparse, csv, json, sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from nomes import nome_bairro   # noqa: E402
RAIZ = Path(__file__).resolve().parent.parent
FONTE = "https://fazenda.prefeitura.rio/itbi-valores-medios-por-m2-de-transacoes-imobiliarias-por-trecho-de-logradouro/"
MAX_MB = 25
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="?", default=str(RAIZ.parent / "planilhas_sefaz" / "saida" / "itbi_limpo.csv"))
    ap.add_argument("--saida", default=str(RAIZ / "public"))
    ap.add_argument("--min-linhas", type=int, default=20_000, help="mínimo de linhas agregadas para aceitar o resultado (para testes)")
    args = ap.parse_args()
    if not Path(args.csv).is_file():
        sys.exit(f"ERRO: arquivo não encontrado: {args.csv}\nRode antes: python scripts/processar_itbi.py")
    print(f"Lendo {args.csv}")
    grupos, lidas, usadas = defaultdict(lambda: [0, 0.0, 0.0]), 0, 0
    with open(args.csv, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            lidas += 1
            if (r["tipo"] not in ("Residencial", "Comercial") or r["aviso_valor_invalido"] == "1" or r["aviso_area_invalida"] == "1"
                    or r["aviso_duplicado"] == "1" or r["aviso_venda_parcial"] == "1" or r["aviso_m2_fora_da_faixa"] == "1"
                    or not r["bairro"] or not r["ano"] or not r["mes"]):
                continue
            g = grupos[(r["bairro"], r["logradouro"], r["tipologia"], r["tipo"] == "Comercial", int(r["ano"]), int(r["mes"]))]
            area, valor = float(r["area"]), float(r["valor"])
            g[0] += 1; g[1] += area; g[2] += valor; usadas += 1
    if not grupos:
        sys.exit("ERRO: nenhuma linha aproveitável. Nada foi alterado.")
    bairros = sorted({k[0] for k in grupos}); ruas = sorted({k[1] for k in grupos}); tips = sorted({k[2] for k in grupos})
    bi, ri, ti = ({n: i for i, n in enumerate(x)} for x in (bairros, ruas, tips))
    linhas = [[bi[b], ri[rua], ti[tip], int(com), ano, mes, g[0], round(g[1] / g[0], 1), round(g[2] / g[0], 2)]
              for (b, rua, tip, com, ano, mes), g in sorted(grupos.items(), key=lambda x: (x[0][4], x[0][5], x[0][0], x[0][1]))]
    dados = {"formato": 2, "bairros": [nome_bairro(b) for b in bairros], "ruas": [r.title() for r in ruas],
             "tipologias": [t.title() for t in tips], "linhas": linhas}
    txt = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    mb = len(txt.encode("utf-8")) / 1e6
    saida = Path(args.saida); saida.mkdir(parents=True, exist_ok=True)
    arq = saida / "dados.json"
    # proteções: não troca um arquivo bom por um resultado pequeno demais
    antigo = None
    if arq.exists():
        try:
            antigo = json.loads(arq.read_text(encoding="utf-8"))
            n_antigo = len(antigo["linhas"]) if isinstance(antigo, dict) else len(antigo)
        except ValueError:
            n_antigo = 0
        if isinstance(antigo, dict) and len(linhas) < 0.9 * n_antigo:
            sys.exit(f"ERRO: só {len(linhas):,} linhas agregadas (antes: {n_antigo:,}). Mantendo o arquivo atual.")
    if len(linhas) < args.min_linhas:
        sys.exit(f"ERRO: só {len(linhas):,} linhas agregadas; parece incompleto. Mantendo o arquivo atual.")
    ultimo = max((l[4], l[5]) for l in linhas); primeiro = min((l[4], l[5]) for l in linhas)
    arq.write_text(txt, encoding="utf-8")
    (saida / "meta.json").write_text(json.dumps({
        "atualizado_em": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "registros": len(linhas),
        "ultimo_periodo": f"{ultimo[0]}-{ultimo[1]:02d}", "primeiro_periodo": f"{primeiro[0]}-{primeiro[1]:02d}",
        "transacoes_usadas": usadas, "origem": "fazenda_por_imovel", "fonte": FONTE}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Lidas {lidas:,} transações; usadas {usadas:,} (vendas integrais, residenciais/comerciais, sem duplicata).")
    print(f"dados.json: {len(linhas):,} linhas agregadas, {len(bairros)} bairros, {len(ruas):,} logradouros, {mb:.1f} MB; "
          f"período {primeiro[0]}-{primeiro[1]:02d} a {ultimo[0]}-{ultimo[1]:02d}.")
    if mb > MAX_MB:
        print(f"ATENÇÃO: o arquivo passou de {MAX_MB} MB; o site pode ficar lento no celular (me avise).")
if __name__ == "__main__":
    main()
