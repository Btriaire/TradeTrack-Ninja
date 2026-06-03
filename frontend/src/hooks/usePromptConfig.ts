import { useState } from 'react'

export interface PromptConfig {
  style:        'journalistique' | 'technique' | 'synthétique' | 'pessimiste' | 'optimiste'
  horizon:      'court' | 'moyen' | 'long' | 'auto'
  focus:        { fondamentaux: boolean; technique: boolean; actualites: boolean; risques: boolean }
  instructions: string   // texte libre ajouté à la fin du prompt
  langue:       'fr' | 'en'
}

const DEFAULT: PromptConfig = {
  style:        'journalistique',
  horizon:      'auto',
  focus:        { fondamentaux: true, technique: true, actualites: true, risques: true },
  instructions: '',
  langue:       'fr',
}

function load(): PromptConfig {
  try {
    const raw = localStorage.getItem('promptConfig')
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT
  } catch { return DEFAULT }
}

export function usePromptConfig() {
  const [config, setConfig] = useState<PromptConfig>(load)

  const update = (patch: Partial<PromptConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem('promptConfig', JSON.stringify(next))
      return next
    })
  }

  const reset = () => {
    localStorage.removeItem('promptConfig')
    setConfig(DEFAULT)
  }

  return { config, update, reset }
}
