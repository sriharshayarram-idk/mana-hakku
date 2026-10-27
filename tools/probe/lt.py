import json, urllib.request, urllib.parse
for i, t in enumerate(["no wter since july ,we hav no handpump in Hukumpeta mandal. their is no doctor in the PHC and childs are suffering",
                       "maa ooru ki neellu raavatledu, borewell repair cheyyali"]):
    d = urllib.parse.urlencode({"text": t, "language": "en-GB", "level": "default"}).encode()
    r = urllib.request.urlopen(urllib.request.Request("https://api.languagetool.org/v2/check", data=d), timeout=30)
    open(f"out/lt{i}.json", "w").write(r.read().decode())
print("ok")
