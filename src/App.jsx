import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import './App.css'

function Field({ label, value, onChange, onFocus, placeholder, readOnly, type = 'number', list }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        min={type === 'number' ? "0" : undefined}
        step={type === 'number' ? "any" : undefined}
        readOnly={readOnly}
        className={readOnly ? 'readonly' : ''}
        list={list}
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
  const [tab, setTab] = useState('family')

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

  // Transactions & Accounts
  // Transactions & Accounts
  const [isInitializing, setIsInitializing] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [members, setMembers] = useState([])
  const [balanceOffset, setBalanceOffset] = useState(0)

  const [initError, setInitError] = useState(null)

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      try {
        const { data: txData, error: txError } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
        if (txError) throw txError
        else if (txData && isMounted) setTransactions(txData)

        const { data: memberData, error: memberError } = await supabase.from('members').select('*')
        if (memberError) throw memberError
        else if (memberData && isMounted) setMembers(memberData.map(m => m.name))

        const { data: settingsData, error: settingsError } = await supabase.from('settings').select('*').eq('key', 'balanceOffset').maybeSingle()
        if (settingsError) throw settingsError
        else if (settingsData && isMounted) setBalanceOffset(settingsData.value)
      } catch (e) {
        console.error("Failed to fetch from Supabase:", e)
        if (isMounted) setInitError(e.message || JSON.stringify(e))
      } finally {
        if (isMounted) setIsInitializing(false)
      }
    }
    loadData()
    setTimeout(() => {
       if (isMounted) setIsInitializing(false)
    }, 5000)

    const txSub = supabase.channel('txs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, payload => {
        if (payload.eventType === 'INSERT') {
          setTransactions(prev => {
            if (prev.find(t => t.id === payload.new.id)) return prev
            return [payload.new, ...prev].sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
          })
        }
        else if (payload.eventType === 'DELETE') {
          setTransactions(prev => prev.filter(t => t.id !== payload.old.id))
        }
      }).subscribe()

    const membersSub = supabase.channel('members')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, payload => {
        if (payload.eventType === 'INSERT') {
          setMembers(prev => prev.includes(payload.new.name) ? prev : [...prev, payload.new.name])
        }
      }).subscribe()

    const settingsSub = supabase.channel('settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: "key=eq.balanceOffset" }, payload => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          setBalanceOffset(payload.new.value)
        }
      }).subscribe()

    return () => {
      supabase.removeChannel(txSub)
      supabase.removeChannel(membersSub)
      supabase.removeChannel(settingsSub)
    }
  }, [])

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

  const autoBdtPaid = usd && bdtPerUsd ? (n(usd) * n(bdtPerUsd)).toFixed(2) : ''
  const actualBdtPaid = bdtPaid || autoBdtPaid

  const effectiveBdt = actualBdtPaid ? n(actualBdtPaid) + (bkash ? n(actualBdtPaid) * 18.5 / 1000 : 0) : null
  const rateCheckerBdtPerUah = rateUah && effectiveBdt
    ? (effectiveBdt / n(rateUah)).toFixed(4) : null

  const bkF = bkashC ? 1 + 18.5 / 1000 : 1
  const derivedBdt = uahCost && rateC ? (n(uahCost) * n(rateC) * bkF).toFixed(2) : ''
  const derivedUah = bdtCost && rateC ? (n(bdtCost) / n(rateC) / bkF).toFixed(2) : ''

  // Derived Accounts for Family
  const familyAccounts = transactions.reduce((acc, t) => {
    if (!acc[t.person]) acc[t.person] = { uah: 0 }
    if (t.type === 'trade') {
      acc[t.person].uah += t.uah
    } else if (t.type === 'gift') {
      acc[t.person].uah -= t.uah
    }
    return acc
  }, {})

  members.forEach(m => {
    if (!familyAccounts[m]) familyAccounts[m] = { uah: 0 }
  })

  const derivedBalance = Object.values(familyAccounts).reduce((sum, acc) => sum + acc.uah, 0)
  const cumulativeBalance = derivedBalance + balanceOffset

  // Family State Logic
  const [newMember, setNewMember] = useState('')
  const handleAddMember = async (e) => {
    e.preventDefault()
    if (newMember && !members.includes(newMember)) {
      setMembers([...members, newMember])
      setNewMember('')
      await supabase.from('members').insert({ name: newMember })
    }
  }

  const [editingBalance, setEditingBalance] = useState(false)
  const [tempBalance, setTempBalance] = useState('')
  const [txFilter, setTxFilter] = useState('all')

  const saveBalance = async () => {
    const desired = parseFloat(tempBalance)
    if (!isNaN(desired)) {
      const offset = desired - derivedBalance
      setBalanceOffset(offset)
      await supabase.from('settings').upsert({ key: 'balanceOffset', value: offset })
    }
    setEditingBalance(false)
  }

  const handleBalanceKey = (e) => {
    if (e.key === 'Enter') saveBalance()
    if (e.key === 'Escape') setEditingBalance(false)
  }

  // Modals
  const [showTradeModal, setShowTradeModal] = useState(false)
  const [tradePerson, setTradePerson] = useState('')
  const [tradeDate, setTradeDate] = useState('')
  const [tradeUah, setTradeUah] = useState('')
  const [tradeTk, setTradeTk] = useState('')

  const handleSaveTrade = async (e) => {
    e.preventDefault()
    if (!tradePerson || !tradeUah || !tradeTk) return
    const rate = (n(tradeTk) / n(tradeUah)).toFixed(2)
    const tx = {
      type: 'trade',
      person: tradePerson,
      uah: n(tradeUah),
      tk: n(tradeTk),
      rate: rate
    }
    if (tradeDate) {
      tx.created_at = new Date(tradeDate).toISOString()
    }
    if (!members.includes(tradePerson)) {
      setMembers([...members, tradePerson])
      supabase.from('members').insert({ name: tradePerson }).then()
    }
    const { data: newTx } = await supabase.from('transactions').insert(tx).select().single()
    if (newTx) setTransactions(prev => prev.find(t => t.id === newTx.id) ? prev : [newTx, ...prev])
    setShowTradeModal(false)
    setTradePerson('')
    setTradeDate('')
    setTradeUah('')
    setTradeTk('')
  }

  const [showGiftModal, setShowGiftModal] = useState(false)
  const [giftPerson, setGiftPerson] = useState('')
  const [giftUah, setGiftUah] = useState('')

  const handleSaveGift = async (e) => {
    e.preventDefault()
    if (!giftPerson || !giftUah) return
    const tx = {
      type: 'gift',
      person: giftPerson,
      uah: n(giftUah)
    }
    if (!members.includes(giftPerson)) {
      setMembers([...members, giftPerson])
      supabase.from('members').insert({ name: giftPerson }).then()
    }
    const { data: newTx } = await supabase.from('transactions').insert(tx).select().single()
    if (newTx) setTransactions(prev => prev.find(t => t.id === newTx.id) ? prev : [newTx, ...prev])
    setShowGiftModal(false)
    setGiftPerson('')
    setGiftUah('')
  }

  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('steamexchange_auth') === 'true')
  const [password, setPassword] = useState('')

  const handleLogin = (e) => {
    e.preventDefault()
    if (password === 'ghost') {
      setIsAuthenticated(true)
      localStorage.setItem('steamexchange_auth', 'true')
    } else {
      alert('Incorrect password')
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <form onSubmit={handleLogin} style={{ background: '#171a21', padding: '30px', borderRadius: '4px', textAlign: 'center', width: '300px' }}>
          <h2 style={{ marginBottom: '20px', color: '#c7d5e0', textTransform: 'uppercase' }}>Sign In</h2>
          <input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            placeholder="Password"
            style={{ padding: '10px', width: '100%', marginBottom: '20px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />
          <button type="submit" className="btn-market-green" style={{ width: '100%' }}>Login</button>
        </form>
      </div>
    )
  }

  if (isInitializing) {
    return (
      <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>
        <div style={{color: '#66c0f4', fontSize: '20px', marginBottom: '20px'}}>Syncing with Supabase...</div>
        {initError && <div style={{color: '#ff4d4d', maxWidth: '400px', textAlign: 'center'}}>{initError}</div>}
      </div>
    )
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-content">
          <div className="logo">STEAM EX<span>CHANGE</span></div>

        </div>
      </header>

      <main className="layout">
        <div className="main-content">
          <div className="tabs">
            <button className={tab === 'family' ? 'active' : ''} onClick={() => setTab('family')}>Family & Trades</button>
            <button className={tab === 'deal' ? 'active' : ''} onClick={() => setTab('deal')}>Wallet Transfer</button>
            <button className={tab === 'cost' ? 'active' : ''} onClick={() => setTab('cost')}>Game Gifting Calculator</button>
          </div>

          {tab === 'family' && (
            <div className="family-view">
              <div className="family-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <form className="add-member-form" onSubmit={handleAddMember}>
                    <input 
                      type="text" 
                      placeholder="add people to family" 
                      value={newMember} 
                      onChange={e => setNewMember(e.target.value)} 
                    />
                    <button type="submit" className="btn-secondary">+</button>
                  </form>
                  <div className="market-header-actions" style={{ margin: 0, padding: 0, background: 'transparent' }}>
                    <button className="btn-market-green" onClick={() => setShowTradeModal(true)}>Log a trade</button>
                    <button className="btn-market-grey" onClick={() => setShowGiftModal(true)}>Log a gift</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '14px', color: '#66c0f4' }}>Wallet Balance</span>
                  {editingBalance ? (
                    <input 
                      type="number"
                      className="balance-input"
                      value={tempBalance}
                      onChange={e => setTempBalance(e.target.value)}
                      onBlur={saveBalance}
                      onKeyDown={handleBalanceKey}
                      autoFocus
                      style={{width: '100px', fontSize: '18px'}}
                    />
                  ) : (
                    <span className="wallet-balance" onClick={() => {
                      setTempBalance(cumulativeBalance.toFixed(2))
                      setEditingBalance(true)
                    }} style={{ fontSize: '24px', color: '#66c0f4', cursor: 'pointer', lineHeight: 1 }}>
                      {cumulativeBalance.toFixed(2).replace('.', ',')}₴
                    </span>
                  )}
                </div>
              </div>

              <div className="family-columns">
                <div className="column">
                  <div className="market-tab-bar">
                    <div className="market-tab">My Market History</div>
                    <div className="tx-filters">
                      <span className={txFilter === 'all' ? 'active' : ''} onClick={() => setTxFilter('all')}>All</span>
                      <span className={txFilter === 'incoming' ? 'active' : ''} onClick={() => setTxFilter('incoming')}>Incoming</span>
                      <span className={txFilter === 'outgoing' ? 'active' : ''} onClick={() => setTxFilter('outgoing')}>Outgoing</span>
                    </div>
                  </div>
                  <table className="market-table">
                    <thead>
                      <tr>
                        <th>DATE</th>
                        <th>DETAILS</th>
                        <th>RATE</th>
                        <th>PAID</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.filter(tx => {
                        if (txFilter === 'incoming') return tx.type === 'trade'
                        if (txFilter === 'outgoing') return tx.type === 'gift'
                        return true
                      }).map(tx => (
                        <tr key={tx.id}>
                          <td style={{ color: '#8f98a0', whiteSpace: 'nowrap' }}>
                            {new Date(tx.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>
                            {tx.type === 'trade' 
                              ? `${tx.person} bought ${tx.uah} ₴`
                              : `gifted ${tx.person} game for ${tx.uah} ₴`}
                          </td>
                          <td>
                            {tx.type === 'trade' && tx.rate && (
                              <div className="discount-wrapper">
                                <div className="discount-tag">{Number(tx.rate).toFixed(2)}</div>
                                <div className="discount-price">{tx.uah}₴</div>
                              </div>
                            )}
                          </td>
                          <td>
                            {tx.type === 'trade' && tx.tk && (
                              <div className="tx-paid">{tx.tk} tk</div>
                            )}
                          </td>
                          <td style={{textAlign: 'right'}}>
                            <button className="tx-delete" onClick={() => {
                              setTransactions(transactions.filter(t => t.id !== tx.id))
                              supabase.from('transactions').delete().eq('id', tx.id).then()
                            }}>x</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="column">
                  <div className="market-tab-bar" style={{ padding: '0 16px', color: '#66c0f4', fontSize: '14px', textTransform: 'uppercase' }}>
                    Members
                  </div>
                  <table className="market-table accounts-table">
                    <thead>
                      <tr>
                        <th>MEMBER</th>
                        <th>BALANCE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m}>
                          <td style={{ textTransform: 'capitalize' }}>{m}</td>
                          <td>
                            <span className="wallet-balance">
                              {familyAccounts[m].uah.toFixed(2).replace('.', ',')}₴
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MODALS */}
              {showTradeModal && (
                <div className="modal-overlay" onClick={() => setShowTradeModal(false)}>
                  <div className="modal" onClick={e => e.stopPropagation()}>
                    <h3>Add a Trade</h3>
                    <form onSubmit={handleSaveTrade}>
                      <div className="field">
                        <label>Person Name</label>
                        <select value={tradePerson} onChange={e => setTradePerson(e.target.value)} required>
                          <option value="" disabled>Select a person...</option>
                          {members.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <Field type="date" label="Date" value={tradeDate} onChange={setTradeDate} />
                      <Field label="UAH Bought" value={tradeUah} onChange={setTradeUah} />
                      <Field label="BDT Paid" value={tradeTk} onChange={setTradeTk} />
                      <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={() => setShowTradeModal(false)}>Cancel</button>
                        <button type="submit" className="btn-primary">Save Trade</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {showGiftModal && (
                <div className="modal-overlay" onClick={() => setShowGiftModal(false)}>
                  <div className="modal" onClick={e => e.stopPropagation()}>
                    <h3>Gift Game</h3>
                    <form onSubmit={handleSaveGift}>
                      <Field type="text" label="Gifted To (Person)" value={giftPerson} onChange={setGiftPerson} list="member-list" />
                      <Field label="Game Price (UAH)" value={giftUah} onChange={setGiftUah} />
                      <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={() => setShowGiftModal(false)}>Cancel</button>
                        <button type="submit" className="btn-primary">Save Gift</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              
              <datalist id="member-list">
                {members.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
          )}

          {tab === 'deal' && <>
            <section className="card">
              <h2>Wallet Transfer Calculator</h2>
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
                  placeholder={autoBdtPaid || "1305"}
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
              <h2>Game Gifting Calculator</h2>
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

        </div>
      </main>
    </>
  )
}
