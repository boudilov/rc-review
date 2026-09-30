# Складывает графики SELF/CLASS на страницах мастерских друг под другом и выравнивает их месяцы
# по годовой полосе броней (tools/year_strip.py): svg во всю ширину, как шкала месяцев; кривые
# сдвинуты преобразованием так, что точки стоят в центрах месяцев, и доведены до краёв года
# (1 августа слева, 31 июля справа). Годы стыкуются: слева 2025/26 идёт от июля 2025 (последней
# точки 2024/25), справа 2024/25 — к августу 2025 (первой точке 2025/26); где соседнего месяца
# в данных нет, продолжение горизонтальное. Подписи месяцев — та же разметка, что под полосой.
#   python tools/stack_charts.py [page ...]
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ['27', '29', '31', '33', '35', '37', '39', '41', '47', '50']
# точки кривых стоят на x=2..598 из 600; центры августа и июля — 15.5/365 от краёв года
AUG_C = 15.5 / 365
W = (1 - 2 * AUG_C) / (596 / 600)
LEFT = AUG_C - 2 / 600 * W
CHART_H = 120
STEP = 596 / 11                   # шаг между месяцами в координатах кривых
X_L = -600 * LEFT / W             # ось слева (1 августа) в координатах кривых
X_R = (600 - 600 * LEFT) / W      # правый край (31 июля)
ANCHORS = [2 + STEP * i for i in range(12)]


def anchor_ys(d):
    # 12 помесячных значений y из пути (точки на x = 2 + i·STEP, первое вхождение каждой)
    ys, pairs = {}, [tuple(map(float, p.split(','))) for p in re.findall(r'-?[\d.]+,-?[\d.]+', d)]
    for x, y in pairs:
        for i, a in enumerate(ANCHORS):
            if abs(x - a) < 0.06 and i not in ys: ys[i] = y
    return [ys[i] for i in range(12)]


def curve(ys, y_prev, y_next):
    # Catmull-Rom (1/6) через 12 точек с виртуальными соседями слева/справа, обрезка по X_L и X_R
    P = [(2 - STEP, y_prev)] + [(ANCHORS[i], ys[i]) for i in range(12)] + [(598 + STEP, y_next)]
    # соседи крайних точек — ещё на шаг дальше с тем же y: x в каждом сегменте остаётся линейным по t
    ext = [(P[0][0] - STEP, P[0][1])] + P + [(P[-1][0] + STEP, P[-1][1])]
    clamp = lambda v: min(150.0, max(0.0, v))
    segs = []
    for k in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[k - 1], ext[k], ext[k + 1], ext[k + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6))
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6))
        segs.append([p1, c1, c2, p2])

    def split(b, t):  # де Кастельжо: (левая, правая) части кривой Безье в точке t
        lerp = lambda a, c: (a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t)
        a, b1, c = lerp(b[0], b[1]), lerp(b[1], b[2]), lerp(b[2], b[3])
        d, e = lerp(a, b1), lerp(b1, c)
        f = lerp(d, e)
        return [b[0], a, d, f], [f, e, c, b[3]]

    # x внутри сегмента линеен по t (контрольные точки по x — на третях), обрезаем по осям
    segs[0] = split(segs[0], (X_L - segs[0][0][0]) / STEP)[1]
    segs[-1] = split(segs[-1], (X_R - segs[-1][0][0]) / STEP)[0]
    fmt = lambda p: f'{p[0]:.1f},{p[1]:.1f}'
    return f'M {fmt(segs[0][0])} ' + ' '.join(f'C {fmt(s[1])} {fmt(s[2])} {fmt(s[3])}' for s in segs)

for page in sys.argv[1:] or PAGES:
    p = ROOT / 'pages' / page / 'index.html'
    t = p.read_text(encoding='utf-8')
    months = re.search(rf'<div class="ws{page}-ys-months">.*?</div>', t).group(0)
    t = re.sub(rf'\.ws{page}-charts {{[^}}]*}}', f'.ws{page}-charts {{ display: flex; flex-direction: column; gap: 26px; }}', t)
    t = re.sub(r'\.wsChart-svg {[^}]*}', '.wsChart-svg { display: block; width: 100%; overflow: visible; }', t)
    # кривые в группу с преобразованием: x_page = 600*LEFT + x*W
    t = re.sub(r'(\n\s*)(<path d="M [^"]*"[^>]*/>)(\s*)(<path d="M [^"]*"[^>]*/>)(\s*</svg>)',
               lambda m: f'{m.group(1)}<g class="wsChart-curves" transform="matrix({W:.5f} 0 0 1 {600 * LEFT:.2f} 0)">{m.group(1)}  {m.group(2)}{m.group(1)}  {m.group(4)}{m.group(1)}</g>{m.group(5)}', t)
    # кривые от оси до правого края; первая в группе — 2024/25, вторая — 2025/26
    def rebuild(m):
        d_old, d_new = re.findall(r'<path d="([^"]+)"', m.group(0))
        a, b = anchor_ys(d_old), anchor_ys(d_new)
        pa, pb = curve(a, a[0], b[0]), curve(b, a[-1], b[-1])
        return m.group(0).replace(d_old, pa, 1).replace(d_new, pb, 1)
    t = re.sub(r'<g class="wsChart-curves"[^>]*>.*?</g>', rebuild, t, flags=re.S)
    t = re.sub(r'<div class="wsChart-months">.*?</div>|<div class="ws\d+-ys-months wsChart-months">.*?</div>',
               lambda m: months.replace(f'ws{page}-ys-months', f'ws{page}-ys-months wsChart-months'), t)
    t = re.sub(r'\.wsChart-months {[^}]*}', '.wsChart-months { margin-top: 6px; }', t)
    t = re.sub(r'(class="wsChart-svg"[^>]*?)|(viewBox="0 0 600 150" width="100%" height=")\d+(")',
               lambda m: m.group(1) or f'{m.group(2)}{CHART_H}{m.group(3)}', t)
    p.write_text(t, encoding='utf-8', newline='\n')
    print('page', page)
