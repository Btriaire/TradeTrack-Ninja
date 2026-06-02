from fastapi import APIRouter
from pydantic import BaseModel
from services.lcl_fees import simuler_ordre, seuil_rentabilite

router = APIRouter(prefix="/simulator", tags=["simulator"])


class OrderRequest(BaseModel):
    montant: float
    quantite: int
    prix_unitaire: float
    action_francaise: bool = True
    eligible_ttf: bool = True
    srd: bool = False
    marche: str = "Euronext Paris"


@router.post("/order")
def simulate_order(req: OrderRequest):
    montant = req.quantite * req.prix_unitaire
    fees = simuler_ordre(
        montant=montant,
        marche=req.marche,
        action_francaise=req.action_francaise,
        eligible_ttf=req.eligible_ttf,
        srd=req.srd,
    )
    seuil = seuil_rentabilite(req.prix_unitaire, fees.courtage + fees.ttf)
    return {
        **fees.__dict__,
        "seuil_rentabilite_par_action": round(seuil, 2),
        "methode": "Ordre internet LCL Bourse",
        "delai_execution": "Immédiat (ordre au marché) / À cours limité",
        "types_ordres": ["Au marché", "À cours limité", "À déclenchement", "À plage de déclenchement"],
        "note": "Simulation basée sur la grille tarifaire LCL Bourse 2024. Frais définitifs sur relevé de compte.",
    }


@router.get("/tarifs")
def get_tarifs():
    return {
        "courtage_internet": [
            {"tranche": "≤ 800 €", "tarif": "Forfait 8,50 €"},
            {"tranche": "800 € – 3 000 €", "tarif": "0,70 %"},
            {"tranche": "> 3 000 €", "tarif": "0,50 % (min. 15 €)"},
        ],
        "ttf": "0,30 % sur achats d'actions françaises (cap. > 1 Mrd €)",
        "srd": "0,032 % du montant nominal par report de liquidation",
        "droits_garde": "0,12 % / an par ligne (min. 3 €/an)",
        "ordres_telephoniques": "+3 € par rapport aux ordres internet",
        "marches_disponibles": [
            "Euronext Paris (continu 09h00–17h30)",
            "Euronext Amsterdam / Bruxelles / Lisbonne",
            "Xetra (Allemagne)",
            "London Stock Exchange (+0,5 % stamp duty UK)",
        ],
        "horaires_saisie": "24h/24 — exécution aux heures d'ouverture des marchés",
        "validite_ordres": ["Jour", "Date limite (max 365 j)", "À révocation"],
    }
