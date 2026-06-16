from http.server import BaseHTTPRequestHandler
import json,sys,os,httpx,feedparser,re,asyncio
from datetime import datetime
sys.path.insert(0,os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _yf import cors,qs_params,slug

SOURCES_PRIMARY={
    "BFM Business":"https://bfmbusiness.bfmtv.com/rss/info/",
    "Boursorama":"https://www.boursorama.com/rss/actus-societes",
    "Figaro Economie":"https://www.lefigaro.fr/rss/figaro_economie.xml",
    "Zone Bourse":"https://www.zonebourse.com/rss/news.xml",
    "Challenges":"https://www.challenges.fr/rss.xml",
    "Yahoo Finance":"https://finance.yahoo.com/rss/topstories",
    "CNBC":"https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "Reuters":"https://feeds.reuters.com/reuters/businessNews",
}
SOURCES_GENERAL={
    "BFM Business":("https://bfmbusiness.bfmtv.com/rss/info/","France","🇫🇷"),
    "Boursorama":("https://www.boursorama.com/rss/actus-societes","Marchés FR","🇫🇷"),
    "Figaro Economie":("https://www.lefigaro.fr/rss/figaro_economie.xml","France","🇫🇷"),
    "Zone Bourse":("https://www.zonebourse.com/rss/news.xml","Marchés FR","🇫🇷"),
    "Capital.fr":("https://www.capital.fr/feed","France","🇫🇷"),
    "La Tribune":("https://www.latribune.fr/rss.html","France","🇫🇷"),
    "Les Echos":("https://www.lesechos.fr/arc/outboundfeeds/rss/?outputType=xml","France","🇫🇷"),
    "L\'AGEFI":("https://www.agefi.fr/rss/all.xml","Finance","💹"),
    "Forbes FR":("https://www.forbes.fr/feed/","Finance","💹"),
    "Challenges":("https://www.challenges.fr/rss.xml","Finance","💹"),
    "Investopedia":("https://www.investopedia.com/feeds/rss.aspx","Finance","💹"),
    "The Street":("https://www.thestreet.com/.rss/full/","Finance","💹"),
    "Barron\'s":("https://www.barrons.com/real-time/feed/rss","Finance","💹"),
    "CNBC":("https://www.cnbc.com/id/100003114/device/rss/rss.html","International","🌍"),
    "Reuters Business":("https://feeds.reuters.com/reuters/businessNews","International","🌍"),
    "Guardian Business":("https://www.theguardian.com/uk/business/rss","International","🌍"),
    "France 24 Éco":("https://www.france24.com/fr/rss?uri=/fr/economie","Géopolitique","🌐"),
    "RFI":("https://www.rfi.fr/fr/rss.xml","Géopolitique","🌐"),
    "Deutsche Welle":("https://rss.dw.com/rdf/rss-en-business","Géopolitique","🌐"),
    "The Diplomat":("https://thediplomat.com/feed/","Géopolitique","🌐"),
    "Politico EU":("https://www.politico.eu/rss/","Géopolitique","🌐"),
    "EurActiv":("https://www.euractiv.com/feed/","Géopolitique","🌐"),
    "CFR Global":("https://www.cfr.org/rss/global.xml","Géopolitique","🌐"),
    "Le Monde Diplo":("https://www.monde-diplomatique.fr/rss.xml","Géopolitique","🌐"),
    "Al Jazeera Eco":("https://www.aljazeera.com/xml/rss/all.xml","Géopolitique","🌐"),
    "Yahoo Finance":("https://finance.yahoo.com/rss/topstories","Marchés","📊"),
    "MarketWatch":("https://feeds.content.dowjones.io/public/rss/mw_topstories","Marchés","📊"),
}
RSS_HEADERS={"User-Agent":"Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36",
    "Accept":"application/rss+xml,*/*","Accept-Language":"fr-FR,fr;q=0.9"}

def fetch_rss(name,url,cat="Général",flag="🌍"):
    try:
        r=httpx.get(url,headers=RSS_HEADERS,timeout=8,follow_redirects=True)
        if r.status_code>=400: return []
        feed=feedparser.parse(r.text)
        arts=[]
        for e in feed.entries[:15]:
            title=e.get("title","").strip()
            if not title: continue
            summary=re.sub(r"<[^>]+>"," ",e.get("summary",e.get("description",""))).strip()
            arts.append({"source":name,"category":cat,"flag":flag,"title":title,
                "summary":summary[:600],"url":e.get("link",""),
                "date":(getattr(e,"published",None) or getattr(e,"updated",None) or datetime.now().isoformat())[:25],
                "image":None})
        return arts
    except: return []

def fetch_many(sources_dict,with_meta=False):
    from concurrent.futures import ThreadPoolExecutor,as_completed
    all_arts=[]
    if with_meta:
        futs_map={}
        with ThreadPoolExecutor(max_workers=6) as pool:
            for name,(url,cat,flag) in sources_dict.items():
                futs_map[pool.submit(fetch_rss,name,url,cat,flag)]=name
            for f in as_completed(futs_map):
                try: all_arts.extend(f.result())
                except: pass
    else:
        with ThreadPoolExecutor(max_workers=6) as pool:
            futs=[pool.submit(fetch_rss,name,url) for name,url in sources_dict.items()]
            for f in futs:
                try: all_arts.extend(f.result())
                except: pass
    all_arts.sort(key=lambda x:x["date"],reverse=True)
    return all_arts

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self): cors(self); self.wfile.write(b"")
    def do_GET(self):
        params=qs_params(self.path)
        segs=slug(self.path,"news")
        try:
            sub=segs[0] if segs and segs[0] else ""
            if sub=="general":
                cat=params.get("category","Tout")
                arts=fetch_many(SOURCES_GENERAL,with_meta=True)
                if cat and cat!="Tout":
                    arts=[a for a in arts if a.get("category")==cat]
                cors(self); self.wfile.write(json.dumps(arts).encode()); return
            if sub=="article":
                url=params.get("url","")
                cors(self); self.wfile.write(json.dumps({"url":url,"content":"","title":"","image":None,"author":None,"sitename":""}).encode()); return
            # main news (default)
            sym=params.get("symbol","")
            arts=fetch_many(SOURCES_PRIMARY)
            if sym:
                ticker=sym.split(".")[0].lower()
                filtered=[a for a in arts if ticker in (a["title"]+a.get("summary","")).lower()]
                arts=filtered if filtered else arts
            cors(self); self.wfile.write(json.dumps(arts).encode())
        except Exception as e:
            cors(self,500); self.wfile.write(json.dumps({"error":str(e)}).encode())
    def log_message(self,*a): pass
