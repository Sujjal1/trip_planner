import React, {useState} from 'react';
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function PaymentForm({owners,userId,busy,onSubmit}) {
  const [payer,setPayer]=useState(String(userId));
  const [recipient,setRecipient]=useState(String(owners.find(o=>o.id!==userId)?.id||''));
  const [amount,setAmount]=useState('');
  if(owners.length<2) return <div className="modal-body"><p>Add another owner to record a payment.</p></div>;
  return <form className="modal-body form" onSubmit={e=>{e.preventDefault();onSubmit({payer_id:Number(payer),recipient_id:Number(recipient),amount});}}>
    <label className="field"><span>Paid by</span><select value={payer} onChange={e=>{const id=e.target.value;setPayer(id);if(id===recipient)setRecipient(String(owners.find(o=>String(o.id)!==id).id));}}>{owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <label className="field"><span>Paid to</span><select value={recipient} onChange={e=>setRecipient(e.target.value)}>{owners.filter(o=>String(o.id)!==payer).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <label className="field"><span>Amount (USD)</span><input required type="number" min="0.01" max="100000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <button className="btn" disabled={busy}>Record payment</button>
  </form>;
}
export function PaymentHistory({payments,canRemove,onRemove,onAdd}) {
  return <section className="card"><div className="card-heading"><div><h2>Payments</h2></div><button className="btn" onClick={onAdd}>Record payment</button></div>
    {payments.length?<div className="table-scroll"><table><thead><tr><th>FROM</th><th>TO</th><th>AMOUNT</th><th>NOTE</th><th>DATE</th><th>ACTIONS</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td>{p.payer}</td><td>{p.recipient}</td><td>{money(p.amount_cents)}</td><td>{p.note||'—'}</td><td>{new Date(p.created_at).toLocaleDateString()}</td><td>{canRemove(p)&&<button className="text-btn" onClick={()=>onRemove('payments',p.id)}>Delete payment</button>}</td></tr>)}</tbody></table></div>:<p className="form-note">No payments yet.</p>}
  </section>;
}
export function RemovedEntries({entries,busy,onRestore}) {
  if(!entries.length)return null;
  return <section className="card"><details><summary>Deleted entries ({entries.length}) — restore a mistake</summary><p>These entries are excluded from totals. Restoring them recalculates balances.</p>{entries.map(r=><div className="card-heading" key={`${r.kind}-${r.id}`}><span>{r.kind==='trips'?'Trip':r.kind==='expenses'?'Expense':'Payment'} #{r.id} · removed {new Date(r.removed_at).toLocaleDateString()}</span><button className="text-btn" disabled={busy} onClick={()=>onRestore(r.kind,r.id)}>Restore</button></div>)}</details></section>;
}
