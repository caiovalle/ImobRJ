"""Funções comuns: normalização de chave (igual à do app.js) e nomes de bairro com acento."""
import json, re, unicodedata
from pathlib import Path

DICIONARIO = Path(__file__).resolve().parent / "nomes_bairros.json"   # chave sem acento -> nome com acento (da base anterior do Data.Rio)


def chave(s):
    """Mesma normalização do app.js (função strip): sem acento, minúsculas, só letras/números/espaço."""
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


_nomes = None
MINUSCULAS = {"da", "de", "do", "das", "dos", "e"}
def capitalizar(nome):
    """'Barra Da Tijuca' -> 'Barra da Tijuca' (preposições em minúscula, menos a 1ª palavra)."""
    p = nome.split(" ")
    return " ".join(w.lower() if i and w.lower() in MINUSCULAS else w for i, w in enumerate(p))


def nome_bairro(bruto):
    """'JACAREPAGUA' -> 'Jacarepaguá' (se o bairro está no dicionário); senão, só Title Case."""
    global _nomes
    if _nomes is None:
        _nomes = json.loads(DICIONARIO.read_text(encoding="utf-8")) if DICIONARIO.exists() else {}
    return capitalizar(_nomes.get(chave(bruto)) or bruto.title())
