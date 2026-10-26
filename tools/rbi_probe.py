import asyncio, re, sys, json
from playwright.async_api import async_playwright
PAGES = {
  "sf": "https://www.rbi.org.in/Scripts/AnnualPublications.aspx?head=State%20Finances%20:%20A%20Study%20of%20Budgets",
  "hsis": "https://www.rbi.org.in/Scripts/AnnualPublications.aspx?head=Handbook%20of%20Statistics%20on%20Indian%20States",
}
async def main():
    rep = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept_downloads=True)
        pg = await ctx.new_page()
        for k, u in PAGES.items():
            try:
                await pg.goto(u, wait_until="networkidle", timeout=90000)
                await pg.wait_for_timeout(4000)
                links = await pg.eval_on_selector_all("a", "els=>els.map(e=>e.href)")
                x = [l for l in links if re.search(r"\.xlsx", l, re.I)]
                rep[k] = {"final": pg.url, "title": await pg.title(), "xlsx": len(x), "sample": x[:5],
                          "estates": [l for l in x if "ESTATES" in l.upper()][:2]}
            except Exception as e:
                rep[k] = {"err": str(e)[:300]}
        # try downloading the e-STATES file through the browser context (cookies from the challenge)
        u = (rep.get("sf", {}).get("estates") or ["https://rbidocs.rbi.org.in/rdocs/Publications/DOCs/ESTATES23012026AB138FB463474EBFBCC03A8FC878C45A.XLSX"])[0]
        try:
            await pg.goto("https://rbidocs.rbi.org.in/rdocs/Publications/PDFs/NOTES230120261772EAC66AA94026B3E4C074E6188FE9.PDF", timeout=90000)
        except Exception as e:
            rep["visit_docs"] = str(e)[:200]
        await pg.wait_for_timeout(5000)
        r = await ctx.request.get(u, timeout=120000)
        body = await r.body()
        rep["download"] = {"url": u, "status": r.status, "len": len(body), "zip": body[:2] == b"PK"}
        if body[:2] != b"PK":
            # fall back: fetch inside the page (same origin, after the challenge ran)
            try:
                res = await pg.evaluate("async u=>{const r=await fetch(u);const b=new Uint8Array(await r.arrayBuffer());return [r.status,b.length,b[0]===80&&b[1]===75]}", u)
                rep["download_in_page"] = res
            except Exception as e:
                rep["download_in_page"] = str(e)[:200]
        await b.close()
    print(json.dumps(rep, indent=1))
    open("probe.json", "w").write(json.dumps(rep, indent=1))
asyncio.run(main())
