"""Prüft public/cmp/crr3.json: (1) Segmente 0+1 gleich alter Text, 0+2 gleich neuer Text der Quelle (buzer-Vergleichsseite),
(2) jedes im BGBl wörtlich zitierte Ersetzungsstück (Art. 1 und 2 BRUBEG) steht im neuen Text des Paragrafen.
Aufruf: python3 -I scripts/crr3-compare-verify.py"""
import re,os,json,importlib.util,sys
here=os.path.dirname(os.path.abspath(__file__))
spec=importlib.util.spec_from_file_location('b',here+'/crr3-compare-build.py')
src=open(here+'/crr3-compare-build.py').read().split("ids=json.load")[0]
ns={'__file__':here+'/crr3-compare-build.py'}; exec(src,ns)
load,split,groups,C=ns['load'],ns['split'],ns['groups'],ns['C']
W=lambda s:re.sub(r'[\W_\d]+','',re.sub(r'\(\d+[a-z]*\)','',s.replace('\u00ad',''))).lower()  # ohne Ziffern: das BGBl setzt Satznummern hochgestellt
d=json.load(open(here+'/../public/cmp/crr3.json'))
bad=0;chk=0
for r in d['old']:
    o,n=load(r['n']); ot,op=split(o); nt,np_=split(n)
    og=groups(op); ng=groups(np_)
    olds=''.join(x for a in r['abs'] for k,x in a['segs'] if k in(0,1))
    news=''.join(x for a in r['abs']+r['ins'] for k,x in a['segs'] if k in(0,2))
    if sorted(W(t) for _,t in og)!=sorted(W(x) for x in re.split(r'(?=\(\d+[a-z]?\) )',olds) if W(x)) and W(olds)!=W(''.join(t for _,t in og)): print('ALT weicht ab',r['n']); bad+=1
    if W(''.join(sorted(W(t) for _,t in ng)))!=W(''.join(sorted([W(''.join(x for k,x in a['segs'] if k in(0,2))) for a in r['abs']+r['ins'] if any(k in(0,2) for k,_ in a['segs'])]))): print('NEU weicht ab',r['n']); bad+=1
    chk+=1
print('Rekonstruktion geprüft:',chk,'Einheiten, Abweichungen:',bad)
# BGBl-Zitate
newtext={r['n']:W(''.join(x for a in r['abs']+r['ins'] for k,x in a['segs'] if k in(0,2))) for r in d['old']}
miss=[];tot=0
for art in ('art1','art2'):
    txt=open(C+art+'.txt').read().split('\n')
    txt=[l for l in txt if not re.match(r'\s*Bundesgesetzblatt Jahrgang',l)]
    items=re.split(r'\n(?=\d{1,3}\. )','\n'.join(txt))
    for it in items:
        m=re.match(r'\d{1,3}\. (?:In )?§§? (\d+[a-z]*)',it)
        if not m: continue
        sec=m.group(1)
        for q in re.findall(r'„(.*?)“',it,flags=re.S):
            if q.strip().startswith('§'): q=re.sub(r'^§[^\n]*\n(?:\s*\n)*[^\n]*\n','',q.strip(),count=1) if False else q
            for part in re.split(r'(?=\n\s*\(\d+[a-z]*\) )',q):
                part=re.sub(r'^\s*\(\d+[a-z]?\)','',part.strip()); part=re.sub(r'^\d+[a-z]?\. |^[a-z]{1,2}\) ','',part)
                w=W(part)
                if len(w)<60 or sec not in newtext: continue
                tot+=1
                if w not in newtext[sec]: miss.append((art,sec,part[:90].replace('\n',' ')))
print('BGBl-Zitate geprüft:',tot,'nicht im neuen Text:',len(miss))
for x in miss[:60]: print(x)
