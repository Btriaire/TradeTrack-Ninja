"""Helper Yahoo Finance partagé (underscore = pas de route Vercel)."""
import httpx, math, re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse, parse_qs

YF_HEADERS = {
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept":"*/*","Accept-Language":"fr-FR,fr;q=0.9,en;q=0.8",
    "Origin":"https://finance.yahoo.com","Referer":"https://finance.yahoo.com/",
}

def clean(v) -> Optional[float]:
    try:
        f=float(v); return None if (math.isnan(f) or math.isinf(f)) else round(f,2)
    except: return None

def cors(h,status=200):
    h.send_response(status)
    h.send_header("Content-type","application/json")
    h.send_header("Access-Control-Allow-Origin","*")
    h.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
    h.send_header("Access-Control-Allow-Headers","Content-Type")
    h.end_headers()

def qs_params(path):
    return {k:v[0] for k,v in parse_qs(urlparse(path).query).items()}

def slug(path, prefix):
    """Retourne les segments après /api/{prefix}/ ex: ['quote','MC.PA']"""
    parts=[p for p in urlparse(path).path.split("/") if p]
    try: i=parts.index(prefix); return parts[i+1:]
    except ValueError: return []

PERIOD_MAP={"1mo":"1mo","3mo":"3mo","6mo":"6mo","1y":"1y","2y":"2y","5y":"5y"}

def yf_chart(symbol, interval="1d", rng="5d", include_pre=False):
    url=f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    r=httpx.get(url,params={"interval":interval,"range":rng,
        "includePrePost":"true" if include_pre else "false","events":"div,splits"},
        headers=YF_HEADERS,timeout=12,follow_redirects=True)
    return r.json()

def yf_quote(symbol):
    try:
        data=yf_chart(symbol,"1d","5d")
        res=data.get("chart",{}).get("result")
        if not res: return {"symbol":symbol,"price":None}
        meta=res[0].get("meta",{})
        price=clean(meta.get("regularMarketPrice"))
        prev=clean(meta.get("chartPreviousClose") or meta.get("previousClose"))
        vol=meta.get("regularMarketVolume")
        change=pct=None
        if price and prev and prev!=0:
            change=round(price-prev,2); pct=round(change/prev*100,2)
        q0=res[0].get("indicators",{}).get("quote",[{}])[0]
        sp=[round(c,2) for c in q0.get("close",[]) if c is not None][-7:]
        return {"symbol":symbol,"price":price,"prev_close":prev,"change":change,
                "change_pct":pct,"volume":vol,"market_cap":None,
                "currency":meta.get("currency","EUR"),"sparkline":sp}
    except Exception as e:
        return {"symbol":symbol,"price":None,"error":str(e)}

def yf_history(symbol, period="6mo", interval="1d"):
    try:
        data=yf_chart(symbol,interval,PERIOD_MAP.get(period,"6mo"))
        res=data.get("chart",{}).get("result")
        if not res: return []
        r0=res[0]; ts=r0.get("timestamp",[])
        q0=r0.get("indicators",{}).get("quote",[{}])[0]
        opens=q0.get("open",[]); highs=q0.get("high",[]); lows=q0.get("low",[])
        closes=q0.get("close",[]); vols=q0.get("volume",[])
        candles=[]
        for i,t in enumerate(ts):
            o=clean(opens[i] if i<len(opens) else None)
            h=clean(highs[i] if i<len(highs) else None)
            l=clean(lows[i]  if i<len(lows)  else None)
            c=clean(closes[i] if i<len(closes) else None)
            v=vols[i] if i<len(vols) else 0
            if None in (o,h,l,c): continue
            candles.append({"time":datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),
                "open":o,"high":h,"low":l,"close":c,"volume":int(v or 0)})
        return candles
    except: return []

def yf_indicators(symbol):
    candles=yf_history(symbol,"6mo")
    if len(candles)<20: return {}
    closes=[c["close"] for c in candles[-120:]]
    n=len(closes)
    # SMA
    sma20=round(sum(closes[-20:])/20,2) if n>=20 else None
    sma50=round(sum(closes[-50:])/50,2) if n>=50 else None
    # RSI 14
    gains,losses=[],[]
    for i in range(1,min(15,n)):
        d=closes[-i]-closes[-i-1]
        (gains if d>0 else losses).append(abs(d))
    ag=sum(gains)/14 if gains else 0; al=sum(losses)/14 if losses else 0.001
    rsi=round(100-100/(1+ag/al),2)
    # Simple MACD
    def ema(d,p):
        if len(d)<p: return d[-1] if d else 0
        k=2/(p+1); e=sum(d[:p])/p
        for x in d[p:]: e=x*k+e*(1-k)
        return e
    macd=round(ema(closes,12)-ema(closes,26),4)
    signal=round(macd*0.8,4)
    # BB
    if n>=20:
        m=sum(closes[-20:])/20
        std=(sum((x-m)**2 for x in closes[-20:])/20)**0.5
        bb_upper=round(m+2*std,2); bb_lower=round(m-2*std,2)
    else: bb_upper=bb_lower=None
    sig="HAUSSIER" if rsi<40 or macd>signal else "BAISSIER" if rsi>65 or macd<signal else "NEUTRE"
    return {"rsi":rsi,"macd":macd,"macd_signal":signal,"bb_upper":bb_upper,"bb_lower":bb_lower,
            "sma20":sma20,"sma50":sma50,"signal":sig}

def yf_batch(symbols):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    result={}
    with ThreadPoolExecutor(max_workers=min(len(symbols),8)) as pool:
        futures={pool.submit(yf_quote,s):s for s in symbols}
        for f in as_completed(futures):
            s=futures[f]
            try: result[s]=f.result()
            except: result[s]={"symbol":s,"price":None}
    return result
