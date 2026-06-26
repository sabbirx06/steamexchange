import { useState, useEffect } from 'react'
import './App.css'

function Field({ label, value, onChange, onFocus, placeholder, readOnly }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
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
  const [tab, setTab] = useState('deal')

  // Deal Calculator
  const [usd, setUsd] = useState('')
  const [bdtPerUsd, setBdtPerUsd] = useState('')
  const [uahPerUsd, setUahPerUsd] = useState('')
  const [rateStatus, setRateStatus] = useState('loading')
  const [rateUah, setRateUah] = useState('')
  const [bdtPaid, setBdtPaid] = useState('')
  const [bkash, setBkash] = useState(false)

  // Total Cost
  const [uahCost, setUahCost] = useState('')
  const [rateC, setRateC] = useState('')
  const [bdtCost, setBdtCost] = useState('')
  const [costSrc, setCostSrc] = useState('uah')
  const [bkashC, setBkashC] = useState(false)

  useEffect(() => {
    fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json')
      .then(r => r.json())
      .then(data => {
        const rate = data[0]?.rate
        if (rate) { setUahPerUsd(rate.toFixed(2)); setRateStatus('live') }
        else setRateStatus('error')
      })
      .catch(() => setRateStatus('error'))
  }, [])

  const n = v => parseFloat(v) || 0

  // Steam fee: 5% + 10% publisher, fees floor'd per kopek — simple /1.15 is wrong
  function steamPayout(buyerUah) {
    const k = Math.round(buyerUah * 100)
    let s = Math.floor(k / 1.15)
    while (true) {
      const sf = Math.floor(Math.max(s * 0.05, 1))
      const pf = Math.floor(Math.max(s * 0.10, 1))
      if (s + sf + pf >= k) { s--; continue }
      const sf2 = Math.floor(Math.max((s+1) * 0.05, 1))
      const pf2 = Math.floor(Math.max((s+1) * 0.10, 1))
      if ((s+1) + sf2 + pf2 === k) s++
      break
    }
    return s / 100
  }

  const uahToList = usd && uahPerUsd ? n(usd) * n(uahPerUsd) : null
  const uahYouGet = uahToList != null ? steamPayout(uahToList) : null

  useEffect(() => {
    if (uahYouGet != null) setRateUah(uahYouGet.toFixed(2))
  }, [uahYouGet])

  const effectiveBdt = bdtPaid ? n(bdtPaid) + (bkash ? n(bdtPaid) * 18.5 / 1000 : 0) : null
  const rateCheckerBdtPerUah = rateUah && effectiveBdt
    ? (effectiveBdt / n(rateUah)).toFixed(4) : null

  // Total Cost — bidirectional
  const bkF = bkashC ? 1 + 18.5 / 1000 : 1
  const derivedBdt = uahCost && rateC ? (n(uahCost) * n(rateC) * bkF).toFixed(2) : ''
  const derivedUah = bdtCost && rateC ? (n(bdtCost) / n(rateC) / bkF).toFixed(2) : ''

  return (
    <main>
      <h1>Steam<span>Exchange</span></h1>

      <div className="tabs">
        <button className={tab === 'deal' ? 'active' : ''} onClick={() => setTab('deal')}>Wallet Transfer</button>
        <button className={tab === 'cost' ? 'active' : ''} onClick={() => setTab('cost')}>Game Gifting</button>
      </div>

      {tab === 'deal' && <>
        <section className="card">
          <h2>Wallet Transfer</h2>
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
            <Result label="BDT per UAH" value={rateCheckerBdtPerUah} highlight />
          </div>
        </section>
      </>}

      {tab === 'cost' && (
        <section className="card">
          <h2>Game Gifting</h2>
          <div className="fields">
            <Field
              label="UAH"
              value={costSrc === 'uah' ? uahCost : derivedUah}
              onChange={v => setUahCost(v)}
              onFocus={() => costSrc !== 'uah' && (setCostSrc('uah'), setUahCost(derivedUah))}
              placeholder="3515"
            />
            <Field
              label="BDT / UAH"
              value={rateC}
              onChange={setRateC}
              placeholder="2.35"
            />
            <Field
              label="BDT"
              value={costSrc === 'bdt' ? bdtCost : derivedBdt}
              onChange={v => setBdtCost(v)}
              onFocus={() => costSrc !== 'bdt' && (setCostSrc('bdt'), setBdtCost(derivedBdt))}
              placeholder="8261"
            />
          </div>
          <label className="toggle">
            <input type="checkbox" checked={bkashC} onChange={e => setBkashC(e.target.checked)} />
            <span className="track"><span className="thumb" /></span>
            <span className="toggle-label">Include bKash charges <span className="muted">(18.5৳ per 1000)</span></span>
          </label>
          <div className="results">
            <Result label="BDT per UAH" value={rateC ? (n(rateC) * bkF).toFixed(4) : null} highlight />
          </div>
        </section>
      )}
    </main>
  )
}
