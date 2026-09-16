import React, {useState} from 'react';
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function PaymentForm({owners,userId,busy,onSubmit}) {
  const recipients=owners.filter(o=>o.id!==userId);
  const [recipient,setRecipient]=useState(String(recipients[0]?.id||''));
  const [amount,setAmount]=useState(''),[note,setNote]=useState('');
  if(!recipients.length) return <div className="modal-body"><p>Invite another owner before recording a payment to them.</p></div>;
  return <form className="modal-body form" onSubmit={e=>{e.preventDefault();onSubmit({recipient_id:Number(recipient),amount,note});}}>

    <label className="field"><span>I paid</span><select value={recipient} onChange={e=>setRecipient(e.target.value)}>{recipients.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <label className="field"><span>Amount paid (USD)</span><input required type="number" min="0.01" max="100000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <details><summary>Optional note</summary><label className="field"><span>Note (optional)</span><input maxLength={140} value={note} placeholder="Cash for last week’s trips" onChange={e=>setNote(e.target.value)}/></label></details>

    <button className="btn" disabled={busy}>Record payment</button>
  </form>;
}
export function PaymentHistory({payments,canRemove,onRemove,onAdd}) {
  return <section className="card"><div className="card-heading"><div><h2>Payments between owners</h2><p>Money already paid outside CoDrive.</p></div><button className="btn" onClick={onAdd}>Record payment</button></div>
    {payments.length?<div className="table-scroll"><table><thead><tr><th>FROM</th><th>TO</th><th>AMOUNT</th><th>NOTE</th><th>DATE</th><th>ACTIONS</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td>{p.payer}</td><td>{p.recipient}</td><td>{money(p.amount_cents)}</td><td>{p.note||'—'}</td><td>{new Date(p.created_at).toLocaleDateString()}</td><td>{canRemove(p)&&<button className="text-btn" onClick={()=>onRemove('payments',p.id)}>Delete payment</button>}</td></tr>)}</tbody></table></div>:<p className="form-note">No payments recorded yet. Use this when you repay another owner without buying fuel.</p>}
  </section>;
}
export function RemovedEntries({entries,busy,onRestore}) {
  if(!entries.length)return null;
  return <section className="card"><details><summary>Deleted entries ({entries.length}) — restore a mistake</summary><p>These entries are excluded from totals. Restoring them recalculates balances.</p>{entries.map(r=><div className="card-heading" key={`${r.kind}-${r.id}`}><span>{r.kind==='trips'?'Trip':r.kind==='expenses'?'Expense':'Payment'} #{r.id} · removed {new Date(r.removed_at).toLocaleDateString()}</span><button className="text-btn" disabled={busy} onClick={()=>onRestore(r.kind,r.id)}>Restore</button></div>)}</details></section>;
}
