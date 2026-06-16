from http.server import BaseHTTPRequestHandler
import json,sys,os
sys.path.insert(0,os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _yf import cors,slug

TARIFS={"courtage_min":0.90,"courtage_pct":0.001,"ttf_pct":0.003,"garde_annuel_pct":0.005}

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self): cors(self); self.wfile.write(b"")
    def do_GET(self):
        cors(self); self.wfile.write(json.dumps(TARIFS).encode())
    def do_POST(self):
        segs=slug(self.path,"simulator")
        sub=segs[0] if segs else ""
        try:
            length=int(self.headers.get("Content-Length",0))
            body=json.loads(self.rfile.read(length)) if length>0 else {}
            if sub=="order":
                montant=float(body.get("montant_brut") or body.get("montant",0))
                fr=bool(body.get("action_francaise",True))
                ttf_eligible=bool(body.get("eligible_ttf",fr))
                courtage=max(0.90,montant*0.001)
                ttf=montant*0.003 if ttf_eligible else 0
                total=courtage+ttf
                result={"montant_brut":montant,"courtage":round(courtage,2),"ttf":round(ttf,2),
                    "srd":0,"droits_garde_annuels":round(montant*0.005,2),"total_frais":round(total,2),
                    "montant_net_achat":round(montant+total,2),"montant_net_vente":round(montant-total,2),
                    "taux_effectif_pct":round(total/montant*100,3) if montant else 0,
                    "seuil_rentabilite_par_action":0,"methode":"LCL","types_ordres":["Marché","Limite"],"note":""}
                cors(self); self.wfile.write(json.dumps(result).encode())
            else:
                cors(self,404); self.wfile.write(json.dumps({"error":"not found"}).encode())
        except Exception as e:
            cors(self,500); self.wfile.write(json.dumps({"error":str(e)}).encode())
    def log_message(self,*a): pass
