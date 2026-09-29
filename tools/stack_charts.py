# Складывает графики SELF/CLASS на страницах мастерских друг под другом и выравнивает их месяцы
# по годовой полосе броней (tools/year_strip.py): точки кривых — в центрах месяцев полосы,
# подписи месяцев — та же разметка, что под полосой.   python tools/stack_charts.py [page ...]
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ['27', '29', '31', '33', '35', '37', '39', '41', '47', '50']
# точки кривых стоят на x=2..598 из 600; центры августа и июля — 15.5/365 от краёв года
AUG_C = 15.5 / 365
W = (1 - 2 * AUG_C) / (596 / 600)
LEFT = AUG_C - 2 / 600 * W
CHART_H = 120

for page in sys.argv[1:] or PAGES:
    p = ROOT / 'pages' / page / 'index.html'
    t = p.read_text(encoding='utf-8')
    months = re.search(rf'<div class="ws{page}-ys-months">.*?</div>', t).group(0)
    t = re.sub(rf'\.ws{page}-charts {{[^}}]*}}', f'.ws{page}-charts {{ display: flex; flex-direction: column; gap: 26px; }}', t)
    t = re.sub(r'\.wsChart-svg {[^}]*}', f'.wsChart-svg {{ display: block; width: {W * 100:.3f}%; margin-left: {LEFT * 100:.3f}%; }}', t)
    t = re.sub(r'<div class="wsChart-months">.*?</div>|<div class="ws\d+-ys-months wsChart-months">.*?</div>',
               lambda m: months.replace(f'ws{page}-ys-months', f'ws{page}-ys-months wsChart-months'), t)
    t = re.sub(r'\.wsChart-months {[^}]*}', '.wsChart-months { margin-top: 6px; }', t)
    t = re.sub(r'(class="wsChart-svg"[^>]*?)|(viewBox="0 0 600 150" width="100%" height=")\d+(")',
               lambda m: m.group(1) or f'{m.group(2)}{CHART_H}{m.group(3)}', t)
    p.write_text(t, encoding='utf-8', newline='\n')
    print('page', page)
