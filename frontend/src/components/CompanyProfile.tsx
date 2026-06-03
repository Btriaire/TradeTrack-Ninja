import { useQuery } from '@tanstack/react-query'
import {
  Building2, Users, Globe, TrendingUp, DollarSign,
  BarChart2, Shield, RefreshCw, ExternalLink,
  Briefcase, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useState } from 'react'
import { getProfile } from '../services/api'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtNum(v: number | null | undefined, opts?: { prefix?: string; suffix?: string; decimals?: number }): string {
  if (v == null) return '—'
  const { prefix = '', suffix = '', decimals = 2 } = opts ?? {}
  const abs = Math.abs(v)
  let str: string
  if (abs >= 1e12)       str = (v / 1e12).toFixed(1) + ' T'
  else if (abs >= 1e9)   str = (v / 1e9).toFixed(1) + ' Mrd'
  else if (abs >= 1e6)   str = (v / 1e6).toFixed(1) + ' M'
  else if (abs >= 1e3)   str = (v / 1e3).toFixed(1) + ' K'
  else                   str = v.toFixed(decimals)
  return `${prefix}${str}${suffix}`
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
}

function fmtRatio(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(2) + 'x'
}

function fmtEmployees(v: number | null | undefined): string {
  if (v == null) return '—'
  return Number(v).toLocaleString('fr-FR')
}

// ── Stat box ─────────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color = 'text-white' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="flex flex-col px-3 py-2.5 bg-dark-700/50 rounded-lg border border-dark-600/30 min-w-0">
      <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-1">{label}</span>
      <span className={`text-sm font-mono font-bold ${color} tabular-nums leading-tight`}>{value}</span>
      {sub && <span className="text-[9px] font-mono text-slate-700 mt-0.5">{sub}</span>}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon size={11} className="text-slate-600" />
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider">{label}</span>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────
export function CompanyProfile({ symbol }: { symbol: string }) {
  const [showDesc, setShowDesc] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey:  ['profile', symbol],
    queryFn:   () => getProfile(symbol),
    staleTime: 6 * 60 * 60 * 1000,  // 6h
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-8 flex items-center justify-center gap-3 text-slate-600">
        <RefreshCw size={16} className="animate-spin text-cyan-400" />
        <span className="text-sm font-mono">Chargement du profil…</span>
      </div>
    )
  }

  if (error || !data || Object.keys(data).length === 0) {
    return (
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 flex flex-col items-center gap-3 text-slate-600">
        <Building2 size={24} className="opacity-30" />
        <p className="text-sm font-mono">Profil indisponible pour {symbol}</p>
        <button onClick={() => refetch()} className="text-xs font-mono text-cyan-500 hover:text-cyan-300 transition-colors">
          Réessayer
        </button>
      </div>
    )
  }

  const p = data
  const curr = p.currency ?? '€'

  return (
    <div className="space-y-3">

      {/* ── Carte identité ────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600/50">
          <div className="flex items-center gap-2">
            <Building2 size={13} className="text-cyan-400" />
            <span className="text-xs font-mono font-bold text-white tracking-wide">FICHE VALEUR</span>
            <span className="text-[10px] font-mono text-slate-600">· {symbol}</span>
          </div>
          <button onClick={() => refetch()} className="p-1.5 text-slate-600 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
            <RefreshCw size={11} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Nom + secteur + industrie */}
          <div>
            <h2 className="text-lg font-bold text-white font-mono">{p.name || symbol}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {p.sector && (
                <span className="text-xs font-mono px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full">
                  {p.sector}
                </span>
              )}
              {p.industry && (
                <span className="text-xs font-mono px-2 py-0.5 bg-dark-700 text-slate-400 border border-dark-600 rounded-full">
                  {p.industry}
                </span>
              )}
              {p.country && (
                <span className="text-xs font-mono text-slate-600">{p.city ? `${p.city}, ` : ''}{p.country}</span>
              )}
            </div>
          </div>

          {/* Infos clés identité */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {p.ceo && (
              <div className="flex items-start gap-2 col-span-2 sm:col-span-1">
                <Briefcase size={11} className="text-slate-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">CEO</div>
                  <div className="text-xs font-mono text-slate-300">{p.ceo}</div>
                </div>
              </div>
            )}
            {p.employees && (
              <div className="flex items-start gap-2">
                <Users size={11} className="text-slate-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">Employés</div>
                  <div className="text-xs font-mono text-slate-300">{fmtEmployees(p.employees)}</div>
                </div>
              </div>
            )}
            {p.founded && (
              <div className="flex items-start gap-2">
                <Building2 size={11} className="text-slate-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">Fondée</div>
                  <div className="text-xs font-mono text-slate-300">{p.founded}</div>
                </div>
              </div>
            )}
            {p.website && (
              <div className="flex items-start gap-2">
                <Globe size={11} className="text-slate-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">Site web</div>
                  <a href={p.website} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                    onClick={e => e.stopPropagation()}>
                    {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    <ExternalLink size={9} />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {p.description && (
            <div>
              <button
                onClick={() => setShowDesc(v => !v)}
                className="flex items-center gap-1.5 text-[10px] font-mono text-slate-600 hover:text-slate-300 transition-colors mb-1.5"
              >
                <span className="uppercase tracking-wider">Description</span>
                {showDesc ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {showDesc && (
                <p className="text-xs font-mono text-slate-500 leading-relaxed border-l-2 border-cyan-500/20 pl-3">
                  {p.description}
                </p>
              )}
              {!showDesc && (
                <p className="text-xs font-mono text-slate-600 leading-relaxed line-clamp-2">
                  {p.description}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Valorisation ────────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3">
        <SectionHeader icon={DollarSign} label="Valorisation" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <StatBox label="Capitalisation" value={fmtNum(p.market_cap, { prefix: curr + ' ' })} />
          <StatBox label="Val. Entreprise" value={fmtNum(p.enterprise_value, { prefix: curr + ' ' })} />
          <StatBox label="P/E (trailing)" value={fmtRatio(p.pe_trailing)} color={p.pe_trailing && p.pe_trailing < 20 ? 'text-green-400' : 'text-white'} />
          <StatBox label="P/E (forward)" value={fmtRatio(p.pe_forward)} color={p.pe_forward && p.pe_forward < 20 ? 'text-green-400' : 'text-white'} />
          <StatBox label="Ratio PEG" value={fmtRatio(p.peg_ratio)} sub="< 1 = sous-évalué" color={p.peg_ratio && p.peg_ratio < 1 ? 'text-green-400' : 'text-white'} />
          <StatBox label="Price/Book" value={fmtRatio(p.price_to_book)} />
          <StatBox label="Bêta" value={p.beta?.toFixed(2) ?? '—'} color={p.beta && p.beta > 1.5 ? 'text-amber-400' : 'text-white'} />
          <StatBox label="Rendement Div." value={p.dividend_yield ? fmtPct(p.dividend_yield) : '—'} color="text-emerald-400" />
        </div>

        {/* 52 semaines */}
        {(p['52w_low'] || p['52w_high']) && (
          <div className="mt-3 pt-3 border-t border-dark-600/30">
            <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest mb-2">Plage 52 semaines</div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-red-400 tabular-nums">{p['52w_low']?.toFixed(2) ?? '—'}</span>
              <div className="flex-1 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-500 to-green-500 rounded-full opacity-60" style={{ width: '100%' }} />
              </div>
              <span className="text-xs font-mono text-green-400 tabular-nums">{p['52w_high']?.toFixed(2) ?? '—'}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Données financières ──────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3">
        <SectionHeader icon={BarChart2} label="Données Financières" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <StatBox
            label="Chiffre d'affaires"
            value={fmtNum(p.revenue, { prefix: curr + ' ' })}
            sub={p.revenue_growth != null ? `croissance ${fmtPct(p.revenue_growth)}` : undefined}
            color="text-cyan-300"
          />
          <StatBox
            label="EBITDA"
            value={fmtNum(p.ebitda, { prefix: curr + ' ' })}
            color={p.ebitda && p.ebitda > 0 ? 'text-green-300' : 'text-red-300'}
          />
          <StatBox
            label="Marge nette"
            value={p.profit_margin != null ? fmtPct(p.profit_margin) : '—'}
            color={p.profit_margin && p.profit_margin > 0.15 ? 'text-green-400' : 'text-white'}
          />
          <StatBox
            label="ROE"
            value={p.roe != null ? fmtPct(p.roe) : '—'}
            sub="Retour capitaux propres"
            color={p.roe && p.roe > 0.15 ? 'text-green-400' : 'text-white'}
          />
          <StatBox
            label="Dette/Cap. propres"
            value={p.debt_to_equity != null ? p.debt_to_equity.toFixed(1) + '%' : '—'}
            color={p.debt_to_equity && p.debt_to_equity > 200 ? 'text-red-400' : 'text-white'}
          />
          <StatBox
            label="Ratio courant"
            value={p.current_ratio?.toFixed(2) ?? '—'}
            sub="liquidité court terme"
            color={p.current_ratio && p.current_ratio > 1.5 ? 'text-green-400' : 'text-amber-400'}
          />
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-700 px-1">
        <TrendingUp size={9} />
        <span>Données Yahoo Finance · actualisation 6h · usage informatif</span>
        {p.website && (
          <a href={p.website} target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-slate-700 hover:text-cyan-400 transition-colors">
            Site officiel <ExternalLink size={8} />
          </a>
        )}
      </div>
    </div>
  )
}
