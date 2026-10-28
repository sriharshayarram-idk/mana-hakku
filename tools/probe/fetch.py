import subprocess, os, re, sys, html
os.makedirs('out/t', exist_ok=True)
for line in open('tools/probe/urls.txt'):
    line=line.strip()
    if not line or '|' not in line: continue
    k,u=line.split('|',1)
    raw='out/'+k+'.raw'
    r=subprocess.run(['curl','-sSL','--max-time','40','-A','Mozilla/5.0 (X11; Linux x86_64) Chrome/120','-o',raw,u],capture_output=True,text=True)
    txt=''
    try:
        b=open(raw,'rb').read()
        if b[:4]==b'%PDF':
            subprocess.run(['pdftotext','-layout',raw,raw+'.txt'])
            txt=open(raw+'.txt',errors='ignore').read()
        else:
            s=b.decode('utf-8','ignore')
            s=re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>',' ',s)
            s=re.sub(r'(?s)<[^>]+>',' ',s); s=html.unescape(s)
            txt=re.sub(r'[ \t\r\f\v]+',' ',s); txt=re.sub(r'\n\s*\n+','\n',txt)
    except Exception as e: txt='ERR '+str(e)
    open('out/t/'+k+'.txt','w').write(('URL '+u+'\n'+(r.stderr or '')+'\n'+txt)[:3000000])
    os.remove(raw) if os.path.exists(raw) else None
    print(k, len(txt))
