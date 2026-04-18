'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { RATES, getUserCurrency } from '@/lib/currencies'

interface CurrencyContextValue {
  currency: string
  setCurrency: (c: string) => void
  ratesAsOf: string
}

const DEFAULT_CURRENCY = 'USD'
const RATES_AS_OF = 'April 2026'

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  setCurrency: () => {},
  ratesAsOf: RATES_AS_OF,
})

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<string>(DEFAULT_CURRENCY)

  useEffect(() => {
    const stored = localStorage.getItem('ns-currency')
    if (stored && RATES[stored]) {
      setCurrencyState(stored)
    } else {
      setCurrencyState(getUserCurrency())
    }
  }, [])

  function setCurrency(c: string) {
    if (!RATES[c]) return
    setCurrencyState(c)
    localStorage.setItem('ns-currency', c)
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, ratesAsOf: RATES_AS_OF }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
