import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {AppShell,ErrorMessage,Loading,Notice,PageHeader} from './ui.jsx';

export default function Customers() {
  const [customers,setCustomers]=useState(null),[error,setError]=useState(null);
  useEffect(()=>{api('/api/customers').then(result=>setCustomers(result.customers)).catch(setError);},[]);
  return <AppShell activePath="/customers"><main className="customers-page">
    <PageHeader eyebrow="YOUR BUSINESS" title="Customers" description="Customer details saved for your business."/>
    <ErrorMessage error={error}/>{!customers?<Loading label="Loading customers"/>:customers.length===0?<Notice>No saved customers yet.</Notice>:
      customers.map(customer=><section className="editor-section" key={customer.id}>
        <h2>{customer.name||'Customer'}</h2><p>{customer.phoneE164||'No phone saved'}</p>
        {customer.address&&<p>{customer.address}</p>}
      </section>)}
  </main></AppShell>;
}
