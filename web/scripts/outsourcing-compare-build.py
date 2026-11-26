"""Baut web/public/cmp/outsourcing.json: EBA/GL/2019/02 (alt) Abschnitt fuer Abschnitt, je Tz mit Wortvergleich
gegen die per Textaehnlichkeit zugeordnete Tz der EBA/GL/2026/09 (neu), dazu Kommentare aus
web/lib/comparisons/outsourcing.json. Quelle: ~/.cache/regradar-cmp/outsourcing (Text englisch).
Aufruf: python3 -I scripts/outsourcing-compare-build.py"""
import re,os,json,difflib,importlib.util,collections
here=os.path.dirname(os.path.abspath(__file__))
spec=importlib.util.spec_from_file_location('p',here+'/outsourcing-compare-parse.py'); p=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)

OT={'1':('I','Verhältnismäßigkeit'),'2':('I','Gruppen und Institutssicherungssysteme'),'3':('II','Begriff der Auslagerung'),
 '4':('II','Kritische oder wichtige Funktionen'),'5':('III','Governance und Drittparteienrisiko'),'6':('III','Governance und Auslagerung'),
 '7':('III','Auslagerungsrichtlinie'),'8':('III','Interessenkonflikte'),'9':('III','Notfallplanung'),'10':('III','Interne Revision'),
 '11':('III','Dokumentation und Register'),'12':('IV','Analyse vor der Auslagerung'),'13':('IV','Vertragsphase'),
 '14':('IV','Überwachung ausgelagerter Funktionen'),'15':('IV','Ausstiegsstrategien'),'V':('V','Aufsichtsbehörden'),'A2':('','Gegenstand und Anwendungsbereich'),'A3':('','Umsetzung und Übergangsfrist')}
NT={'1':('I','Verhältnismäßigkeit'),'2':('I','Gruppen und Institutssicherungssysteme'),'3':('II','Management von Drittparteienrisiken'),
 '4':('II','Kritische oder wichtige Funktionen'),'5':('III','Governance und Drittparteienrisiko'),'6':('III','Richtlinie zu Drittparteienvereinbarungen'),
 '7':('III','Interessenkonflikte'),'8':('III','Notfallplanung'),'9':('III','Interne Revision'),'10':('III','Dokumentation und Register'),
 '11':('IV','Analyse vor Vertragsschluss'),'12':('IV','Vertragsphase'),'13':('IV','Überwachung'),'14':('IV','Ausstiegsstrategien'),'V':('V','Aufsichtsbehörden'),'A2':('','Gegenstand und Anwendungsbereich'),'A3':('','Umsetzung und Übergangsfrist')}
def unit(map_,i):
    t,_=map_[i]
    if i[0]=='A': return 'Abschnitt '+i[1:]
    return f'Titel {t}, {i}' if i!='V' else 'Titel V'

tok=lambda s:re.findall(r'\S+\s*',s)
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

O=p.parse_front('old.txt',None)+p.old(); N=p.parse_front('final.txt',None)+p.new()
osec={s['id']:s for s in O}; nsec={s['id']:s for s in N}
opara={n:(s['id'],t) for s in O for n,t in s['paras']}
npara={n:(s['id'],t) for s in N for n,t in s['paras']}
# --- Zuordnung Tz alt -> Tz neu nach Textaehnlichkeit (gierig, eins zu eins, Schwelle) ---
cand=[]
for on,(oi,ot) in opara.items():
    a=set(w.strip() for w in tok(ot))
    for nn,(ni,nt) in npara.items():
        b=set(w.strip() for w in tok(nt))
        if not a or not b: continue
        q=len(a&b)/max(len(a),len(b))
        if q<0.30: continue
        # Vorzeichen: Nachbarschaft belohnt (Reihenfolge)
        cand.append((q,on,nn))
cand.sort(reverse=True)
pairs={}; usedn=set()
scored=[]
for q,on,nn in cand[:6000]:
    sg,r=diff(opara[on][1],npara[nn][1]); scored.append((r,on,nn,sg))
scored.sort(key=lambda x:-x[0])
for r,on,nn,sg in scored:
    if on in pairs or nn in usedn or r<0.40: continue
    pairs[on]=(nn,sg,r); usedn.add(nn)
# manuelle Korrekturen aus der Sichtprobe
FIX=json.load(open(here+'/outsourcing-fix.json')) if os.path.exists(here+'/outsourcing-fix.json') else {}
for k,v in FIX.get('map',{}).items():
    k=int(k)
    if k in pairs: usedn.discard(pairs[k][0]); del pairs[k]
    if v is not None:
        v=int(v); 
        for kk in [x for x,y in pairs.items() if y[0]==v]: del pairs[kk]
        sg,r=diff(opara[k][1],npara[v][1]); pairs[k]=(v,sg,r); usedn.add(v)
usedn={y[0] for y in pairs.values()}
# --- Einheiten ---
res=[]; insby=collections.defaultdict(list)
# neue, nicht zugeordnete Tz einem alten Abschnitt zuordnen: der Abschnitt, auf den die zugeordneten Tz des gleichen neuen Abschnitts zeigen
ncount=collections.defaultdict(collections.Counter)
for on,(nn,sg,r) in pairs.items(): ncount[npara[nn][0]][opara[on][0]]+=1
for nn,(ni,nt) in npara.items():
    if nn in usedn: continue
    c=ncount.get(ni)
    if c: insby[c.most_common(1)[0][0]].append(nn)
used_new_sec=set()
for oid in [s['id'] for s in O]:
    s=osec[oid]; abs_out=[]; tgt=[]; changed=False
    for on,ot in s['paras']:
        if on in pairs:
            nn,sg,r=pairs[on]; sid=npara[nn][0]
            if unit(NT,sid) not in tgt: tgt.append(unit(NT,sid))
            st='eq' if all(k==0 for k,_ in sg) else 'chg'
            if st=='chg': changed=True
            abs_out.append({'l':f'Tz. {on}','st':st,'to':f'Tz. {nn}','segs':sg})
        else:
            changed=True; e={'l':f'Tz. {on}','st':'del','segs':[[1,ot]]}
            mv=FIX.get('moved',{}).get(str(on))
            if mv:
                e['to']=f'Tz. {mv}'
                if unit(NT,npara[mv][0]) not in tgt: tgt.append(unit(NT,npara[mv][0]))
            abs_out.append(e)
    ins=[{'l':f'Tz. {nn}','to':unit(NT,npara[nn][0]),'segs':[[2,npara[nn][1]]]} for nn in sorted(insby.get(oid,[]))]
    if ins: changed=True
    def words(k): return sum(len(x.split()) for a in abs_out+ins for kk,x in a['segs'] if kk in k)
    tot=words((0,1,2)) or 1; frac=words((1,2))/tot
    oldw=sum(len(x.split()) for a in abs_out for kk,x in a['segs'] if kk in (0,1)) or 1
    delw=sum(len(x.split()) for a in abs_out for kk,x in a['segs'] if kk==1)
    hv=bool(tgt) and delw/oldw>=0.6
    st='removed' if not tgt else ('same' if frac<0.02 and not ins else 'changed')
    res.append({'n':unit(OT,oid),'t':OT[oid][1],'hv':hv,'st':st,'to':tgt,'abs':abs_out,'ins':ins,'c':[]})
    for t in tgt: used_new_sec.add(t)
byn={r['n']:r for r in res}
# --- Kommentare ---
cf=here+'/../lib/comparisons/outsourcing.json'
rows=json.load(open(cf)) if os.path.exists(cf) else []
def old_unit(ref):
    if not ref: return None
    m=re.search(r'Tz\. ?(\d+)',ref)
    if m and int(m.group(1)) in opara: return unit(OT,opara[int(m.group(1))][0])
    return None
def new_unit(ref):
    if not ref: return None
    m=re.search(r'Tz\. ?(\d+)',ref)
    if m and int(m.group(1)) in npara: return unit(NT,npara[int(m.group(1))][0])
    return None
orphan=[]
for r in rows:
    a=r.pop('anchor',None)
    ou=old_unit(r.get('oldRef')) or (unit(OT,opara[a][0]) if a else None)
    if ou: byn[ou]['c'].append(r)
    else: orphan.append(r)
neu=[]
for sid in nsec:
    u=unit(NT,sid)
    if u in used_new_sec: continue
    neu.append({'n':u,'t':NT[sid][1],'c':[r for r in orphan if new_unit(r.get('newRef'))==u]})
placed={id(r) for e in neu for r in e['c']}
rest=[r for r in orphan if id(r) not in placed]
# Pruefung: Segmente 0+1 = alter Text, 0+2 = neuer Text (bis auf Whitespace)
W=lambda x:re.sub(r'\s+',' ',x).strip()
bad=0
for r in res:
    sec=osec[[k for k,v in OT.items() if unit(OT,k)==r['n']][0]]
    ot={n:t for n,t in sec['paras']}
    for a in r['abs']:
        n=int(a['l'][4:]); old_=W(''.join(x for k,x in a['segs'] if k in (0,1)))
        if old_!=W(ot[n]): bad+=1; print('ALT-FEHLER',r['n'],a['l'])
        if a['st']!='del':
            nn=int(a['to'][4:]); 
            if W(''.join(x for k,x in a['segs'] if k in (0,2)))!=W(npara[nn][1]): bad+=1; print('NEU-FEHLER',r['n'],a['l'])
    for a in r['ins']:
        nn=int(a['l'][4:])
        if W(a['segs'][0][1])!=W(npara[nn][1]): bad+=1; print('INS-FEHLER',a['l'])
print('Pruefung Rekonstruktion: Fehler =',bad)
out={'old':res,'neu':neu,'rest':rest,'newTitles':{unit(NT,k):NT[k][1] for k in nsec}}
os.makedirs(here+'/../public/cmp',exist_ok=True)
json.dump(out,open(here+'/../public/cmp/outsourcing.json','w'),ensure_ascii=False,separators=(',',':'))
if __name__=='__main__':
    print(collections.Counter(r['st'] for r in res),len(neu),'neu-only,',len(rest),'rest')
    print('Tz alt zugeordnet',len(pairs),'/',len(opara),'; neu zugeordnet',len(usedn),'/',len(npara))
    for r in res: print(r['n'],r['st'],r['to'],len(r['abs']),len(r['ins']),'hv' if r['hv'] else '',len(r['c']))
