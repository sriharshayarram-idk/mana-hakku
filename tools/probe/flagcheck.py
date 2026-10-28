# Checks whether the deployed register has the per-phone flag limit (11 flags on a made-up report id; nothing is written to the sheet).
import json,urllib.request,re,sys
u=re.search(r'REGISTER_URL="([^"]+)"',open('app/src/main/assets/index.html').read()).group(1)
def post(d):
    r=urllib.request.Request(u,data=json.dumps(d).encode(),headers={'Content-Type':'text/plain;charset=utf-8'})
    return json.loads(urllib.request.urlopen(r,timeout=60).read())
out=[]
for i in range(11):
    out.append(post({"type":"flag","id":"rzzzzprobe1","reason":"other","note":"","state":"ap","dev":"probecheck0000000000000001"}).get('error'))
print('flag answers:',out)
g=json.loads(urllib.request.urlopen(u+'?state=ap',timeout=60).read())
print('get ok',g.get('ok'),'reports',len(g.get('reports',[])))
