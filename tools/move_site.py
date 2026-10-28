"""Moves every link from the old GitHub account to a new, neutral one in one go.
Use after the repository has been transferred:  python3 tools/move_site.py NEW_ACCOUNT_NAME   (add --dry to only list changes)
It rewrites the website address (OLD.github.io/mana-hakku) and the repository address (github.com/OLD/mana-hakku)
in the app, the register (Code.gs), the promo and QR tools. Then: commit, push, redeploy Code.gs, reprint QR posters."""
import sys, pathlib, re
OLD = 'sriharshayarram-idk'
if len(sys.argv) < 2 or not re.fullmatch(r'[A-Za-z0-9-]{1,39}', sys.argv[1]): sys.exit('Usage: python3 tools/move_site.py NEW_ACCOUNT_NAME [--dry]')
NEW, dry = sys.argv[1], '--dry' in sys.argv
root = pathlib.Path(__file__).resolve().parent.parent
files = ['app/src/main/assets/index.html', 'backend/Code.gs', 'web/privacy.html', 'tools/promo/run.sh', 'tools/promo/promo.html',
         'tools/probe/qr.py', 'tools/build_mandals.py', 'tools/fetch_people_images.py', 'tools/probe_wiki.py', 'README.md']
total = 0
for f in files:
    p = root / f
    if not p.exists(): continue
    s = p.read_text(encoding='utf8')
    n = s.count(OLD)
    if not n: continue
    total += n
    print(f'{f}: {n} link(s)')
    if not dry: p.write_text(s.replace(OLD.lower() + '.github.io', NEW.lower() + '.github.io').replace(OLD, NEW), encoding='utf8')
print(('Would change' if dry else 'Changed'), total, 'link(s).', '' if dry else 'Next: git commit, push; paste the new Code.gs into Apps Script and deploy a new version; reprint QR posters.')
