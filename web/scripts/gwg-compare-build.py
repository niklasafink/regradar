"""Baut web/public/cmp/gwg-gwbg.json: heutiges GwG Paragraf für Paragraf, je Absatz mit
Wortvergleich gegen das zugeordnete GwBG-E, dazu die redaktionellen Kommentare
(web/lib/comparisons/gwg-gwbg.json). Aufruf: python3 -I scripts/gwg-compare-build.py"""
import re,os,json,difflib,importlib.util
here=os.path.dirname(os.path.abspath(__file__))
spec=importlib.util.spec_from_file_location('p',here+'/gwg-compare-parse.py'); p=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
D=p.D
natkey=lambda x:(int(re.sub(r'\D','',x)),x)

new=p.parse_new(); old=p.parse_old()
for n in new.values(): n['text']=n['text'].replace('Verordnung EU)','Verordnung (EU)')

# --- Begründung: Zuordnung neu §  ->  alte §§ ---
t=open(D+'e.txt').read().split('\n')
b0=[i for i,l in enumerate(t) if l.startswith('B. Besonderer Teil')][0]
b1=[i for i,l in enumerate(t) if l.startswith('Zu Artikel 2 (')][0]
txt=[l for l in t[b0:b1] if 'Bearbeitungsstand' not in l and not re.fullmatch(r'\s*-\s*\d+\s*-\s*',l)]
txt='\n'.join(p.dehyph(txt))
cov={}   # alt -> [neu]
for b in re.split(r'\n(?=Zu § \d+[a-z]? \()',txt):
    h=re.match(r'Zu § (\d+[a-z]?) \(',b)
    if not h: continue
    n=h.group(1); body=re.sub(r'\s+',' ',b); refs=set()
    for mm in re.finditer(r'§§? ?(\d+[a-z]?)((?: (?:Absatz|Abs\.) \d+[a-z]?)?(?:(?: Satz| Nummer| Buchstabe) \d+[a-z]?)*)(?: in der Fassung[^.]{0,60})?,? (?:des )?(?:bisherigen )?(?:GwG|Geldwäschegesetzes)',body): refs.add(mm.group(1))
    for mm in re.finditer(r'bisherigen §§ ([\d a-z,und]+?) GwG',body):
        for x in re.findall(r'\d+[a-z]?',mm.group(1)): refs.add(x)
    for r in refs:
        if r in old: cov.setdefault(r,[]).append(n)
# Handkorrekturen: Bußgeldtatbestände nennen den alten § 56 in der Begründung nicht,
# § 122 zitiert § 56 nur als Übergang, § 59 (Übergang) geht in § 122 Abs. 2 auf.
cov['56']=['105','117','118','119','120']
cov['59']=['122']
for k in cov: cov[k]=sorted(set(cov[k]),key=natkey)

# --- Absätze ---
def fixold(s):
    s=re.sub(r'(^|\s)(\d{1,3})\.(?=[^\s\d])',r'\1\2. ',s)
    s=re.sub(r'(^|\s)([a-z]{1,2})\)(?=[^\s])',r'\1\2) ',s)
    return s
def old_abs(o):
    out=[]
    for ptxt in o['abs']:
        ptxt=fixold(ptxt)
        m=re.match(r'\((\d+[a-z]?)\)\s*(.*)',ptxt)
        if m or not out: out.append(['('+m.group(1)+')' if m else '',(m.group(2) if m else ptxt)])
        else: out[-1][1]+=' '+ptxt
    return out
tok=lambda s:re.findall(r'\S+\s*',s)
def norm(s): return re.sub(r'\s+',' ',s).strip()
def diff(a,b):
    A,B=tok(a),tok(b)
    sm=difflib.SequenceMatcher(None,[x.strip() for x in A],[x.strip() for x in B],autojunk=False)
    segs=[]
    def add(k,x):
        if not x: return
        if segs and segs[-1][0]==k: segs[-1][1]+=x
        else: segs.append([k,x])
    ops=sm.get_opcodes()
    # kurze Gleichläufe (<=2 Wörter) zwischen Änderungen zu del+ins verschmelzen
    for i,(tag,i1,i2,j1,j2) in enumerate(ops):
        if tag=='equal' and 0<i<len(ops)-1 and (i2-i1)<=2 and ops[i-1][0]!='equal' and ops[i+1][0]!='equal':
            ops[i]=('replace',i1,i2,j1,j2)
    for tag,i1,i2,j1,j2 in ops:
        if tag=='equal': add(0,''.join(A[i1:i2]))
        else:
            add(1,''.join(A[i1:i2])); add(2,''.join(B[j1:j2]))
    # Löschungen vor Einfügungen je Block ordnen
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

res=[];used_new=set()
for num in sorted(old,key=natkey):
    o=old[num]; tgt=cov.get(num,[])
    pool=[]  # (neu §, label, text)
    for nn in tgt:
        for lab,tx in p.split_abs(new[nn]['text']): pool.append([nn,lab,tx,False])
        used_new.add(nn)
    oa=old_abs(o); abs_out=[]; changed=False
    for lab,tx in oa:
        best=None;br=0
        for c in pool:
            if c[3]: continue
            # schneller Vorfilter
            a=set(tok(tx)); b=set(tok(c[2]))
            if not a or not b: continue
            q=len(a&b)/max(len(a),len(b))
            if q<0.25: continue
            sg,r=diff(tx,c[2])
            if r>br: br=r;best=(c,sg)
        if best and br>=0.35:
            best[0][3]=True
            sg=best[1]; st='eq' if all(k==0 for k,_ in sg) else 'chg'
            if st=='chg': changed=True
            abs_out.append({'l':lab,'st':st,'to':best[0][0]+(' '+best[0][1] if best[0][1] else ''),'segs':sg})
        else:
            changed=True
            abs_out.append({'l':lab,'st':'del','segs':[[1,tx]]})
    ins=[]
    if len(tgt)==1:
        for c in pool:
            if not c[3]: ins.append({'l':c[1],'to':c[0],'segs':[[2,c[2]]]}); changed=True
    def words(k): return sum(len(x.split()) for a in abs_out+ins for kk,x in a['segs'] if kk in k)
    tot=words((0,1,2)) or 1; frac=words((1,2))/tot
    oldw=sum(len(x.split()) for a in abs_out for kk,x in a['segs'] if kk in (0,1)) or 1
    delw=sum(len(x.split()) for a in abs_out for kk,x in a['segs'] if kk==1)
    # überwiegend gestrichen: wie ein wegfallender Paragraf behandeln (kleine Zeile statt Textwand)
    hv=bool(tgt) and delw/oldw>=0.6
    if not tgt: st='removed'
    elif frac<0.04 and not ins: st='same'
    else: st='changed'
    res.append({'n':num,'t':o['title'],'hv':hv,'st':st,'to':tgt,'abs':abs_out,'ins':ins,'c':[]})
byn={r['n']:r for r in res}

# --- Kommentare (redaktionelle Zeilen) anhängen ---
rows=json.load(open(here+'/../lib/comparisons/gwg-gwbg.json'))
def old_nums(ref):
    if not ref or 'GwG' not in ref: return []
    seg=ref.split('->')[0]
    out=[]
    for m in re.finditer(r'§§? ?(\d+[a-z]?)(?: bis (\d+[a-z]?))?',seg):
        a=m.group(1)
        if m.group(2):
            lo,hi=int(re.sub(r'\D','',a)),int(re.sub(r'\D','',m.group(2)))
            out+=[k for k in byn if lo<=int(re.sub(r'\D','',k))<=hi]
        else: out.append(a)
    # nur Bezüge auf GwG, KWG-Verweise ausschließen
    return [x for x in out if x in byn]
def new_nums(ref):
    if not ref or 'GwBG-E' not in ref: return []
    return re.findall(r'§§? ?(\d+[a-z]?)',ref.split(';')[0]) if ref else []
orphan=[]
for r in rows:
    olds=old_nums(r.get('oldRef'))
    if olds: 
        byn[olds[0]]['c'].append(r)
        continue
    nn=new_nums(r.get('newRef'))
    r['_new']=nn[0] if nn else None
    orphan.append(r)
neu=[]
for nn in sorted(new,key=natkey):
    if nn in used_new: continue
    cs=[r for r in orphan if r.get('_new')==nn]
    neu.append({'n':nn,'t':new[nn]['title'],'c':cs})
placed={id(r) for e in neu for r in e['c']}
rest=[r for r in orphan if id(r) not in placed]
for e in neu:
    for r in e['c']: r.pop('_new',None)
for r in rest: r.pop('_new',None)
out={'old':res,'neu':neu,'rest':rest,'newTitles':{k:v['title'] for k,v in new.items()}}
os.makedirs(here+'/../public/cmp',exist_ok=True)
json.dump(out,open(here+'/../public/cmp/gwg-gwbg.json','w'),ensure_ascii=False,separators=(',',':'))
import collections
print(collections.Counter(r['st'] for r in res),len(neu),'neu-only,',len(rest),'rest',os.path.getsize(here+'/../public/cmp/gwg-gwbg.json')//1024,'KB')
for r in res:
    if r['st']!='changed' or r['c']: print(r['n'],r['st'],r['to'],len(r['c']),end=' | ')
