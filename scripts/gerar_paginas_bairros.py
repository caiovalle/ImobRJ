#!/usr/bin/env python3
"""
Gera uma página própria para cada bairro (public/bairros/<bairro>/index.html), a lista de bairros
(public/bairros/index.html), o public/sitemap.xml e o public/robots.txt.

Para quê: o painel principal é uma página só, montada no navegador; o Google quase não enxerga o que aparece
depois de escolher um bairro. Estas páginas são HTML pronto, leve e com os números escritos no texto, então
aparecem em buscas como "preço do m² na Tijuca". Cada página tem botões para abrir o bairro no painel.

Lê os arquivos já publicados em public/transacoes/*.json (saída do gerar_transacoes_site.py, que chama este
script no final). Usa só vendas integrais de imóveis residenciais (flags = 0), igual ao resto do site.

Uso (terminal do VS Code, pasta do projeto aberta):
    python scripts/gerar_paginas_bairros.py
Só biblioteca padrão.
"""
import html, json, shutil, statistics, sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gerar_rankings import resumo   # noqa: E402  (mediana com no máximo 5 vendas por prédio)

RAIZ = Path(__file__).resolve().parent.parent
SITE = "https://imobrj.github.io"
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
MIN_PAGINA = 10      # vendas residenciais nos últimos 24 meses para o bairro ganhar página
MIN_LINHA = 5        # vendas mínimas para mostrar uma mediana numa tabela
MIN_VAR = 30         # vendas mínimas em cada período para mostrar a variação em 12 meses
MIN_ANO = 10         # vendas mínimas no ano para entrar no gráfico
FAIXAS = [(0, 50, "Até 49 m²"), (50, 80, "50 a 79 m²"), (80, 120, "80 a 119 m²"), (120, 10 ** 9, "120 m² ou mais")]
TIPOS = [("Apartamento", "Apartamentos"), ("Casa", "Casas")]

# primeira palavra abreviada nas planilhas (Avn Maracana → Avenida Maracana), igual ao pretty() do app.js
ABREV = {"avn": "Avenida", "av": "Avenida", "etr": "Estrada", "est": "Estrada", "prc": "Praça", "pra": "Praça", "pca": "Praça",
         "trv": "Travessa", "tv": "Travessa", "lrg": "Largo", "lgo": "Largo", "lad": "Ladeira", "al": "Alameda", "r": "Rua"}
nome_rua = lambda r: " ".join([ABREV.get(r.split()[0].lower(), r.split()[0])] + r.split()[1:]) if r.split() else r
esc = html.escape
slug = lambda nb: nb.replace(" ", "-")


def brl(v):
    return "—" if v is None else "R$ " + f"{round(v):,}".replace(",", ".")


def num(v):
    return f"{round(v):,}".replace(",", ".")


def pct(v):
    return ("+" if v > 0.05 else "") + f"{v:.1f}".replace(".", ",").replace("-0,0", "0,0") + "%"


def pabs(v):
    return f"{abs(v):.1f}".replace(".", ",") + "%"


def mes(t):
    return f"{MESES[t % 12]}/{t // 12}"


def mediana(vs):
    return statistics.median(vs) if len(vs) >= MIN_LINHA else None


def grafico(anos):
    """SVG simples com a mediana anual do R$/m² (anos = [(ano, mediana, n)])."""
    if len(anos) < 3:
        return ""
    W, H, ml, mr, mt, mb = 640, 220, 64, 16, 16, 28
    lo, hi = min(m for _, m, _ in anos), max(m for _, m, _ in anos)
    pad = (hi - lo) * .12 or hi * .1
    lo, hi = max(0, lo - pad), hi + pad
    a0, a1 = anos[0][0], anos[-1][0]
    x = lambda a: ml + (a - a0) / max(1, a1 - a0) * (W - ml - mr)
    y = lambda v: mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb)
    pts = " ".join(f"{x(a):.1f},{y(m):.1f}" for a, m, _ in anos)
    grade = "".join(f'<line x1="{ml}" x2="{W - mr}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="g"/><text x="{ml - 6}" y="{y(v) + 4:.1f}" text-anchor="end">{brl(v)}</text>'
                    for v in (lo + (hi - lo) * i / 3 for i in range(4)))
    rot = "".join(f'<text x="{x(a):.1f}" y="{H - 8}" text-anchor="middle">{a}</text>' for a, _, _ in anos if a in (a0, a1) or (a - a0) % 3 == 0 and a1 - a > 1)
    pontos = "".join(f'<circle cx="{x(a):.1f}" cy="{y(m):.1f}" r="3.5"><title>{a}: {brl(m)}/m² ({num(n)} vendas)</title></circle>' for a, m, n in anos)
    return (f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Mediana do preço do m² por ano, de {a0} a {a1}">{grade}{rot}'
            f'<polyline points="{pts}" class="l"/>{pontos}</svg>')


ESTILO = """
:root{--fundo:#f6efe4;--card:#fffbf4;--borda:#e3d6c2;--texto:#2a211a;--suave:#6b5b4b;--terracota:#b4472a;--verde:#1f4d3a;--sobe:#047857;--cai:#b91c1c}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.55 "Work Sans",system-ui,sans-serif}
a{color:var(--terracota)}h1,h2{font-family:"DM Serif Display",Georgia,serif;font-weight:400;line-height:1.2}
h1{font-size:clamp(1.8rem,5vw,2.6rem);margin:.2em 0 .3em}h2{font-size:1.35rem;margin:0 0 .6rem}
header,main,footer{max-width:960px;margin:0 auto;padding:0 16px}header{padding-top:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.logo{font-weight:700;font-size:1.25rem;color:var(--texto);text-decoration:none}.logo b{color:var(--terracota)}
.card{background:var(--card);border:1.5px solid var(--borda);border-radius:6px;padding:20px;margin:18px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.kpi{background:var(--card);border:1.5px solid var(--borda);border-radius:6px;padding:14px}
.kpi small{display:block;color:var(--suave);font-size:.78rem}.kpi strong{font-size:1.35rem}.sobe{color:var(--sobe)}.cai{color:var(--cai)}
.botoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.btn{display:inline-block;padding:.55rem 1rem;border-radius:5px;font-weight:600;text-decoration:none;font-size:.92rem}
.btn.p{background:var(--verde);color:#fffbf4}.btn.s{border:1.5px solid #cdbba2;color:var(--texto);background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:.93rem}th,td{text-align:left;padding:7px 8px 7px 0;border-bottom:1px solid #efe4d3}th{color:var(--suave);font-weight:600;font-size:.8rem}
td.n,th.n{text-align:right}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:0 18px}
svg{width:100%;height:auto;font-size:11px;fill:var(--suave)}svg .g{stroke:#e9dfcf}svg .l{fill:none;stroke:var(--terracota);stroke-width:2.5}svg circle{fill:var(--terracota)}
.nota{font-size:.8rem;color:var(--suave)}.lista{columns:3 200px;padding:0;list-style:none}.lista li{padding:3px 0;break-inside:avoid}
.lista span{color:var(--suave);font-size:.85rem}footer{padding:24px 16px 40px;font-size:.85rem;color:var(--suave)}
"""


def pagina(titulo, descricao, caminho, corpo):
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(titulo)}</title>
<meta name="description" content="{esc(descricao)}">
<link rel="canonical" href="{SITE}{caminho}">
<meta property="og:type" content="website"><meta property="og:title" content="{esc(titulo)}"><meta property="og:description" content="{esc(descricao)}"><meta property="og:url" content="{SITE}{caminho}">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Work+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>{ESTILO}</style>
</head>
<body>
<header><a class="logo" href="/">Imob<b>RJ</b></a><a href="/bairros/">Todos os bairros</a></header>
<main>
{corpo}
</main>
<footer>Fonte: ITBI da Prefeitura do Rio de Janeiro (Secretaria de Fazenda), vendas registradas por imóvel. Valores declarados na compra, sem descontar a inflação.
Não é avaliação profissional nem recomendação de investimento. <a href="/#method">Sobre os dados e a metodologia</a> ·
<a href="https://github.com/imobrj/imobrj.github.io/issues/new?template=erro.yml" rel="noopener">Relatar um erro</a>
<script data-goatcounter="https://imobrj.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</footer>
</body>
</html>
"""


def gerar(pasta=RAIZ / "public" / "transacoes", publico=RAIZ / "public"):
    pasta, publico = Path(pasta), Path(publico)
    idx_arq = pasta / "index.json"
    if not idx_arq.is_file():
        sys.exit(f"ERRO: {idx_arq} não encontrado. Rode antes: python scripts/gerar_transacoes_site.py")
    idx = json.loads(idx_arq.read_text(encoding="utf-8"))

    # vendas residenciais aproveitáveis por bairro: (t, rua, número, tipologia, área, R$/m²)
    por_bairro, fim = {}, 0
    for b in idx["bairros"]:
        d = json.loads((pasta / b["arquivo"]).read_text(encoding="utf-8"))
        vs = []
        for ano, mes_, rua, nume, _c, tip, com, area, valor, fl in d["linhas"]:
            if fl or com or not area or area <= 0:
                continue
            t = ano * 12 + mes_ - 1
            vs.append((t, d["ruas"][rua], str(nume).strip().upper(), d["tipologias"][tip], area, valor / area))
            fim = max(fim, t)
        por_bairro[b["nb"]] = (b["nome"], vs)
    if not fim:
        sys.exit("ERRO: nenhuma venda aproveitável. Nada foi alterado.")
    ini, ini_ant = fim - 11, fim - 23
    janela = f"{mes(ini)} a {mes(fim)}"
    cidade = statistics.median(v[5] for _, vs in por_bairro.values() for v in vs if v[0] >= ini)

    saida = publico / "bairros"
    if saida.exists():
        shutil.rmtree(saida)   # recria do zero (bairro que perdeu dados não fica com página velha)
    saida.mkdir(parents=True)
    hoje = date.today().isoformat()
    lista, urls = [], [f"{SITE}/", f"{SITE}/bairros/"]

    for nb, (nome, vs) in sorted(por_bairro.items(), key=lambda x: x[0]):   # pela chave sem acento (Água Santa junto do A)
        atual = [v for v in vs if v[0] >= ini]
        if sum(1 for v in vs if v[0] >= ini_ant) < MIN_PAGINA:
            continue
        ant = [v for v in vs if ini_ant <= v[0] < ini]
        m12 = statistics.median(v[5] for v in atual) if len(atual) >= MIN_LINHA else None
        area_med = statistics.median(v[4] for v in atual) if len(atual) >= MIN_LINHA else None
        var = None
        if len(atual) >= MIN_VAR and len(ant) >= MIN_VAR:
            a, _, _ = resumo([((v[1], v[2]), v[5]) for v in atual]); b, _, _ = resumo([((v[1], v[2]), v[5]) for v in ant])
            var = (a / b - 1) * 100 if a and b else None
        vs_cid = (m12 / cidade - 1) * 100 if m12 else None

        # gráfico: mediana por ano (ano corrente incompleto entra, marcado no texto)
        por_ano = defaultdict(list)
        for v in vs:
            por_ano[v[0] // 12].append(v[5])
        anos = [(a, statistics.median(x), len(x)) for a, x in sorted(por_ano.items()) if len(x) >= MIN_ANO]

        tipos = [(rot, mediana([v[5] for v in atual if v[3] == tip]), sum(1 for v in atual if v[3] == tip)) for tip, rot in TIPOS]
        faixas = [(rot, mediana([v[5] for v in atual if lo <= v[4] < hi]), sum(1 for v in atual if lo <= v[4] < hi)) for lo, hi, rot in FAIXAS]
        por_rua = defaultdict(list)
        for v in atual:
            por_rua[v[1]].append(((v[1], v[2]), v[5]))
        ruas = []
        for rua, xs in por_rua.items():
            m, n, p = resumo(xs)
            if n >= MIN_LINHA:
                ruas.append((rua, m, n, p))
        caras = sorted((r for r in ruas if r[3] >= 2), key=lambda r: -r[1])[:10]
        movimento = sorted(ruas, key=lambda r: -r[2])[:10]

        s = slug(nb)
        caminho = f"/bairros/{s}/"
        urls.append(SITE + caminho)
        lista.append((nome, s, m12, len(atual)))
        if m12:
            desc = (f"Preço do m² em {nome}, Rio de Janeiro: mediana de {brl(m12)}/m² em {num(len(atual))} vendas residenciais registradas "
                    f"no ITBI de {janela}" + (f" ({pct(var)} em 12 meses)" if var is not None else "") + ". Dados oficiais da Prefeitura.")
        else:
            desc = f"Vendas de imóveis em {nome}, Rio de Janeiro, registradas no ITBI da Prefeitura: preço do m², ruas e histórico."
        cls = lambda v: "sobe" if v and v > 0 else "cai" if v and v < 0 else ""
        kpis = (f'<div class="kpi"><small>Preço mediano do m²</small><strong>{brl(m12)}</strong><small>{janela}</small></div>'
                f'<div class="kpi"><small>Vendas residenciais</small><strong>{num(len(atual))}</strong><small>nos últimos 12 meses</small></div>'
                + (f'<div class="kpi"><small>Variação em 12 meses</small><strong class="{cls(var)}">{pct(var)}</strong><small>sem o efeito de prédios novos</small></div>' if var is not None else "")
                + (f'<div class="kpi"><small>Comparado com a cidade</small><strong>{pct(vs_cid)}</strong><small>cidade: {brl(cidade)}/m²</small></div>' if vs_cid is not None else "")
                + (f'<div class="kpi"><small>Área mediana vendida</small><strong>{num(area_med)} m²</strong><small>nos últimos 12 meses</small></div>' if area_med else ""))
        linhas = lambda xs: "".join(f"<tr><td>{esc(r)}</td><td class=\"n\">{brl(m) + '/m²' if m else '<span class=nota>poucas vendas</span>'}</td><td class=\"n\">{num(n)}</td></tr>" for r, m, n in xs)
        tab_ruas = lambda xs, extra: ("<table><thead><tr><th>Rua</th><th class=\"n\">R$/m²</th><th class=\"n\">Vendas</th></tr></thead><tbody>"
                                      + "".join(f"<tr><td>{esc(nome_rua(r))}</td><td class=\"n\">{brl(m)}/m²</td><td class=\"n\">{num(n)}</td></tr>" for r, m, n, _ in xs)
                                      + f"</tbody></table><p class=\"nota\">{extra}</p>") if xs else '<p class="nota">Poucas vendas por rua nestes 12 meses.</p>'
        g = grafico(anos)
        corpo = f"""
<p class="nota" style="margin-top:22px"><a href="/bairros/">Bairros</a> › {esc(nome)}</p>
<h1>Preço do m² em {esc(nome)}</h1>
<p>{f"Nos últimos 12 meses com dados ({janela}), os imóveis residenciais em <b>{esc(nome)}</b> foram vendidos por uma mediana de <b>{brl(m12)} por m²</b>, em {num(len(atual))} vendas registradas no ITBI da Prefeitura do Rio." if m12 else f"{esc(nome)} teve poucas vendas residenciais registradas no ITBI nos últimos 12 meses ({janela})."}
{f" Isso é {pabs(vs_cid)} {'abaixo' if vs_cid < 0 else 'acima'} da mediana da cidade ({brl(cidade)}/m²)." if vs_cid is not None and abs(vs_cid) >= 0.5 else ""}
{f" Em relação aos 12 meses anteriores, o m² {'subiu' if var > 0 else 'caiu'} {pabs(var)}." if var is not None and abs(var) >= 0.5 else ""}</p>
<div class="kpis">{kpis}</div>
<div class="botoes"><a class="btn p" href="/#overview/{s}">Ver {esc(nome)} no painel completo</a><a class="btn s" href="/#tx/{s}">Ver cada venda</a><a class="btn s" href="/#anuncios">Avaliar um anúncio</a><a class="btn s" href="/#calc">Comprar ou alugar?</a></div>
{f'<div class="card"><h2>Preço do m² ano a ano</h2>{g}<p class="nota">Mediana do R$/m² das vendas residenciais de cada ano (anos com {MIN_ANO} vendas ou mais). Valores da época, sem descontar a inflação. {anos[-1][0]} vai até {mes(fim)}.</p></div>' if g else ""}
<div class="card grid">
<div><h2>Por tipo de imóvel</h2><table><thead><tr><th>Tipo</th><th class="n">R$/m²</th><th class="n">Vendas</th></tr></thead><tbody>{linhas(tipos)}</tbody></table></div>
<div><h2>Por tamanho</h2><table><thead><tr><th>Área</th><th class="n">R$/m²</th><th class="n">Vendas</th></tr></thead><tbody>{linhas(faixas)}</tbody></table></div>
<p class="nota" style="grid-column:1/-1">Mediana dos últimos 12 meses ({janela}). Com menos de {MIN_LINHA} vendas, a linha fica sem preço.</p>
</div>
<div class="card grid">
<div><h2>Ruas com o m² mais caro</h2>{tab_ruas(caras, f"Ruas com {MIN_LINHA} ou mais vendas em 2 prédios ou mais. Cada prédio conta no máximo 5 vendas.")}</div>
<div><h2>Ruas com mais vendas</h2>{tab_ruas(movimento, "Nos últimos 12 meses. Cada prédio conta no máximo 5 vendas na mediana.")}</div>
</div>
<p class="nota">O preço do ITBI é o valor declarado na compra. Ele mistura imóveis diferentes (tamanho, padrão, andar, conservação), então serve como referência, não como avaliação de um imóvel específico. Atualizado em {date.today().strftime('%d/%m/%Y')}.</p>
"""
        (saida / s).mkdir()
        (saida / s / "index.html").write_text(pagina(f"Preço do m² em {nome} (Rio de Janeiro) · ImobRJ", desc, caminho, corpo), encoding="utf-8")

    itens = "".join(f'<li><a href="/bairros/{s}/">{esc(n)}</a> <span>{brl(m) + "/m²" if m else "poucas vendas"}</span></li>' for n, s, m, _ in lista)
    corpo = f"""
<h1 style="margin-top:22px">Preço do m² por bairro no Rio de Janeiro</h1>
<p>Mediana do preço do m² das vendas residenciais registradas no ITBI da Prefeitura do Rio de {janela}. Na cidade toda: <b>{brl(cidade)}/m²</b>.
Escolha um bairro para ver o histórico, os preços por tamanho e as ruas mais caras. Para ver os bairros no mapa ou em rankings, use o <a href="/#mapa">mapa</a> e os <a href="/#ranking">rankings</a>.</p>
<div class="card"><ul class="lista">{itens}</ul></div>
"""
    (saida / "index.html").write_text(pagina("Preço do m² por bairro no Rio de Janeiro · ImobRJ",
                                             f"Preço do m² em {len(lista)} bairros do Rio de Janeiro, com dados oficiais do ITBI da Prefeitura ({janela}).", "/bairros/", corpo), encoding="utf-8")
    (publico / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                         + "".join(f"  <url><loc>{u}</loc><lastmod>{hoje}</lastmod></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
    (publico / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
    print(f"Páginas de bairro: {len(lista)} em {saida} (+ sitemap.xml e robots.txt).")


if __name__ == "__main__":
    gerar()
