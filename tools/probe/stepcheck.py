# Confirms the deployed register knows the "step" type, without counting anything (an unknown step name is refused).
import json,urllib.request,re
u=re.search(r'REGISTER_URL="([^"]+)"',open('app/src/main/assets/index.html').read()).group(1)
r=urllib.request.Request(u,data=json.dumps({"type":"step","s":"zz_check","state":"ap"}).encode(),headers={'Content-Type':'text/plain;charset=utf-8'})
print('answer:',urllib.request.urlopen(r,timeout=60).read().decode()[:200])
