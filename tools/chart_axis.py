# Вертикальная ось графиков SELF/CLASS на страницах мастерских: подпись единиц у заголовка графика
# и круглые деления (тонкие линии + подписи слева). Масштаб графиков: ноль на y=148, максимум
# помесячных часов за оба года (2024/25 и 2025/26) на y=12 из viewBox 0 0 600 150.
#   python tools/chart_axis.py            — все страницы
# Повторный запуск заменяет ранее добавленные деления.
import re, sys, glob, collections
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
Y0, Y_TOP = 148, 12
H_PX = 120  # высота svg графика в px (tools/stack_charts.py)
# страница: префикс файлов в Stats 2026
PAGES = {'27': '01', '29': '02', '31': '03', '33': '04', '35': '05', '37': '06', '39': '07', '41': '08', '50': '09', '47': '10'}
MONTHS = [f'{y + (m < 8)}-{m:02d}' for y in (2024, 2025) for m in (*range(8, 13), *range(1, 8))]  # авг 2024 … июл 2026


def vmax(prefix, kind):
    f = glob.glob(str(ROOT / 'Stats 2026' / f'{prefix}_*_{kind}_*.xlsx'))[0]
    c = collections.Counter()
    for r in openpyxl.load_workbook(f, data_only=True).active.iter_rows(min_row=2, values_only=True):
        if r[4]: c[r[4]] += r[5] or 0
    return max(c[m] for m in MONTHS)


def ticks(vm):
    # шаг 1/2/2.5/5 × 10^n, чтобы делений было 2–3 ниже максимума
    for step in (10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000):
        if vm / step <= 3: return [step * i for i in range(1, int(vm // step) + 1)]
    return []


def fmt(v):
    return f'{v:,}'.replace(',', '&nbsp;')


for page in sys.argv[1:] or list(PAGES):
    p = ROOT / 'pages' / page / 'index.html'
    t = p.read_text(encoding='utf-8')
    # убрать результат прошлого запуска
    t = re.sub(r'<div class="wsChart-plot">\s*(<svg .*?</svg>)\s*(?:<span class="wsChart-tick".*?</span>\s*)*</div>', r'\1', t, flags=re.S)
    t = re.sub(r'\s*<line class="wsChart-(grid|axis)"[^>]*/>', '', t)
    t = re.sub(r'<span class="wsChart-unit">.*?</span>', '', t)
    t = re.sub(r'  \.wsChart-(plot|tick|grid|unit)[ {].*\n', '', t)

    def per_chart(m):
        block, kind = m.group(0), m.group(1)
        vm = vmax(PAGES[page], kind)
        grid, labels = '', ''
        for v in ticks(vm):
            y = Y0 - v * (Y0 - Y_TOP) / vm
            grid += f'\n        <line class="wsChart-grid" x1="0" y1="{y:.1f}" x2="600" y2="{y:.1f}" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>'
            labels += f'\n        <span class="wsChart-tick" style="top:{y / 150 * H_PX:.1f}px">{fmt(v)}</span>'
        labels += f'\n        <span class="wsChart-tick" style="top:{Y0 / 150 * H_PX:.1f}px">0</span>'
        block = block.replace(f'<span class="wsChart-kicker">{kind}</span>',
                              f'<span class="wsChart-kicker">{kind}<span class="wsChart-unit"> · часы в месяц</span></span>')
        axis = '\n        <line class="wsChart-axis" x1="0" y1="0" x2="0" y2="148" stroke="rgba(255,255,255,0.18)" stroke-width="1" vector-effect="non-scaling-stroke"/>'
        block = re.sub(r'(<line x1="0" y1="148"[^>]*/>)', lambda g: g.group(1) + grid + axis, block, count=1)
        block = re.sub(r'(<svg viewBox="0 0 600 150".*?</svg>)', lambda g: f'<div class="wsChart-plot">\n      {g.group(1)}{labels}\n      </div>', block, count=1, flags=re.S)
        return block

    t, n = re.subn(r'<div class="wsChart">\s*<div class="wsChart-head">\s*<span class="wsChart-kicker">(SELF|CLASS)</span>.*?wsChart-months">', per_chart, t, flags=re.S)
    css = '''  .wsChart-plot { position: relative; }
  .wsChart-tick { position: absolute; right: 100%; padding-right: 8px; transform: translateY(-50%); text-align: right; font-size: 9px; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; color: rgba(230,230,240,0.35); white-space: nowrap; }
  .wsChart-unit { letter-spacing: 0.1em; color: rgba(230,230,240,0.4); }
'''
    t = t.replace('</style>', css + '</style>', 1)
    p.write_text(t, encoding='utf-8', newline='\n')
    print(f'page {page}: {n} charts')
