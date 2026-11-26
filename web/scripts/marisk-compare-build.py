"""Baut web/public/cmp/marisk.json: MaRisk der Banken, 8. Fassung (BaFin RS 06/2024) gegen 9. Novelle
(BaFin RS 06/2026 (BA), 30.06.2026). Quellen nur aus ~/.cache/regradar-cmp/marisk/:
  vergleichsfassung_8_marisk.pdf  amtliche Vergleichsfassung der BaFin (Alttext = Zeichen mit Streichung oder ohne Markierung)
  rs0626.pdf                      Neufassung sauber (Neutext, Grundlage der Rekonstruktionspruefung)
Kommentare: web/lib/comparisons/marisk.json. Aufruf: ~/.cache/regradar-cmp/venv/bin/python -I scripts/marisk-compare-build.py"""
import re,os,sys,json,difflib,collections
import fitz
SRC=os.path.expanduser('~/.cache/regradar-cmp/marisk/')
RED=(0.82,0.2,0.22);GRN=(0.17,0.38,0.2);BLU=(0.0,0.47,0.83)
def near(a,b): return all(abs(x-y)<0.05 for x,y in zip(a,b))
def lines_of(pg):
    L=[]
    for dr in pg.get_drawings():
        r=dr['rect'];f=dr.get('fill')
        if f and r.height<2 and r.width>1 and dr['type']=='f':
            if near(f,RED): L.append(('r',r))
            elif near(f,GRN): L.append(('g',r))
            elif near(f,BLU): L.append(('b',r))
    return L
def colkey(c):
    return {0xd13438:'r',0x2c6234:'g',0x78d4:'b'}.get(c)
def chars(pg,tracked=True):
    """liefert Zeichen (x0,x1,y(origin),size,kind,ch,font,color) ohne Kopf/Fuß"""
    out=[];L=lines_of(pg) if tracked else []
    raw=pg.get_text('rawdict')
    for b in raw['blocks']:
        for l in b.get('lines',[]):
            for s in l['spans']:
                if 'Tahoma' in s['font']: continue
                ck=colkey(s['color']);oy=s['origin'][1]
                for c in s['chars']:
                    x0,y0,x1,y1=c['bbox'];ch=c['c']
                    k=0
                    if ck and tracked:
                        cx=(x0+x1)/2;st=un=False
                        for lc,r in L:
                            if lc!=ck: continue
                            if r.x0-0.4<=cx<=r.x1+0.4:
                                ym=(r.y0+r.y1)/2-oy
                                if -4.5<ym<-0.45: st=True
                                elif 0.3<=ym<4: un=True
                        k=1 if st else 2 if un else 3   # 3: farbig ohne Linie
                    out.append((x0,x1,oy,s['size'],k,ch,s['font'],s['color']))
    return out

"""Tokenizer: Vergleichsfassung -> Zeilen je Tabellenzeile (Regelabschnitt)"""
BLUE_RULE=(0.12,0.29,0.49)
def near(a,b): return all(abs(x-y)<0.05 for x,y in zip(a,b))
def rules(pg,junc=False):
    ys=[];J=collections.defaultdict(set)
    for dr in pg.get_drawings():
        r=dr['rect'];f=dr.get('fill')
        if f and near(f,BLUE_RULE) and r.height<1.5:
            y=round((r.y0+r.y1)/2,1)
            if r.width>150: ys.append(y)
            if r.width<1.0 and 300<r.x0<400: J[y].add(round((r.x0+r.x1)/2,1))
            if r.width>150 and 300<r.x1<400 and r.x1<600: J[y].add(round(r.x1,1))
    ys=sorted(set(ys))
    return (ys,J) if junc else ys
TR=dict(split=359.5,ymin=126,ymax=476,xmin=40,xmax=660,hsize=11,bsize=9.5)
CL=dict(split=448,ymin=85,ymax=536,xmin=40,xmax=830,hsize=12,bsize=99)
def page_rows(pg,tracked=True,cfg=TR):
    """-> Liste Zeilen: je Zeile (left:[lines], right:[lines]), Zeile = Liste Zeichen"""
    cs=[c for c in chars(pg,tracked) if cfg['xmin']<=c[0]<=cfg['xmax'] and cfg['ymin']<c[2]<cfg['ymax']]
    ys,J=rules(pg,True)
    def rowof(y):
        # y liegt zwischen Regel i und i+1
        i=0
        for k,v in enumerate(ys):
            if y>v: i=k+1
        return i
    # Zeilen-Cluster (Grundlinien) je Spalte
    rowsd=collections.defaultdict(lambda:([],[]))
    byrow=collections.defaultdict(list)
    for c in cs: byrow[rowof(c[2])].append(c)
    def bound(ri,rc):
        if not tracked:
            occ=[False]*80
            for c in rc:
                if c[3]>=cfg['hsize']: continue
                for x in range(int(c[0])-400,int(c[1])-400+1):
                    if 0<=x<80: occ[x]=True
            best=(0,cfg['split']);i=0
            while i<80:
                if not occ[i]:
                    j=i
                    while j<80 and not occ[j]: j+=1
                    if j-i>best[0]: best=(j-i,400+(i+j)/2)
                    i=j
                else: i+=1
            return best[1]
        cand=set()
        for k in (ri-1,ri):
            if 0<=k<len(ys): cand|=J.get(ys[k],set())
        cand={x for x in cand if 340<x<375}
        if not cand: return cfg['split']
        def cost(b): return sum(1 for c in rc if c[0]<b-0.3 and c[1]>b+0.3)*10+sum(1 for c in rc if b-0.5<=c[0]<b+1.5)
        return min(sorted(cand),key=cost)
    for ri,rc in byrow.items():
        B=bound(ri,rc)
        for c in rc:
            col=0 if (c[0]<B-0.5 or c[3]>=cfg['hsize'] or ('Bold' in c[6] and c[3]>=cfg['bsize'])) else 1
            rowsd[ri][col].append(c)
    out=[]
    for ri in sorted(rowsd):
        pair=[]
        for col in (0,1):
            cl=sorted(rowsd[ri][col],key=lambda c:(c[2],c[0]))
            lines=[];cur=[]
            for c in cl:
                if cur and abs(c[2]-cur[0][2])>3.2: lines.append(sorted(cur,key=lambda t:t[0]));cur=[]
                cur.append(c)
            if cur: lines.append(sorted(cur,key=lambda t:t[0]))
            pair.append(lines)
        out.append(pair)
    return out

MOD=re.compile(r'^(AT|BTO|BTR|BT)(?:\s+(\d+(?:\.\d+)*))?\s*(.*)$')
BUL={'':'-','':'-','•':'-'}
def is_head(c,cfg=TR): return c[3]>=cfg['hsize'] or ('Bold' in c[6] and c[3]>=cfg['bsize'])
def line_text(toks):
    out=[];prev=None
    for c in toks:
        ch=BUL.get(c[5],c[5])
        if prev is not None and c[0]-prev[1]>1.3 and ch!=' ' and not (out and out[-1]==' '): out.append(' ')
        out.append(ch);prev=c
    return ''.join(out)
def join_lines(lines):
    res=''
    for ln in lines:
        ln=ln.strip()
        if not ln: continue
        if res:
            m=re.match(r'^(\S+)',ln)
            w=m.group(1)
            if res.endswith('-') and len(res)>1 and res[-2].isalpha():
                if ln[0].isupper(): res=res+ln;continue        # Bindestrich-Kompositum (EBA-Leitlinien)
                if ln[0].islower() and (w not in ('und','oder','bzw.','sowie','sowie,','wie','bzw','beziehungsweise') or (w=='wie' and res.endswith('so-'))):
                    res=res[:-1]+ln;continue                   # Silbentrennung
            res+=' '+ln
        else: res=ln
    return re.sub(r'\s+',' ',res).strip()
def fix(s):
    s=re.sub(r'\s+([.,;:)])',r'\1',s)   # Leerzeichen vor Satzzeichen (Artefakt gestrichener Wörter)
    s=re.sub(r'\(\s+',r'(',s)
    return s
def parse(pdf,want,tracked=True,first=10,maxpages=None,cfg=TR,nx=(60,66)):
    d=fitz.open(pdf)
    mods=[];cur=None;para=None;hb=[];hbkey=None
    def flush_head():
        nonlocal cur,para,hb
        if not hb: return
        groups=[]
        for h in hb:
            s=''.join(h).strip()
            if not s: continue
            if re.match(r'^(AT|BTO|BTR|BT)(\s+\d|\s+[A-ZÄÖÜ])',s) or not groups: groups.append([s])
            else: groups[-1].append(s)
        hb=[]
        for g in groups:
            t=re.sub(r'\s+',' ',join_lines(g)).strip()
            m=MOD.match(t)
            if m and (m.group(2) or m.group(3)):
                cur={'n':(m.group(1)+(' '+m.group(2) if m.group(2) else '')),'t':m.group(3).strip(),'paras':[],'head':t,'pre':[]}
            else:
                cur={'n':'?','t':t,'paras':[],'head':t,'pre':[]}
            mods.append(cur);para=None
    for pn,pg in enumerate(d):
        if pn<first: continue
        if maxpages and pn>=maxpages: break
        for left,right in page_rows(pg,tracked,cfg):
            for ln in left:
                kept=[c for c in ln if (c[4] in want or (c[4]==3 and c[5]==' ') or (c[4]==3 and not tracked) or not tracked)]
                if tracked:
                    # k3 (farbig ohne Linie) nur als Leerzeichen
                    kept=[c for c in ln if c[4] in want or (c[4]==3 and c[5].isspace())]
                heads=[c for c in kept if is_head(c,cfg)]
                body=[c for c in kept if not is_head(c,cfg)]
                if tracked and not heads and body:
                    tx=''.join(c[5] for c in body).strip()
                    if body[0][3]>=7.95 and body[0][3]<9.5 and body[0][0]<60 and re.match(r'^(AT|BTO|BTR|BT)\s+\d+(\.\d+)*\s+(?!Tz)[A-ZÄÖÜ]',tx):
                        heads=body;body=[]
                if heads: 
                    hb.append(sorted(heads,key=lambda c:c[0]) and [BUL.get(c[5],c[5]) if True else '' for c in heads])
                if not body or not ''.join(c[5] for c in body).strip():
                    continue
                flush_head()
                # Tz-Nummer: führende Ziffern-Zone (alle Arten), davon die gewollten Ziffern
                allb=sorted([c for c in ln if not is_head(c,cfg) and (c[4]!=3 or True)],key=lambda c:c[0])
                m=None;rest=body
                a0=[c for c in allb if not c[5].isspace()]
                if a0 and a0[0][5].isdigit() and a0[0][0]<nx[0]:
                    slot=[];last=a0[0][0]
                    for c in allb:
                        if c[5].isspace(): continue
                        if c[5].isdigit() and c[0]<nx[1]+22 and c[0]-last<14: slot.append(c);last=c[1]
                        else: break
                    sl=set(id(c) for c in slot)
                    kd=[c for c in slot if c in body]
                    mm=''.join(c[5] for c in sorted(kd,key=lambda c:c[0]))
                    rest=[c for c in body if id(c) not in sl]
                    # Text direkt anschließend (kein Abstand) -> keine Nummer
                    if slot:
                        kk=[c for c in slot if c in body]
                        if kk:
                            nxt=[c for c in rest if c[0]>=kk[-1][1]-0.01 and not c[5].isspace()]
                            if nxt and nxt[0][0]-kk[-1][1]<0.8: slot=[]
                    if slot:
                        m=mm if mm else None
                        if m is None:
                            rest=[c for c in body if id(c) not in sl]
                    else: rest=body
                if tracked and rest:
                    rt=re.sub(r'\s+',' ',''.join(c[5] for c in rest)).strip()
                    if len(rt)<95 and re.match(r'^(AT|BTO|BTR|BT)\s+\d+(\.\d+)*\s+(?!Tz)[A-ZÄÖÜ][^.]*$',rt) and (m is not None or para is None or True) and not re.search(r'(ist|sind|hat|sowie|und)\s*$',rt):
                        hb.append([c[5] for c in rest]);continue
                if m is not None:
                    if cur is None:
                        cur={'n':'?','t':'','paras':[],'head':'','pre':[]};mods.append(cur)
                    para={'num':m,'lines':[line_text(rest)],'erl':[]}
                    cur['paras'].append(para)
                else:
                    if cur is None: continue
                    if para is None:
                        para={'num':'','lines':[],'erl':[]};cur['paras'].append(para)
                    para["lines"].append(line_text(body))
            for ln in right:
                kept=[c for c in ln if c[4] in want or (c[4]==3 and c[5].isspace())] if tracked else ln
                if not kept or not ''.join(c[5] for c in kept).strip(): continue
                flush_head()
                if cur is None: continue
                if para is None:
                    para={'num':'','lines':[],'erl':[]};cur['paras'].append(para)
                fb=[c for c in kept if not c[5].isspace()][0]
                bold='Bold' in fb[6]
                para['erl'].append((bold,line_text(kept)))
    flush_head()
    # Nachbearbeitung
    for m in mods:
        for p in m['paras']:
            p['text']=fix(join_lines(p['lines']))
            blocks=[];
            for bold,t in p['erl']:
                if bold and (not blocks or not blocks[-1][0] or True) and (not blocks or blocks[-1][2] is False or not bold):
                    pass
            # Blöcke: neuer Block, wenn eine fette Zeile auf eine nicht-fette folgt oder am Anfang
            blk=[];prevb=None
            for bold,t in p['erl']:
                if bold and (prevb is False or prevb is None) : blk.append([[t]])
                elif bold and prevb: blk[-1][-1].append(t)
                else:
                    if not blk: blk.append([[],[t]])
                    elif len(blk[-1])==1: blk[-1].append([t])
                    else: blk[-1][-1].append(t)
                prevb=bold
            # blk: je Block [Titelzeilen, Textzeilen]
            outb=[]
            for b in blk:
                tit=join_lines(b[0]) if len(b)>0 else ''
                txt=join_lines(b[1]) if len(b)>1 else ''
                outb.append(fix((tit+' '+txt).strip()))
            p['erlb']=outb
            del p['erl']
        m['head']=fix(m['head'])
    return mods

OLDM=parse(SRC+'vergleichsfassung_8_marisk.pdf',(0,1))
NEWM=parse(SRC+'rs0626.pdf',(0,),tracked=False,first=6,cfg=CL,nx=(75,80))
NEWM=[m for m in NEWM if m['n']!='?']
newby={m['n']:m for m in NEWM}
def mnum(n): return n
MAP={'AT 3':['AT 3.1'],'AT 4.3.5':['AT 4.3.4'],'AT 8.3':['AT 8.2'],'BT 3':['BT 2'],'BT 3.1':['BT 2.1'],'BT 3.2':['BT 2.2'],'BTR 3.1':['BTR 3'],'BTR 3.2':['BTR 3'],'BTR 3':['BTR 3']}
tok=lambda s:re.findall(r'\S+\s*',s)
def ratio(a,b):
    A=[x.strip() for x in tok(a)];B=[x.strip() for x in tok(b)]
    if not A or not B: return 0.0
    sa,sb=set(A),set(B)
    if len(sa&sb)/max(len(sa),len(sb))<0.2: return 0.0
    return difflib.SequenceMatcher(None,A,B,autojunk=False).ratio()
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
    return out,difflib.SequenceMatcher(None,[x.strip() for x in A],[x.strip() for x in B],autojunk=False).ratio()
# --- Items ---
def items_old(m):
    out=[]
    for k,p in enumerate(m['paras'],1):
        if not re.search(r'\w',p['text']) and not p['erlb']: continue
        if re.search(r'\w',p['text']): out.append({'kind':'tz','k':k,'j':0,'text':p['text'],'l':'Tz %d'%k})
        for j,e in enumerate([e for e in p['erlb'] if re.search(r'\w',e)],1):
            out.append({'kind':'erl','k':k,'j':j,'text':e,'l':'Erl. zu Tz %d'%k+(' (%d)'%j if len([x for x in p['erlb'] if re.search(r'\w',x)])>1 else '')})
    return out
def items_new(m):
    out=[]
    for p in m['paras']:
        k=int(p['num']) if p['num'].isdigit() else 0
        if re.search(r'\w',p['text']): out.append({'kind':'tz','k':k,'j':0,'text':p['text'],'l':'Tz %d'%k,'mod':m['n'],'used':False})
        for j,e in enumerate([e for e in p['erlb'] if re.search(r'\w',e)],1):
            out.append({'kind':'erl','k':k,'j':j,'text':e,'l':'Erl. zu Tz %d'%k+(' (%d)'%j if len([x for x in p['erlb'] if re.search(r'\w',x)])>1 else ''),'mod':m['n'],'used':False})
    return out
NEWI={m['n']:items_new(m) for m in NEWM}
OLDI={}
for m in OLDM: OLDI.setdefault(m['n'],[]); OLDI[m['n']]+= [] 
oldmods=[]
seen=set()
for m in OLDM:
    it=items_old(m)
    if m['n'] in seen:
        print('DUP old module',m['n'])
    seen.add(m['n'])
    oldmods.append({'n':m['n'],'t':m['t'],'items':it,'m':m})
STEM=lambda t:{w[:6] for w in re.findall(r'[a-zäöüß]{4,}',t.lower())}
def score(a,b):
    sa,sb=STEM(a),STEM(b)
    if not sa or not sb: return 0.0
    j=len(sa&sb)/len(sa|sb)
    return max(j,ratio(a,b))
def mono(oit,cands,thr):
    """monotone Zuordnung (Needleman-Wunsch ohne Lückenstrafe), nur freie Elemente"""
    O=[o for o in oit if o.get('mt') is None];C=[c for c in cands if not c['used']]
    n,m=len(O),len(C)
    if not n or not m: return
    S=[[score(O[i]['text'],C[j]['text']) for j in range(m)] for i in range(n)]
    D=[[0.0]*(m+1) for _ in range(n+1)]
    for i in range(1,n+1):
        for j in range(1,m+1):
            v=S[i-1][j-1]
            D[i][j]=max(D[i-1][j],D[i][j-1],D[i-1][j-1]+(v if v>=thr else -9))
    i,j=n,m
    while i>0 and j>0:
        v=S[i-1][j-1]
        if v>=thr and abs(D[i][j]-(D[i-1][j-1]+v))<1e-9:
            O[i-1]['mt']=C[j-1];O[i-1]['r']=v;C[j-1]['used']=True;i-=1;j-=1
        elif abs(D[i][j]-D[i-1][j])<1e-9: i-=1
        else: j-=1
def match(oit,cands,thr,crossthr=None):
    pairs=[]
    for i,o in enumerate(oit):
        if o.get('mt') is not None: continue
        for c in cands:
            if c['used']: continue
            if o['kind']!=c['kind'] and crossthr is None: continue
            r=score(o['text'],c['text'])
            t=thr if o['kind']==c['kind'] else crossthr
            if t is not None and r>=t: pairs.append((r,i,id(c),c))
    pairs.sort(key=lambda x:-x[0])
    for r,i,cid,c in pairs:
        o=oit[i]
        if o.get('mt') is not None or c['used']: continue
        o['mt']=c;o['r']=r;c['used']=True
def gapfill(oit,cands,thr):
    O=oit;C=cands
    idx={id(c):j for j,c in enumerate(C)}
    i=0
    while i<len(O):
        if O[i].get('mt') is None:
            a=i
            while i<len(O) and O[i].get('mt') is None: i+=1
            b=i  # O[a:b] frei
            jp=idx[id(O[a-1]['mt'])] if a>0 and O[a-1].get('mt') is not None and id(O[a-1]['mt']) in idx else -1
            jn=idx[id(O[b]['mt'])] if b<len(O) and O[b].get('mt') is not None and id(O[b]['mt']) in idx else len(C)
            free=[j for j in range(jp+1,jn) if not C[j]['used']]
            if len(free)==b-a:
                for o,j in zip(O[a:b],free):
                    if score(o['text'],C[j]['text'])>=thr: o['mt']=C[j];o['r']=0;C[j]['used']=True
        else: i+=1
def align_all():
    for om in oldmods:
        for it in om['items']: it['mt']=None
    for t in NEWI:
        for c in NEWI[t]: c['used']=False
    # Reihenfolge der Module: gleiche Zielmodule zusammen
    groups=collections.OrderedDict()
    for om in oldmods:
        tg=tuple(MAP.get(om['n'],[om['n']] if om['n'] in newby else []))
        groups.setdefault(tg,[]).append(om)
    for tg,oms in groups.items():
        if not tg: continue
        oit=[i for om in oms for i in om['items']]
        cands=[c for t in tg for c in NEWI.get(t,[])]
        tz=[i for i in oit if i['kind']=='tz'];ctz=[c for c in cands if c['kind']=='tz']
        match(tz,ctz,0.40)
        mono(tz,ctz,0.18)
        gapfill(tz,ctz,0.05)
        # Erläuterungen: zuerst zu zugeordneten Tz
        for o in tz:
            if o.get('mt'):
                oe=[i for i in oit if i['kind']=='erl' and i['k']==o['k'] and i['text'] and i in [x for om in oms for x in om['items']] and i.get('own') is o['own'] if 'own' in o] if False else None
        # einfacher: Erl. je Modul monoton
        for om in oms:
            for tzi in [i for i in om['items'] if i['kind']=='tz']:
                if tzi.get('mt'):
                    oe=[i for i in om['items'] if i['kind']=='erl' and i['k']==tzi['k']]
                    ce=[c for c in cands if c['kind']=='erl' and c['mod']==tzi['mt']['mod'] and c['k']==tzi['mt']['k']]
                    match(oe,ce,0.35);mono(oe,ce,0.15)
        er=[i for i in oit if i['kind']=='erl'];cer=[c for c in cands if c['kind']=='erl']
        match(er,cer,0.35);mono(er,cer,0.2)
        # Tz noch frei: auch gegen Erläuterungen derselben Module
        match(tz,cands,0.45,0.45)
    allnew=[c for t in NEWI for c in NEWI[t]]
    for om in oldmods:
        un=[i for i in om['items'] if i['mt'] is None]
        match(un,allnew,0.30,0.38)
def assemble(rows=None):
    align_all()
    natc=lambda x:x
    owner={}   # neues Modul -> alt-Modul mit den meisten Treffern
    cnt=collections.defaultdict(collections.Counter)
    for om in oldmods:
        for it in om['items']:
            if it['mt']: cnt[it['mt']['mod']][om['n']]+=1
    order={om['n']:i for i,om in enumerate(oldmods)}
    for X,c in cnt.items():
        best=max(c.items(),key=lambda kv:(kv[1],-order[kv[0]]))
        owner[X]=best[0]
    res=[]
    for om in oldmods:
        if not om['items']: continue
        absl=[];changed=False;tos=[]
        for it in om['items']:
            if it['mt']:
                c=it['mt'];sg,r=diff(it['text'],c['text'])
                st='eq' if all(k==0 for k,_ in sg) else 'chg'
                if st=='chg': changed=True
                absl.append({'l':it['l'],'st':st,'to':c['mod']+' '+c['l'],'segs':sg})
                if c['mod'] not in tos: tos.append(c['mod'])
            else:
                changed=True
                absl.append({'l':it['l'],'st':'del','segs':[[1,it['text']]]})
        ins=[]
        for X in tos:
            if owner.get(X)==om['n']:
                for c in NEWI[X]:
                    if not c['used']:
                        ins.append({'l':c['l'],'to':X,'segs':[[2,c['text']]]});changed=True
        def words(k): return sum(len(x.split()) for a in absl+ins for kk,x in a['segs'] if kk in k)
        tot=words((0,1,2)) or 1;frac=words((1,2))/tot
        oldw=sum(len(x.split()) for a in absl for kk,x in a['segs'] if kk in (0,1)) or 1
        delw=sum(len(x.split()) for a in absl for kk,x in a['segs'] if kk==1)
        hv=bool(tos) and delw/oldw>=0.6
        if not tos: st='removed'
        elif frac<0.04 and not ins: st='same'
        else: st='changed'
        res.append({'n':om['n'],'t':om['t'],'hv':hv,'st':st,'to':tos,'abs':absl,'ins':ins,'c':[]})
    return res,owner

# ================= Zusammenbau der Ausgabe =================
def build():
    res,owner=assemble()
    here=os.path.dirname(os.path.abspath(__file__))
    rows=json.load(open(here+'/../lib/comparisons/marisk.json'))
    byn={r['n']:r for r in res}
    modre=re.compile(r'^((?:AT|BTO|BTR|BT)(?: \d+(?:\.\d+)*)?)(?= |$)')
    def mod_of(ref):
        m=modre.match(ref or '')
        return m.group(1) if m else None
    rest=[]
    for r in rows:
        k=mod_of(r.get('oldRef'))
        if k in byn: byn[k]['c'].append(r)
        else: rest.append(r)
    owned=set(owner)
    neu=[]
    for m in NEWM:
        if m['n'] in owned or not NEWI[m['n']]: continue
        neu.append({'n':m['n'],'t':m['t'],'c':[]})
    out={'old':res,'neu':neu,'rest':rest,'newTitles':{m['n']:m['t'] for m in NEWM}}
    os.makedirs(here+'/../public/cmp',exist_ok=True)
    json.dump(out,open(here+'/../public/cmp/marisk.json','w'),ensure_ascii=False,separators=(',',':'))
    print(collections.Counter(r['st'] for r in res),'Einheiten;',len(neu),'neu-only;',len(rest),'rest;',sum(len(r['c']) for r in res),'Kommentare angehängt;',os.path.getsize(here+'/../public/cmp/marisk.json')//1024,'KB')
    return out
if __name__=='__main__': build()
