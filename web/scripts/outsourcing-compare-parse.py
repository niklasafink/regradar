"""Parser fuer EBA/GL/2019/02 (alt) und EBA/GL/2026/09 (neu) aus ~/.cache/regradar-cmp/outsourcing/{old,final}.txt
(pdftotext -layout). Liefert je Abschnitt die nummerierten Absaetze (Tz)."""
import re,os
D=os.path.expanduser('~/.cache/regradar-cmp/outsourcing/')
OLD_HEADS=[('1','Proportionality'),('2','Outsourcing by groups and institutions'),('3','Outsourcing'),('4','Critical or important functions'),
 ('5','Sound governance arrangements and third-party risk'),('6','Sound governance arrangements and outsourcing'),('7','Outsourcing policy'),
 ('8','Conflicts of interests'),('9','Business continuity plans'),('10','Internal audit function'),('11','Documentation requirements'),
 ('12','Pre-outsourcing analysis'),('13','Contractual phase'),('14','Oversight of outsourced functions'),('15','Exit strategies')]
NEW_HEADS=[('1','Proportionality'),('2','Management of third-party risks by financial'),('3','Sound management of third-party risk'),
 ('4','Critical or important functions'),('5','Sound governance arrangements and third-party risk'),('6','Policy on the contractual arrangement'),
 ('7','Conflicts of interests'),('8','Business continuity plans'),('9','Internal audit function'),('10','Documentation requirements'),
 ('11','Pre-contractual analysis'),('12','Contractual phase'),('13','Monitoring'),('14','Exit strategies regarding third-party')]
TITLE_RE=re.compile(r'^Title ([IV]+) –')
NOREF=('section','article','articles','title','paragraph','point','annex','no','regulation','directive','para','sections','of','and','in','art')
def clean_pages(txt,start_line,end_line,heads):
    raw=txt.split('\n')
    # Seitenwechsel: pdftotext setzt \f am Zeilenanfang
    pages=[[]]
    for i in range(start_line,end_line):
        l=raw[i]
        while '\f' in l:
            a,l=l.split('\f',1); pages[-1].append(a); pages.append([])
        pages[-1].append(l)
    out=[]
    headtxt=[h for _,h in heads]
    def is_head(l):
        m=re.match(r'^(\d{1,2}) (.+)$',l)
        return bool(m and any(m.group(2).startswith(h) for n,h in heads if n==m.group(1)))
    for pg in pages:
        keep=[];foot=False;F=set()
        for l in pg:
            if l.startswith('FINAL REPORT ON THE GUIDELINES'): continue
            if re.fullmatch(r'\s{20,}\d{1,3}\s*',l): continue
            m=re.match(r'^(\d{1,3}) +(\S.*)',l)
            if m and not is_head(l) and not TITLE_RE.match(l):
                foot=True
            if foot:
                if m: F.add(int(m.group(1)))
                continue
            keep.append(l)
        out.append((keep,F))
    return out
def rm_marks(s,F):
    if not F: return s
    def f(m):
        n=int(m.group(2))
        if n not in F: return m.group(0)
        pre=m.group(1)
        if m.group(0)[len(pre):].startswith(' '):
            w=re.findall(r'[A-Za-z]+$',pre)
            if not w or w[0].lower() in NOREF: return m.group(0)
        return pre
    # Ziffern direkt an Wort/Satzzeichen oder per Leerzeichen, wenn danach Kleinbuchstabe oder Satzzeichen folgt
    s=re.sub(r'([A-Za-z\.;:,\)’]+) ?(\d{1,3})(?=\s[a-z]|\s*$|\s?[.,;:)])',f,s)
    s=re.sub(r'(\.)(\d{1,3})(?=\s[A-Z])',lambda m:m.group(1) if int(m.group(2)) in F else m.group(0),s)
    def g(m):
        n=int(m.group(2))
        if n not in F: return m.group(0)
        pre=m.group(1)
        w=re.findall(r'[A-Za-z]+$',pre.rstrip())
        if pre.endswith(')') or (w and w[0].lower() in ('point','points','paragraph','article','articles')): return m.group(0)
        return pre.rstrip()
    s=re.sub(r'(\S+\s?)\(\s?(\d{1,3})\s?\)',g,s)
    s=re.sub(r'(?<=\d) (\d{1,3})(?= ?[,.;:])',lambda m:'' if int(m.group(1)) in F else m.group(0),s)
    s=re.sub(r'(/\d{3})(\d{2})(?= ?[ .,;:])',lambda m:m.group(1) if int(m.group(2)) in F else m.group(0),s)
    s=re.sub(r'(?<=[a-z]) (\d{1,3}) (?=[,.;:])',lambda m:'' if int(m.group(1)) in F else m.group(0),s)
    return s
def dehyph(s): return re.sub(r'(\w)-\s(\w)',lambda m:m.group(1)+'-'+m.group(2),s)
def parse(fn,start_pat,end_pat,heads,tag):
    L=open(D+fn).read().split('\n')
    # Beginn: Zeile "Title I – Proportionality" im Hauptteil (zweites Vorkommen nach Inhaltsverzeichnis)
    s=[i for i,l in enumerate(L) if l.startswith('Title I – Proportionality')][-1]
    e=[i for i,l in enumerate(L) if re.match(start_pat,l) and i>s][0] if False else None
    e=[i for i,l in enumerate(L) if i>s and l.startswith(end_pat)][0]
    pages=clean_pages('\n'.join(L),s,e,heads)
    lines=[]
    for keep,F in pages:
        for l in keep: lines.append(rm_marks(l,F) if l.strip() else l)
    # in Abschnitte teilen
    secs=[];cur=None
    skipnext=False
    for l in lines:
        if skipnext:
            skipnext=False
            if re.match(r'^ {8,}[a-z][^.:;]{0,50}$',l): continue
        if re.match(r'^ {3,8}\d{1,2}\.\d{1,2} [A-Z]',l):
            if cur is not None: cur.setdefault('subs',[]).append(l.strip())
            skipnext=True; continue
        m=re.match(r'^(\d{1,2}) (.+)$',l)
        t=TITLE_RE.match(l)
        if t:
            tt=t.group(1)
            if tt=='V': cur={'id':'V','title':'','title_roman':'V','paras':[],'raw':[]}; secs.append(cur)
            else: cur=None
            continue
        if m and any(m.group(2).startswith(h) for n,h in heads if n==m.group(1)) and not re.match(r'^\d+\. ',l):
            cur={'id':m.group(1),'title':m.group(2).strip(),'paras':[],'raw':[]}; secs.append(cur); continue
        if cur is None:
            continue
        cur['raw'].append(l)
    # Titel V: Ueberschrift hat zweite Zeile "authorities"
    for sc in secs:
        txt='\n'.join(sc['raw'])
        if sc['id']=='V': txt=re.sub(r'^\s*(competent\s*)?authorities\s*\n','',txt.lstrip('\n'),count=1) if txt.lstrip().startswith(('authorities','competent')) else txt
        ps=re.split(r'\n(?= {0,3}\d{1,3}\.\s)',('\n'+txt))
        for p in ps:
            m=re.match(r'\s*(\d{1,3})\.\s+(.*)',p,re.S)
            if not m:
                if p.strip() and sc['paras']: sc['paras'][-1][1]+=' '+norm(p)  # Fortsetzung (z.B. Rest nach Seitenumbruch)
                elif p.strip() and sc['id']!='V': sc.setdefault('pre',[]).append(norm(p))
                continue
            sc['paras'].append([int(m.group(1)),norm(m.group(2))])
        del sc['raw']
    return secs
def norm(s):
    s=re.sub(r'(?<=[A-Za-z])-\s*\n\s*(?=[A-Za-z])','-',s)
    s=re.sub(r'\s+',' ',s).strip()
    s=re.sub(r' ([,.;])(?=\s|$)',r'\1',s)
    s=re.sub(r'(?<=[a-z])- (?=[a-z]{2})',lambda m:'-',s) if False else s
    return s
def old(): return parse('old.txt',None,'5. Accompanying',OLD_HEADS,'old')
def new(): return parse('final.txt',None,'4. Accompanying',NEW_HEADS,'new')
if __name__=='__main__':
    for nm,f in (('old',old),('new',new)):
        S=f(); print(nm,len(S),'Abschnitte',sum(len(s['paras']) for s in S),'Tz')
        for s in S: print(' ',s['id'],s['title'][:50],len(s['paras']),s['paras'][0][0] if s['paras'] else '',s['paras'][-1][0] if s['paras'] else '',s.get('pre',''))

def parse_front(fn,first_head):
    """Abschnitt 2 (Gegenstand, Anwendungsbereich; ohne Definitionstabelle) und 3 (Umsetzung) vor Titel I."""
    L=open(D+fn).read().split('\n')
    t1=[i for i,l in enumerate(L) if l.startswith('Title I – Proportionality')][-1]
    s2=[i for i,l in enumerate(L) if l.startswith('2. Subject matter') and i<t1][-1]
    d=[i for i,l in enumerate(L) if l.strip()=='Definitions' and s2<i<t1][0]
    s3=[i for i,l in enumerate(L) if l.startswith('3. Implementation') and i<t1][-1]
    # Definitionsabsatz (Tz mit "following definitions apply") liegt vor der Tabelle; Tabelle selbst entfaellt
    out=[]
    for nm,(a,b) in (('A2',(s2+1,d)),('A3',(s3+1,t1))):
        pages=clean_pages('\n'.join(L),a,b,[])
        lines=[]
        for keep,F in pages:
            for l in keep: lines.append(rm_marks(l,F) if l.strip() else l)
        txt='\n'.join(lines)
        sub=re.findall(r'^(Subject matter|Addressees|Scope of application|Date of application|Transitional provisions|Repeal)\s*$',txt,re.M)
        ps=re.split(r'\n(?= {0,3}\d{1,3}\.\s)','\n'+txt)
        paras=[]
        for p_ in ps:
            m=re.match(r'\s*(\d{1,3})\.\s+(.*)',p_,re.S)
            if not m: continue
            body=m.group(2)
            body=re.sub(r'\n(Subject matter|Addressees|Scope of application|Date of application|Transitional provisions|Repeal|Definitions)\s*(\n|$).*','',body,flags=re.S) if False else body
            # Zwischenueberschriften am Ende eines Absatzes entfernen
            body=re.sub(r'\n(Subject matter|Addressees|Scope of application|Date of application|Transitional provisions|Repeal|Definitions)\s*$','',body.rstrip())
            body=re.sub(r'\n(Addressees|Scope of application|Transitional provisions|Repeal)\s*\n','\n',body+'\n').rstrip()
            if paras and int(m.group(1))<=paras[-1][0]: continue
            paras.append([int(m.group(1)),norm(body)])
        out.append({'id':nm,'title':nm,'paras':paras,'subs':sub})
    return out
