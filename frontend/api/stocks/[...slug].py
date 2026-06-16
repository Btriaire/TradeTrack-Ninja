from http.server import BaseHTTPRequestHandler
import json,sys,os,httpx
sys.path.insert(0,os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _yf import cors,qs_params,slug,yf_quote,yf_history,yf_indicators,yf_batch,YF_HEADERS,clean

INDICES={"CAC 40":"^FCHI","DAX":"^GDAXI","S&P 500":"^GSPC","NASDAQ":"^IXIC",
    "Euro Stoxx 50":"^STOXX50E","FTSE 100":"^FTSE","Nikkei 225":"^N225","AEX":"^AEX"}

UNIVERSE_SYMBOLS=["MC.PA","TTE.PA","AIR.PA","BNP.PA","SAN.PA","OR.PA","CS.PA","DG.PA",
    "DSY.PA","CAP.PA","KER.PA","RMS.PA","STM.PA","VIE.PA","BN.PA",
    "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA",
    "SAP.DE","SIE.DE","ALV.DE","DAI.DE","BAYN.DE",
    "ASML.AS","SHELL.AS","ABN.AS","PHIA.AS"]

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self): cors(self); self.wfile.write(b"")
    def do_GET(self):
        params=qs_params(self.path)
        segs=slug(self.path,"stocks")
        try:
            if not segs: cors(self,404); self.wfile.write(b"{}"); return
            s0=segs[0]
            # /stocks/indices
            if s0=="indices":
                from concurrent.futures import ThreadPoolExecutor,as_completed
                results=[]
                with ThreadPoolExecutor(max_workers=8) as pool:
                    futs={pool.submit(lambda n,sym:(n,yf_quote(sym)),name,sym):name
                          for name,sym in INDICES.items()}
                    for f in as_completed(futs):
                        try:
                            name,q=f.result()
                            if q.get("price"):
                                results.append({"name":name,"symbol":INDICES[name],
                                    "price":q["price"],"change_pct":q.get("change_pct",0) or 0,
                                    "change":q.get("change",0) or 0,"market_state":"REGULAR","is_open":True})
                        except: pass
                order=list(INDICES.keys())
                results.sort(key=lambda x:order.index(x["name"]) if x["name"] in order else 99)
                cors(self); self.wfile.write(json.dumps(results).encode()); return
            # /stocks/search?q=...
            if s0=="search":
                q=params.get("q","")
                if not q: cors(self); self.wfile.write(b"[]"); return
                r=httpx.get("https://query2.finance.yahoo.com/v1/finance/search",
                    params={"q":q,"quotesCount":15,"newsCount":0,"lang":"fr-FR"},
                    headers=YF_HEADERS,timeout=8)
                items=r.json().get("quotes",[])
                out=[{"symbol":i.get("symbol",""),"name":i.get("shortname") or i.get("longname",""),
                      "exchange":i.get("exchange",""),"type":i.get("quoteType",""),"market":"ALL"}
                     for i in items if i.get("quoteType") in ("EQUITY","ETF","INDEX")][:15]
                cors(self); self.wfile.write(json.dumps(out).encode()); return
            # /stocks/batch-quotes?symbols=MC.PA,AAPL
            if s0=="batch-quotes":
                syms=[s.strip() for s in params.get("symbols","").split(",") if s.strip()]
                if not syms: cors(self); self.wfile.write(b"{}"); return
                data=yf_batch(syms[:30])
                cors(self); self.wfile.write(json.dumps(data).encode()); return
            # /stocks/markets
            if s0=="markets":
                data=yf_batch(UNIVERSE_SYMBOLS)
                import importlib.util
                out=[]
                for sym in UNIVERSE_SYMBOLS:
                    q=data.get(sym,{})
                    out.append({"symbol":sym,"name":sym,"price":q.get("price") or 0,
                        "change_pct":q.get("change_pct") or 0,"volume":q.get("volume") or 0,"market_cap":0})
                cors(self); self.wfile.write(json.dumps(out).encode()); return
            # /stocks/sectors
            if s0=="sectors":
                cors(self); self.wfile.write(json.dumps([]).encode()); return
            # /stocks/quote/{sym}
            if s0=="quote" and len(segs)>=2:
                q=yf_quote(segs[1])
                st=200 if q.get("price") else 404
                cors(self,st); self.wfile.write(json.dumps(q).encode()); return
            # /stocks/history/{sym}
            if s0=="history" and len(segs)>=2:
                data=yf_history(segs[1],params.get("period","6mo"),params.get("interval","1d"))
                cors(self,200 if data else 404); self.wfile.write(json.dumps(data).encode()); return
            # /stocks/indicators/{sym}
            if s0=="indicators" and len(segs)>=2:
                data=yf_indicators(segs[1])
                cors(self); self.wfile.write(json.dumps(data).encode()); return
            # /stocks/live/{sym}
            if s0=="live" and len(segs)>=2:
                q=yf_quote(segs[1]); cors(self); self.wfile.write(json.dumps(q).encode()); return
            # /stocks/intraday/{sym}
            if s0=="intraday" and len(segs)>=2:
                from _yf import yf_chart
                data=yf_chart(segs[1],"2m","1d",True)
                res=data.get("chart",{}).get("result")
                out={"symbol":segs[1],"candles":[],"vwap":None,"high":None,"low":None,"volume":None}
                if res:
                    r0=res[0]; ts=r0.get("timestamp",[])
                    q0=r0.get("indicators",{}).get("quote",[{}])[0]
                    cs=q0.get("close",[]); os_=q0.get("open",[]); vs=q0.get("volume",[])
                    for i,t in enumerate(ts):
                        c=clean(cs[i] if i<len(cs) else None)
                        o=clean(os_[i] if i<len(os_) else None)
                        if c is None or o is None: continue
                        out["candles"].append({"time":t,"open":o,"close":c,
                            "volume":vs[i] if i<len(vs) else 0})
                cors(self); self.wfile.write(json.dumps(out).encode()); return
            # /stocks/profile/{sym} and /stocks/targets/{sym}
            if s0 in ("profile","targets") and len(segs)>=2:
                cors(self); self.wfile.write(json.dumps({"symbol":segs[1],"error":"not available"}).encode()); return
            cors(self,404); self.wfile.write(json.dumps({"error":"not found"}).encode())
        except Exception as e:
            cors(self,500); self.wfile.write(json.dumps({"error":str(e)}).encode())
    def log_message(self,*a): pass
