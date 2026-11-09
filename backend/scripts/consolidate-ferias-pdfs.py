"""
Consolida os PDFs "Programacao de Ferias ACQUA *" (relatorio do sistema de folha) em um xlsx
no formato que scripts/sync-ferias2-xlsx.ts le: Empregado | Vencto. Ferias | Limite p/ Gozo |
Dias Dir. | Dias Goz. | Dias Rest. | Arquivo.

Regra: uma linha por colaborador, com o periodo MAIS ANTIGO em aberto (a 1a linha dele no PDF).
Quem tem periodo vencido aparece com 2 linhas no PDF; a 2a (periodo em aquisicao) nao vai para o app.

Aborta se alguma linha nao for reconhecida, se a contagem divergir de "Total de empregados"
ou se Vencto. != Fim aquisitivo (sinal de coluna deslocada).

Uso (a partir de backend/):
  python -P scripts/consolidate-ferias-pdfs.py <pasta-dos-pdfs> <saida.xlsx>
"""
import glob
import os
import re
import sys
import unicodedata

import pdfplumber
from openpyxl import Workbook

sys.stdout.reconfigure(encoding='utf-8')

DATE = r'\d{2}/\d{2}/\d{4}'
NUM = r'\d+(?:,\d+)?'
PERIOD_TAIL = (
    rf'(?P<ini_aq>{DATE})\s+(?P<fim_aq>{DATE})\s+'
    r'(?P<ini_gozo>\S+)\s+(?P<dias_ferias>\S+)\s+(?P<abono>\S+)\s+(?P<decimo>\S+)\s+'
    rf'(?P<dir>{NUM})\s+(?P<goz>{NUM})\s+(?P<rest>{NUM})\s+(?P<limite>{DATE})\s+'
    r'(?P<afast>\S+)\s+(?P<faltas>\S+)$'
)
MAIN_RE = re.compile(
    rf'^(?P<codigo>\d+)\s+(?P<nome>.+?)\s+(?P<admissao>{DATE})\s+(?P<vencto>{DATE})\s+'
    rf'(?P<venc>\d+)\s+(?P<pro>\d{{2}}/12)\s+' + PERIOD_TAIL
)
SECOND_RE = re.compile(r'^' + PERIOD_TAIL)
SKIP_PREFIXES = (
    'ACQUA DISTRIBUIDORA', 'CNPJ:', 'Data base:', 'PROGRAMAÇÃO DE FÉRIAS', 'Data Vencto.',
    'Código Empregado', 'Observações:', 'Sistema licenciado',
)


def to_num(value):
    n = float(value.replace(',', '.'))
    return int(n) if n.is_integer() else n


def norm(name):
    text = unicodedata.normalize('NFD', name.lower())
    return ' '.join(''.join(c for c in text if not unicodedata.combining(c)).split())


def sort_key(emp):
    d, m, y = emp['vencto'].split('/')
    return (y, m, d, emp['nome'])


def parse_pdf(path):
    base = os.path.basename(path)
    employees, total, data_base = [], None, None
    with pdfplumber.open(path) as pdf:
        lines = [ln.strip() for page in pdf.pages for ln in (page.extract_text() or '').splitlines()]
    for ln in lines:
        if not ln:
            continue
        m = re.match(r'Total de empregados:\s*(\d+)', ln)
        if m:
            total = int(m.group(1))
            continue
        m = re.match(rf'Data base:\s*({DATE})', ln)
        if m:
            data_base = m.group(1)
        if ln.startswith(SKIP_PREFIXES):
            continue
        m = MAIN_RE.match(ln)
        if m:
            emp = m.groupdict()
            emp['arquivo'] = base
            emp['extra'] = []
            if emp['vencto'] != emp['fim_aq']:
                sys.exit(f'ERRO {base}: Vencto != Fim aquisitivo em: {ln}')
            employees.append(emp)
            continue
        m = SECOND_RE.match(ln)
        if m and employees:
            employees[-1]['extra'].append(m.groupdict())
            continue
        sys.exit(f'ERRO {base}: linha nao reconhecida: {ln}')
    if total is None or total != len(employees):
        sys.exit(f'ERRO {base}: Total de empregados={total}, lidos={len(employees)}')
    print(f'{base}: {len(employees)} colaboradores | data base {data_base}')
    return employees


def main():
    pasta, saida = sys.argv[1], sys.argv[2]
    if os.path.exists(saida):
        sys.exit(f'ERRO: {saida} ja existe, nao vou sobrescrever')
    arquivos = sorted(glob.glob(os.path.join(pasta, 'Programa*ACQUA*.pdf')))
    if not arquivos:
        sys.exit('ERRO: nenhum PDF encontrado')

    todos = [emp for f in arquivos for emp in parse_pdf(f)]
    print(f'\nTotal: {len(todos)} colaboradores em {len(arquivos)} PDFs')

    vistos = {}
    for emp in todos:
        vistos.setdefault(norm(emp['nome']), []).append(emp['arquivo'])
    repetidos = {k: v for k, v in vistos.items() if len(v) > 1}
    print(f'Nomes repetidos entre arquivos: {repetidos or "nenhum"}')

    print('\nCasos para revisar (dados do proprio relatorio):')
    for emp in todos:
        notas = []
        if to_num(emp['rest']) != 30 - to_num(emp['goz']):
            notas.append(f"Dir/Goz/Rest {emp['dir']}/{emp['goz']}/{emp['rest']} (Rest != 30-Goz)")
        for p in [emp] + emp['extra']:
            if not p['ini_gozo'].startswith('...'):
                notas.append(f"gozo programado {p['ini_gozo']} ({p['dias_ferias']} dias), aquisitivo {p['ini_aq']}-{p['fim_aq']}")
            if p['afast'] != '-':
                notas.append(f"{p['afast']} dias de afastamento")
            if p['faltas'] != '-':
                notas.append(f"{p['faltas']} faltas")
        if notas:
            print(f"  {emp['nome']}: " + '; '.join(notas))

    wb = Workbook()
    ws = wb.active
    ws.title = 'Programação de Férias'
    ws.append(['Empregado', 'Vencto. Férias', 'Limite p/ Gozo', 'Dias Dir.', 'Dias Goz.', 'Dias Rest.', 'Arquivo'])
    for emp in sorted(todos, key=sort_key):
        ws.append([
            emp['nome'].upper(), emp['vencto'], emp['limite'],
            to_num(emp['dir']), to_num(emp['goz']), to_num(emp['rest']), emp['arquivo'],
        ])
    wb.save(saida)
    duas = sum(1 for e in todos if e['extra'])
    print(f'\nGravado: {saida} ({len(todos)} linhas; {duas} colaboradores tinham 2 periodos no PDF)')


if __name__ == '__main__':
    main()
