"""Downloads freely-licensed portraits of the history-page personalities from Wikimedia Commons, with attribution.
Writes app/src/main/assets/people/<slug>.jpg and people/credits.json. Only free licences (PD / CC0 / CC BY / CC BY-SA) are kept."""
import json, os, re, sys, time, urllib.parse, urllib.request
UA = {"User-Agent": "ManaHakku/1.0 (https://github.com/sriharshayarram-idk/mana-hakku)"}
OUT = os.path.join(os.path.dirname(__file__), "..", "app", "src", "main", "assets", "people")
TITLES = {
 "Nannaya": "Nannaya", "Rudrama Devi": "Rudrama Devi", "Annamacharya": "Annamacharya", "Sri Krishnadevaraya": "Krishnadevaraya",
 "Tenali Ramakrishna": "Tenali Ramakrishna", "Vemana": "Vemana", "Bhakta Ramadasu": "Bhadrachala Ramadasu", "Sir Arthur Cotton": "Arthur Cotton",
 "Kandukuri Veeresalingam": "Kandukuri Veeresalingam", "Gurajada Apparao": "Gurajada Apparao", "Pingali Venkayya": "Pingali Venkayya",
 "Tanguturi Prakasam": "Tanguturi Prakasam", "Alluri Sitarama Raju": "Alluri Sitarama Raju", "Potti Sriramulu": "Potti Sreeramulu",
 "Neelam Sanjiva Reddy": "Neelam Sanjiva Reddy", "N. T. Rama Rao": "N. T. Rama Rao", "Palkuriki Somanatha": "Palkuriki Somanatha",
 "Bammera Pothana": "Bammera Pothana", "Muhammad Quli Qutb Shah": "Muhammad Quli Qutb Shah", "Salar Jung I": "Salar Jung I",
 "Sarojini Naidu": "Sarojini Naidu", "Chakali Ilamma": "Chakali Ilamma", "Suravaram Pratapa Reddy": "Suravaram Pratapa Reddy",
 "Burgula Ramakrishna Rao": "Burgula Ramakrishna Rao", "Komaram Bheem": "Komaram Bheem", "Ravi Narayana Reddy": "Ravi Narayana Reddy",
 "Kaloji Narayana Rao": "Kaloji Narayana Rao", "P. V. Narasimha Rao": "P. V. Narasimha Rao",
 "Dasarathi Krishnamacharyulu": "Dasarathi Krishnamacharyulu", "Prof. K. Jayashankar": "Kothapalli Jayashankar"}
FREE = re.compile(r"^(godl[- ]india|public domain|pd|cc0|cc[ -]by(-sa)?[ -]?[0-9.]*|cc by(-sa)? [0-9.]+( [a-z]+)?|gfdl.*)$", re.I)
def get(u):
    for _ in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40))
        except Exception as e:
            err = e; time.sleep(2)
    raise err
def strip(h): return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", h or "")).strip()
slug = lambda n: re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")
os.makedirs(OUT, exist_ok=True)
credits, log = {}, []
for name, title in TITLES.items():
    q = get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "titles": title, "prop": "pageimages", "piprop": "name", "pilicense": "free", "redirects": 1, "format": "json"}))
    pg = next(iter(q["query"]["pages"].values()))
    f = pg.get("pageimage")
    if not f:
        log.append(f"NO FREE IMAGE  {name}"); continue
    c = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "titles": "File:" + f, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 360, "format": "json"}))
    cp = next(iter(c["query"]["pages"].values()))
    if "imageinfo" not in cp:
        log.append(f"NOT ON COMMONS  {name}  {f}"); continue
    ii = cp["imageinfo"][0]; md = ii.get("extmetadata", {})
    lic = strip(md.get("LicenseShortName", {}).get("value", ""))
    if not FREE.match(lic):
        log.append(f"LICENCE SKIPPED {name}  {lic}"); continue
    data = urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA), timeout=60).read()
    fn = slug(name) + ".jpg"
    if not ii["thumburl"].lower().endswith((".jpg", ".jpeg")):
        from PIL import Image; import io
        im = Image.open(io.BytesIO(data)).convert("RGB"); b = io.BytesIO(); im.save(b, "JPEG", quality=85); data = b.getvalue()
    from PIL import Image; import io
    im = Image.open(io.BytesIO(data)).convert("RGB"); im.thumbnail((320, 400)); b = io.BytesIO(); im.save(b, "JPEG", quality=80, optimize=True); data = b.getvalue()
    open(os.path.join(OUT, fn), "wb").write(data)
    credits[name] = {"file": "people/" + fn, "source": ii["descriptionurl"], "license": lic,
                     "artist": strip(md.get("Artist", {}).get("value", ""))[:120], "desc": strip(md.get("ImageDescription", {}).get("value", ""))[:160]}
    log.append(f"OK  {name}  {lic}  {len(data)//1024} KB  {f}")
    time.sleep(0.5)
json.dump(credits, open(os.path.join(OUT, "credits.json"), "w"), ensure_ascii=False, indent=1)
print("\n".join(log)); print(len(credits), "images")
