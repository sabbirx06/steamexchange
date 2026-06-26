import { useState, useEffect } from 'react'
import './App.css'

function Field({ label, value, onChange, placeholder, readOnly }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min="0"
        step="any"
        readOnly={readOnly}
        className={readOnly ? 'readonly' : ''}
      />
    </div>
  )
}

function Result({ label, value, highlight }) {
  return (
    <div className={`result${highlight ? ' highlight' : ''}`}>
      <span className="result-label">{label}</span>
      <span className="result-value">{value ?? '—'}</span>
    </div>
  )
}

export default function App() {
  const [usd, setUsd] = useState('')
  const [bdtPerUsd, setBdtPerUsd] = useState('')
  const [uahPerUsd, setUahPerUsd] = useState('')
  const [rateStatus, setRateStatus] = useState('loading') // 'loading' | 'live' | 'error'

  const [rateUah, setRateUah] = useState('')
  const [bdtPaid, setBdtPaid] = useState('')
  const [bkash, setBkash] = useState(false)

  useEffect(() => {
    fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json')
      .then(r => r.json())
      .then(data => {
        const rate = data[0]?.rate
        if (rate) {
          setUahPerUsd(rate.toFixed(2))
          setRateStatus('live')
        } else {
          setRateStatus('error')
        }
      })
      .catch(() => setRateStatus('error'))
  }, [])

  const n = v => parseFloat(v) || 0

  // ponytail: $ × rate = listing price; Steam payout = listing / 1.15
  const uahToList = usd && uahPerUsd ? n(usd) * n(uahPerUsd) : null
  const uahYouGet = uahToList != null ? uahToList / 1.15 : null

  // auto-sync rate checker's UAH field from calculator
  useEffect(() => {
    if (uahYouGet != null) setRateUah(uahYouGet.toFixed(2))
  }, [uahYouGet])

  const effectiveBdt = bdtPaid
    ? n(bdtPaid) + (bkash ? n(bdtPaid) * 18.5 / 1000 : 0)
    : null
  const bdtPerUah = rateUah && effectiveBdt
    ? (effectiveBdt / n(rateUah)).toFixed(4)
    : null

  return (
    <main>
      <h1>Steam<span>Exchange</span></h1>

      <section className="card">
        <h2>Deal Calculator</h2>
        <p className="section-label">Buyer's offer</p>
        <div className="row">
          <Field label="$ amount" value={usd} onChange={setUsd} placeholder="15" />
          <Field label="BDT / USD" value={bdtPerUsd} onChange={setBdtPerUsd} placeholder="87" />
        </div>
        <Field
          label={rateStatus === 'live' ? 'UAH / USD (live · NBU)' : rateStatus === 'loading' ? 'UAH / USD (loading…)' : 'UAH / USD (enter manually)'}
          value={uahPerUsd}
          onChange={setUahPerUsd}
          placeholder="41.5"
        />
        <div className="results">
          <Result label="UAH to list" value={uahToList != null ? `₴ ${uahToList.toFixed(2)}` : null} highlight />
          <Result label="UAH you get" value={uahYouGet != null ? `₴ ${uahYouGet.toFixed(2)}` : null} />
        </div>
      </section>

      <section className="card">
        <h2>Rate Checker</h2>
        <div className="row">
          <Field label="UAH you got" value={rateUah} onChange={setRateUah} placeholder="624" />
          <Field
            label="BDT paid"
            value={bkash && bdtPaid ? effectiveBdt.toFixed(2) : bdtPaid}
            onChange={bkash ? () => {} : setBdtPaid}
            placeholder="1305"
            readOnly={bkash && !!bdtPaid}
          />
        </div>
        <label className="toggle">
          <input type="checkbox" checked={bkash} onChange={e => setBkash(e.target.checked)} />
          <span className="track"><span className="thumb" /></span>
          <span className="toggle-label">Include bKash charges <span className="muted">(18.5৳ per 1000)</span></span>
        </label>
        <div className="results">
          <Result label="BDT per UAH" value={bdtPerUah} highlight />
        </div>
      </section>
    </main>
  )
}
