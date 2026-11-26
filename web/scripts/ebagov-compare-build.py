"""Baut web/public/cmp/ebagov.json: die EBA-Leitlinien zur internen Governance (EBA/GL/2021/05) Einheit für
Einheit gegen die überarbeitete Fassung (EBA/GL/2026/10), je Tz mit Wortvergleich, dazu die redaktionellen
Kommentare (web/lib/comparisons/ebagov.json). Beide Texte englisch (neue Fassung nur englisch abrufbar).
Aufruf: ~/.cache/regradar-cmp/venv/bin/python -W ignore scripts/ebagov-compare-build.py"""
import re,os,json,difflib,importlib.util,collections
here=os.path.dirname(os.path.abspath(__file__))
spec=importlib.util.spec_from_file_location('p',here+'/ebagov-compare-parse.py'); p=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)

DE={ # Anzeigetitel je Abschnitt (deutsch, kurz)
 'I':'Verhältnismäßigkeit',
 'II 1':'Rolle und Verantwortung des Leitungsorgans','II 2':'Managementfunktion des Leitungsorgans',
 'II 3':'Aufsichtsfunktion des Leitungsorgans','II 4':'Rolle des Vorsitzenden des Leitungsorgans',
 'II 5.1':'Einrichtung von Ausschüssen','II 5.2':'Zusammensetzung der Ausschüsse','II 5.3':'Arbeitsweise der Ausschüsse',
 'II 5.4':'Risikoausschuss','II 5.5':'Prüfungsausschuss','II 5.6':'Kombinierte Ausschüsse',
 'III 6.1':'Organisationsrahmen','III 6.2':'Kenntnis der eigenen Struktur',
 'III 6.3':'Komplexe Strukturen und nicht standardisierte oder intransparente Geschäfte',
 'III 7':'Organisationsrahmen im Konzern','III 7.1':'Anwendung im Konzern',
 'III 7.2':'Interne Governance von Drittlandzweigstellen','III 8':'Auslagerungsrichtlinie',
 'IV 8':'Risikokultur','IV 9':'Unternehmenswerte und Verhaltenskodex','IV 10':'Interessenkonflikte auf Institutsebene',
 'IV 11':'Interessenkonflikte beim Personal','IV 11.1':'Interessenkonflikte bei Krediten und Geschäften mit Mitgliedern des Leitungsorgans',
 'IV 11.2':'Dokumentation von Krediten an Mitglieder des Leitungsorgans','IV 12':'Interne Meldeverfahren','IV 13':'Meldung von Verstößen an die Aufsicht',
 'V 14':'Internes Kontrollrahmenwerk','V 15':'Umsetzung des internen Kontrollrahmenwerks','V 16':'Risikomanagementrahmen',
 'V 17':'Neue Produkte und wesentliche Änderungen','V 18':'Interne Kontrollfunktionen','V 18.1':'Leiter der internen Kontrollfunktionen',
 'V 18.2':'Unabhängigkeit der internen Kontrollfunktionen','V 18.3':'Kombination interner Kontrollfunktionen','V 18.4':'Ressourcen der internen Kontrollfunktionen',
 'V 19':'Risikomanagementfunktion','V 19.1':'Rolle bei Risikostrategie und Entscheidungen','V 19.2':'Rolle bei wesentlichen Änderungen',
 'V 19.3':'Rolle bei Identifizierung, Messung, Steuerung und Meldung von Risiken','V 19.4':'Rolle bei nicht genehmigten Risikopositionen',
 'V 19.5':'Leiter der Risikomanagementfunktion','V 20':'Compliance-Funktion','V 21':'Interne Revision',
 'VI':'Fortführung des Geschäftsbetriebs (Business Continuity)','VII':'Transparenz',
}
OLDKEY={}   # alt: Abschnittsnummern der alten Fassung (anders nummeriert)
# alt 9..14 -> IV (Risikokultur ... Meldung), 12/12.1/12.2 -> 11 ..., 15.. -> V, 19.x -> 18.x, 20.x -> 19.x, 21 Compliance, 22 Revision
OLD_T={'I':'I','II 1':'II 1','II 2':'II 2','II 3':'II 3','II 4':'II 4','II 5.1':'II 5.1','II 5.2':'II 5.2','II 5.3':'II 5.3','II 5.4':'II 5.4','II 5.5':'II 5.5','II 5.6':'II 5.6',
 'III 6.1':'III 6.1','III 6.2':'III 6.2','III 6.3':'III 6.3','III 7':'III 7','III 8':'III 8',
 'IV 9':'IV 8','IV 10':'IV 9','IV 11':'IV 10','IV 12':'IV 11','IV 12.1':'IV 11.1','IV 12.2':'IV 11.2','IV 13':'IV 12','IV 14':'IV 13',
 'V 15':'V 14','V 16':'V 15','V 17':'V 16','V 18':'V 17','V 19':'V 18','V 19.1':'V 18.1','V 19.2':'V 18.2','V 19.3':'V 18.3','V 19.4':'V 18.4',
 'V 20':'V 19','V 20.1':'V 19.1','V 20.2':'V 19.2','V 20.3':'V 19.3','V 20.4':'V 19.4','V 20.5':'V 19.5','V 21':'V 20','V 22':'V 21','VI':'VI','VII':'VII'}
def ukey(u): return u['title']+(' '+u['sec'] if u['sec'] else '')
def disp(k): # 'IV 11.1' -> 'Titel IV, 11.1'
    t,_,s=k.partition(' '); return 'Titel '+t+(', '+s if s else '')
def dekey_old(k): return DE[OLD_T[k]] if k!='III 7' and k!='III 8' else DE[k]

def load(pdf):
    us=[u for u in p.build(pdf) if u['paras']]
    return us
old=load('old_orig.pdf'); new=load('final.pdf')
for u in old: u['k']=ukey(u)
for u in new: u['k']=ukey(u)
newpar=[]; 
for u in new:
    for q in u['paras']: newpar.append((u['k'],q['num'],q['text']))
oldpar=[]
for u in old:
    for q in u['paras']: oldpar.append((u['k'],q['num'],q['text']))

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

# --- Zuordnung alt Tz -> neu Tz über Textähnlichkeit (global, eins zu eins, gierig) ---
words=lambda s:set(re.findall(r'[a-z0-9]+',s.lower()))
cand=[]
for i,(ok,on,ot) in enumerate(oldpar):
    a=words(ot)
    sc=[]
    for j,(nk,nn,nt) in enumerate(newpar):
        b=words(nt)
        if not a or not b: continue
        q=len(a&b)/max(len(a),len(b))
        if q>=0.25: sc.append((q,j))
    sc.sort(reverse=True)
    for q,j in sc[:6]:
        sg,r=diff(ot,newpar[j][2])
        # Nähe in der Reihenfolge leicht bevorzugen (gegen Verwechslung ähnlicher Tz)
        rel=abs((i/len(oldpar))-(j/len(newpar)))
        cand.append((r-0.15*rel,r,i,j,sg))
cand.sort(reverse=True)
match={}; usedn=set()
for s,r,i,j,sg in cand:
    if i in match or j in usedn or r<0.35: continue
    match[i]=(j,sg,r); usedn.add(j)

# zweiter Durchgang: ungepaarte alte Tz mit ungepaarten neuen Tz derselben (umnummerierten) Einheit, schwächere Schwelle
for i,(ok,on,ot) in enumerate(oldpar):
    if i in match or ok in ('III 8',): continue
    tk=OLD_T.get(ok,ok); best=None
    for j,(nk,nn,nt) in enumerate(newpar):
        if j in usedn or nk!=tk: continue
        sg,r=diff(ot,nt)
        if r>=0.2 and (not best or r>best[1]): best=(j,r,sg)
    if best: match[i]=(best[0],best[2],best[1]); usedn.add(best[0])

# dritter Durchgang: eine neue Tz fasst mehrere alte zusammen -> passenden Ausschnitt der neuen Tz vergleichen
partial={}
for i,(ok,on,ot) in enumerate(oldpar):
    if i in match or ok=='III 8': continue
    A=[x.strip() for x in tok(ot)]; best=None
    for j,(nk,nn,nt) in enumerate(newpar):
        B=[x.strip() for x in tok(nt)]
        sm=difflib.SequenceMatcher(None,A,B,autojunk=False)
        bl=[b for b in sm.get_matching_blocks() if b.size>=3]
        cov=sum(b.size for b in bl)/len(A)
        if bl and cov>=0.6 and (not best or cov>best[0]): best=(cov,j,bl[0].b,bl[-1].b+bl[-1].size)
    if best:
        cov,j,b0,b1=best; T=tok(newpar[j][2]); sub=''.join(T[b0:b1]).strip()
        sg,r=diff(ot,sub); match[i]=(j,sg,r); partial[i]=True


# mehrere alte Tz in einer neuen: jede nur gegen ihren Ausschnitt der neuen Tz vergleichen
byj=collections.defaultdict(list)
for i,m in match.items(): byj[m[0]].append(i)
for j,ii in byj.items():
    if len(ii)<2: continue
    for i in ii:
        ot=oldpar[i][2]; A=[x.strip() for x in tok(ot)]; T=tok(newpar[j][2]); B=[x.strip() for x in T]
        bl=[b for b in difflib.SequenceMatcher(None,A,B,autojunk=False).get_matching_blocks() if b.size>=3]
        if not bl: continue
        sub=''.join(T[bl[0].b:bl[-1].b+bl[-1].size]).strip()
        sg,r=diff(ot,sub); match[i]=(j,sg,r); partial[i]=True

# --- Absätze und Einheiten ---
def lab(num): return 'Tz. %d'%num
newunit_of={j:newpar[j][0] for j in range(len(newpar))}
res=[]; used_newunits=set(); attached=set()
# unzugeordnete neue Tz an alte Einheit hängen: Nachbarschaft in der neuen Reihenfolge, gleiche neue Einheit
j2i={m[0]:i for i,m in match.items() if not partial.get(i)}
owner_of_new={}
for j in range(len(newpar)):
    if j in j2i: owner_of_new[j]=oldpar[j2i[j]][0]
ins_for={}
for j in range(len(newpar)):
    if j in usedn: continue
    nk=newpar[j][0]; ow=None
    for d in range(1,6):
        for jj in (j-d,):
            if jj>=0 and jj in owner_of_new and newpar[jj][0]==nk: ow=owner_of_new[jj]; break
        if ow: break
    if not ow:
        for d in range(1,6):
            jj=j+d
            if jj<len(newpar) and jj in owner_of_new and newpar[jj][0]==nk: ow=owner_of_new[jj]; break
    if ow: ins_for.setdefault(ow,[]).append(j); attached.add(j)
oldkeys=[]
for u in old:
    k=u['k']; paras=[]; tgt=[]
    abs_out=[]; changed=False
    for q in u['paras']:
        i=[x for x,(ok,on,ot) in enumerate(oldpar) if on==q['num']][0]
        if i in match:
            j,sg,r=match[i]; nk=newpar[j][0]
            if nk not in tgt: tgt.append(nk)
            st='eq' if all(kk==0 for kk,_ in sg) else 'chg'
            if st=='chg': changed=True
            abs_out.append({'l':lab(q['num']),'st':st,'to':disp(nk)+' '+lab(newpar[j][1]),'segs':sg})
        else:
            changed=True; abs_out.append({'l':lab(q['num']),'st':'del','segs':[[1,q['text']]]})
    ins=[]
    for j in ins_for.get(k,[]):
        ins.append({'l':lab(newpar[j][1]),'to':disp(newpar[j][0]),'segs':[[2,newpar[j][2]]]}); changed=True
        if newpar[j][0] not in tgt: tgt.append(newpar[j][0])
    def words(kk): return sum(len(x.split()) for a in abs_out+ins for k2,x in a['segs'] if k2 in kk)
    tot=words((0,1,2)) or 1; frac=words((1,2))/tot
    oldw=sum(len(x.split()) for a in abs_out for k2,x in a['segs'] if k2 in (0,1)) or 1
    delw=sum(len(x.split()) for a in abs_out for k2,x in a['segs'] if k2==1)
    hv=bool(tgt) and delw/oldw>=0.6
    matched_any=any(a['st']!='del' for a in abs_out)
    if not matched_any: st='removed'; tgt=[]
    elif frac<0.04 and not ins: st='same'
    else: st='changed'
    used_newunits.update(tgt)
    res.append({'n':disp(k),'t':DE[OLD_T[k]],'hv':hv,'st':st,'to':[disp(x) for x in tgt],'abs':abs_out,'ins':ins,'c':[],'_k':k})
byn={r['n']:r for r in res}
# --- Kommentare anhängen ---
cm=here+'/../lib/comparisons/ebagov.json'
rows=json.load(open(cm)) if os.path.exists(cm) else []
neu=[];orph=[]
for r in rows:
    ref=(r.get('oldRef') or '')
    m=re.match(r'(Titel [IVX]+(?:, [\d.]+)?)',ref)
    if m and m.group(1) in byn: byn[m.group(1)]['c'].append(r)
    else: orph.append(r)
newunits=[]
for u in new:
    if u['k'] not in used_newunits:
        n=disp(u['k']); cs=[r for r in orph if (r.get('newRef') or '').startswith(n)]
        neu.append({'n':n,'t':DE[u['k']],'c':cs})
placed={id(r) for e in neu for r in e['c']}
rest=[r for r in orph if id(r) not in placed]
for r in res: r.pop('_k')
out={'old':res,'neu':neu,'rest':rest,'newTitles':{disp(u['k']):DE[u['k']] for u in new}}
os.makedirs(here+'/../public/cmp',exist_ok=True)
json.dump(out,open(here+'/../public/cmp/ebagov.json','w'),ensure_ascii=False,separators=(',',':'))

# --- Prüfung: Rekonstruktion alt/neu gegen Quelltext ---
def ws(x): return re.sub(r'\s+','',x)
bad=0; checked=0
oldtext={q['num']:q['text'] for u in old for q in u['paras']}
for u,r in zip(old,res):
    for q,a in zip(u['paras'],r['abs']):
        checked+=1
        recon_old=''.join(x for kk,x in a['segs'] if kk in (0,1))
        if ws(recon_old)!=ws(q['text']): bad+=1; print('ALT-FEHLER',q['num'])
newtext={(newpar[j][1]):newpar[j][2] for j in range(len(newpar))}
for r in res:
    for a in r['abs']:
        if a['st']=='del': continue
        tz=int(a['to'].split('Tz. ')[1]); rn=''.join(x for kk,x in a['segs'] if kk in (0,2))
        # voller Text oder Ausschnitt (zusammengefasste Tz): muss wörtlich enthalten sein
        if ws(rn) not in ws(newtext[tz]): bad+=1; print('NEU-FEHLER',a['l'],a['to'])
    for a in r['ins']:
        tz=int(a['l'].split('Tz. ')[1])
        if ws(a['segs'][0][1])!=ws(newtext[tz]): bad+=1; print('INS-FEHLER',a['l'])
print('geprüft',checked,'alte Tz, Fehler',bad)
print(collections.Counter(r['st'] for r in res),len(neu),'neu-only,',len(rest),'rest,',sum(len(r['c']) for r in res),'Kommentare in Einheiten',os.path.getsize(here+'/../public/cmp/ebagov.json')//1024,'KB')
