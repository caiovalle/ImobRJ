#!/usr/bin/env python3
"""
Atualiza public/dados.json a partir do Data.Rio (Prefeitura do Rio, Secretaria de Fazenda).

Fonte: ITBI - Transações por Logradouro e Mês - Imóveis Residenciais e Não Residenciais
       https://www.data.rio/datasets/5e4dda4d33f44b1eb9246559b281d1b8_8/about
API:   ArcGIS REST, camada 8 (paginação de 2.000 registros por chamada)

Uso:
    python scripts/atualizar_dados.py                  # baixa do Data.Rio
    python scripts/atualizar_dados.py --csv arq.csv    # gera a partir de um CSV baixado
Só usa a biblioteca padrão do Python (3.8+).
"""
import argparse, csv, json, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = "https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Fazenda/ITBI/MapServer/8/query"
FONTE = "https://www.data.rio/datasets/5e4dda4d33f44b1eb9246559b281d1b8_8/about"
ANO_MIN = 2018                 # a base começa em 2010; o dashboard usa de 2018 em diante
M2_MIN, M2_MAX = 500, 200_000  # descarta erros de digitação (ex.: R$ 3,29 de valor, R$ 379 mil/m²)
PAGINA = 2000                  # MaxRecordCount do serviço
RAIZ = Path(__file__).resolve().parent.parent
PUBLIC = RAIZ / "public"


def http_json(url, params, tentativas=5):
    q = urllib.parse.urlencode(params)
    for i in range(tentativas):
        try:
            req = urllib.request.Request(f"{url}?{q}", headers={"User-Agent": "imobrj-atualizador/1.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
            if "error" in d:
                raise RuntimeError(d["error"])
            return d
        except Exception as e:
            if i == tentativas - 1:
                raise
            espera = 3 * 2 ** i
            print(f"  falha ({e}); nova tentativa em {espera}s", file=sys.stderr)
            time.sleep(espera)


def baixar(url):
    total = http_json(url, {"where": "1=1", "returnCountOnly": "true", "f": "json"})["count"]
    print(f"Data.Rio informa {total:,} registros; baixando…")
    linhas, offset = [], 0
    while offset < total:
        d = http_json(url, {"where": "1=1", "outFields": "*", "returnGeometry": "false",
                            "orderByFields": "objectid", "resultOffset": offset,
                            "resultRecordCount": PAGINA, "f": "json"})
        feats = d.get("features", [])
        if not feats:
            break
        linhas += [f["attributes"] for f in feats]
        offset += len(feats)
        print(f"  {len(linhas):,}/{total:,}", end="\r")
    print()
    if len(linhas) < total * 0.99:
        sys.exit(f"ERRO: baixou {len(linhas):,} de {total:,} registros; abortando para não corromper os dados.")
    return linhas


def ler_csv(caminho):
    def num(v, tipo=float):
        try: return tipo(v)
        except (TypeError, ValueError): return None
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            yield {**r, "objectid": num(r["objectid"], int), "total_transações": num(r["total_transações"], int),
                   "média_área_construída": num(r["média_área_construída"]), "média_valor_imóvel": num(r["média_valor_imóvel"]),
                   "ano_transação": num(r["ano_transação"], int), "mês_transação": num(r["mês_transação"], int)}


def converter(a):
    """Registro bruto do Data.Rio -> registro do dashboard (ou None se deve ser descartado)."""
    if a.get("principal_transação_mercado") != "COMPRA E VENDA":
        return None
    ano, mes = a.get("ano_transação"), a.get("mês_transação")
    area, valor = a.get("média_área_construída"), a.get("média_valor_imóvel")
    if not ano or ano < ANO_MIN or not mes or not area or not valor or area <= 0:
        return None
    m2 = valor / area
    if not (M2_MIN <= m2 <= M2_MAX):
        return None
    return {"id": a["objectid"], "bairro": a["bairro"].strip().title(), "logradouro": a["logradouro"].strip().title(),
            "area": round(area, 1), "valor": round(valor, 2), "valor_m2": round(m2, 2),
            "transacoes": a["total_transações"] or 1,
            "tipo": "Comercial" if a["uso"].startswith("NAO") else "Residencial",
            "tipologia": a["principais_tipologias"].strip().title(), "ano": ano, "mes": mes}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", help="usa um CSV local em vez de baixar do Data.Rio")
    ap.add_argument("--url", default=URL, help="endpoint de consulta (para testes)")
    ap.add_argument("--saida", default=str(PUBLIC), help="pasta de saída (padrão: public/)")
    args = ap.parse_args()

    bruto = list(ler_csv(args.csv)) if args.csv else baixar(args.url)
    dados = sorted(filter(None, map(converter, bruto)), key=lambda r: r["id"])
    saida = Path(args.saida); saida.mkdir(parents=True, exist_ok=True)
    arq = saida / "dados.json"

    antigo = arq.read_bytes() if arq.exists() else b""
    n_antigo = len(json.loads(antigo)) if antigo else 0
    if len(dados) < 50_000 or (n_antigo and len(dados) < 0.9 * n_antigo):
        sys.exit(f"ERRO: só {len(dados):,} registros válidos (antes: {n_antigo:,}). Mantendo o arquivo atual.")

    novo = json.dumps(dados, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if novo == antigo:
        print(f"Sem mudanças ({len(dados):,} registros).")
        return
    arq.write_bytes(novo)
    ultimo = max(dados, key=lambda r: (r["ano"], r["mes"]))
    (saida / "meta.json").write_text(json.dumps({
        "atualizado_em": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "registros": len(dados), "ultimo_periodo": f'{ultimo["ano"]}-{ultimo["mes"]:02d}',
        "fonte": FONTE}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"dados.json atualizado: {n_antigo:,} -> {len(dados):,} registros (último período {ultimo['ano']}-{ultimo['mes']:02d}).")


if __name__ == "__main__":
    main()
