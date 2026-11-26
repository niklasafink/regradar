"""Baut web/public/cmp/srep.json: SREP-Leitlinien EBA/GL/2022/03 (alt) gegen EBA/GL/2026/06 (neu), deutsche Fassungen.
Einheit = Abschnitt (z. B. 7.2) bzw. Titel ohne Unterabschnitte; Absätze = Textziffern (Tz). Zuordnung alt -> neu
über Textähnlichkeit (nicht Nummern). Nur Fließtext (Tabellen, Anhänge, Fußnoten entfallen).
Aufruf: ~/.cache/regradar-cmp/venv/bin/python -W ignore scripts/srep-compare-build.py"""
import fitz,re,os,unicodedata
C=os.path.expanduser('~/.cache/regradar-cmp/srep/')  # Quellen: old_de_tracked.pdf (EBA/GL/2022/03 DE), new_de.pdf (EBA/GL/2026/06 DE)
OLDT={1:'Gegenstand, Begriffsbestimmungen, Anwendungsebene und Umsetzung',2:'Der gemeinsame aufsichtliche Überprüfungs- und Bewertungsprozess (SREP)',3:'Überwachung der Schlüsselindikatoren',4:'Analyse des Geschäftsmodells',5:'Bewertung der internen Governance und der institutsweiten Kontrollen',6:'Bewertung der Kapitalrisiken',7:'SREP-Kapitalbewertung',8:'Bewertung der Liquiditäts- und Finanzierungsrisiken',9:'SREP-Liquiditätsbewertung',10:'SREP-Gesamtbewertung und Anwendung von Aufsichtsmaßnahmen',11:'Anwendung des SREP auf grenzüberschreitend tätige Gruppen',12:'Aufsichtliche Stresstests'}
NEWT={1:'Gegenstand, Anwendungsbereich, Begriffsbestimmungen und Umsetzung',2:'SREP-Rahmen',3:'Überwachung der Schlüsselindikatoren',4:'Analyse des Geschäftsmodells',5:'Bewertung der internen Governance und der institutsweiten Kontrollen',6:'Bewertung der Kapitalrisiken',7:'SREP-Kapitalbewertung',8:'Bewertung der Liquiditäts- und Refinanzierungsrisiken und SREP-Liquiditäts- und Refinanzierungsbewertung',9:'SREP-Gesamtbewertung und -Kommunikation',10:'Anwendung des SREP auf grenzüberschreitend tätige Gruppen',11:'Aufsichtliche Stresstests',12:'Bewertung von Zweigstellen aus Drittländern'}
def lines(pdf):
    d=fitz.open(C+pdf); out=[]
    for pn,p in enumerate(d):
        raw=[]
        for b in p.get_text('dict')['blocks']:
            for l in b.get('lines',[]):
                sp=[s for s in l['spans'] if not (s['flags']&1 and s['text'].strip().isdigit())]   # Fußnotenziffern (hochgestellt) entfallen
                if not any(s['text'].strip() for s in sp): continue
                sp=[s for s in sp if s['text'].strip()]+[]
                txt=''.join(s['text'] for s in l['spans'] if not (s['flags']&1 and s['text'].strip().isdigit()))
                raw.append((l['bbox'][0],sp[0]['origin'][1],max(s['size'] for s in sp),all('Bold' in s['font'] for s in sp),txt))
        raw.sort(key=lambda r:(r[1],r[0]))
        rows=[]
        for r in raw:
            if rows and abs(rows[-1][0]-r[1])<=2.5: rows[-1][1].append(r)
            else: rows.append([r[1],[r]])
        for y,rs in rows:
            rs.sort(key=lambda r:r[0])
            out.append(dict(p=pn+1,y=y,x=rs[0][0],sz=max(r[2] for r in rs),t=' '.join(r[4].strip() for r in rs).strip()))
    return out
def fixhyph(t):
    """Die Textebene der PDFs verliert den Bindestrich bei Zeilenumbruch in 'Liquiditäts- und' (steht dann als 'Liquiditätsund')."""
    def f(m):
        w=m.group(0); left,conj=w[:-3],'und'
        if w.endswith('oder'): left,conj=w[:-4],'oder'
        if len(left)<3 or re.search(r'(gr|f|b|st)$',left) and conj=='und' and w.lower().endswith(('grund','fund','bund','stund')): return w
        return left+'- '+conj
    return re.sub(r'\b[A-Za-zÄÖÜäöüß]{3,}(?:und|oder)\b',lambda m: m.group(0) if m.group(0).lower().endswith(('grund','fund','bund','stund','kund','mund')) else f(m),t)
def clean(s):
    s=unicodedata.normalize('NFKC',s)
    s=re.sub(r'[•►‣]\s*','• ',s)
    return re.sub(r'\s+',' ',s).strip()
def parse(pdf,new):
    TT=NEWT if new else OLDT
    units=[]; cur=None; last=0; titel=0; skipping=False
    def nu(n,t): 
        nonlocal cur
        cur={'n':n,'t':re.sub(r'(?<=\w)- (?=[A-ZÄÖÜ])','-',t).rstrip(';').strip(),'titel':titel,'tz':[]}; units.append(cur)
    for l in lines(pdf):
        if l['y']<60 or l['y']>785 or l['sz']<10.9: continue
        t=l['t']
        if l['sz']>=24:
            m=re.match(r'(?:\d+\.\s+)?Titel\s+(\d+)\b',t)
            if m:
                titel=int(m.group(1)); nu(str(titel),'Titel %d: %s'%(titel,TT[titel]))
                if titel==1: last=0 if new else 4
                skipping=False
            elif re.match(r'(Anhänge?|\d*\.?\s*Anhang)',t): nu('Anhänge','Anhänge'); skipping=True
            elif t.startswith('Einhaltung'): skipping=True
            continue
        if skipping: continue
        if l['sz']>=15.9:
            m=re.match(r'(\d+\.\d+)\.?\s+(.*)',t)
            if m and int(m.group(1).split('.')[0])==titel: nu(m.group(1),clean(m.group(2)),) ; cur['open']=1; continue
            if re.match(r'Anhang',t): nu('Anhänge','Anhänge'); skipping=True; continue
            if cur and cur.get('open') and not cur['tz'] and l['sz']>=15.9 and not re.match(r'\d',t): cur['t']=clean(cur['t']+' '+t); continue
            if cur: cur['open']=0
            continue
        if l['sz']>=11.9:
            if cur: cur['open']=0
            continue
        if cur is None: continue
        cur['open']=0
        m=re.match(r'^(\d{1,3})\.\s*(\S.*)$',t) if l['x']<125 else None
        if m and int(m.group(1))==last+1:
            last+=1; cur['tz'].append({'n':last,'text':m.group(2)})
        elif cur['tz']: cur['tz'][-1]['text']+=' '+t
    # Titel 1 zusammenfassen nicht nötig (Unterabschnitte tragen keine eigene Einheit)
    out=[]
    for u in units:
        if not u['tz'] and u['n']!='Anhänge': continue
        for z in u['tz']: z['text']=fixhyph(clean(re.sub(r'(?<=[a-zäöüß])- (?=(?!(?:und|oder|bzw)\b)[a-zäöüß])','',z['text'])))
        out.append(u)
    return out

# ---------------------------------------------------------------- Zuordnung
import json,difflib,collections
here=os.path.dirname(os.path.abspath(__file__))
OLD=parse('old_de_tracked.pdf',0); NEW=parse('new_de.pdf',1)
OLD=[u for u in OLD if u['tz']]; NEW=[u for u in NEW if u['tz']]
oz=[(u['n'],z) for u in OLD for z in u['tz']]; nz=[(u['n'],z) for u in NEW for z in u['tz']]
tok=lambda s:re.findall(r'\S+\s*',s)
def words(s): return [w for w in re.findall(r'[\wäöüÄÖÜß]+',s.lower()) if len(w)>2]
# Titelzuordnung alt -> neu (inhaltlich, aus den Gliederungen)
AFF={1:{1},2:{2},3:{3},4:{4},5:{5,6},6:{6},7:{7},8:{8},9:{8},10:{9},11:{10},12:{11}}
tit=lambda n:int(n.split('.')[0])
def diff(a,b):
    A,B=tok(a+' '),tok(b+' ')
    sm=difflib.SequenceMatcher(None,[x.strip() for x in A],[x.strip() for x in B],autojunk=False)
    segs=[]
    def add(k,x):
        if not x: return
        if segs and segs[-1][0]==k: segs[-1][1]+=x
        else: segs.append([k,x])
    ops=sm.get_opcodes()
    for i,(tag,i1,i2,j1,j2) in enumerate(ops):
        if tag=='equal' and 0<i<len(ops)-1 and (i2-i1)<=2 and ops[i-1][0]!='equal' and ops[i+1][0]!='equal': ops[i]=('replace',i1,i2,j1,j2)
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
    if out: out[-1][1]=out[-1][1].rstrip()
    return out,sm.ratio()
ow=[set(words(z['text'])) for _,z in oz]; nw=[set(words(z['text'])) for _,z in nz]
inv=collections.defaultdict(set)
for j,s in enumerate(nw):
    for w in s: inv[w].add(j)
def recall(sg):
    o=sum(len(x.split()) for k,x in sg if k in (0,1)) or 1
    return sum(len(x.split()) for k,x in sg if k==0)/o
cand=[]
for i,s in enumerate(ow):
    if not s: continue
    cnt=collections.Counter()
    for w in s:
        if len(inv[w])<150:
            for j in inv[w]: cnt[j]+=1
    for j,c in cnt.most_common(12):
        if c/len(s)<0.25 and c/max(1,len(nw[j]))<0.3: continue
        sg,r=diff(oz[i][1]['text'],nz[j][1]['text'])
        aff=0.08 if int(nz[j][0].split('.')[0]) in AFF.get(tit(oz[i][0]),set()) else 0
        cand.append((r+aff,r,i,j,sg))
cand.sort(key=lambda c:-c[0])
mi={};mj={}
for sc,r,i,j,sg in cand:
    if i in mi or j in mj or r<0.25: continue
    if r<0.4 and sc==r: continue   # schwache Treffer nur im passenden Titel
    mi[i]=(j,sg,r,'1:1'); mj[j]=i
# Zusammenführungen: alter Absatz steckt weitgehend in einem schon vergebenen neuen Absatz
merged={}
for sc,r,i,j,sg in sorted(cand,key=lambda c:-recall(c[4])):
    if i in mi: continue
    rc=recall(sg)
    if rc<0.6 or sum(len(x.split()) for k,x in sg if k==0)<8: continue
    if int(nz[j][0].split('.')[0]) not in AFF.get(tit(oz[i][0]),set()) and rc<0.8: continue
    mi[i]=(j,[s_ for s_ in sg if s_[0]!=2],rc,'merge')
# Dritte Runde: umformulierte Absätze innerhalb einander zugeordneter Abschnitte (Überschriften, nicht Nummern)
UM={'4.2':['4.2'],'4.3':['4.2'],'4.4':['4.3'],'4.5':['4.3'],'4.6':['4.3'],'4.7':['4.4'],'4.8':['4.4'],'4.9':['4.3'],'4.10':['4.5'],
 '5.2':['5.1','5.2'],'5.3':['5.2'],'5.4':['5.3'],'5.5':['5.4'],'5.6':['5.5'],'5.7':['5.6'],'5.8':['5.7'],'5.9':['5.8'],'5.10':['5.9'],'5.11':['5.1'],'5.12':['5.10'],
 '7.6':['7.5','7.2'],'7.7':['7.6'],'7.8':['7.7'],'8.5':['8.5'],
 '9.1':['8.1'],'9.2':['8.2','8.5'],'9.3':['8.6','8.5'],'9.4':['8.6'],'9.5':['8.6'],'9.6':['8.5'],
 '10.1':['9.1'],'10.2':['9.2'],'10.5':['9.3','9.4'],'10.6':['9.4'],'10.7':['9.5'],'10.8':['9.6'],'10.9':['9.7'],'10.10':['9.8'],'12.4':['11.3']}
for k in ('2.1','2.2','2.3','2.4','3','4.1','5.1','6.1','6.2','6.3','6.4','6.5','7.1','7.2','7.3','7.4','7.5','8.1','8.2','8.3','8.4','11.1','11.2','11.3','11.4','12.1','12.2','12.3'): UM.setdefault(k,[k])
UM['11.1']=['10.1'];UM['11.2']=['10.2'];UM['11.3']=['10.3'];UM['11.4']=['10.4'];UM['11']=['10'];UM['12.1']=['11.1'];UM['12.2']=['11.2'];UM['12.3']=['11.3']
UM['1']=['1']
weak=[]
for i,(un,z) in enumerate(oz):
    if i in mi: continue
    for j,(nun,nzz) in enumerate(nz):
        if j in mj or nun not in UM.get(un,[]): continue
        if len(ow[i]&nw[j])<3: continue
        sg,r=diff(z['text'],nzz['text'])
        if r>=0.12: weak.append((r,i,j,sg))
weak.sort(key=lambda c:-c[0])
for r,i,j,sg in weak:
    if i in mi or j in mj: continue
    mi[i]=(j,sg,r,'1:1'); mj[j]=i
# alt-Einheiten
byu=collections.OrderedDict((u['n'],{'u':u,'abs':[],'to':[]}) for u in OLD)
tzu={}
for i,(un,z) in enumerate(oz): tzu[i]=un
newunit_of={j:nz[j][0] for j in range(len(nz))}
res=[];used_newu=set()
for u in OLD:
    out=[];to=[];changed=False
    for z in u['tz']:
        i=[k for k,(un,zz) in enumerate(oz) if zz is z][0]
        lab='Tz. %d'%z['n']
        if i in mi:
            j,sg,r,kind=mi[i]; nu_=nz[j][0]
            st='eq' if all(k==0 for k,_ in sg) else 'chg'
            if st=='chg': changed=True
            out.append({'l':lab,'st':st,'to':'%s Tz. %d'%(nu_,nz[j][1]['n']),'segs':sg})
            if nu_ not in to: to.append(nu_)
        else:
            changed=True; out.append({'l':lab,'st':'del','segs':[[1,z['text']]]})
    res.append({'n':u['n'],'t':u['t'],'hv':False,'st':'changed','to':to,'abs':out,'ins':[],'c':[]})
byn={r['n']:r for r in res}
# nicht zugeordnete neue Tz: an die alte Einheit hängen, aus der die meisten Tz derselben neuen Einheit stammen
anchor={}
for nun in {nz[j][0] for j in range(len(nz))}:
    c=collections.Counter(tzu[mj[j]] for j in range(len(nz)) if nz[j][0]==nun and j in mj)
    anchor[nun]=c.most_common(1)[0][0] if c else None
newonly=collections.OrderedDict()
for j,(nun,z) in enumerate(nz):
    if j in mj: continue
    a=anchor[nun]
    if a is None: newonly.setdefault(nun,[]).append(z); continue
    byn[a]['ins'].append({'l':'Tz. %d'%z['n'],'to':nun,'segs':[[2,z['text']]]})
    if nun not in byn[a]['to']: byn[a]['to'].append(nun)
natkey=lambda x:[int(p) for p in x.split('.')]
for r in res:
    r['to']=sorted(set(r['to']),key=natkey)
    def w(k): return sum(len(x.split()) for a in r['abs']+r['ins'] for kk,x in a['segs'] if kk in k)
    tot=w((0,1,2)) or 1; frac=w((1,2))/tot
    oldw=sum(len(x.split()) for a in r['abs'] for kk,x in a['segs'] if kk in (0,1)) or 1
    delw=sum(len(x.split()) for a in r['abs'] for kk,x in a['segs'] if kk==1)
    r['hv']=bool(r['to']) and delw/oldw>=0.6
    if not r['to']: r['st']='removed'
    elif frac<0.02 and not r['ins']: r['st']='same'
    else: r['st']='changed'

# ---------------------------------------------------------------- Kommentare anhängen
def unit_of(ref):
    m=re.match(r'Abschnitt ([\d.]+?)[,;]',(ref or '')+',')
    return m.group(1) if m else None
cf=here+'/../lib/comparisons/srep.json'
rows=json.load(open(cf)) if os.path.exists(cf) else []
newtitles={u['n']:u['t'] for u in NEW}
used_new={nz[j][0] for j in mj}
orphan=[]
for r in rows:
    o=unit_of(r.get('oldRef'))
    if o and o in byn: byn[o]['c'].append(r)
    else: orphan.append(r)
neu=[];placed=set()
for nun in sorted({u['n'] for u in NEW},key=natkey):
    if anchor.get(nun) is not None: continue
    cs=[r for r in orphan if unit_of(r.get('newRef'))==nun]
    placed|={id(r) for r in cs}
    neu.append({'n':nun,'t':newtitles[nun],'c':cs})
rest=[]
for r in orphan:
    if id(r) in placed: continue
    a=anchor.get(unit_of(r.get('newRef')))
    if a: byn[a]['c'].append(r)
    else: rest.append(r)
out={'old':res,'neu':neu,'rest':rest,'newTitles':newtitles}
os.makedirs(here+'/../public/cmp',exist_ok=True)
json.dump(out,open(here+'/../public/cmp/srep.json','w'),ensure_ascii=False,separators=(',',':'))
if __name__=='__main__':
    print(collections.Counter(r['st'] for r in res),len(neu),'neu-only,',len(rest),'rest',os.path.getsize(here+'/../public/cmp/srep.json')//1024,'KB')
    print('1:1',sum(1 for v in mi.values() if v[3]=='1:1'),'merge',sum(1 for v in mi.values() if v[3]=='merge'),'von',len(oz),'alt /',len(nz),'neu; unmatched new',len(nz)-len(mj))
