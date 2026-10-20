# Модалка «Помесячно по направлениям» для ЦИР (стр. 26): посещения из отчёта посещений
# (время входа + направление обучения + школа), группы ВО / ДПО / Uteens / СПО / сотрудники.
# По клику на месяц — посещения месяца по школам. Стили и кнопка — общие с tools/directions_modal.py.
#   python tools/library_modal.py
# Отчёты лежат в C:/DATA/UU/UCampus/Stats 2026/ (вне репозитория — внутри ФИО), по одному на год:
# «ЦИР_посещения_2024-25.xlsx», «ЦИР_посещения_2025-26.xlsx». Год без файла пропускается.
import re, collections, datetime as dt
from pathlib import Path
import openpyxl
from directions_modal import CSS, num, nice_step, esc

ROOT = Path(__file__).resolve().parent.parent
PAGE = '26'
STATS = Path(r'C:/DATA/UU/UCampus/Stats 2026')
YEARS = ['2024/25', '2025/26']
# учебный год → отчёт посещений «ЦИР_посещения_2024-25.xlsx»; None, если файла нет
REPORTS = {y: (f if (f := STATS / f'ЦИР_посещения_{y.replace("/", "-")}.xlsx').exists() else None) for y in YEARS}
MON = ['АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК', 'ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ']
MON_FULL = ['август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь', 'январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль']

GROUPS = [  # ключ, подпись, заливка, пояснение
    ('vo', 'ВО', 'rgba(255,255,255,0.92)', 'бакалавриат, магистратура, британское ВО'),
    ('dpo', 'ДПО', 'rgba(255,255,255,0.42)', 'ДПО, дополнительное образование, подготовительные курсы, переподготовка'),
    ('teens', 'Uteens', 'url(#{hatch})', 'Школа подростков (ШП)'),
    ('spo', 'СПО', 'rgba(255,255,255,0.18)', 'среднее профессиональное образование'),
    ('staff', 'Сотрудники', 'none', 'сотрудники и преподаватели, без направления'),
]
SCHOOL_NAME = {
    'БВШД': 'Британская высшая школа дизайна', 'МШК': 'Московская школа кино', 'МАРШ': 'Архитектурная школа МАРШ',
    'МШСИ': 'Московская школа современного искусства', 'МШМ': 'Московская школа музыки', 'ШП': 'Школа подростков',
    'СКРИМСКУЛ': 'Scream School', 'Московский креативный тех': 'Московский креативный техникум',
    'School Of Education': 'School of Education',
}


def group_of(kind, school, direction):
    if kind != 'Студент': return 'staff'
    if school == 'ШП': return 'teens'
    d = (direction or '').strip().lower()
    if 'среднее профессиональное' in d: return 'spo'
    if 'бакалавр' in d or 'магистр' in d or 'высшее' in d: return 'vo'
    return 'dpo'


def load(path):
    # месяц → группа → посещений; месяц → школа → группа → посещений
    data = collections.defaultdict(collections.Counter)
    schools = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    school = None
    for r in openpyxl.load_workbook(path, data_only=True).active.iter_rows(min_row=7, values_only=True):
        v = r[7] if len(r) > 7 else None
        if not (isinstance(v, str) and re.match(r'\d\d\.\d\d\.\d{4} ', v)):
            if r[0] and isinstance(r[0], str) and not any(r[1:]): school = r[0]  # строка-заголовок школы
            continue
        m = dt.datetime.strptime(v, '%d.%m.%Y %H:%M:%S').strftime('%Y-%m')
        g = group_of(r[4], school, r[8] if len(r) > 8 else None)
        data[m][g] += 1
        schools[m]['Сотрудники и преподаватели' if g == 'staff' else SCHOOL_NAME.get(school, school or '—')][g] += 1
    return data, schools


def months_of(year):
    y = int(year[:4])
    return [f'{y + (m < 8)}-{m:02d}' for m in (*range(8, 13), *range(1, 8))]


def detail_id(i):
    return f'ws{PAGE}-dir-{i:02d}'


def build():
    years = [y for y, f in REPORTS.items() if f]
    months, data, schools = [], collections.defaultdict(collections.Counter), {}
    for y in years:
        d, s = load(REPORTS[y])
        for m in months_of(y):
            months.append(m); data[m] = d[m]; schools[m] = s[m]
    n = len(months)
    W, H, TOP, BOT = 960, 180, 6, 160
    slot = W / n
    bw = slot * (0.62 if n > 12 else 0.5)
    totals = [sum(data[m].values()) for m in months]
    vm = max(totals) or 1
    step = nice_step(vm)
    ymax = step * -(-vm // step)
    sy = (BOT - TOP) / ymax
    hatch = f'ws{PAGE}dir-hatch'
    svg = [f'<svg class="wsdir-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="none" width="100%" height="{H}">',
           f'<defs><pattern id="{hatch}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
           f'<rect width="5" height="5" fill="rgba(255,255,255,0.12)"/><rect width="2" height="5" fill="rgba(255,255,255,0.85)"/></pattern></defs>']
    for v in range(step, int(ymax) + 1, step):
        y = BOT - v * sy
        svg.append(f'<line x1="0" y1="{y:.1f}" x2="{W}" y2="{y:.1f}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>')
    svg.append(f'<line x1="0" y1="{BOT}" x2="{W}" y2="{BOT}" stroke="rgba(255,255,255,0.18)" vector-effect="non-scaling-stroke"/>')
    for k in range(1, len(years)):
        svg.append(f'<line x1="{W * k / len(years)}" y1="0" x2="{W * k / len(years)}" y2="{H}" stroke="rgba(255,255,255,0.22)" vector-effect="non-scaling-stroke"/>')
    for i, m in enumerate(months):
        x = i * slot + (slot - bw) / 2
        y, parts = BOT, []
        for key, label, fill, _ in GROUPS:
            v = data[m][key]
            if v <= 0: continue
            h = v * sy
            y -= h
            if key == 'staff':  # контур без заливки
                parts.append(f'<rect x="{x + 0.5:.1f}" y="{y + 0.5:.1f}" width="{bw - 1:.1f}" height="{max(h - 1, 0):.1f}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1" vector-effect="non-scaling-stroke"/>')
            else:
                parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{h:.1f}" fill="{fill.format(hatch=hatch)}"/>')
        tip = f'{MON_FULL[i % 12]} {m[:4]} — всего {totals[i]} посещений' + ''.join(
            f'\n{label}: {data[m][key]}' for key, label, *_ in GROUPS if data[m][key] > 0) + '\nклик — посещения по школам'
        svg.append(f'<a href="#{detail_id(i)}" class="wsdir-col"><title>{tip}</title><rect x="{i * slot:.1f}" y="0" width="{slot:.1f}" height="{BOT}" fill="transparent"/>{"".join(parts)}</a>')
    svg.append('</svg>')
    ticks = ''.join(f'<span class="wsdir-tick" style="top:{BOT - v * sy:.1f}px">{num(v)}</span>' for v in range(0, int(ymax) + 1, step))
    mlabels = ''.join(f'<span>{MON[i % 12]}</span>' for i in range(n))
    ylabels = ''.join(f'<span>{y}</span>' for y in years)
    chart = (f'<div class="wsdir-plot">{"".join(svg)}{ticks}</div>'
             f'<div class="wsdir-months" style="grid-template-columns: repeat({n}, 1fr)">{mlabels}</div>'
             f'<div class="wsdir-years" style="grid-template-columns: repeat({len(years)}, 1fr)">{ylabels}</div>')

    # легенда: столбцы — группы, строки — учебные годы
    head = ''.join(f'<th><i class="wsdir-sw wsdir-sw-{key}"></i><b>{label}</b></th>' for key, label, *_ in GROUPS)
    rows = ''
    for k, y in enumerate(years):
        ms = months_of(y)
        tot = {key: sum(data[m][key] for m in ms) for key, *_ in GROUPS}
        s = sum(tot.values()) or 1
        cells = ''.join(f'<td>{num(tot[key])}<span>{round(100 * tot[key] / s)}%</span></td>' for key, *_ in GROUPS)
        rows += f'<tr class="wsdir-y{2 if k == len(years) - 1 else 1}"><th>{y}</th>{cells}</tr>'
    legend = f'<table class="wsdir-legend"><thead><tr><th></th>{head}</tr></thead><tbody>{rows}</tbody></table>'

    # карточки месяцев: посещения по школам
    label = {key: l for key, l, *_ in GROUPS}
    cards = []
    for i, m in enumerate(months):
        rows_s = sorted(schools[m].items(), key=lambda kv: -sum(kv[1].values()))
        total = totals[i]
        hd = (f'<a href="#ws{PAGE}-dir" class="wsdir-back">&larr; к графику</a>'
              f'<div class="wsdir-dh">{MON_FULL[i % 12].capitalize()} {m[:4]}</div>'
              f'<div class="wsdir-dsub">всего {num(total)} посещений · по школам</div>')
        if not rows_s:
            body = '<div class="wsdir-dempty">В этом месяце посещений нет</div>'
        else:
            vmax = sum(rows_s[0][1].values()) or 1
            body = ''.join(
                f'<div class="wsdir-drow wsdir-drow-lib"><span class="wsdir-dn">{k + 1}</span>'
                f'<span class="wsdir-dp" title="{esc(sch)}">{esc(sch)}</span>'
                f'<span class="wsdir-dmix">{" · ".join(f"{label[g]} {c}" for g, c in gs.most_common())}</span>'
                f'<span class="wsdir-dbar"><i style="width:{100 * sum(gs.values()) / vmax:.1f}%"></i></span>'
                f'<span class="wsdir-dv">{sum(gs.values())}</span></div>'
                for k, (sch, gs) in enumerate(rows_s))
        cards.append(f'<div id="{detail_id(i)}" class="wsdir-detail"><div class="wsdir-dcard">{hd}{body}</div></div>')

    period = ('Учебные годы ' if len(years) > 1 else 'Учебный год ') + ' и '.join(years)
    missing = [y for y, f in REPORTS.items() if not f]
    note = (f' Отчёта за {", ".join(missing)} пока нет.' if missing else '') + (' Отчёт 2024/25 начинается с 1 сентября — август пустой.' if REPORTS.get('2024/25') else '')
    notes = '; '.join(f'<b>{l}</b> — {d}' for _, l, _, d in GROUPS)
    modal = (f'<!-- wsdir:start -->\n<div id="ws{PAGE}-dir" class="wsdir-modal">\n  <a href="#" class="wsdir-bg" aria-label="Закрыть"></a>\n'
             f'  <div class="wsdir-panel">\n    <a href="#" class="wsdir-close">&#10005;</a>\n'
             f'    <div class="wsdir-h">Центр информационных ресурсов · посещения по направлениям помесячно</div>\n'
             f'    <div class="wsdir-sub">{period}, по отчёту посещений (время входа).{note} Столбик — посещения за месяц, сегменты — группы; '
             f'наведите на месяц, чтобы увидеть числа, кликните — посещения месяца по школам. {notes}.</div>\n'
             f'    <div class="wsdir-kind">Посещения<span>в месяц</span></div>{chart}{legend}\n    {"".join(cards)}\n  </div>\n</div>\n<!-- wsdir:end -->\n')
    return modal


EXTRA_CSS = '''  /* wsdir-lib:start — ЦИР: группа «сотрудники» и карточки по школам (tools/library_modal.py) */
  .wsdir-sw-staff { box-sizing: border-box; border: 1px solid rgba(255,255,255,0.6); }
  .wsdir-drow-lib { grid-template-columns: 20px minmax(0, 1fr) 210px 120px 48px; }
  .wsdir-dmix { font-size: 10px; color: rgba(230,230,240,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* wsdir-lib:end */
'''

if __name__ == '__main__':
    p = ROOT / 'pages' / PAGE / 'index.html'
    t = p.read_text(encoding='utf-8')
    t = re.sub(r'\n?<!-- wsdir:start -->.*?<!-- wsdir:end -->\n?', '\n', t, flags=re.S)
    t = re.sub(r'  /\* wsdir(-lib)?:start.*?/\* wsdir(-lib)?:end \*/\n', '', t, flags=re.S)
    t = re.sub(r'<div class="wsdir-head">(<div class="ws\d+-title">.*?</div>)<a [^>]*class="wsdir-btn"[^>]*>.*?</a></div>', r'\1', t)
    title = re.search(rf'<div class="ws{PAGE}-title">.*?</div>', t).group(0)
    t = t.replace(title, f'<div class="wsdir-head">{title}<a href="#ws{PAGE}-dir" class="wsdir-btn">Помесячно по направлениям</a></div>', 1)
    t = t.rstrip('\n') + '\n\n' + build()
    t = t.replace('</style>', CSS + EXTRA_CSS + '</style>', 1)
    p.write_text(t, encoding='utf-8', newline='\n')
    print(f'page {PAGE}: ok')
