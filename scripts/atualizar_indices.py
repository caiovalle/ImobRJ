#!/usr/bin/env python3
"""
Atualiza public/indices.json com IPCA e CDI mensais, a partir da API de dados abertos do
Banco Central do Brasil (Sistema Gerenciador de Séries Temporais - SGS).

Séries (códigos SGS):
    433   IPCA - variação mensal (% a.m.)         -> índice produzido pelo IBGE
    4391  CDI  - acumulado no mês (% a.m.)        -> taxa apurada e divulgada pela B3

Uso:
    python scripts/atualizar_indices.py

Só usa a biblioteca padrão do Python (3.8+). Se o download falhar ou vier incompleto,
o arquivo atual NÃO é sobrescrito.
"""
import argparse, json, sys, time, urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"
INICIO = (2018, 1)   # mesmo início da base de imóveis
RAIZ = Path(__file__).resolve().parent.parent

SERIES = {
    "ipca": {"codigo": 433, "nome": "IPCA – variação mensal", "unidade": "% ao mês",
             "instituicao": "IBGE (divulgado pelo Banco Central, SGS 433)", "min": -2.0, "max": 5.0},
    "cdi": {"codigo": 4391, "nome": "CDI – acumulado no mês", "unidade": "% ao mês",
            "instituicao": "B3 (divulgado pelo Banco Central, SGS 4391)", "min": 0.0, "max": 2.5},
}
CABECALHOS = {"User-Agent": "Mozilla/5.0 (compatible; ImobRJ/1.0)", "Accept": "application/json"}


def baixar(url, tentativas=4):
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=CABECALHOS)
            with urllib.request.urlopen(req, timeout=60) as r:
                bruto = r.read()
            dados = json.loads(bruto)
            if not isinstance(dados, list):
                raise RuntimeError(f"resposta inesperada: {bruto[:200]!r}")
            return dados
        except Exception as e:
            if i == tentativas - 1:
                raise
            espera = 3 * 2 ** i
            print(f"  falha ({e}); nova tentativa em {espera}s", file=sys.stderr)
            time.sleep(espera)


def converter(nome, cfg, brutos):
    """[{'data':'01/03/2024','valor':'0.16'}, ...] -> {'2024-03': 0.16}, com validações."""
    saida = {}
    for x in brutos:
        d, m, a = x["data"].split("/")
        ym = f"{a}-{m}"
        v = float(str(x["valor"]).replace(",", "."))
        if ym in saida and saida[ym] != v:
            sys.exit(f"ERRO: {nome} tem dois valores diferentes para {ym}.")
        if not (cfg["min"] <= v <= cfg["max"]):
            sys.exit(f"ERRO: {nome} em {ym} = {v} está fora do intervalo plausível [{cfg['min']}; {cfg['max']}].")
        saida[ym] = v
    if len(saida) < 60:
        sys.exit(f"ERRO: {nome} veio com só {len(saida)} meses.")
    # sem buracos entre o início e o último mês disponível
    meses = sorted(saida)
    a, m = INICIO
    esperado = []
    while f"{a}-{m:02d}" <= meses[-1]:
        esperado.append(f"{a}-{m:02d}")
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    faltando = [e for e in esperado if e not in saida]
    if faltando:
        sys.exit(f"ERRO: {nome} sem dados em {faltando[:6]}…")
    return {k: saida[k] for k in esperado}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=BASE, help="modelo de URL com {codigo} (para testes)")
    ap.add_argument("--saida", default=str(RAIZ / "public"), help="pasta de saída")
    args = ap.parse_args()

    hoje = date.today()
    ini, fim = f"01/{INICIO[1]:02d}/{INICIO[0]}", hoje.strftime("%d/%m/%Y")
    resultado = {}
    for chave, cfg in SERIES.items():
        url = args.base.format(codigo=cfg["codigo"]) + f"?formato=json&dataInicial={ini}&dataFinal={fim}"
        print(f"Baixando {cfg['nome']} (SGS {cfg['codigo']})…")
        try:
            brutos = baixar(url)
        except Exception as e:
            sys.exit(f"ERRO: não consegui baixar {cfg['nome']} do Banco Central ({e}). Mantendo o arquivo atual.")
        dados = converter(chave, cfg, brutos)
        if hoje.strftime("%Y-%m") in dados:   # o mês em andamento ainda está incompleto (ex.: CDI parcial)
            dados.pop(hoje.strftime("%Y-%m"))
            print(f"  (mês em andamento {hoje.strftime('%Y-%m')} descartado: ainda incompleto)")
        ultimo = max(dados)
        print(f"  {len(dados)} meses, de {min(dados)} a {ultimo}")
        resultado[chave] = {"codigo_sgs": cfg["codigo"], "nome": cfg["nome"], "unidade": cfg["unidade"],
                            "instituicao": cfg["instituicao"], "dados": dados}

    saida = Path(args.saida); saida.mkdir(parents=True, exist_ok=True)
    arq = saida / "indices.json"
    antigo = json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else {}
    if antigo.get("series") == resultado:
        print("Sem mudanças nos índices.")
        return
    arq.write_text(json.dumps({
        "gerado_em": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "fonte": "Banco Central do Brasil – SGS (api.bcb.gov.br)",
        "series": resultado}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"indices.json atualizado ({arq}).")


if __name__ == "__main__":
    main()
