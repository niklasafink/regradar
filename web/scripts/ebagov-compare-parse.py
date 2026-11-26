"""Zerlegt die Leitlinien zur internen Governance (alt: EBA/GL/2021/05, neu: EBA/GL/2026/10) aus den
PDFs im Cache in Einheiten (Titel/Abschnitt) mit nummerierten Tz.  Nur mit PyMuPDF:
~/.cache/regradar-cmp/venv/bin/python -W ignore scripts/ebagov-compare-build.py"""
import re,os,fitz
D=os.path.expanduser('~/.cache/regradar-cmp/ebagov/')
ROM=['I','II','III','IV','V','VI','VII']
def lines(pdf):
    d=fitz.open(D+pdf); out=[]
    for pn,pg in enumerate(d):
        sp=[]
        for b in pg.get_text('dict')['blocks']:
            for l in b.get('lines',[]):
                for s in l['spans']:
                    if not s['text'].strip(): continue
                    if s['size']<9.6:
                        if 62<s['origin'][1]<745: sp.append((s['origin'][1],s['bbox'][0],11,' '))   # Fußnotenzeichen: Platzhalter
                        continue
                    if s['origin'][1]<62 or s['origin'][1]>785: continue
                    sp.append((s['origin'][1],s['bbox'][0],s['size'],s['text'].replace('\xa0',' ')))
        sp.sort()
        rows=[]
        for s in sp:
            if rows and abs(rows[-1][0]-s[0])<5.5: rows[-1][1].append(s)
            else: rows.append([s[0],[s]])
        for y,r in rows:
            r.sort(key=lambda s:s[1])
            t=''.join(s[3] for s in r)
            # Lücke zwischen Spans: Leerzeichen einfügen, wenn nötig
            t=''
            for i,s in enumerate(r):
                if i and not t.endswith(' ') and not s[3].startswith(' ') and s[1]-prevx1>1.5: t+=' '
                t+=s[3]; prevx1=s[1]+len(s[3].strip())*s[2]*0.45
            out.append((pn,round(r[0][1]),max(s[2] for s in r),t.strip()))
    return out
def parse(pdf):
    L=lines(pdf)
    # Region: ab "4. Guidelines" bis "5. Accompanying documents" (Größe >20)
    i0=[i for i,l in enumerate(L) if l[3]=='4. Guidelines' and l[2]>20][0]
    i1=[i for i,l in enumerate(L) if i>i0 and l[3].startswith('5. Accompanying') and l[2]>20][0]
    L=L[i0+1:i1]
    units=[]; cur=None; title=None; para=None; pend=None; stop=False
    def newunit(tt,sec,st):
        nonlocal cur,para
        cur={'title':tt,'sec':sec,'st':st,'paras':[]}; units.append(cur); para=None
    k=0
    while k<len(L):
        pn,x,sz,t=L[k]; k+=1
        if re.match(r'^Annex',t) and sz>11.5: break
        if sz>14:
            # Überschriftenzeile(n), ggf. umgebrochen
            h=t
            while k<len(L) and L[k][2]>14 and L[k][1]>=x and not re.match(r'^(\d+(\.\d+)?|Title [IVX]+ .*)\s',L[k][3]) and not L[k][3].startswith('Title'):
                h+=' '+L[k][3]; k+=1
            h=re.sub(r'(?<=[a-z])\d{1,3}$','',h).strip()
            m=re.match(r'Title ([IVX]+) – (.*)',h)
            if m:
                title=m.group(1); newunit(title,None,m.group(2)); continue
            m=re.match(r'(\d+(?:\.\d+)?)\s+(.*)',h)
            if m:
                newunit(title,m.group(1),m.group(2)); continue
            # nur Zahl, Titel in nächster Zeile (sollte nicht vorkommen)
            raise SystemExit('Überschrift? '+h)
        if re.match(r'^Annex',t) and sz>11.5: break
        if 11.5<sz<=14 and x<100 and not re.match(r'^\d+\.',t):   # Zwischenüberschrift: ignorieren
            continue
        m=re.match(r'^(\d{1,3})\.\s*(.*)$',t)
        if m and x<96 and sz<12:
            para={'num':int(m.group(1)),'lines':[m.group(2)] if m.group(2) else []}; cur['paras'].append(para); continue
        if para is None: continue   # Text vor erstem Tz (Titelkopf)
        para['lines'].append(t)
    return units
def join(ls,hy):
    out=''
    for t in ls:
        if not out: out=t; continue
        if out.endswith('-') and t[:1].islower():
            w=re.search(r'(\S+)-$',out); nx=re.match(r'\S+',t)
            if w and nx and (w.group(1)+'-'+nx.group(0).rstrip('.,;:)')) .lower() in hy: out+=t
            else: out=out[:-1]+t
        else: out+=' '+t
    return out
def build(pdf):
    us=parse(pdf)
    # Wörterbuch echter Bindestrichwörter (Bindestrich nicht am Zeilenende)
    hy=set()
    for u in us:
        for p in u['paras']:
            for t in p['lines']:
                for w in re.findall(r'[A-Za-z]+(?:-[A-Za-z]+)+',t[:-1] if t.endswith('-') else t): hy.add(w.lower())
    for u in us:
        for p in u['paras']:
            s=join(p['lines'],hy)
            s=re.sub(r'\s+',' ',s).strip()
            s=re.sub(r'\s+([.,;:)])',r'\1',s)   # Leerraum vor Fußnotenresten
            # bekannte Fehler der PDF-Textebene (fehlende Leerzeichen/Bindestriche, Fußnotenziffer in der Zahl)
            for a,b in (('singlepurpose','single-purpose'),('bodyand','body and'),('2016/67950','2016/679')): s=s.replace(a,b)
            p['text']=s; del p['lines']
    return us
if __name__=='__main__':
    import sys
    for pdf in ('old_orig.pdf','final.pdf'):
        us=build(pdf)
        print(pdf,len(us),sum(len(u['paras']) for u in us))
        for u in us: print(' ',u['title'],u['sec'],u['st'][:50],[p['num'] for p in u['paras']][:1],'..',[p['num'] for p in u['paras']][-1:],len(u['paras']))
