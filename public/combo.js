// Combobox com busca por qualquer palavra, no lugar do <select> nativo (que só entende o início do texto).
// O <select> original continua existindo (escondido) como fonte da verdade: o resto do código continua lendo/escrevendo
// sel.value, repovoando com innerHTML, usando sel.disabled e ouvindo o evento "change", sem mudanças.
(function () {
  const IDS = ['selBairro', 'selRua', 'cmpExtra', 'txBairro', 'txRua', 'txTip'];
  const MAX = 150;                                   // itens exibidos de uma vez (digite para refinar)
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const valor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const memo = new Map();                            // texto -> texto normalizado (+ forma expandida da rua, p.ex. "Visc De" ~ "visconde")
  const alvo = txt => memo.get(txt) ?? (memo.set(txt, norm(txt) + (typeof normRua === 'function' ? ' ' + normRua(txt) : '')), memo.get(txt));

  function melhorar(sel) {
    if (sel.dataset.combo) return; sel.dataset.combo = '1';
    const wrap = document.createElement('div'); wrap.className = 'combo relative inline-block align-top';
    const input = document.createElement('input');
    input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
    input.className = sel.className.replace(/\bhidden\b/g, '') + ' combo-input';
    input.style.width = sel.dataset.w || '13.5rem'; input.style.maxWidth = '100%';
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
    const lista = document.createElement('ul');
    lista.id = sel.id + '-lista'; lista.setAttribute('role', 'listbox'); input.setAttribute('aria-controls', lista.id);
    lista.className = 'hidden absolute z-50 left-0 top-full mt-1 min-w-full w-max max-w-[22rem] max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-sm text-left';
    lista.style.color = '#1c2433'; lista.style.fontWeight = '500';
    sel.style.display = 'none'; sel.after(wrap); wrap.append(input, lista);
    const rotulo = (sel.closest('label')?.firstChild?.textContent || '').trim();
    let ativo = -1, sujo = false, itens = [];

    const opcoes = () => Array.from(sel.options).map(o => ({ v: o.value, t: o.text }));
    const sincronizar = () => {
      const o = sel.options[sel.selectedIndex], vazio = !o || o.value === '';
      input.value = vazio ? '' : o.text;
      input.placeholder = (Array.from(sel.options).find(x => x.value === '') || sel.options[0])?.text || '';
      input.disabled = sel.disabled;
      input.setAttribute('aria-label', rotulo || input.placeholder);
    };
    const fechar = () => { lista.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); ativo = -1; };
    const desenhar = () => {
      const toks = sujo ? norm(input.value).split(' ').filter(Boolean) : [];
      let r = opcoes().filter(o => !toks.length || toks.every(t => alvo(o.t).includes(t)));
      if (toks.length) {                                   // quem começa pelo que foi digitado vem primeiro (ordem original dentro de cada grupo)
        const q = toks.join(' '), pts = o => (norm(o.t).startsWith(q) ? 0 : norm(o.t).split(' ').some(w => w.startsWith(toks[0])) ? 1 : 2);
        r = r.map((o, i) => ({ o, i, p: pts(o) })).sort((a, b) => a.p - b.p || a.i - b.i).map(x => x.o);
      }
      const total = r.length; itens = r.slice(0, MAX);
      lista.innerHTML = (itens.map((o, i) => `<li role="option" data-i="${i}" aria-selected="${o.v === sel.value}" class="px-3 py-1.5 cursor-pointer ${o.v === sel.value ? 'font-bold' : ''} ${o.v === '' ? 'text-gray-500' : ''}"></li>`).join('')
        || '<li class="px-3 py-2 text-gray-400">Nada encontrado</li>') + (total > MAX ? `<li class="px-3 py-1.5 text-xs text-gray-400">Mostrando ${MAX} de ${total}. Digite mais para refinar.</li>` : '');
      lista.querySelectorAll('li[data-i]').forEach(li => { li.textContent = itens[+li.dataset.i].t; });   // textContent: nomes nunca viram HTML
      ativo = itens.length ? Math.max(0, itens.findIndex(o => o.v === sel.value && !sujo)) : -1; marcar();
    };
    const marcar = () => lista.querySelectorAll('li[data-i]').forEach(li => {
      const on = +li.dataset.i === ativo; li.classList.toggle('bg-gray-100', on);
      if (on) li.scrollIntoView({ block: 'nearest' });
    });
    const abrir = () => { desenhar(); lista.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true'); };
    const escolher = i => {
      const o = itens[i]; if (!o) return;
      const mudou = sel.value !== o.v; valor.set.call(sel, o.v); sincronizar(); fechar(); sujo = false;
      if (mudou) sel.dispatchEvent(new Event('change', { bubbles: true }));
    };

    input.addEventListener('focus', () => { sujo = false; input.select(); abrir(); });
    input.addEventListener('click', () => { if (lista.classList.contains('hidden')) { sujo = false; abrir(); } if (!sujo) input.select(); });
    input.addEventListener('input', () => { sujo = true; abrir(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (lista.classList.contains('hidden')) return abrir();
        ativo = itens.length ? (ativo + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length : -1; marcar();
      } else if (e.key === 'Enter') { if (!lista.classList.contains('hidden')) { e.preventDefault(); escolher(ativo >= 0 ? ativo : 0); } }
      else if (e.key === 'Escape') { sujo = false; sincronizar(); fechar(); }
      else if (e.key === 'Tab') { sujo = false; sincronizar(); fechar(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { sujo = false; sincronizar(); fechar(); }, 120));
    lista.addEventListener('mousedown', e => { e.preventDefault(); const li = e.target.closest('li[data-i]'); if (li) escolher(+li.dataset.i); });
    lista.addEventListener('mousemove', e => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== ativo) { ativo = +li.dataset.i; marcar(); } });

    // mantém o campo em dia quando o resto do código muda o select (innerHTML, .value =, .disabled =)
    new MutationObserver(sincronizar).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    Object.defineProperty(sel, 'value', { get() { return valor.get.call(sel); }, set(v) { valor.set.call(sel, v); sincronizar(); }, configurable: true });
    sincronizar();
  }
  const iniciar = () => IDS.forEach(id => { const s = document.getElementById(id); if (s) melhorar(s); });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', iniciar) : iniciar();
})();
