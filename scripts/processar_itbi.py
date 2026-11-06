#!/usr/bin/env python3
"""
Concatena e limpa as planilhas de ITBI por transação (Prefeitura do Rio / Fazenda).

Entrada : pasta com os .xlsx (ex.: 2011-2018, 2019-2024, 2025 em diante)
Saída   : <pasta>/saida/itbi_limpo.csv          base completa, uma linha por transação, com marcações
          <pasta>/saida/relatorio_qualidade.txt  o que foi encontrado e quantas linhas cada regra marcou

IMPORTANTE: o itbi_limpo.csv COMPLETO (todas as colunas, linhas marcadas, terrenos etc.) fica só no seu computador:
NÃO coloque a pasta de saída dentro do projeto e NÃO envie esse arquivo ao GitHub. O que é publicado no site (inclusive o
apartamento, por decisão do responsável pelo projeto) é gerado depois por scripts/gerar_transacoes_site.py.

Nenhuma linha é apagada: problemas viram marcações (colunas aviso_*). Os xlsx originais não são alterados.

Uso (no terminal do VS Code, com a pasta do projeto aberta):
    pip install openpyxl
    python scripts/processar_itbi.py
Sem argumento, usa a pasta "planilhas_sefaz" que fica ao lado da pasta do projeto, ou seja:
    C:\\Projetos\\ITBI Git\\planilhas_sefaz     (projeto em C:\\Projetos\\ITBI Git\\ImobRJ)
Para usar outra pasta:  python scripts/processar_itbi.py "C:\\outra\\pasta"
"""
import csv, hashlib, re, statistics, sys, unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from openpyxl import load_workbook

# Colunas esperadas (nomes em minúsculas), conforme a amostra do arquivo "2025 em diante".
ESPERADAS = ["ano", "mes", "regiao_fiscal", "cd_bairro", "cl", "trecho", "cod_tipologia", "id_utilizacao", "numero",
             "complemento", "bairro", "logradouro", "ds_imovel_tipologia", "descricao", "parte_transferida",
             "vl_declarado", "area", "valor_m2"]
M2_MIN, M2_MAX = 500, 200_000          # mesma faixa do painel atual (o limite superior é estimativa)
# Nomes alternativos usados em outros arquivos (nome na planilha -> nome padrão). Só é aplicado se o nome padrão não existir.
ALIASES = {"nm_bairro_norm": "bairro", "valor_transacoes": "vl_declarado"}
ESC = re.compile(r"_x([0-9A-Fa-f]{4})_")
decodificar = lambda s: ESC.sub(lambda m: chr(int(m.group(1), 16)), s).strip() if isinstance(s, str) else s


# Nos arquivos antigos o logradouro vem por extenso, com acento ("Estrada Cabuçu de Baixo"); no de 2025 vem abreviado e sem
# acento ("ETR CABUCU DE BAIXO"). O código do logradouro (cl) é o mesmo nos dois, então ele é a chave; o nome padrão é o do
# período mais recente em que a rua aparece, sem acento, em maiúsculas e com os prefixos já usados na fonte.
PREFIXOS = {"ESTRADA": "ETR", "AVENIDA": "AVN", "TRAVESSA": "TRV", "PRACA": "PRC", "RODOVIA": "ROD"}


def nome_padrao(t):
    t = "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn").upper().strip()
    t = re.sub(r"\s+", " ", t)
    p = t.split(" ", 1)
    return PREFIXOS.get(p[0], p[0]) + (" " + p[1] if len(p) > 1 else "")


def num(v):
    """Aceita número, '100', '100,00', '1.234,5' ou vazio. Devolve float ou None."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = decodificar(str(v)).replace(" ", "")
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def ler_xlsx(caminho):
    """Gera dicionários (colunas em minúsculas, textos decodificados), uma aba por vez."""
    wb = load_workbook(caminho, read_only=True, data_only=True)
    for ws in wb.worksheets:
        linhas = ws.iter_rows(values_only=True)
        cab = next(linhas, None)
        if not cab:
            continue
        cab = [str(c).strip().lower() if c is not None else "" for c in cab]
        origem = {}                                    # nome padrão -> nome que estava na planilha
        for i, c in enumerate(cab):
            if c in ALIASES and ALIASES[c] not in cab:
                origem[ALIASES[c]] = c
                cab[i] = ALIASES[c]
        faltam = [c for c in ESPERADAS if c not in cab]
        if faltam:
            sys.exit(f"\nERRO: {caminho.name} (aba '{ws.title}') não tem as colunas {faltam}.\n"
                     f"Colunas encontradas: {cab}\nMe envie esta mensagem para eu ajustar o script.")
        for i, linha in enumerate(linhas, start=2):
            if all(v is None or v == "" for v in linha):
                continue
            r = {c: decodificar(v) for c, v in zip(cab, linha)}
            r["_arquivo"], r["_aba"], r["_linha"] = caminho.name, ws.title, i
            r["_campo_valor"], r["_campo_bairro"] = origem.get("vl_declarado", "vl_declarado"), origem.get("bairro", "bairro")
            yield r
    wb.close()


def main():
    pasta = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent.parent / "planilhas_sefaz"
    if not pasta.is_dir():
        sys.exit(f"ERRO: a pasta {pasta} não existe. Confira o caminho ou informe a pasta como argumento.")
    arquivos = sorted(pasta.glob("*.xlsx"))
    if not arquivos:
        sys.exit(f"ERRO: nenhum arquivo .xlsx em {pasta}")
    print(f"Pasta das planilhas: {pasta}")
    saida = pasta / "saida"; saida.mkdir(exist_ok=True)

    # ---- passada 1: lê, converte e guarda em memória apenas o necessário --------------------------------
    cl_bairro = defaultdict(Counter)       # (código do logradouro, trecho) -> bairros observados (para completar bairro vazio)
    vistos, dupl = set(), Counter()
    ultimo_nome = {}                       # cl -> (ano*100+mes, logradouro) do período mais recente
    linhas, por_arquivo = [], Counter()
    for arq in arquivos:
        print(f"Lendo {arq.name}…")
        for r in ler_xlsx(arq):
            por_arquivo[arq.name] += 1
            ano, mes = num(r["ano"]), num(r["mes"])
            vl, area, parte = num(r["vl_declarado"]), num(r["area"]), num(r["parte_transferida"])
            m2_fonte = num(r["valor_m2"])
            bairro = r["bairro"] or ""
            if r["cl"] and ano and mes and (r["cl"] not in ultimo_nome or ano * 100 + mes >= ultimo_nome[r["cl"]][0]):
                ultimo_nome[r["cl"]] = (ano * 100 + mes, r["logradouro"])
            if bairro and r["cl"]:
                cl_bairro[(r["cl"], r["trecho"])][bairro] += 1
            chave = hashlib.md5("|".join(str(r[c]) for c in
                    ("ano", "mes", "cl", "numero", "complemento", "vl_declarado", "area", "ds_imovel_tipologia")).encode()).digest()
            duplicado = chave in vistos
            vistos.add(chave)
            linhas.append((r, ano, mes, vl, area, parte, m2_fonte, duplicado))
            if len(linhas) % 100000 == 0:
                print(f"  {len(linhas):,} linhas…")
    print(f"Total lido: {len(linhas):,} linhas. Gravando…")

    # ---- passada 2: marcações e gravação --------------------------------------------------------------
    cols = ["id", "arquivo_origem", "aba_origem", "linha_origem", "ano", "mes", "regiao_fiscal", "cd_bairro", "cl", "trecho",
            "bairro", "bairro_inferido", "logradouro", "logradouro_original", "numero", "complemento", "tipologia", "tipo", "parte_transferida",
            "valor", "area", "valor_m2",
            "aviso_venda_parcial", "aviso_area_invalida", "aviso_valor_invalido", "aviso_m2_fora_da_faixa",
            "aviso_duplicado", "aviso_sem_numero", "aviso_m2_divergente_da_fonte", "aviso_sem_bairro",
            "campo_valor_origem", "campo_bairro_origem"]
    div_arq = defaultdict(lambda: [0, 0])
    cont, m2_ano, bairros_anos, tipolog, uso, compl_vazio = Counter(), defaultdict(list), defaultdict(set), Counter(), Counter(), 0
    with open(saida / "itbi_limpo.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f); w.writerow(cols)
        for n, (r, ano, mes, vl, area, parte, m2f, dup) in enumerate(linhas, start=1):
            bairro, inferido = r["bairro"] or "", 0
            if not bairro and (r["cl"], r["trecho"]) in cl_bairro:
                bairro, inferido = cl_bairro[(r["cl"], r["trecho"])].most_common(1)[0][0], 1
            desc = (r["descricao"] or "").upper()
            tipo = "Territorial" if desc.startswith("TERRIT") else "Comercial" if desc.startswith("NAO") else "Residencial"
            valido_a, valido_v = bool(area and area > 0), bool(vl and vl > 0)
            m2 = vl / area if valido_a and valido_v else None
            av = {
                "parcial": parte is not None and parte < 99.999,
                "area": not valido_a, "valor": not valido_v,
                "faixa": m2 is not None and tipo != "Territorial" and not (M2_MIN <= m2 <= M2_MAX),
                "dup": dup, "semnum": r["numero"] in ("", "0"),
                "div": m2 is not None and m2f is not None and abs(m2 - m2f) > 0.01,
                "sembairro": not bairro}
            for k, v in av.items():
                cont[k] += v
            div_arq[r["_arquivo"]][0] += av["div"]; div_arq[r["_arquivo"]][1] += m2 is not None and m2f is not None
            tipolog[(r["ds_imovel_tipologia"], tipo)] += 1; uso[desc] += 1; compl_vazio += not r["complemento"]
            if bairro and ano:
                bairros_anos[bairro].add(int(ano))
            if m2 and tipo == "Residencial" and r["ds_imovel_tipologia"] == "APARTAMENTO" and not av["parcial"] and not av["faixa"] and ano:
                m2_ano[int(ano)].append(m2)
            w.writerow([n, r["_arquivo"], r["_aba"], r["_linha"], int(ano) if ano else "", int(mes) if mes else "",
                        r["regiao_fiscal"], r["cd_bairro"], r["cl"], r["trecho"], bairro, inferido,
                        nome_padrao(ultimo_nome[r["cl"]][1]) if r["cl"] in ultimo_nome else nome_padrao(r["logradouro"]), r["logradouro"],
                        r["numero"], r["complemento"], r["ds_imovel_tipologia"], tipo,
                        "" if parte is None else parte, "" if vl is None else vl, "" if area is None else area,
                        "" if m2 is None else round(m2, 2)] + [int(av[k]) for k in
                       ("parcial", "area", "valor", "faixa", "dup", "semnum", "div", "sembairro")] + [r["_campo_valor"], r["_campo_bairro"]])

    # ---- relatório -----------------------------------------------------------------------------------
    N = len(linhas); pc = lambda x: f"{x:,} ({x / N:.1%})"
    rel = [f"RELATÓRIO DE QUALIDADE – {N:,} linhas de {len(arquivos)} arquivo(s)", "", "Linhas por arquivo:"]
    rel += [f"  {k}: {v:,}" for k, v in por_arquivo.items()]
    rel += ["", "Marcações (uma linha pode ter várias; nenhuma foi apagada):",
            f"  venda parcial (parte transferida < 100%): {pc(cont['parcial'])}",
            f"  área inválida (vazia ou <= 0):           {pc(cont['area'])}",
            f"  valor inválido (vazio ou <= 0):          {pc(cont['valor'])}",
            f"  R$/m² fora de [{M2_MIN:,}; {M2_MAX:,}] (sem terrenos): {pc(cont['faixa'])}",
            f"  possível duplicado (mesma chave):        {pc(cont['dup'])}",
            f"  sem número do imóvel (vazio ou 0):       {pc(cont['semnum'])}",
            f"  R$/m² recalculado difere da fonte:       {pc(cont['div'])}",
            f"  sem bairro (mesmo após completar por logradouro+trecho): {pc(cont['sembairro'])}",
            f"  complemento vazio:                       {pc(compl_vazio)}",
            "", "Conferência valor ÷ área contra o R$/m² da própria fonte (linhas que divergem / comparadas):"] + \
           [f"  {k}: {a:,} / {b:,}" for k, (a, b) in div_arq.items()] + \
           ["", "Colunas usadas como valor e bairro, por arquivo:"] + \
           [f"  {k}: valor={v}, bairro={b}" for k, v, b in sorted({(r['_arquivo'], r['_campo_valor'], r['_campo_bairro']) for r, *_ in linhas})] + \
           ["", "Tipologia × tipo:"] + [f"  {a} / {b}: {v:,}" for (a, b), v in tipolog.most_common()]
    rel += ["", "Mediana de R$/m² – apartamentos residenciais, vendas de 100%, dentro da faixa (nominal):"]
    for a in sorted(m2_ano):
        rel.append(f"  {a}: R$ {statistics.median(m2_ano[a]):,.0f}  (n={len(m2_ano[a]):,})")
    nomes_por_cl = defaultdict(set)
    for r, *_ in linhas:
        nomes_por_cl[r["cl"]].add(nome_padrao(r["logradouro"]))
    varios = [(c, sorted(n)) for c, n in nomes_por_cl.items() if len(n) > 1]
    rel += ["", f"Logradouros (cl) distintos: {len(nomes_por_cl):,}; com mais de um nome ao longo dos anos: {len(varios):,}. Exemplos:"]
    rel += [f"  cl {c}: {n}" for c, n in varios[:8]] or ["  nenhum"]
    anos = sorted({a for s in bairros_anos.values() for a in s})
    if anos:
        incompletos = sorted((b, min(s), max(s), len(s)) for b, s in bairros_anos.items() if min(s) > anos[0] or max(s) < anos[-1])
        rel += ["", f"Bairros que não cobrem todo o período {anos[0]}–{anos[-1]} (possível mudança de nome ou bairro novo):"]
        rel += [f"  {b}: {a0}–{a1} ({n} anos)" for b, a0, a1, n in incompletos[:40]] or ["  nenhum"]
    texto = "\n".join(rel)
    (saida / "relatorio_qualidade.txt").write_text(texto, encoding="utf-8")
    print("\n" + texto)
    print(f"\nPronto. Arquivos em {saida}\nNOTA: o itbi_limpo.csv COMPLETO fica só no seu computador (não vai ao GitHub). O que aparece no site, inclusive o apartamento,\nvem dos arquivos de public/transacoes, gerados pelo próximo passo: python scripts/gerar_transacoes_site.py\nEnvie ao Claude só o relatorio_qualidade.txt.")


if __name__ == "__main__":
    main()
