#!/usr/bin/env python3
"""
Gera public/areas.json: área e R$/m² de cada venda, para o site filtrar por FAIXA DE METRAGEM (ex.: 65 a 75 m²)
nas abas Visão geral, Tendência e Comprar ou alugar.

Lê os arquivos já publicados em public/transacoes/*.json (saída do gerar_transacoes_site.py, que chama este
script no final). Entram só as vendas usadas nas estatísticas (flags = 0: venda integral, R$/m² dentro da faixa).

Formato (agrupado como o medianas.json, por bairro, tipologia, tipo e mês):
    {"formato":1,"passo":10,"bairros":[nome,...],"nbs":[chave,...],"tipologias":[...],
     "grupos":[[bairro,tipologia,comercial,ano,mes,[a0,d1,d2,...],[v0,v1,v2,...]], ...]}
    áreas em m² inteiros, ordenadas (a0 = 1ª área; d1, d2... = diferença para a anterior);
    v = R$/m² de cada venda, na mesma ordem das áreas, em unidades de R$ 10.

Uso (terminal do VS Code, pasta ImobRJ aberta):
    python scripts/gerar_areas.py
Só biblioteca padrão.
"""
import json, sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASSO = 10


def gerar(pasta=RAIZ / "public" / "transacoes", saida=RAIZ / "public" / "areas.json"):
    pasta, saida = Path(pasta), Path(saida)
    idx_arq = pasta / "index.json"
    if not idx_arq.is_file():
        sys.exit(f"ERRO: {idx_arq} não encontrado. Rode antes: python scripts/gerar_transacoes_site.py")
    idx = json.loads(idx_arq.read_text(encoding="utf-8"))
    grupos, usadas = defaultdict(list), 0
    for bi, b in enumerate(idx["bairros"]):
        d = json.loads((pasta / b["arquivo"]).read_text(encoding="utf-8"))
        for ano, mes, _rua, _num, _compl, tip, com, area, valor, fl in d["linhas"]:
            if fl or not area or area <= 0:
                continue
            grupos[(bi, d["tipologias"][tip], com, ano, mes)].append((round(area), round(valor / area / PASSO)))
            usadas += 1
    if not grupos:
        sys.exit("ERRO: nenhuma venda aproveitável. Nada foi alterado.")
    tips = sorted({k[1] for k in grupos}); ti = {t: i for i, t in enumerate(tips)}
    out = []
    for (bi, tip, com, ano, mes), vs in sorted(grupos.items(), key=lambda x: (x[0][3], x[0][4], x[0][0], x[0][1], x[0][2])):
        vs.sort()
        out.append([bi, ti[tip], com, ano, mes, [vs[0][0]] + [vs[i][0] - vs[i - 1][0] for i in range(1, len(vs))], [v for _, v in vs]])
    txt = json.dumps({"formato": 1, "passo": PASSO, "bairros": [b["nome"] for b in idx["bairros"]], "nbs": [b["nb"] for b in idx["bairros"]],
                      "tipologias": tips, "grupos": out}, ensure_ascii=False, separators=(",", ":"))
    saida.write_text(txt, encoding="utf-8")
    print(f"areas.json: {len(out):,} grupos, {usadas:,} vendas, {len(txt.encode('utf-8')) / 1e6:.1f} MB.")


if __name__ == "__main__":
    gerar()
