"""
LCL Bourse fee simulation — tarifs publics LCL 2024.
Sources: grille tarifaire LCL Bourse (ordres internet, compte-titres ordinaire).
"""

from dataclasses import dataclass

# Seuils courtage internet LCL Bourse (ordres sur marchés règlementés)
COURTAGE_TRANCHES = [
    (800,   8.50,  None),   # ≤ 800€ → forfait 8.50€
    (3000,  None,  0.0070), # 800–3000€ → 0.70 %
    (float("inf"), 15.00, 0.0050),  # > 3000€ → 0.50 % min 15€
]

# Taxe sur les Transactions Financières (PTF/TTF) — art. 235 ter ZD CGI
# 0.3 % sur achats d'actions françaises cotées si cap. bours. > 1 Mrd€
TTF_RATE = 0.003

# SRD — report en date de liquidation
SRD_RATE = 0.00032  # 0.032 % du montant nominal par report

# Droits de garde annuels (simulés par ordre, base annuelle)
DROITS_GARDE_RATE = 0.0012  # 0.12 % / an, min 3 € par ligne
DROITS_GARDE_MIN  = 3.00

# Droits de timbre UK (stamp duty) pour London Stock Exchange
STAMP_DUTY_UK_RATE = 0.005  # 0.5 %


@dataclass
class FeeBreakdown:
    montant_brut: float
    courtage: float
    ttf: float
    srd: float
    droits_garde_annuels: float
    total_frais: float
    montant_net_achat: float
    montant_net_vente: float
    taux_effectif_pct: float


def _courtage(montant: float) -> float:
    for seuil, forfait, taux in COURTAGE_TRANCHES:
        if montant <= seuil:
            if forfait is not None:
                return forfait
            fee = montant * taux
            return max(fee, COURTAGE_TRANCHES[2][1])  # min 15€ pour dernière tranche
    return montant * COURTAGE_TRANCHES[-1][2]


def simuler_ordre(
    montant: float,
    marche: str = "Euronext Paris",
    action_francaise: bool = True,
    eligible_ttf: bool = True,
    srd: bool = False,
) -> FeeBreakdown:
    """
    Calcule le détail des frais LCL Bourse pour un ordre.

    Args:
        montant: montant de l'ordre en euros (quantité × cours)
        marche: place de cotation
        action_francaise: True si l'action est cotée en France
        eligible_ttf: True si cap. bours. > 1 Mrd€ (TTF applicable)
        srd: True si l'ordre est passé avec SRD (report)
    """
    courtage = _courtage(montant)

    ttf = 0.0
    if action_francaise and eligible_ttf:
        ttf = montant * TTF_RATE

    srd_frais = montant * SRD_RATE if srd else 0.0

    garde = max(montant * DROITS_GARDE_RATE / 12, DROITS_GARDE_MIN / 12)  # mensuel

    total = courtage + ttf + srd_frais
    net_achat = montant + total
    net_vente = montant - total
    taux_eff = (total / montant) * 100 if montant > 0 else 0

    return FeeBreakdown(
        montant_brut=round(montant, 2),
        courtage=round(courtage, 2),
        ttf=round(ttf, 2),
        srd=round(srd_frais, 2),
        droits_garde_annuels=round(montant * DROITS_GARDE_RATE, 2),
        total_frais=round(total, 2),
        montant_net_achat=round(net_achat, 2),
        montant_net_vente=round(net_vente, 2),
        taux_effectif_pct=round(taux_eff, 4),
    )


def seuil_rentabilite(prix_achat: float, frais_achat: float, frais_vente_rate: float = 0.007) -> float:
    """Prix minimum de revente pour couvrir les frais aller-retour."""
    return prix_achat + frais_achat / 1 + (prix_achat * frais_vente_rate)
