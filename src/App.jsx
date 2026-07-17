import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
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
  const [chartRange, setChartRange] = useState('months')
  const [showTk, setShowTk] = useState(true)
  const [showUah, setShowUah] = useState(true)
  const [showSpentUah, setShowSpentUah] = useState(true)

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
    if (t.details && !acc[t.details] && t.type === 'transfer') acc[t.details] = { uah: 0 }
    
    if (t.type === 'trade') {
      acc[t.person].uah += t.uah
    } else if (t.type === 'gift' || t.type === 'market') {
      acc[t.person].uah -= t.uah
    } else if (t.type === 'transfer') {
      acc[t.person].uah -= t.uah
      if (t.details) acc[t.details].uah += t.uah
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

  const [editingTx, setEditingTx] = useState(null)

  const handleSaveTrade = async (e) => {
    e.preventDefault()
    if (!tradePerson || !tradeUah) return
    const rate = tradeTk ? (n(tradeTk) / n(tradeUah)).toFixed(2) : null
    const tx = {
      type: 'trade',
      person: tradePerson,
      uah: n(tradeUah),
      tk: tradeTk ? n(tradeTk) : null,
      rate: rate
    }
    if (tradeDate) {
      tx.created_at = new Date(tradeDate).toISOString()
    }
    if (!members.includes(tradePerson)) {
      setMembers([...members, tradePerson])
      supabase.from('members').insert({ name: tradePerson }).then()
    }
    if (editingTx) {
      const { data: newTx } = await supabase.from('transactions').update(tx).eq('id', editingTx).select().single()
      if (newTx) setTransactions(prev => prev.map(t => t.id === editingTx ? newTx : t))
    } else {
      const { data: newTx } = await supabase.from('transactions').insert(tx).select().single()
      if (newTx) setTransactions(prev => prev.find(t => t.id === newTx.id) ? prev : [newTx, ...prev])
    }
    
    setShowTradeModal(false)
    setEditingTx(null)
    setTradePerson('')
    setTradeDate('')
    setTradeUah('')
    setTradeTk('')
  }

  const openEditModal = (tx) => {
    setEditingTx(tx.id)
    if (tx.type === 'trade') {
      setTradePerson(tx.person)
      setTradeDate(tx.created_at ? tx.created_at.split('T')[0] : '')
      setTradeUah(tx.uah || '')
      setTradeTk(tx.tk || '')
      setShowTradeModal(true)
    } else {
      setGiftType(tx.type)
      setGiftPerson(tx.person)
      setGiftDate(tx.created_at ? tx.created_at.split('T')[0] : '')
      setGiftDetails(tx.details || '')
      setGiftUah(tx.uah || '')
      setShowGiftModal(true)
    }
  }

  const [showGiftModal, setShowGiftModal] = useState(false)
  const [giftType, setGiftType] = useState('gift')
  const [giftPerson, setGiftPerson] = useState('')
  const [giftDate, setGiftDate] = useState('')
  const [giftDetails, setGiftDetails] = useState('')
  const [giftUah, setGiftUah] = useState('')

  const handleSaveGift = async (e) => {
    e.preventDefault()
    if (!giftPerson || !giftUah) return
    if (giftType === 'transfer' && !giftDetails) return // require receiver for transfer
    
    const tx = {
      type: giftType,
      person: giftPerson,
      uah: n(giftUah),
      details: giftDetails || null
    }
    if (giftDate) {
      tx.created_at = new Date(giftDate).toISOString()
    }
    if (!members.includes(giftPerson)) {
      setMembers([...members, giftPerson])
      supabase.from('members').insert({ name: giftPerson }).then()
    }
    if (editingTx) {
      const { data: newTx } = await supabase.from('transactions').update(tx).eq('id', editingTx).select().single()
      if (newTx) setTransactions(prev => prev.map(t => t.id === editingTx ? newTx : t))
    } else {
      const { data: newTx } = await supabase.from('transactions').insert(tx).select().single()
      if (newTx) setTransactions(prev => prev.find(t => t.id === newTx.id) ? prev : [newTx, ...prev])
    }
    
    setShowGiftModal(false)
    setEditingTx(null)
    setGiftType('gift')
    setGiftPerson('')
    setGiftDate('')
    setGiftDetails('')
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

  const getChartData = () => {
    const dataMap = {}
    const now = new Date()
    let startDate;

    if (chartRange === 'weeks') {
      startDate = new Date(now)
      startDate.setDate(now.getDate() - 6)
      startDate.setHours(0,0,0,0)
      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate)
        d.setDate(startDate.getDate() + i)
        const key = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`
        dataMap[key] = { name: key, tk: 0, uah: 0, spentUah: 0, raw: d.getTime() }
      }
    } else if (chartRange === 'months') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      for (let i = 1; i <= lastDay; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), i)
        const key = `${i} ${d.toLocaleString('default', { month: 'short' })}`
        dataMap[key] = { name: key, tk: 0, uah: 0, spentUah: 0, raw: d.getTime() }
      }
    } else if (chartRange === 'years') {
      startDate = new Date(now.getFullYear(), 0, 1)
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      for (let i = 0; i < 12; i++) {
        const key = monthNames[i]
        dataMap[key] = { name: key, tk: 0, uah: 0, spentUah: 0, raw: i }
      }
    }

    transactions.forEach(t => {
      if (!t.created_at) return
      const tDate = new Date(t.created_at)
      
      if (chartRange === 'years' && tDate.getFullYear() !== now.getFullYear()) return
      if (chartRange === 'months' && (tDate.getFullYear() !== now.getFullYear() || tDate.getMonth() !== now.getMonth())) return
      if (chartRange === 'weeks' && tDate < startDate) return

      let key;
      if (chartRange === 'years') {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        key = monthNames[tDate.getMonth()]
      } else {
        key = `${tDate.getDate()} ${tDate.toLocaleString('default', { month: 'short' })}`
      }
      
      if (dataMap[key]) {
        if (t.type === 'trade') {
          dataMap[key].tk += Number(t.tk || 0)
          dataMap[key].uah += Number(t.uah || 0)
        } else if (t.type === 'gift' || t.type === 'market' || t.type === 'transfer') {
          dataMap[key].spentUah += Number(t.uah || 0)
        }
      }
    })

    return Object.values(dataMap).sort((a, b) => a.raw - b.raw)
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
            <button className={tab === 'analytics' ? 'active' : ''} onClick={() => setTab('analytics')}>Analytics</button>
          </div>

          {tab === 'family' && (
            <div className="family-view">
              <div className="family-header">
                <div className="family-header-left">
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
                    <button className="btn-market-green" onClick={() => { setEditingTx(null); setShowTradeModal(true); }}>Log a trade</button>
                    <button className="btn-market-grey" onClick={() => { setEditingTx(null); setShowGiftModal(true); }}>Log an Outgoing</button>
                  </div>
                </div>
                <div className="family-header-right">
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
                        if (txFilter === 'incoming') return tx.type === 'trade' || tx.type === 'transfer'
                        if (txFilter === 'outgoing') return tx.type === 'gift' || tx.type === 'market' || tx.type === 'transfer'
                        return true
                      }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(tx => (
                        <tr key={tx.id}>
                          <td style={{ color: '#8f98a0', whiteSpace: 'nowrap' }}>
                            {new Date(tx.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>
                            {tx.type === 'trade' 
                              ? `${tx.person} bought ${tx.uah} ₴`
                              : tx.type === 'market'
                              ? `${tx.person} bought market item for ${tx.uah} ₴`
                              : tx.type === 'transfer'
                              ? `${tx.person} transferred ${tx.uah} ₴ to ${tx.details}`
                              : `gifted ${tx.person} game for ${tx.uah} ₴`}
                          </td>
                          <td>
                            {tx.type === 'trade' && tx.rate && (
                              <div className="discount-wrapper">
                                <div className="discount-tag">{Number(tx.rate).toFixed(2)}</div>
                                <div className="discount-price">{tx.uah}₴</div>
                              </div>
                            )}
                            {(tx.type === 'gift' || tx.type === 'market') && tx.details && (
                              <div style={{ display: 'inline-block', background: 'rgba(0,0,0,0.3)', color: '#66c0f4', padding: '4px 8px', fontSize: '13px', border: '1px solid rgba(102,192,244,0.2)' }}>
                                {tx.details}
                              </div>
                            )}
                          </td>
                          <td>
                            {tx.type === 'trade' && tx.tk && (
                              <div className="tx-paid">{tx.tk} tk</div>
                            )}
                          </td>
                          <td style={{textAlign: 'right', whiteSpace: 'nowrap'}}>
                            <button className="tx-delete" onClick={() => openEditModal(tx)} style={{ marginRight: '12px' }}>✎</button>
                            <button className="tx-delete" onClick={() => {
                              if(window.confirm('Delete this transaction?')) {
                                setTransactions(transactions.filter(t => t.id !== tx.id))
                                supabase.from('transactions').delete().eq('id', tx.id).then()
                              }
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
                        <button type="button" className="btn-secondary" onClick={() => { setShowTradeModal(false); setEditingTx(null); }}>Cancel</button>
                        <button type="submit" className="btn-primary">{editingTx ? 'Update Trade' : 'Save Trade'}</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {showGiftModal && (
                <div className="modal-overlay" onClick={() => setShowGiftModal(false)}>
                  <div className="modal" onClick={e => e.stopPropagation()}>
                    <h3>Log an Outgoing</h3>
                    <form onSubmit={handleSaveGift}>
                      <div className="field">
                        <label>Transaction Type</label>
                        <select value={giftType} onChange={e => setGiftType(e.target.value)}>
                          <option value="gift">Game Gift</option>
                          <option value="market">Market Item</option>
                          <option value="transfer">Internal Transfer</option>
                        </select>
                      </div>
                      <Field type="date" label="Date" value={giftDate} onChange={setGiftDate} />
                      <Field 
                        type="text" 
                        label={giftType === 'transfer' ? "From (Sender)" : giftType === 'market' ? "Bought By (Person)" : "Gifted To (Person)"} 
                        value={giftPerson} 
                        onChange={setGiftPerson} 
                        list="member-list" 
                      />
                      {giftType === 'transfer' ? (
                        <Field 
                          type="text" 
                          label="To (Receiver)" 
                          value={giftDetails} 
                          onChange={setGiftDetails} 
                          list="member-list" 
                        />
                      ) : (
                        <Field 
                          type="text" 
                          label={giftType === 'market' ? "Item Name (Optional)" : "Game Name (Optional)"} 
                          value={giftDetails} 
                          onChange={setGiftDetails} 
                        />
                      )}
                      <Field 
                        label={giftType === 'transfer' ? "Amount (UAH)" : giftType === 'market' ? "Item Price (UAH)" : "Game Price (UAH)"} 
                        value={giftUah} 
                        onChange={setGiftUah} 
                      />
                      <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={() => { setShowGiftModal(false); setEditingTx(null); }}>Cancel</button>
                        <button type="submit" className="btn-primary">{editingTx ? 'Update Outgoing' : 'Save Outgoing'}</button>
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
          {tab === 'analytics' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2>Transaction Analytics</h2>
                <div className="tabs" style={{ marginBottom: 0 }}>
                  <button className={chartRange === 'weeks' ? 'active' : ''} onClick={() => setChartRange('weeks')}>Weeks</button>
                  <button className={chartRange === 'months' ? 'active' : ''} onClick={() => setChartRange('months')}>Months</button>
                  <button className={chartRange === 'years' ? 'active' : ''} onClick={() => setChartRange('years')}>Years</button>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', padding: '0 4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showTk} onChange={e => setShowTk(e.target.checked)} />
                  <span style={{ color: '#a4d007', fontSize: '13px' }}>Amount Spent (BDT)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showUah} onChange={e => setShowUah(e.target.checked)} />
                  <span style={{ color: '#66c0f4', fontSize: '13px' }}>UAH Got (₴)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showSpentUah} onChange={e => setShowSpentUah(e.target.checked)} />
                  <span style={{ color: '#ff5e5e', fontSize: '13px' }}>UAH Spent (₴)</span>
                </label>
              </div>

              <div style={{ height: '400px', width: '100%', background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '4px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={getChartData()} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#323f4c" />
                    <XAxis dataKey="name" stroke="#8f98a0" tick={{fill: '#8f98a0', fontSize: 12}} />
                    <YAxis stroke="#8f98a0" tick={{fill: '#8f98a0', fontSize: 12}} />
                    <Tooltip contentStyle={{ backgroundColor: '#171a21', border: '1px solid #323f4c', borderRadius: '4px' }} itemStyle={{ color: '#c7d5e0' }} />
                    {showTk && <Line type="monotone" dataKey="tk" name="Amount Spent (BDT)" stroke="#a4d007" strokeWidth={2} dot={{ r: 4, fill: '#a4d007', strokeWidth: 0 }} activeDot={{ r: 6 }} />}
                    {showUah && <Line type="monotone" dataKey="uah" name="UAH Got (₴)" stroke="#66c0f4" strokeWidth={2} dot={{ r: 4, fill: '#66c0f4', strokeWidth: 0 }} activeDot={{ r: 6 }} />}
                    {showSpentUah && <Line type="monotone" dataKey="spentUah" name="UAH Spent (₴)" stroke="#ff5e5e" strokeWidth={2} dot={{ r: 4, fill: '#ff5e5e', strokeWidth: 0 }} activeDot={{ r: 6 }} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      </main>
    </>
  )
}
