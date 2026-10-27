"""Builds web/data/mandals.json: district -> [[mandal_en, mandal_te], ...] for Andhra Pradesh and Telangana,
from the English Wikipedia lists of mandals, with Telugu names taken from each mandal article's Telugu link."""
import json, re, sys, time, urllib.parse, urllib.request
UA = {"User-Agent": "ManaHakku/1.0 (https://github.com/sriharshayarram-idk/mana-hakku)"}

def api(lang, **p):
    p["format"] = "json"
    u = f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode(p)
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60))
        except Exception:
            time.sleep(2 + i * 3)
    raise SystemExit("API failed: " + u)

def wikitext(title):
    return api("en", action="parse", page=title, prop="wikitext", redirects=1)["parse"]["wikitext"]["*"]

def link_parts(s):
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", s)
    return (m.group(1).strip(), (m.group(2) or m.group(1)).strip()) if m else (None, s.strip())

def clean_name(n):
    n = re.sub(r"\s*mandal$", "", n.strip(), flags=re.I)
    n = re.sub(r",.*$", "", n)
    return re.sub(r"\s+", " ", n).strip(" '\"")

def parse_ap(wt):
    out, district = [], None
    body = wt[wt.index("{|"):wt.index("|}", wt.index("{|"))]
    for row in body.split("\n|-"):
        cells = [c for c in re.split(r"\n\|", "\n" + row) if c.strip()]
        for c in cells:
            if re.search(r"district\]\]", c):
                district = link_parts(c.split("|", 1)[-1] if "rowspan" in c else c)[1]
        if not cells or cells[0].lstrip().startswith(("!", "{", "class")):
            continue
        first = cells[0].strip()
        if "rowspan" in first or not first.startswith("[["):
            continue
        title, text = link_parts(first)
        if district:
            out.append((district, clean_name(text), title))
    return out

def parse_ts(wt):
    out = []
    body = wt[wt.index("{|"):wt.rindex("|}")]
    rows = body.split("\n|-")
    pending = []  # mandals waiting for a district cell (rowspan covers following rows)
    district, span = None, 0
    for row in rows:
        items = re.findall(r"^\*\s*(.+)$", row, flags=re.M)
        dcell = re.search(r"rowspan=\"?(\d+)\"?\s*\|\s*(\[\[[^\]]+\]\])", row)
        if dcell:
            district, span = link_parts(dcell.group(2))[1], int(dcell.group(1))
        elif not dcell:
            d2 = re.search(r"\n\|\s*(\[\[[^\]]*district[^\]]*\]\])\s*$", row)
            if d2:
                district, span = link_parts(d2.group(1))[1], 1
        for it in items:
            title, text = link_parts(it) if "[[" in it else (None, it)
            out.append((district, clean_name(text), title))
    return out

def te_links(titles):
    res = {}
    titles = [t for t in set(titles) if t]
    for i in range(0, len(titles), 50):
        j = api("en", action="query", titles="|".join(titles[i:i + 50]), prop="langlinks", lllang="te", lllimit="max", redirects=1)
        q = j.get("query", {})
        redir = {r["to"]: r["from"] for r in q.get("redirects", [])}
        norm = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for pg in q.get("pages", {}).values():
            ll = pg.get("langlinks")
            if not ll:
                continue
            te = ll[0]["*"]
            src = pg["title"]
            src = redir.get(src, src)
            src = norm.get(src, src)
            res[src] = te
            res[pg["title"]] = te
        time.sleep(0.3)
    return res

def te_name(s):
    s = re.sub(r"\s*\(.*?\)\s*", "", s)
    s = re.sub(r"\s*మండలం\s*$", "", s)
    s = re.sub(r",.*$", "", s)
    return s.strip()

def main():
    ap = parse_ap(wikitext("List of mandals in Andhra Pradesh"))
    ts = parse_ts(wikitext("List of mandals in Telangana"))
    te = te_links([t for _, _, t in ap + ts])
    data, report = {"ap": {}, "ts": {}}, []
    for key, rows in (("ap", ap), ("ts", ts)):
        for d, n, t in rows:
            if not d or not n:
                continue
            d = re.sub(r"\s*district$", "", d, flags=re.I).strip()
            lst = data[key].setdefault(d, [])
            tn = te_name(te[t]) if t and t in te else ""
            if n.lower() not in [x[0].lower() for x in lst]:
                lst.append([n, tn])
        for d in data[key]:
            data[key][d].sort(key=lambda x: x[0].lower())
        tot = sum(len(v) for v in data[key].values())
        withte = sum(1 for v in data[key].values() for x in v if x[1])
        report.append(f"{key}: {len(data[key])} districts, {tot} mandals, {withte} with Telugu names")
    data["meta"] = {"source": "Wikipedia: List of mandals in Andhra Pradesh / Telangana (+ Telugu Wikipedia links)", "built": time.strftime("%Y-%m-%d")}
    dest = sys.argv[1] if len(sys.argv) > 1 else "web/data/mandals.json"
    json.dump(data, open(dest, "w"), ensure_ascii=False, separators=(",", ":"))
    print("\n".join(report))
    for key in ("ap", "ts"):
        print(key, {d: len(v) for d, v in data[key].items()})

if __name__ == "__main__":
    main()
