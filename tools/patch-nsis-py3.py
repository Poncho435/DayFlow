#!/usr/bin/env python3
"""Патчи для сборки NSIS 3.03 под Python 3 (SConstruct + SCons-скрипты)."""
import re, glob, os, sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

files = [os.path.join(root, 'SConstruct')] + \
    glob.glob(os.path.join(root, 'SCons', '**', '*.py'), recursive=True) + \
    glob.glob(os.path.join(root, '**', 'SConscript'), recursive=True)

def patch(path, transforms):
    if not os.path.isfile(path):
        return
    s = open(path, encoding='utf-8', errors='replace').read()
    orig = s
    for fn in transforms:
        s = fn(s)
    if s != orig:
        open(path, 'w', encoding='utf-8').write(s)
        print('patched', os.path.relpath(path, root))

# 1) env.has_key(x)  →  x in env  (полный dotted-путь объекта)
has_key = re.compile(r'((?:[A-Za-z_]\w*\.)*[A-Za-z_]\w*)\.has_key\(\s*([^()]*?)\s*\)')
def fix_has_key(s):
    return has_key.sub(lambda m: f'{m.group(2).strip()} in {m.group(1)}', s)

# 2) raise X, "msg"  →  raise X("msg")
raise_py2 = re.compile(r'^([ \t]*)raise[ \t]+([A-Za-z_][A-Za-z0-9_.]*)[ \t]*,[ \t]*(.+?)[ \t]*$', re.MULTILINE)
def fix_raise(s):
    return raise_py2.sub(lambda m: f'{m.group(1)}raise {m.group(2)}({m.group(3).strip()})', s)

# 3) StringType → str, убрать import
def fix_stringtype(s):
    s = s.replace('from types import StringType\n', '')
    s = s.replace('from types import StringType\r\n', '')
    return s.replace('StringType', 'str')

# 4) map(...) в контексте списка → list(map(...)); os.environ.has_key уже покрыт (1)
def fix_map(s):
    # map(...) сразу после "= " или "+ " → list(map(...)
    s = re.sub(r'(?<![A-Za-z0-9_])(=|\+)[ \t]*map\(', lambda m: m.group(0).replace('map(', 'list(map('), s)
    return s

for f in files:
    patch(f, [fix_has_key, fix_raise, fix_stringtype, fix_map])

# Точечные правки известных мест с потерей скобок при list(map(...)
def targeted(path, pairs):
    if not os.path.isfile(path):
        return
    s = open(path, encoding='utf-8', errors='replace').read()
    orig = s
    for a, b in pairs:
        s = s.replace(a, b)
    if s != orig:
        open(path, 'w', encoding='utf-8').write(s)
        print('targeted', os.path.relpath(path, root))

targeted(os.path.join(root, 'SConstruct'), [
    # добавить недостающую закрывающую скобку у list(map(...))
    ("paths = list(map(lambda file: os.path.join(d, path, subpath, file), names)",
     "paths = list(map(lambda file: os.path.join(d, path, subpath, file), names))"),
    ("paths = list(map(lambda file: os.path.join(prefix, path, subpath, file), names)",
     "paths = list(map(lambda file: os.path.join(prefix, path, subpath, file), names))"),
    ("names = names or map(lambda x: x.name, files)",
     "names = names or list(map(lambda x: x.name, files))"),
])

targeted(os.path.join(root, 'Docs', 'src', 'SConscript'), [
    ("+ list(map(lambda ch: 'Chapter' + str(ch + 1) + '.html', range(chapters))",
     "+ list(map(lambda ch: 'Chapter' + str(ch + 1) + '.html', range(chapters)))"),
    ("+ list(map(lambda ap: 'Appendix' + chr(ord('A') + ap) + '.html', range(appendices))",
     "+ list(map(lambda ap: 'Appendix' + chr(ord('A') + ap) + '.html', range(appendices)))"),
])

print('done')
