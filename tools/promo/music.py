"""Soft, original background music: warm pad chords + gentle plucked arpeggio (synthesised, no samples)."""
import numpy as np, wave, sys
SR=44100; T=float(sys.argv[2]) if len(sys.argv)>2 else 54.0
n=int(SR*T); t=np.arange(n)/SR; out=np.zeros(n)
def note(f): return 440*2**((f-69)/12)
# I–V–vi–IV in D major, 4 s per chord
prog=[[62,66,69,74],[57,61,64,69],[59,62,66,71],[55,59,62,67]]
bar=4.0
for k in range(int(T/bar)+1):
    ch=prog[k%4]; s=int(k*bar*SR); e=min(n,int((k+1)*bar*SR)+SR)
    if s>=n: break
    tt=np.arange(e-s)/SR; env=np.minimum(1,tt/0.8)*np.exp(-np.maximum(0,tt-bar)/0.5)
    for m in ch:
        f=note(m-12)
        out[s:e]+=0.05*env*(np.sin(2*np.pi*f*tt)+0.3*np.sin(2*np.pi*2*f*tt+0.3)+0.15*np.sin(2*np.pi*f*1.003*tt))
    # arpeggio, eighth notes
    for j in range(8):
        m=ch[[0,1,2,3,2,1,2,3][j]]+12; st=s+int(j*0.5*SR); ln=int(0.9*SR)
        if st>=n: break
        ln=min(ln,n-st); x=np.arange(ln)/SR; f=note(m)
        out[st:st+ln]+=0.045*np.exp(-x*5)*(np.sin(2*np.pi*f*x)+0.4*np.sin(2*np.pi*2*f*x))*(0.7 if j%2 else 1)
    # soft low pulse on beats
    for j in range(4):
        st=s+int(j*1.0*SR); ln=min(int(0.5*SR),n-st)
        if ln<=0: break
        x=np.arange(ln)/SR; out[st:st+ln]+=0.06*np.exp(-x*9)*np.sin(2*np.pi*note(ch[0]-24)*x)
# simple echo, fades
d=int(0.375*SR); out[d:]+=0.25*out[:-d]
fade=np.ones(n); fi=int(1.5*SR); fo=int(3*SR); fade[:fi]=np.linspace(0,1,fi); fade[-fo:]=np.linspace(1,0,fo); out*=fade
out=out/np.max(np.abs(out))*0.6
st=np.stack([out,np.roll(out,int(0.012*SR))],1)
with wave.open(sys.argv[1],"wb") as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((st*32767).astype(np.int16).tobytes())
print("music ok")
