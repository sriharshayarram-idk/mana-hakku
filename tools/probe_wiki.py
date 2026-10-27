import json, sys, urllib.request, urllib.parse
UA={"User-Agent":"ManaHakku/1.0 (https://github.com/sriharshayarram-idk/mana-hakku)"}
def wikitext(title, lang="en"):
    u=f"https://{lang}.wikipedia.org/w/api.php?"+urllib.parse.urlencode({"action":"parse","page":title,"prop":"wikitext","format":"json","redirects":1})
    return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA)))["parse"]["wikitext"]["*"]
import os
os.makedirs("out",exist_ok=True)
for t in sys.argv[1:]:
    try:
        open("out/"+t.replace("/","_")+".txt","w").write(wikitext(t))
        print("ok",t)
    except Exception as e:
        print("ERR",t,e)
