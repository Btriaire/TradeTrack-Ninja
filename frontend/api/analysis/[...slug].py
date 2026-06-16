from http.server import BaseHTTPRequestHandler
import json,sys,os
sys.path.insert(0,os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _yf import cors,slug

def call_gemini(prompt):
    import httpx,os
    key=os.environ.get("GEMINI_API_KEY","")
    if not key: return None
    url=f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
    r=httpx.post(url,json={"contents":[{"parts":[{"text":prompt}]}]},timeout=30)
    data=r.json()
    return data.get("candidates",[{}])[0].get("content",{}).get("parts",[{}])[0].get("text","")

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self): cors(self); self.wfile.write(b"")
    def do_POST(self):
        segs=slug(self.path,"analysis")
        sub=segs[0] if segs else ""
        try:
            length=int(self.headers.get("Content-Length",0))
            body=json.loads(self.rfile.read(length)) if length>0 else {}
            sym=body.get("symbol","?"); name=body.get("name",sym)
            articles=body.get("articles",[]); indicators=body.get("indicators",{})
            if sub=="sentiment":
                news_txt="\n".join(f"- {a.get('title','')}" for a in articles[:5])
                prompt=f"""Analyse le sentiment pour {name} ({sym}).
Indicateurs: RSI={indicators.get('rsi','N/A')}, Signal={indicators.get('signal','N/A')}
Actualités:\n{news_txt}
Réponds en JSON: {{"sentiment":"HAUSSIER|BAISSIER|NEUTRE","score":0-10,"resume":"...","points_cles":["..."],"risques":["..."],"horizon":"court|moyen|long terme"}}"""
                text=call_gemini(prompt)
                if text:
                    try:
                        import re
                        m=re.search(r"\{[\s\S]*\}",text)
                        if m: cors(self); self.wfile.write(m.group().encode()); return
                    except: pass
                fallback={"sentiment":indicators.get("signal","NEUTRE"),"score":5,
                    "resume":f"Analyse IA indisponible pour {name}.",
                    "points_cles":["Données insuffisantes"],"risques":["Incertitude"],"horizon":"moyen terme"}
                cors(self); self.wfile.write(json.dumps(fallback).encode())
            elif sub in ("diagnostic","cloture"):
                candles=body.get("candles",[]); ind=body.get("indicators",{})
                last_price=candles[-1]["close"] if candles else "N/A"
                prompt=f"""{"Diagnostic technique" if sub=="diagnostic" else "Analyse de clôture IA"} pour {name} ({sym}).
Prix: {last_price} | RSI: {ind.get("rsi","N/A")} | Signal: {ind.get("signal","N/A")} | SMA20: {ind.get("sma20","N/A")}
Fournis une analyse concise en français (3-5 phrases) avec niveau de conviction (Faible/Moyen/Fort)."""
                text=call_gemini(prompt)
                result={"symbol":sym,"analysis":text or f"Analyse {sub} indisponible.",
                    "conviction":"Moyen","generated_at":""}
                cors(self); self.wfile.write(json.dumps(result).encode())
            else:
                cors(self,404); self.wfile.write(json.dumps({"error":"not found"}).encode())
        except Exception as e:
            cors(self,500); self.wfile.write(json.dumps({"error":str(e)}).encode())
    def log_message(self,*a): pass
