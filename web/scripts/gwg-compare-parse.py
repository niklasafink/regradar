"""Parst das heutige GwG (gesetze-im-internet XML) und Art. 1 GwBG-E (BMF-PDF als Text)
in Paragrafen und Absätze und ordnet sie per Begründung und Textähnlichkeit zu.
Quellen liegen in ~/.cache/regradar-gwbg (siehe Memory version-compare-gwg-gwbg)."""
import re,os,json,difflib,xml.etree.ElementTree as ET
D=os.path.expanduser('~/.cache/regradar-gwbg/')

def clean(s):
    s=s.replace('­','')
    s=re.sub(r'\s+',' ',s).strip()
    return s

# ---------- neu ----------
def dehyph(lines):
    out=[]
    for l in lines:
        l=l.rstrip()
        if out and out[-1].endswith('-') and not out[-1].endswith(' -'):
            nxt=l.lstrip()
            first=nxt.split(' ')[0] if nxt else ''
            if first and first[0].islower() and first not in ('und','oder','bzw.','sowie','beziehungsweise','bis','im','in'):
                out[-1]=out[-1][:-1]+nxt; continue
        out.append(l.lstrip())
    return out

def parse_new():
    t=open(D+'e.txt').read().split('\n')
    start=[i for i,l in enumerate(t) if l.strip()=='Abschnitt 1' and i>300][0]
    end=[i for i,l in enumerate(t) if l.strip()=='Artikel 2' and i>start][0]
    body=[l for l in t[start:end] if 'Bearbeitungsstand' not in l and not re.fullmatch(r'\s*-\s*\d+\s*-\s*',l)]
    idx=[i for i,l in enumerate(body) if re.fullmatch(r'\s*§\s?\d+[a-z]?\s*',l)]
    res={}
    for k,i in enumerate(idx):
        j=idx[k+1] if k+1<len(idx) else len(body)
        num=re.sub(r'\D','',body[i]) if not re.search(r'[a-z]',body[i]) else re.sub(r'\s|§','',body[i])
        chunk=[l for l in body[i+1:j] if l.strip()]
        # Titel: Zeilen bis zur ersten Zeile, die mit "(1)" oder Text beginnt; Titel endet vor Absatz (1)/Text
        # Abschnittsköpfe am Ende des Chunks entfernen
        while chunk and re.match(r'\s*(Abschnitt|Unterabschnitt) \d+\s*$',chunk[-1]): 
            chunk.pop()
            # Überschrift des Abschnitts (1-2 Zeilen) davor ebenfalls
            while chunk and not re.search(r'[\.\;\:,]$|\)$',chunk[-1].strip()) and len(chunk[-1])<95 and chunk and not re.match(r'\s*\(?\d',chunk[-1]): chunk.pop()
        lines=dehyph(chunk)
        # Titel = erste Zeile(n) bis Absatz-Beginn
        title=[];k2=0
        while k2<len(lines) and not re.match(r'\(\d+[a-z]?\)',lines[k2]) and not (k2>0 and len(title)>=1 and re.match(r'[A-ZÄÖÜ]',lines[k2]) and title[-1].endswith(('.',':'))):
            title.append(lines[k2]); k2+=1
            if len(title)>=3: break
        text=' '.join(lines[k2:])
        res[num]={'title':clean(' '.join(title)),'text':clean(text)}
    return res

def split_abs(text):
    """Absätze an "(n) ": nur wenn die Zählung lückenlos weiterläuft (1, 2, 2a, 3 ...)."""
    cands=[(m.start(),m.end(),m.group(1)) for m in re.finditer(r'(?:^|\s)\((\d+[a-z]?)\)\s',text)]
    cut=[];cur=0;letter=''
    for st,en,lab in cands:
        num=int(re.sub(r'\D','',lab)); suf=re.sub(r'\d','',lab)
        ok=(not cut and lab=='1') or (cut and ((num==cur+1 and not suf) or (num==cur and suf and suf>letter) ))
        if ok: cut.append((st,en,lab)); cur=num; letter=suf
    if not cut: return [('',text)]
    out=[]
    if text[:cut[0][0]].strip(): out.append(('',text[:cut[0][0]].strip()))
    for k,(st,en,lab) in enumerate(cut):
        e=cut[k+1][0] if k+1<len(cut) else len(text)
        out.append(('('+lab+')',text[en:e].strip()))
    return out

# ---------- alt ----------
def parse_old():
    t=ET.parse(D+'gwg/BJNR182210017.xml').getroot()
    res={}
    for n in t.iter('norm'):
        a=n.findtext('metadaten/enbez'); ti=n.findtext('metadaten/titel')
        if not a or not a.startswith('§'): continue
        num=a.replace('§','').strip()
        ps=[re.sub(r'\s+([\.,;:\)])',r'\1',clean(' '.join(x.strip() for x in p.itertext() if x.strip()))) for p in n.iter('P')]
        ps=[p for p in ps if p]
        # (+++ Hinweise +++) entfernen
        ps=[re.sub(r'\(\+\+\+.*?\+\+\+\)','',p).strip() for p in ps]
        ps=[p for p in ps if p]
        res[num]={'title':clean(ti or ''),'abs':ps}
    return res

if __name__=='__main__':
    new=parse_new(); old=parse_old()
    print(len(new),len(old))
    for k in ('1','9','56','104','119','25'):
        n=new.get(k); print(k,'|',n['title'],'|',n['text'][:200],'| absätze',len(split_abs(n['text'])))
    for k in ('1','10','56','16a'):
        o=old[k]; print(k,o['title'],len(o['abs']),o['abs'][0][:120])
