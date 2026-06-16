from http.server import BaseHTTPRequestHandler
import json,sys,os,random
sys.path.insert(0,os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _yf import cors,qs_params,slug,yf_quote,yf_batch,yf_indicators

WATCHLIST=["MC.PA","TTE.PA","AIR.PA","BNP.PA","SAN.PA","OR.PA","DSY.PA","CAP.PA",
    "AAPL","MSFT","NVDA","GOOGL","TSLA","META","AMZN",
    "SAP.DE","ASML.AS","SIE.DE"]

SECTOR_ETFS={
    "Technologie":"XLK","Énergie":"XLE","Finance":"XLF","Santé":"XLV",
    "Consommation":"XLY","Industrie":"XLI","Luxe & Mode":"MC.PA",
    "Chimie":"AI.PA","Infrastructures":"DG.PA",
}

GEO_EVENTS=[
    {"id":"fed1","type":"banque_centrale","title":"Fed — Décision taux","description":"La Fed maintient ses taux entre 4.25-4.50%.","impact":"medium","region":"USA","date":"2025-06"},
    {"id":"bce1","type":"banque_centrale","title":"BCE — Politique monétaire","description":"La BCE en phase de désinflation progressive.","impact":"medium","region":"Europe","date":"2025-06"},
    {"id":"trade1","type":"commerce","title":"Tensions commerciales","description":"Droits de douane américains sur les importations chinoises et européennes.","impact":"high","region":"Global","date":"2025-06"},
    {"id":"ukraine1","type":"geopolitique","title":"Conflit Ukraine","description":"Impact sur les prix de l'énergie et les chaînes d'approvisionnement.","impact":"high","region":"Europe","date":"2025-06"},
    {"id":"cac1","type":"marche","title":"CAC 40 — Contexte","description":"Marchés européens sous pression liée aux incertitudes macroéconomiques.","impact":"medium","region":"France","date":"2025-06"},
]

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self): cors(self); self.wfile.write(b"")
    def do_POST(self):
        cors(self); self.wfile.write(json.dumps({"ok":True}).encode())
    def do_GET(self):
        segs=slug(self.path,"signals")
        try:
            sub=segs[0] if segs else ""
            if sub=="geo-events":
                cors(self); self.wfile.write(json.dumps(GEO_EVENTS).encode()); return
            if sub=="top-sectors":
                from concurrent.futures import ThreadPoolExecutor,as_completed
                results=[]
                with ThreadPoolExecutor(max_workers=6) as pool:
                    futs={pool.submit(yf_quote,sym):name for name,sym in SECTOR_ETFS.items()}
                    for f in as_completed(futs):
                        name=futs[f]
                        try:
                            q=f.result()
                            results.append({"sector":name,"change_pct":q.get("change_pct") or 0,
                                "price":q.get("price") or 0,"symbol":q.get("symbol","")})
                        except: pass
                results.sort(key=lambda x:x["change_pct"],reverse=True)
                cors(self); self.wfile.write(json.dumps(results).encode()); return
            if sub in ("game",""):
                picks=random.sample(WATCHLIST,min(5,len(WATCHLIST)))
                batch=yf_batch(picks)
                best=None; best_score=0
                for sym,q in batch.items():
                    if not q.get("price"): continue
                    pct=abs(q.get("change_pct") or 0)
                    if pct>best_score: best_score=pct; best=sym
                if best:
                    q=batch[best]
                    game={"symbol":best,"name":best.split(".")[0],
                        "sector":"Finance","index":"CAC 40" if ".PA" in best else "NASDAQ",
                        "price":q.get("price"),"change_pct":q.get("change_pct"),
                        "score":round(best_score,1),"reason":"Mouvement notable du jour",
                        "signal":"HAUSSIER" if (q.get("change_pct") or 0)>0 else "BAISSIER"}
                else:
                    game={"symbol":"MC.PA","name":"LVMH","sector":"Luxe & Mode",
                        "index":"CAC 40","price":None,"change_pct":None,"score":0,
                        "reason":"Indisponible","signal":"NEUTRE"}
                cors(self); self.wfile.write(json.dumps(game).encode()); return
            if sub=="daily":
                cors(self); self.wfile.write(json.dumps({"great_catch":[],"stay_away":[],"generated_at":""}).encode()); return
            cors(self,404); self.wfile.write(json.dumps({"error":"not found"}).encode())
        except Exception as e:
            cors(self,500); self.wfile.write(json.dumps({"error":str(e)}).encode())
    def log_message(self,*a): pass
