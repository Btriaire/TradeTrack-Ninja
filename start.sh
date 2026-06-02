#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     TradeTrack-Ninja — Démarrage         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Backend ──────────────────────────────────────
echo "▶ Démarrage du backend FastAPI..."

if [ ! -d "$BACKEND/venv" ]; then
  echo "  → Création de l'environnement virtuel Python..."
  python3 -m venv "$BACKEND/venv"
fi

source "$BACKEND/venv/bin/activate"

echo "  → Installation des dépendances Python..."
pip install -q -r "$BACKEND/requirements.txt"

# Copie .env si pas encore créé
if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  echo "  → Fichier .env créé (ajoutez votre ANTHROPIC_API_KEY dans backend/.env)"
fi

cd "$BACKEND"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  ✓ Backend démarré → http://localhost:8000"
echo "  ✓ Docs API      → http://localhost:8000/docs"

# ── Frontend ─────────────────────────────────────
echo ""
echo "▶ Démarrage du frontend React..."
cd "$FRONTEND"

if [ ! -d "node_modules" ]; then
  echo "  → Installation des dépendances npm..."
  npm install
fi

npm run dev &
FRONTEND_PID=$!
echo "  ✓ Frontend démarré → http://localhost:5173"

# ── Attente ──────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo "  Application disponible : http://localhost:5173"
echo "  Appuyez sur Ctrl+C pour arrêter"
echo "════════════════════════════════════════════"
echo ""

trap "echo ''; echo 'Arrêt...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
