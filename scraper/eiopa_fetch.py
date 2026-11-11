"""Fetch EIOPA Register of Insurance Undertakings via ASP.NET postback (search -> export CSV/Excel).
usage: eiopa_fetch.py <outdir>"""
import re,sys,html,urllib.request,urllib.parse,http.cookiejar
out=sys.argv[1]
URL='https://register.eiopa.europa.eu/registers/register-of-insurance-undertakings'
UA='Mozilla/5.0 (compatible; data-fetch/1.0)'
P='ctl00$ctl34$g_3217d152_792c_4dd6_9a62_51a782ee2349$'
DOMESTIC='49c9c4c0-70ab-4500-94f4-3f1f897d340f'
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
op.addheaders=[('User-Agent',UA)]
def fields(h):
    f={}
    for m in re.finditer(r'<input[^>]*type="hidden"[^>]*>',h):
        n=re.search(r'name="([^"]+)"',m.group(0)); v=re.search(r'value="([^"]*)"',m.group(0))
        if n: f[n.group(1)]=html.unescape(v.group(1)) if v else ''
    for sel in re.finditer(r'<select name="([^"]+)".*?</select>',h,flags=re.S):
        s=re.search(r'<option[^>]*selected[^>]*value="([^"]*)"',sel.group(0)) or re.search(r'<option[^>]*value="([^"]*)"',sel.group(0))
        f[sel.group(1)]=html.unescape(s.group(1)) if s else ''
    for m in re.finditer(r'<input name="([^"]+)" type="text"(?: value="([^"]*)")?',h): f[m.group(1)]=html.unescape(m.group(2) or '')
    return f
def post(f):
    r=op.open(URL,urllib.parse.urlencode(f).encode(),timeout=600)
    return r.headers,r.read()
h=op.open(URL,timeout=60).read().decode('utf-8','replace')
for label,status in (('domestic',DOMESTIC),('all','All')):
    f=fields(h); f[P+'ddlActivity']='1'; f[P+'ddlCrossBorderStatus']=status; f[P+'btnSearch']='Search'
    hd,body=post(f); r=body.decode('utf-8','replace')
    c=re.search(r'lblCounter[^>]*>([^<]*)',r); print(label,'search:',c.group(1) if c else None,len(r))
    for ext,target in (('csv','lkbtnExport'),('xlsx','lkbtnExcelExport')):
        f2=fields(r); f2['__EVENTTARGET']=P+target; f2['__EVENTARGUMENT']=''
        hd,body=post(f2)
        print(label,ext,hd.get('Content-Type'),hd.get('Content-Disposition'),len(body))
        open(f'{out}/eiopa_insurance_undertakings_{label}_active.{ext}','wb').write(body)
