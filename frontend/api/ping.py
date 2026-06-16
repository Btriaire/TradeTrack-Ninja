from http.server import BaseHTTPRequestHandler
import json,sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from _yf import cors
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        cors(self); self.wfile.write(json.dumps({"pong":True}).encode())
    def do_OPTIONS(self): cors(self); self.wfile.write(b"")
    def log_message(self,*a): pass
