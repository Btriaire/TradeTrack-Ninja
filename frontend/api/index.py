"""
Backend unique TradeTrack — fonction serverless Vercel.
Toutes les routes /api/* sont redirigées ici via vercel.json (rewrite),
ce qui évite le bug de routing des catch-all imbriqués [...slug].py
(qui ne matchaient qu'un seul segment de chemin).
"""
from http.server import BaseHTTPRequestHandler
import json, sys, os, random, re, time
from datetime import datetime
from urllib.parse import urlparse
import httpx

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _yf import (cors, qs_params, yf_quote, yf_history, yf_indicators,
                 yf_batch, yf_chart, YF_HEADERS, clean)

# ── Données stocks ────────────────────────────────────────────────────────────
INDICES = {"CAC 40":"^FCHI","DAX":"^GDAXI","S&P 500":"^GSPC","NASDAQ":"^IXIC",
    "Euro Stoxx 50":"^STOXX50E","FTSE 100":"^FTSE","Nikkei 225":"^N225","AEX":"^AEX"}

UNIVERSE_SYMBOLS = ["MC.PA","TTE.PA","AIR.PA","BNP.PA","SAN.PA","OR.PA","CS.PA","DG.PA",
    "DSY.PA","CAP.PA","KER.PA","RMS.PA","STM.PA","VIE.PA","BN.PA",
    "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA",
    "SAP.DE","SIE.DE","ALV.DE","DAI.DE","BAYN.DE",
    "ASML.AS","SHELL.AS","ABN.AS","PHIA.AS"]

# ── Données news ──────────────────────────────────────────────────────────────
SOURCES_PRIMARY = {
    "BFM Business":"https://bfmbusiness.bfmtv.com/rss/info/",
    "Boursorama":"https://www.boursorama.com/rss/actus-societes",
    "Figaro Economie":"https://www.lefigaro.fr/rss/figaro_economie.xml",
    "Zone Bourse":"https://www.zonebourse.com/rss/news.xml",
    "Challenges":"https://www.challenges.fr/rss.xml",
    "Yahoo Finance":"https://finance.yahoo.com/rss/topstories",
    "CNBC":"https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "Reuters":"https://feeds.reuters.com/reuters/businessNews",
}
SOURCES_GENERAL = {
    "BFM Business":("https://bfmbusiness.bfmtv.com/rss/info/","France","🇫🇷"),
    "Boursorama":("https://www.boursorama.com/rss/actus-societes","Marchés FR","🇫🇷"),
    "Figaro Economie":("https://www.lefigaro.fr/rss/figaro_economie.xml","France","🇫🇷"),
    "Zone Bourse":("https://www.zonebourse.com/rss/news.xml","Marchés FR","🇫🇷"),
    "Capital.fr":("https://www.capital.fr/feed","France","🇫🇷"),
    "La Tribune":("https://www.latribune.fr/rss.html","France","🇫🇷"),
    "Les Echos":("https://www.lesechos.fr/arc/outboundfeeds/rss/?outputType=xml","France","🇫🇷"),
    "L'AGEFI":("https://www.agefi.fr/rss/all.xml","Finance","💹"),
    "Forbes FR":("https://www.forbes.fr/feed/","Finance","💹"),
    "Challenges":("https://www.challenges.fr/rss.xml","Finance","💹"),
    "Investopedia":("https://www.investopedia.com/feeds/rss.aspx","Finance","💹"),
    "The Street":("https://www.thestreet.com/.rss/full/","Finance","💹"),
    "Barron's":("https://www.barrons.com/real-time/feed/rss","Finance","💹"),
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
RSS_HEADERS = {"User-Agent":"Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36",
    "Accept":"application/rss+xml,*/*","Accept-Language":"fr-FR,fr;q=0.9"}

def fetch_rss(name, url, cat="Général", flag="🌍"):
    try:
        import feedparser
        r = httpx.get(url, headers=RSS_HEADERS, timeout=5, follow_redirects=True)
        if r.status_code >= 400: return []
        feed = feedparser.parse(r.text)
        arts = []
        for e in feed.entries[:12]:
            title = e.get("title","").strip()
            if not title: continue
            summary = re.sub(r"<[^>]+>"," ", e.get("summary", e.get("description",""))).strip()
            arts.append({"source":name,"category":cat,"flag":flag,"title":title,
                "summary":summary[:600],"url":e.get("link",""),
                "date":(getattr(e,"published",None) or getattr(e,"updated",None) or datetime.now().isoformat())[:25],
                "image":None})
        return arts
    except Exception:
        return []

# ── Cache news (réutilisé par les invocations "warm" de la fonction) ───────────
_NEWS_CACHE = {}
_NEWS_TTL = 600  # 10 min

def _cached_news(key, builder):
    e = _NEWS_CACHE.get(key)
    if e and (time.time() - e[0]) < _NEWS_TTL:
        return e[1]
    data = builder()
    if data:
        _NEWS_CACHE[key] = (time.time(), data)
    return data

def fetch_many(sources_dict, with_meta=False, budget=6.0):
    """Fetch RSS en parallèle avec un budget global (s). Au-delà du budget,
    on renvoie ce qui est prêt et on abandonne les sources lentes — garantit
    un retour < limite Vercel (10s) même si une source bloque (IP cloud)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FTimeout
    pool = ThreadPoolExecutor(max_workers=max(8, len(sources_dict)))
    if with_meta:
        futs = [pool.submit(fetch_rss, name, url, cat, flag)
                for name,(url,cat,flag) in sources_dict.items()]
    else:
        futs = [pool.submit(fetch_rss, name, url) for name,url in sources_dict.items()]
    all_arts = []
    try:
        for f in as_completed(futs, timeout=budget):
            try: all_arts.extend(f.result())
            except Exception: pass
    except FTimeout:
        pass  # budget dépassé : on garde ce qui est arrivé
    pool.shutdown(wait=False, cancel_futures=True)
    all_arts.sort(key=lambda x: x["date"], reverse=True)
    return all_arts

# ── Données signals ───────────────────────────────────────────────────────────
WATCHLIST = ["MC.PA","TTE.PA","AIR.PA","BNP.PA","SAN.PA","OR.PA","DSY.PA","CAP.PA",
    "AAPL","MSFT","NVDA","GOOGL","TSLA","META","AMZN","SAP.DE","ASML.AS","SIE.DE"]

# symbole → (nom, indice, drapeau) — univers scanné par /signals/daily
SIGNAL_UNIVERSE = {
    "MC.PA":("LVMH","CAC 40","🇫🇷"),       "TTE.PA":("TotalEnergies","CAC 40","🇫🇷"),
    "AIR.PA":("Airbus","CAC 40","🇫🇷"),     "BNP.PA":("BNP Paribas","CAC 40","🇫🇷"),
    "OR.PA":("L'Oréal","CAC 40","🇫🇷"),     "SAN.PA":("Sanofi","CAC 40","🇫🇷"),
    "DG.PA":("Vinci","CAC 40","🇫🇷"),       "CAP.PA":("Capgemini","CAC 40","🇫🇷"),
    "AAPL":("Apple","NASDAQ","🇺🇸"),        "MSFT":("Microsoft","NASDAQ","🇺🇸"),
    "NVDA":("Nvidia","NASDAQ","🇺🇸"),       "GOOGL":("Alphabet","NASDAQ","🇺🇸"),
    "AMZN":("Amazon","NASDAQ","🇺🇸"),       "META":("Meta","NASDAQ","🇺🇸"),
    "TSLA":("Tesla","NASDAQ","🇺🇸"),        "SAP.DE":("SAP","DAX","🇩🇪"),
    "SIE.DE":("Siemens","DAX","🇩🇪"),       "ASML.AS":("ASML","AEX","🇳🇱"),
}

def _signal_card(sym):
    """Calcule une carte de signal (scoring technique) pour un symbole."""
    name, index, country = SIGNAL_UNIVERSE.get(sym, (sym, "", "🌍"))
    q = yf_quote(sym)
    price = q.get("price")
    if not price:
        return None
    ind = yf_indicators(sym)
    if not ind:
        return None
    rsi = ind.get("rsi", 50) or 50
    macd = ind.get("macd", 0) or 0
    msig = ind.get("macd_signal", 0) or 0
    sma20 = ind.get("sma20"); sma50 = ind.get("sma50")
    bb_up = ind.get("bb_upper"); bb_lo = ind.get("bb_lower")
    change = q.get("change_pct", 0) or 0
    buy = sell = 0; tags = []
    if rsi < 35:  buy += 1;  tags.append("Survente")
    elif rsi > 65: sell += 1; tags.append("Surachat")
    if macd > msig: buy += 1;  tags.append("MACD ↑")
    elif macd < msig: sell += 1; tags.append("MACD ↓")
    if sma20 and sma50:
        if sma20 > sma50: buy += 1;  tags.append("Tendance ↑")
        else:             sell += 1; tags.append("Tendance ↓")
    if buy >= sell and buy >= 1:
        side, score = "buy", buy
        signal = "HAUSSIER"
        pot = round((bb_up - price) / price * 100, 1) if bb_up and bb_up > price else round(buy * 3.0, 1)
        reason = "Configuration acheteuse : " + ", ".join(tags[:3]).lower() if tags else "Signal technique haussier"
    elif sell > buy and sell >= 1:
        side, score = "sell", sell
        signal = "BAISSIER"
        pot = round((bb_lo - price) / price * 100, 1) if bb_lo and bb_lo < price else round(-sell * 3.0, 1)
        reason = "Configuration vendeuse : " + ", ".join(tags[:3]).lower() if tags else "Signal technique baissier"
    else:
        return None
    return {"side": side, "card": {
        "symbol": sym, "name": name, "index": index, "country": country,
        "price": price, "change_pct": change, "score": score, "rsi": rsi,
        "tags": tags, "potential_pct": pot, "horizon": "2-10 j",
        "signal": signal, "reason": reason}}

def compute_daily_signals():
    from concurrent.futures import ThreadPoolExecutor, as_completed
    great, away = [], []
    syms = list(SIGNAL_UNIVERSE.keys())
    with ThreadPoolExecutor(max_workers=len(syms)) as pool:
        futs = [pool.submit(_signal_card, s) for s in syms]
        for f in as_completed(futs):
            try:
                r = f.result()
                if not r: continue
                (great if r["side"] == "buy" else away).append(r["card"])
            except Exception:
                pass
    great.sort(key=lambda c: (c["score"], c["potential_pct"]), reverse=True)
    away.sort(key=lambda c: (c["score"], -c["potential_pct"]), reverse=True)
    return {"great_catch": great, "stay_away": away,
            "universe_size": len(syms), "generating": False,
            "generated_at": datetime.now().isoformat()}
SECTOR_ETFS = {"Technologie":"XLK","Énergie":"XLE","Finance":"XLF","Santé":"XLV",
    "Consommation":"XLY","Industrie":"XLI","Luxe & Mode":"MC.PA","Chimie":"AI.PA","Infrastructures":"DG.PA"}
GEO_EVENTS = [
    {"id":"fed1","type":"banque_centrale","title":"Fed — Décision taux","description":"La Fed maintient ses taux entre 4.25-4.50%.","impact":"medium","region":"USA","date":"2025-06"},
    {"id":"bce1","type":"banque_centrale","title":"BCE — Politique monétaire","description":"La BCE en phase de désinflation progressive.","impact":"medium","region":"Europe","date":"2025-06"},
    {"id":"trade1","type":"commerce","title":"Tensions commerciales","description":"Droits de douane américains sur les importations chinoises et européennes.","impact":"high","region":"Global","date":"2025-06"},
    {"id":"ukraine1","type":"geopolitique","title":"Conflit Ukraine","description":"Impact sur les prix de l'énergie et les chaînes d'approvisionnement.","impact":"high","region":"Europe","date":"2025-06"},
    {"id":"cac1","type":"marche","title":"CAC 40 — Contexte","description":"Marchés européens sous pression liée aux incertitudes macroéconomiques.","impact":"medium","region":"France","date":"2025-06"},
]

# ── Données simulateur ────────────────────────────────────────────────────────
TARIFS = {"courtage_min":0.90,"courtage_pct":0.001,"ttf_pct":0.003,"garde_annuel_pct":0.005}

# ── Analyse IA (Gemini) ───────────────────────────────────────────────────────
def call_gemini(prompt):
    key = os.environ.get("GEMINI_API_KEY","")
    if not key: return None
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
        r = httpx.post(url, json={"contents":[{"parts":[{"text":prompt}]}]}, timeout=30)
        data = r.json()
        return data.get("candidates",[{}])[0].get("content",{}).get("parts",[{}])[0].get("text","")
    except Exception:
        return None

# ── Routing ───────────────────────────────────────────────────────────────────
def _parts(path):
    p = [x for x in urlparse(path).path.split("/") if x]
    if p and p[0] == "api": p = p[1:]
    return p


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_OPTIONS(self): cors(self); self.wfile.write(b"")

    def _send(self, obj, status=200):
        cors(self, status)
        self.wfile.write(obj if isinstance(obj, (bytes, bytearray)) else json.dumps(obj).encode())

    # ── GET ───────────────────────────────────────────────────────────────────
    def do_GET(self):
        parts = _parts(self.path)
        group = parts[0] if parts else ""
        segs = parts[1:]
        params = qs_params(self.path)
        try:
            if group == "ping":
                return self._send({"pong": True})
            if group == "stocks":
                return self._stocks_get(segs, params)
            if group == "news":
                return self._news_get(segs, params)
            if group == "signals":
                return self._signals_get(segs, params)
            if group == "simulator":
                return self._send(TARIFS)
            self._send({"error": "not found"}, 404)
        except Exception as e:
            self._send({"error": str(e)}, 500)

    # ── POST ──────────────────────────────────────────────────────────────────
    def do_POST(self):
        parts = _parts(self.path)
        group = parts[0] if parts else ""
        segs = parts[1:]
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length > 0 else {}
        except Exception:
            body = {}
        try:
            if group == "analysis":
                return self._analysis_post(segs, body)
            if group == "simulator":
                return self._simulator_post(segs, body)
            if group == "signals":
                return self._send({"ok": True})
            self._send({"error": "not found"}, 404)
        except Exception as e:
            self._send({"error": str(e)}, 500)

    # ── Stocks ──────────────────────────────────────────────────────────────
    def _stocks_get(self, segs, params):
        if not segs:
            return self._send({}, 404)
        s0 = segs[0]
        if s0 == "indices":
            from concurrent.futures import ThreadPoolExecutor, as_completed
            results = []
            with ThreadPoolExecutor(max_workers=8) as pool:
                futs = {pool.submit(lambda n, sym: (n, yf_quote(sym)), name, sym): name
                        for name, sym in INDICES.items()}
                for f in as_completed(futs):
                    try:
                        name, q = f.result()
                        if q.get("price"):
                            results.append({"name":name,"symbol":INDICES[name],"price":q["price"],
                                "change_pct":q.get("change_pct",0) or 0,"change":q.get("change",0) or 0,
                                "market_state":"REGULAR","is_open":True})
                    except Exception: pass
            order = list(INDICES.keys())
            results.sort(key=lambda x: order.index(x["name"]) if x["name"] in order else 99)
            return self._send(results)
        if s0 == "search":
            q = params.get("q","")
            if not q: return self._send([])
            r = httpx.get("https://query2.finance.yahoo.com/v1/finance/search",
                params={"q":q,"quotesCount":15,"newsCount":0,"lang":"fr-FR"},
                headers=YF_HEADERS, timeout=8)
            items = r.json().get("quotes",[])
            out = [{"symbol":i.get("symbol",""),"name":i.get("shortname") or i.get("longname",""),
                    "exchange":i.get("exchange",""),"type":i.get("quoteType",""),"market":"ALL"}
                   for i in items if i.get("quoteType") in ("EQUITY","ETF","INDEX")][:15]
            return self._send(out)
        if s0 == "batch-quotes":
            syms = [s.strip() for s in params.get("symbols","").split(",") if s.strip()]
            if not syms: return self._send({})
            return self._send(yf_batch(syms[:30]))
        if s0 == "markets":
            data = yf_batch(UNIVERSE_SYMBOLS)
            out = [{"symbol":sym,"name":sym,"price":data.get(sym,{}).get("price") or 0,
                    "change_pct":data.get(sym,{}).get("change_pct") or 0,
                    "volume":data.get(sym,{}).get("volume") or 0,"market_cap":0}
                   for sym in UNIVERSE_SYMBOLS]
            return self._send(out)
        if s0 == "sectors":
            return self._send([])
        if s0 == "quote" and len(segs) >= 2:
            q = yf_quote(segs[1])
            return self._send(q, 200 if q.get("price") else 404)
        if s0 == "history" and len(segs) >= 2:
            data = yf_history(segs[1], params.get("period","6mo"), params.get("interval","1d"))
            return self._send(data, 200 if data else 404)
        if s0 == "indicators" and len(segs) >= 2:
            return self._send(yf_indicators(segs[1]))
        if s0 == "live" and len(segs) >= 2:
            return self._send(yf_quote(segs[1]))
        if s0 == "intraday" and len(segs) >= 2:
            data = yf_chart(segs[1], "2m", "1d", True)
            res = data.get("chart",{}).get("result")
            out = {"symbol":segs[1],"candles":[],"vwap":None,"high":None,"low":None,"volume":None}
            if res:
                r0 = res[0]; ts = r0.get("timestamp",[])
                q0 = r0.get("indicators",{}).get("quote",[{}])[0]
                cs = q0.get("close",[]); os_ = q0.get("open",[]); vs = q0.get("volume",[])
                for i, t in enumerate(ts):
                    c = clean(cs[i] if i < len(cs) else None)
                    o = clean(os_[i] if i < len(os_) else None)
                    if c is None or o is None: continue
                    out["candles"].append({"time":t,"open":o,"close":c,"volume":vs[i] if i < len(vs) else 0})
            return self._send(out)
        if s0 in ("profile","targets") and len(segs) >= 2:
            return self._send({"symbol":segs[1],"error":"not available"})
        self._send({"error":"not found"}, 404)

    # ── News ────────────────────────────────────────────────────────────────
    def _news_get(self, segs, params):
        sub = segs[0] if segs and segs[0] else ""
        if sub == "general":
            cat = params.get("category","Tout")
            arts = _cached_news("general", lambda: fetch_many(SOURCES_GENERAL, with_meta=True))
            if cat and cat != "Tout":
                arts = [a for a in arts if a.get("category") == cat]
            return self._send(arts)
        if sub == "article":
            url = params.get("url","")
            return self._send({"url":url,"content":"","title":"","image":None,"author":None,"sitename":""})
        sym = params.get("symbol","")
        arts = _cached_news("primary", lambda: fetch_many(SOURCES_PRIMARY))
        if sym:
            ticker = sym.split(".")[0].lower()
            filtered = [a for a in arts if ticker in (a["title"]+a.get("summary","")).lower()]
            arts = filtered if filtered else arts
        self._send(arts)

    # ── Signals ─────────────────────────────────────────────────────────────
    def _signals_get(self, segs, params):
        sub = segs[0] if segs else ""
        if sub == "geo-events":
            return self._send(GEO_EVENTS)
        if sub == "top-sectors":
            from concurrent.futures import ThreadPoolExecutor, as_completed
            results = []
            with ThreadPoolExecutor(max_workers=6) as pool:
                futs = {pool.submit(yf_quote, sym): name for name, sym in SECTOR_ETFS.items()}
                for f in as_completed(futs):
                    name = futs[f]
                    try:
                        q = f.result()
                        results.append({"sector":name,"change_pct":q.get("change_pct") or 0,
                            "price":q.get("price") or 0,"symbol":q.get("symbol","")})
                    except Exception: pass
            results.sort(key=lambda x: x["change_pct"], reverse=True)
            return self._send(results)
        if sub in ("game", ""):
            picks = random.sample(WATCHLIST, min(5, len(WATCHLIST)))
            batch = yf_batch(picks)
            best = None; best_score = 0
            for sym, q in batch.items():
                if not q.get("price"): continue
                pct = abs(q.get("change_pct") or 0)
                if pct > best_score: best_score = pct; best = sym
            if best:
                q = batch[best]
                game = {"symbol":best,"name":best.split(".")[0],"sector":"Finance",
                    "index":"CAC 40" if ".PA" in best else "NASDAQ","price":q.get("price"),
                    "change_pct":q.get("change_pct"),"score":round(best_score,1),
                    "reason":"Mouvement notable du jour",
                    "signal":"HAUSSIER" if (q.get("change_pct") or 0) > 0 else "BAISSIER"}
            else:
                game = {"symbol":"MC.PA","name":"LVMH","sector":"Luxe & Mode","index":"CAC 40",
                    "price":None,"change_pct":None,"score":0,"reason":"Indisponible","signal":"NEUTRE"}
            return self._send(game)
        if sub == "daily":
            return self._send(compute_daily_signals())
        self._send({"error":"not found"}, 404)

    # ── Analyse IA ──────────────────────────────────────────────────────────
    def _analysis_post(self, segs, body):
        sub = segs[0] if segs else ""
        sym = body.get("symbol","?"); name = body.get("name", sym)
        articles = body.get("articles",[]); indicators = body.get("indicators",{})
        if sub == "sentiment":
            news_txt = "\n".join(f"- {a.get('title','')}" for a in articles[:5])
            prompt = (f"Analyse le sentiment pour {name} ({sym}).\n"
                f"Indicateurs: RSI={indicators.get('rsi','N/A')}, Signal={indicators.get('signal','N/A')}\n"
                f"Actualités:\n{news_txt}\n"
                'Réponds en JSON: {"sentiment":"HAUSSIER|BAISSIER|NEUTRE","score":0-10,"resume":"...",'
                '"points_cles":["..."],"risques":["..."],"horizon":"court|moyen|long terme"}')
            text = call_gemini(prompt)
            if text:
                m = re.search(r"\{[\s\S]*\}", text)
                if m: return self._send(m.group().encode())
            fallback = {"sentiment":indicators.get("signal","NEUTRE"),"score":5,
                "resume":f"Analyse IA indisponible pour {name}.",
                "points_cles":["Données insuffisantes"],"risques":["Incertitude"],"horizon":"moyen terme"}
            return self._send(fallback)
        if sub in ("diagnostic","cloture"):
            candles = body.get("candles",[]); ind = body.get("indicators",{})
            last_price = candles[-1]["close"] if candles else "N/A"
            label = "Diagnostic technique" if sub == "diagnostic" else "Analyse de clôture IA"
            prompt = (f"{label} pour {name} ({sym}).\n"
                f"Prix: {last_price} | RSI: {ind.get('rsi','N/A')} | Signal: {ind.get('signal','N/A')} | SMA20: {ind.get('sma20','N/A')}\n"
                "Fournis une analyse concise en français (3-5 phrases) avec niveau de conviction (Faible/Moyen/Fort).")
            text = call_gemini(prompt)
            return self._send({"symbol":sym,"analysis":text or f"Analyse {sub} indisponible.",
                "conviction":"Moyen","generated_at":""})
        self._send({"error":"not found"}, 404)

    # ── Simulateur ──────────────────────────────────────────────────────────
    def _simulator_post(self, segs, body):
        sub = segs[0] if segs else ""
        if sub == "order":
            montant = float(body.get("montant_brut") or body.get("montant", 0))
            fr = bool(body.get("action_francaise", True))
            ttf_eligible = bool(body.get("eligible_ttf", fr))
            courtage = max(0.90, montant*0.001)
            ttf = montant*0.003 if ttf_eligible else 0
            total = courtage + ttf
            return self._send({"montant_brut":montant,"courtage":round(courtage,2),"ttf":round(ttf,2),
                "srd":0,"droits_garde_annuels":round(montant*0.005,2),"total_frais":round(total,2),
                "montant_net_achat":round(montant+total,2),"montant_net_vente":round(montant-total,2),
                "taux_effectif_pct":round(total/montant*100,3) if montant else 0,
                "seuil_rentabilite_par_action":0,"methode":"LCL","types_ordres":["Marché","Limite"],"note":""})
        self._send({"error":"not found"}, 404)
