"""Baut web/public/cmp/crr3.json: KWG vor dem BRUBEG gegen KWG nach Art. 1 und Art. 2 BRUBEG (BGBl. 2026 I Nr. 81),
nur die geänderten Paragrafen. Quellen im Cache ~/.cache/regradar-cmp/crr3/ (buzer.de-Vergleichsseiten je Paragraf,
BGBl-Text art1.txt/art2.txt) und die redaktionellen Kommentare web/lib/comparisons/crr3.json.
Aufruf: python3 -I scripts/crr3-compare-build.py"""
import re,os,json,html,difflib,collections
here=os.path.dirname(os.path.abspath(__file__))
C=os.path.expanduser('~/.cache/regradar-cmp/crr3/'); D=C+'buzer/'
natkey=lambda x:(int(re.sub(r'\D','',x)),x)

def cell(h):
    h=re.sub(r'<span class="satz"[^>]*>\d+</span>\s*','',h)
    h=re.sub(r'<h3[^>]*>(.*?)</h3>',lambda m:'\n\n@@T'+re.sub(r'<[^>]+>','',m.group(1))+'@@\n\n',h,flags=re.S)
    h=re.sub(r'<br\s*/?>\s*<br\s*/?>','\n\n',h); h=re.sub(r'<br\s*/?>','\n',h)
    h=re.sub(r'<a [^>]*class="noprint".*?</a>','',h,flags=re.S)
    h=re.sub(r'<[^>]+>','',h); return html.unescape(h).replace('\xa0',' ').replace('­','')
def page(path):
    t=open(path,errors='ignore').read()
    body=t[t.find('</select>'):t.rfind('</table>')]; old=[];new=[]
    for m in re.finditer(r'<td class="(halt|hneu)"[^>]*>(.*?)</td>|<div class="hunc">(.*?)</div></td>',body,flags=re.S):
        k=m.group(1) or 'hunc'; h=m.group(2) if m.group(1) else m.group(3)
        h=re.sub(r'<span class="hdiff">.*?</span>','',h); c=cell(h)
        if k in('halt','hunc'): old.append(c)
        if k in('hneu','hunc'): new.append(c)
    return '\n\n'.join(old),'\n\n'.join(new)
def load(s):
    """alt = Fassung vor Art. 1 (bzw. vor Art. 2, falls Art. 1 den Paragrafen nicht berührt), neu = Fassung nach Art. 2 (bzw. nach Art. 1)."""
    p1=D+f'c1/{s}.html'; p2=D+f'c2/{s}.html'; o=n=None
    if os.path.exists(p1): o,n=page(p1)
    if os.path.exists(p2):
        o2,n2=page(p2); n=n2
        if o is None: o=o2
    return o,n
def split(txt):
    title=None;paras=[]
    for p in re.split(r'\n\s*\n',txt):
        p=re.sub(r'\s+',' ',p).strip()
        if not p or p.startswith('(Textabschnitt unverändert)'): continue
        m=re.match(r'@@T(.*)@@$',p)
        if m: title=re.sub(r'^§\s*\S+\s*','',m.group(1).strip()).strip(); continue
        paras.append(p)
    return title,paras
def groups(paras):
    out=[]
    for p in paras:
        m=re.match(r'\((\d+[a-z]?)\)\s*(.*)',p)
        if m or not out: out.append(['('+m.group(1)+')' if m else '',(m.group(2) if m else p)])
        else: out[-1][1]+=' '+p
    return out
tok=lambda s:re.findall(r'\S+\s*',s)
def diff(a,b):
    A,B=tok(a),tok(b)
    sm=difflib.SequenceMatcher(None,[x.strip() for x in A],[x.strip() for x in B],autojunk=False)
    segs=[]
    def add(k,x):
        if not x: return
        if segs and segs[-1][0]==k: segs[-1][1]+=x
        else: segs.append([k,x])
    ops=sm.get_opcodes()
    for i,(tag,i1,i2,j1,j2) in enumerate(ops):
        if tag=='equal' and 0<i<len(ops)-1 and (i2-i1)<=2 and ops[i-1][0]!='equal' and ops[i+1][0]!='equal':
            ops[i]=('replace',i1,i2,j1,j2)
    for tag,i1,i2,j1,j2 in ops:
        if tag=='equal': add(0,''.join(A[i1:i2]))
        else: add(1,''.join(A[i1:i2])); add(2,''.join(B[j1:j2]))
    out=[];buf={1:'',2:''}
    for k,x in segs:
        if k==0:
            for kk in (1,2):
                if buf[kk]: out.append([kk,buf[kk]]); buf[kk]=''
            out.append([0,x])
        else: buf[k]+=x
    for kk in (1,2):
        if buf[kk]: out.append([kk,buf[kk]])
    return out,sm.ratio()

ids=json.load(open(D+'ids.json'))
NEU='2h 2i 26c 26d 53ca 53cb 53cc 53cd 53ce 53cf 53cg 53ch 53ci 53cj 53ck 53cl 53cm 53cn 53co 53cp 53cq'.split()
secs=sorted(set(f[:-5] for d in ('c1','c2') for f in os.listdir(D+d) if f.endswith('.html')),key=natkey)
# Titel der neuen Paragrafen aus der Inhaltsübersicht von Art. 2
a2=open(C+'art2.txt').read().split('\n')[:60]
ntitle={}
for l in a2:
    m=re.search(r'§ (\d+[a-z]*)\s{1,}(\S.*)$',l)
    if m and not l.strip().startswith('Die Angabe'): ntitle[m.group(1)]=re.sub(r'\s+',' ',m.group(2)).strip('„“. ')
res=[];newTitles={}
for s in secs:
    o,n=load(s); ot,op=split(o); nt,np_=split(n)
    og=groups(op); ng=groups(np_)
    if ot: pass
    pool=[[l,tx,False] for l,tx in ng]
    abs_out=[]
    for lab,tx in og:
        best=None;br=0
        for c in pool:
            if c[2]: continue
            a=set(tok(tx)); b=set(tok(c[1]))
            if not a or not b: continue
            q=len(a&b)/max(len(a),len(b))
            if q<0.2 and c[0]!=lab: continue
            sg,r=diff(tx,c[1]); r=r+(0.15 if c[0]==lab else 0)
            if r>br: br=r;best=(c,sg)
        if best and br>=0.35:
            best[0][2]=True; sg=best[1]
            st='eq' if all(k==0 for k,_ in sg) else 'chg'
            abs_out.append({'l':lab,'st':st,'to':s+(' '+best[0][0] if best[0][0] else ''),'segs':sg})
        else: abs_out.append({'l':lab,'st':'del','segs':[[1,tx]]})
    ins=[{'l':c[0],'to':s,'segs':[[2,c[1]]]} for c in pool if not c[2]]
    def words(k): return sum(len(x.split()) for a in abs_out+ins for kk,x in a['segs'] if kk in k)
    tot=words((0,1,2)) or 1; frac=words((1,2))/tot
    oldw=sum(len(x.split()) for a in abs_out for kk,x in a['segs'] if kk in (0,1)) or 1
    delw=sum(len(x.split()) for a in abs_out for kk,x in a['segs'] if kk==1)
    hv=delw/oldw>=0.6
    st='same' if (frac<0.001 and not ins) else 'changed'
    res.append({'n':s,'t':ot or '','hv':hv,'st':st,'to':[s],'abs':abs_out,'ins':ins,'c':[],'_nt':nt})
    if nt: newTitles[s]=nt
# bisher aufgehobene/weggefallene Paragrafen (50, 64c) sind erst durch das BRUBEG gefüllt: kein Vorgänger
GONEOLD=[r['n'] for r in res if re.search(r'weggefallen|aufgehoben',r['t'])]
res=[r for r in res if r['n'] not in GONEOLD]
NEU=NEU+GONEOLD
byn={r['n']:r for r in res}
# fehlende Titel (Seiten ohne Überschriftszeile) aus der Chronologie des Paragrafen nachtragen
tt=json.load(open(here+'/../lib/comparisons/crr3.titles.json')) if os.path.exists(here+'/../lib/comparisons/crr3.titles.json') else {}
for r in res:
    if not r['t']: r['t']=tt.get(r['n'],{}).get('old','')
    if r['n'] in tt and tt[r['n']].get('new'): newTitles[r['n']]=tt[r['n']]['new']
    r.pop('_nt')
for k,v in ntitle.items():
    if k in NEU or k not in newTitles: newTitles[k]=v
# Kommentare anhängen
rows=json.load(open(here+'/../lib/comparisons/crr3.json'))
def nums(ref):
    return [x for x in re.findall(r'§§? ?(\d+[a-z]*)',(ref or '').split('KWG')[0])]
orphan=[]
for r in rows:
    o=[x for x in nums(r.get('oldRef')) if x in byn]
    if o: byn[o[0]]['c'].append(r); continue
    nn=nums(r.get('newRef')); r['_new']=nn[0] if nn else None; orphan.append(r)
neu=[]
for nn in sorted(NEU,key=natkey):
    cs=[r for r in orphan if r.get('_new')==nn]
    neu.append({'n':nn,'t':newTitles.get(nn,''),'c':cs})
placed={id(r) for e in neu for r in e['c']}
rest=[r for r in orphan if id(r) not in placed]
for e in neu:
    for r in e['c']: r.pop('_new',None)
for r in rest: r.pop('_new',None)
out={'old':res,'neu':neu,'rest':rest,'newTitles':newTitles}
os.makedirs(here+'/../public/cmp',exist_ok=True)
json.dump(out,open(here+'/../public/cmp/crr3.json','w'),ensure_ascii=False,separators=(',',':'))
print(collections.Counter(r['st'] for r in res),len(neu),'neu-only,',len(rest),'rest',os.path.getsize(here+'/../public/cmp/crr3.json')//1024,'KB')
