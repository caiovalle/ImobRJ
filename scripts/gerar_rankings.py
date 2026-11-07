#!/usr/bin/env python3
"""
Gera public/rankings.json: os rankings da sub-aba Preços → Rankings e a cor "Valorização" do mapa.

Lê os arquivos já publicados em public/transacoes/*.json (saída do gerar_transacoes_site.py, que chama este
script no final). Entram só as vendas usadas nas estatísticas (flags = 0: venda integral, R$/m² dentro da faixa)
de imóveis residenciais.

Janela: os 12 meses que terminam no último mês com vendas, comparados com os 12 meses anteriores.

Prédio novo: quando um lançamento é entregue, dezenas de unidades do MESMO prédio são vendidas no mesmo ano e
"puxam" a mediana do bairro (ex.: Bonsucesso, Av. Itaoca 1064: 149 de 377 vendas em 12 meses). Para o ranking não
confundir isso com valorização, cada prédio (rua + número) conta no máximo MAX_PREDIO vendas na janela: um prédio
com 30 vendas entra com peso 5/30 em cada uma. As medianas abaixo são medianas ponderadas por esse peso.

Formato:
    {"formato":1, "gerado_em":"AAAA-MM-DD", "janela":["AAAA-MM","AAAA-MM"], "anterior":["AAAA-MM","AAAA-MM"],
     "max_predio":5,
     "grupos":{"residencial":{...}, "apartamento":{...}}}
    cada grupo: {"bairros":[[nb, nome, m2, n, predios, m2_ant, n_ant], ...],
                 "ruas":[[rua, nb, m2, n, predios], ...]}
    m2 = mediana ponderada do R$/m² (inteiro); n = vendas; predios = nº de prédios distintos; _ant = 12 meses anteriores.
    Entram bairros com ao menos MIN_BAIRRO vendas na janela atual e ruas com MIN_RUA vendas em MIN_PREDIOS_RUA prédios;
    o site aplica os mínimos mais altos de cada lista.

Uso (terminal do VS Code, pasta do projeto aberta):
    python scripts/gerar_rankings.py
Só biblioteca padrão.
"""
import json, sys
from collections import defaultdict
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MAX_PREDIO = 5
MIN_BAIRRO = 10
MIN_RUA = 10
MIN_PREDIOS_RUA = 3
GRUPOS = {"residencial": None, "apartamento": {"Apartamento"}}


def mediana_ponderada(vs):
    """vs = lista de (valor, peso). Mediana ponderada (média dos dois do meio quando cai exatamente na metade)."""
    vs = sorted(vs)
    tot = sum(p for _, p in vs)
    if not tot:
        return None
    acc, meio = 0.0, tot / 2
    for i, (v, p) in enumerate(vs):
        acc += p
        if abs(acc - meio) < 1e-9 and i + 1 < len(vs):
            return (v + vs[i + 1][0]) / 2
        if acc > meio:
            return v
    return vs[-1][0]


def resumo(vendas):
    """vendas = lista de (predio, R$/m²). Devolve (mediana ponderada, nº de vendas, nº de prédios)."""
    por_predio = defaultdict(int)
    for pr, _ in vendas:
        por_predio[pr] += 1
    m = mediana_ponderada([(v, min(1.0, MAX_PREDIO / por_predio[pr])) for pr, v in vendas])
    return (round(m) if m is not None else None), len(vendas), len(por_predio)


def ym(t):
    return f"{t // 12}-{t % 12 + 1:02d}"


def gerar(pasta=RAIZ / "public" / "transacoes", saida=RAIZ / "public" / "rankings.json"):
    pasta, saida = Path(pasta), Path(saida)
    idx_arq = pasta / "index.json"
    if not idx_arq.is_file():
        sys.exit(f"ERRO: {idx_arq} não encontrado. Rode antes: python scripts/gerar_transacoes_site.py")
    idx = json.loads(idx_arq.read_text(encoding="utf-8"))

    # vendas residenciais aproveitáveis: (bairro, rua, número, tipologia, mês corrido, R$/m²)
    vendas = []
    for b in idx["bairros"]:
        d = json.loads((pasta / b["arquivo"]).read_text(encoding="utf-8"))
        for ano, mes, rua, num, _compl, tip, com, area, valor, fl in d["linhas"]:
            if fl or com or not area or area <= 0:
                continue
            vendas.append((b["nb"], d["ruas"][rua], str(num).strip().upper(), d["tipologias"][tip], ano * 12 + mes - 1, valor / area))
    if not vendas:
        sys.exit("ERRO: nenhuma venda aproveitável. Nada foi alterado.")
    nomes = {b["nb"]: b["nome"] for b in idx["bairros"]}
    fim = max(v[4] for v in vendas)
    ini, ini_ant = fim - 11, fim - 23

    grupos = {}
    for nome_g, tips in GRUPOS.items():
        bai, bai_ant, ruas = defaultdict(list), defaultdict(list), defaultdict(list)
        for nb, rua, num, tip, t, m2 in vendas:
            if tips and tip not in tips:
                continue
            pr = (rua, num)
            if t >= ini:
                bai[nb].append((pr, m2)); ruas[(rua, nb)].append((pr, m2))
            elif t >= ini_ant:
                bai_ant[nb].append((pr, m2))
        lb = []
        for nb, vs in bai.items():
            m, n, p = resumo(vs)
            if n < MIN_BAIRRO:
                continue
            ma, na, _ = resumo(bai_ant[nb]) if bai_ant.get(nb) else (None, 0, 0)
            lb.append([nb, nomes[nb], m, n, p, ma, na])
        lr = []
        for (rua, nb), vs in ruas.items():
            m, n, p = resumo(vs)
            if n >= MIN_RUA and p >= MIN_PREDIOS_RUA:
                lr.append([rua, nb, m, n, p])
        lb.sort(key=lambda x: -x[2]); lr.sort(key=lambda x: -x[2])
        grupos[nome_g] = {"bairros": lb, "ruas": lr}

    out = {"formato": 1, "gerado_em": date.today().isoformat(), "janela": [ym(ini), ym(fim)], "anterior": [ym(ini_ant), ym(ini - 1)],
           "max_predio": MAX_PREDIO, "grupos": grupos}
    txt = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    saida.write_text(txt, encoding="utf-8")
    g = grupos["residencial"]
    print(f"rankings.json: {ym(ini)} a {ym(fim)}; {len(g['bairros'])} bairros e {len(g['ruas'])} ruas (residencial), "
          f"{len(txt.encode('utf-8')) / 1e3:.0f} KB.")


if __name__ == "__main__":
    gerar()
