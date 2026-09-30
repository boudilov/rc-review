# Годовая полоса броней на страницах мастерских (вместо заглушки «скан мастерской»).
# Каждый день учебного года — тонкая вертикальная полоска, 10:00 снизу, 22:00 сверху.
#
#   python tools/year_strip.py            — пересобрать все страницы из PAGES
#   python tools/year_strip.py 39         — только страницу 39
#
# Режимы: spans  — брони целиком (многодневные рисуются на каждом дне);
#         ticks  — засечки выдачи (start) и возврата (end), для Проката;
#         visits — засечки входа из отчёта посещений ЦИР (xlsx), число в подписи берётся из итога отчёта;
#         density — все мастерские сразу (кроме DENSITY_SKIP): яркость = число одновременных броней в 10-минутном отрезке.
# Повторный запуск заменяет ранее вставленную полосу и её стили.
import re, sys, datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESERVATIONS = Path(r'C:/DATA/UU/UCampus/Stats 2026/reservations_202609291235.md')  # выгрузка reservations из UCampus
VISITS = Path(r'C:/Users/user/Downloads/Общая статистика (студики + сотрудники)_2526.xlsx')  # отчёт посещений ЦИР
VISITS_TOTAL = 4651  # «Итого» из отчёта посещений (строк с отметками в нём 4 700)

Y0, Y1 = dt.date(2025, 8, 1), dt.date(2026, 8, 1)
H0, H1 = 10 * 60, 22 * 60
TICK = 12  # высота засечки, минут
BIN = 10  # шаг тепловой карты density, минут
LEVELS = 12  # градаций яркости density
# служебные брони сотрудников без флага block — на полосах не показываем
LUNCH_WORK = {
    '135',  # Прокат: обеденный перерыв 14:00–15:00
    '88',   # Тёмная комната: обед 13:30–14:30, закрытие 18:00–19:00, техокна
}
DENSITY_SKIP = {'16', '28', '15', '25', '22', '12'}  # прокаты (многодневные выдачи), ЦИР (посещения отдельно), WellBeing (не мастерская), тестовые

# страница: (workshop_id, режим)
PAGES = {
    '26': ('15', 'visits'),  # Центр информационных ресурсов
    '27': ('11', 'spans'),   # Фешн
    '29': ('23', 'spans'),   # Текстиль
    '31': ('10', 'spans'),   # Ручная печать
    '33': ('8', 'spans'),    # 3D
    '35': ('6', 'spans'),    # Ювелирная
    '37': ('4', 'spans'),    # Керамика
    '39': ('9', 'spans'),    # Фотостудия Артплей
    '41': ('26', 'spans'),   # Фотостудия Фабрика
    '43': ('16', 'ticks'),   # Прокат
    '47': ('13', 'spans'),   # Принт-офис
    '50': ('7', 'spans'),    # Тёмная комната
    '52': ('27', 'spans'),   # Галерея
    '67': ('*', 'density'),  # Аналитика: все мастерские
}


def load_reservations():
    # в комментариях бывают переводы строк — склеиваем строки до следующей записи
    L = RESERVATIONS.read_text(encoding='utf-8').split('\n')
    hdr = L[0][1:-1].split('|')
    recs, buf = [], None
    for s in L[2:]:
        if re.match(r'^\|\d+\|\d{4}-\d\d-\d\d ', s):
            if buf: recs.append(buf)
            buf = s
        elif buf is not None: buf += '\n' + s
    recs.append(buf)
    return [dict(zip(hdr, r.rstrip('\n')[1:-1].split('|'))) for r in recs if r]


def load_visits():
    import openpyxl
    out = []
    for r in openpyxl.load_workbook(VISITS, data_only=True).active.iter_rows(values_only=True):
        v = r[7] if len(r) > 7 else None
        if isinstance(v, str) and re.match(r'\d\d\.\d\d\.\d{4} ', v):
            out.append(dt.datetime.strptime(v, '%d.%m.%Y %H:%M:%S'))
    return out


def build(page, ws_id, mode, rows):
    prefix = f'ws{page}'
    ndays = (Y1 - Y0).days
    rects, rects_in, n = [], [], 0

    def rect(d, m0, m1):
        return f'<rect x="{d + 0.2:.1f}" y="{720 - m1}" width="0.6" height="{m1 - m0}"/>'

    def tick(when, out):
        d = (when.date() - Y0).days
        m = when.hour * 60 + when.minute - H0
        if 0 <= d < ndays and -TICK < m < 720 + TICK:
            (rects if out else rects_in).append(rect(d, max(0, m - TICK // 2), min(720, m + TICK // 2)))
            return True
        return False

    if mode == 'visits':
        for when in load_visits():
            n += tick(when, True)
    elif mode == 'density':
        nb = 720 // BIN
        cnt = [[0] * nb for _ in range(ndays)]
        for r in rows:
            if r['workshop_id'] in DENSITY_SKIP or r['block'] == 'true' or r['work_id'] in LUNCH_WORK: continue
            s = dt.datetime.fromisoformat(r['start_at'][:19]); e = dt.datetime.fromisoformat(r['end_at'][:19])
            if e <= s or s.date() != e.date(): continue
            d = (s.date() - Y0).days
            if not 0 <= d < ndays: continue
            a = max(H0, s.hour * 60 + s.minute) - H0; b = min(H1, e.hour * 60 + e.minute) - H0
            if b <= a: continue
            n += 1
            for k in range(a // BIN, (b - 1) // BIN + 1): cnt[d][k] += 1
        peak = max(max(c) for c in cnt)
        for lv in range(1, LEVELS + 1):  # по группе на градацию, соседние отрезки одной градации склеены
            out = []
            for d, col in enumerate(cnt):
                k = 0
                while k < nb:
                    q = -(-col[k] * LEVELS // peak)
                    if q != lv: k += 1; continue
                    j = k
                    while j < nb and -(-col[j] * LEVELS // peak) == lv: j += 1
                    out.append(rect(d, k * BIN, j * BIN)); k = j
            rects_in.append(f'<g fill="rgba(255,255,255,{0.06 + 0.9 * lv / LEVELS:.3f})">{"".join(out)}</g>')
    else:
        for r in rows:
            if r['workshop_id'] != ws_id or r['block'] == 'true' or r['work_id'] in LUNCH_WORK: continue
            s = dt.datetime.fromisoformat(r['start_at'][:19]); e = dt.datetime.fromisoformat(r['end_at'][:19])
            if e <= s: continue
            if mode == 'ticks':
                hit = tick(s, True)
                n += tick(e, False) or hit
                continue
            hit, day = False, s.date()
            while day <= e.date():  # многодневная бронь рисуется на каждом дне
                d = (day - Y0).days
                if 0 <= d < ndays:
                    a = s.hour * 60 + s.minute if day == s.date() else 0
                    b = e.hour * 60 + e.minute if day == e.date() else 24 * 60
                    m0, m1 = max(H0, a) - H0, min(H1, b) - H0
                    if m1 > m0:
                        rects.append(rect(d, m0, m1)); hit = True
                day += dt.timedelta(days=1)
            n += hit

    bg = ''.join(rect(d, 0, 720) for d in range(ndays))
    mon = ['АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК', 'ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ']
    labels, d0 = [], Y0
    for i in range(12):
        d1 = dt.date(d0.year + (d0.month == 12), d0.month % 12 + 1, 1)
        labels.append(f'<span style="left:{(d0 - Y0).days / ndays * 100:.3f}%;width:{(d1 - d0).days / ndays * 100:.3f}%">{mon[i]}</span>')
        d0 = d1

    legend = (f'<i class="{prefix}-ys-key" style="background:rgba(255,255,255,0.95)"></i>выдача'
              f'<i class="{prefix}-ys-key" style="background:rgba(255,255,255,0.4)"></i>возврат<b class="{prefix}-ys-sep"></b>') if mode == 'ticks' else ''
    shown = VISITS_TOTAL if mode == 'visits' else n
    what, unit = ('Посещения', 'посещений') if mode == 'visits' else ('Брони', 'броней')
    if mode == 'density':
        what = 'Брони всех мастерских'
        legend = f'<span class="{prefix}-ys-scale"></span>до {peak} одновременно<b class="{prefix}-ys-sep"></b>'
    html = f'''<div class="{prefix}-ys">
    <div class="{prefix}-ys-head"><span>{what} за 2025/26 · каждая полоска — день, 10:00 ↑ 22:00</span><span>{legend}{f'{shown:,}'.replace(',', ' ')} {unit}</span></div>
    <div class="{prefix}-ys-plot">
      <span class="{prefix}-ys-h {prefix}-ys-h0">22:00</span><span class="{prefix}-ys-h {prefix}-ys-h1">10:00</span>
      <svg viewBox="0 0 {ndays} 720" preserveAspectRatio="none" width="100%" height="100%" shape-rendering="crispEdges">
        <g fill="rgba(255,255,255,{0.02 if mode == 'density' else 0.06})">{bg}</g>
        <g fill="rgba(255,255,255,0.4)">{"".join(rects_in)}</g>
        <g fill="rgba(255,255,255,{0.55 if mode == 'spans' else 0.9})">{"".join(rects)}</g>
      </svg>
    </div>
    <div class="{prefix}-ys-months">{"".join(labels)}</div>
  </div>'''
    css = f'''  .{prefix}-ys {{ width: 100%; margin-bottom: 28px; }}
  .{prefix}-ys-head {{ display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(230,230,240,0.55); }}
  .{prefix}-ys-key {{ display: inline-block; width: 3px; height: 10px; margin: 0 8px 0 18px; vertical-align: -1px; }}
  .{prefix}-ys-scale {{ display: inline-block; width: 60px; height: 8px; margin-right: 10px; vertical-align: 0; background: linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,0.96)); }}
  .{prefix}-ys-sep {{ display: inline-block; width: 28px; }}
  .{prefix}-ys-plot {{ position: relative; width: 100%; height: 236px; }}
  .{prefix}-ys-plot svg {{ display: block; }}
  .{prefix}-ys-h {{ position: absolute; left: -44px; font-size: 9px; letter-spacing: 0.06em; color: rgba(230,230,240,0.35); font-variant-numeric: tabular-nums; }}
  .{prefix}-ys-h0 {{ top: -2px; }}
  .{prefix}-ys-h1 {{ bottom: -2px; }}
  .{prefix}-ys-months {{ position: relative; height: 14px; margin-top: 6px; }}
  .{prefix}-ys-months span {{ position: absolute; top: 0; text-align: center; font-size: 9px; letter-spacing: 0.06em; color: rgba(230,230,240,0.35); border-left: 1px solid rgba(255,255,255,0.12); }}
'''
    p = ROOT / 'pages' / page / 'index.html'
    t = p.read_text(encoding='utf-8')
    t, k = re.subn(rf'  <div class="{prefix}-scan">.*?</div>|  <div class="{prefix}-ys">.*?\n  </div>', lambda m: '  ' + html, t, count=1, flags=re.S)
    if k != 1: sys.exit(f'page {page}: no placeholder or strip found')
    t = re.sub(rf'  \.{prefix}-ys[ -].*\n', '', t)  # убрать ранее сгенерированные стили, затем добавить заново
    t = t.replace('</style>', css + '</style>', 1)
    p.write_text(t, encoding='utf-8', newline='\n')
    print(f'page {page}: {n} drawn ({mode})')


if __name__ == '__main__':
    pages = sys.argv[1:] or list(PAGES)
    rows = load_reservations() if any(PAGES[p][1] != 'visits' for p in pages) else []
    for p in pages:
        build(p, *PAGES[p], rows)
