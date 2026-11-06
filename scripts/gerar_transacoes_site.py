#!/usr/bin/env python3
"""
Gera os arquivos da aba "Transações" do site a partir do itbi_limpo.csv (saída do processar_itbi.py).

Saída (pasta public/transacoes/):
    index.json        lista de bairros (nome, chave, arquivo, nº de transações, período)
    <bairro>.json     transações do bairro, em formato compacto (carregado só quando o usuário escolhe o bairro)

O que entra: imóveis Residenciais e Comerciais com valor e área válidos e sem duplicata.
O que NÃO entra: terrenos (Territorial), linhas com área/valor inválidos e duplicadas.
Vendas parciais e R$/m² fora da faixa entram, mas marcadas (o site não as usa nas estatísticas).
O complemento (apartamento) é publicado, por decisão do responsável pelo projeto.

Uso (no terminal do VS Code, com a pasta do projeto aberta):
    python scripts/gerar_transacoes_site.py
Sem argumento, lê:  C:\\Projetos\\ITBI Git\\planilhas_sefaz\\saida\\itbi_limpo.csv   (ao lado da pasta do projeto)
Para usar outro arquivo:  python scripts/gerar_transacoes_site.py "C:\\outro\\itbi_limpo.csv"
Só biblioteca padrão (Python 3.8+).
"""
import argparse, csv, json, re, sys, unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nomes import chave, nome_bairro   # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FONTE = "Prefeitura do Rio de Janeiro, Secretaria de Fazenda – ITBI, transações por imóvel"
MAX_MB = 8   # aviso se algum arquivo de bairro passar disso


def numero(v):
    f = float(v)
    return int(f) if f.is_integer() else round(f, 2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="?", default=str(RAIZ.parent / "planilhas_sefaz" / "saida" / "itbi_limpo.csv"),
                    help="itbi_limpo.csv gerado pelo processar_itbi.py (padrão: ../planilhas_sefaz/saida/itbi_limpo.csv)")
    ap.add_argument("--saida", default=str(RAIZ / "public" / "transacoes"))
    args = ap.parse_args()

    if not Path(args.csv).is_file():
        sys.exit(f"ERRO: arquivo não encontrado: {args.csv}\nRode antes: python scripts/processar_itbi.py")
    print(f"Lendo {args.csv}")
    por_bairro, descartes, total = defaultdict(list), Counter(), 0
    with open(args.csv, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            total += 1
            if r["tipo"] not in ("Residencial", "Comercial"):
                descartes["terreno/territorial"] += 1; continue
            if r["aviso_valor_invalido"] == "1" or r["aviso_area_invalida"] == "1":
                descartes["valor ou área inválidos"] += 1; continue
            if r["aviso_duplicado"] == "1":
                descartes["duplicado"] += 1; continue
            if not r["bairro"] or not r["ano"] or not r["mes"]:
                descartes["sem bairro ou data"] += 1; continue
            por_bairro[r["bairro"]].append(r)
    if total == 0 or not por_bairro:
        sys.exit("ERRO: nenhum registro aproveitável no CSV. Nada foi alterado.")

    saida = Path(args.saida); saida.mkdir(parents=True, exist_ok=True)
    indice, publicadas, grandes = [], 0, []
    for bairro, rows in sorted(por_bairro.items()):
        ruas = sorted({r["logradouro"].title() for r in rows}); ri = {n: i for i, n in enumerate(ruas)}
        tips = sorted({r["tipologia"].title() for r in rows}); ti = {n: i for i, n in enumerate(tips)}
        linhas = []
        for r in rows:
            flags = int(r["aviso_venda_parcial"] == "1") | (int(r["aviso_m2_fora_da_faixa"] == "1") << 1)
            linhas.append([int(r["ano"]), int(r["mes"]), ri[r["logradouro"].title()], r["numero"].strip(), r["complemento"].strip(),
                           ti[r["tipologia"].title()], 1 if r["tipo"] == "Comercial" else 0,
                           numero(r["area"]), numero(r["valor"]), flags])
        linhas.sort(key=lambda x: (x[0], x[1], x[2], x[3]))
        arq = chave(bairro).replace(" ", "-") + ".json"
        dados = {"bairro": nome_bairro(bairro), "ruas": ruas, "tipologias": tips,
                 "colunas": ["ano", "mes", "rua", "numero", "complemento", "tipologia", "comercial", "area", "valor", "flags"],
                 "linhas": linhas}
        txt = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
        (saida / arq).write_text(txt, encoding="utf-8")
        mb = len(txt.encode("utf-8")) / 1e6
        if mb > MAX_MB:
            grandes.append((bairro, mb))
        publicadas += len(linhas)
        indice.append({"nome": nome_bairro(bairro), "nb": chave(bairro), "arquivo": arq, "n": len(linhas),
                       "ano_min": linhas[0][0], "ano_max": linhas[-1][0]})
    anos = [i["ano_min"] for i in indice] + [i["ano_max"] for i in indice]
    (saida / "index.json").write_text(json.dumps({
        "gerado_em": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "fonte": FONTE, "total": publicadas,
        "ano_min": min(anos), "ano_max": max(anos), "bairros": indice}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    tam = sum(p.stat().st_size for p in saida.glob("*.json")) / 1e6
    print(f"Lidas {total:,} linhas; publicadas {publicadas:,} em {len(indice)} bairros ({tam:.1f} MB no total).")
    for k, v in descartes.most_common():
        print(f"  não publicadas – {k}: {v:,}")
    maior = max(indice, key=lambda i: i["n"])
    print(f"  maior bairro: {maior['nome']} ({maior['n']:,} linhas)")
    for b, mb in grandes:
        print(f"  ATENÇÃO: {b} tem {mb:.1f} MB; pode ficar lento no celular (me avise para dividir por período).")
    print(f"Arquivos em {saida}")


if __name__ == "__main__":
    main()
