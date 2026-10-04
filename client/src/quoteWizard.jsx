import {customerFieldVisible,customerFieldForInputs} from '../../server/scopeConfiguration.js';
import React, {useEffect, useRef, useState} from 'react';
import {Button, Field, Notice, Select, Textarea, TextInput} from './ui.jsx';
import {CustomerMeasurements} from './quoteDoneControls.jsx';

const show = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const addressLabels = {addressLine1:'Project location',addressLine2:'Address line 2',city:'City',region:'State / province',postalCode:'Postal / ZIP code',country:'Country'};

export function QuoteWizard({pricingOnly=false,services, service, values, change, onServiceChange, onSubmit, sending}) {
  const [position, setPosition] = useState(0);
  const heading = useRef(null);
  const steps = [
    {id:'service', title:'What can we help with?'},
    ...(values.requestedService === undefined ? [] : [{id:'requested',title:'Requested work'}]),
    ...(service?.customerFields || []).filter(field => field.type !== 'confirmed_facts' && customerFieldVisible(field,values.inputs)).map(field=>customerFieldForInputs(field,values.inputs)).map(field => ({id:'field:'+field.name,title:field.label,field})),
    ...(service?.customerFees || []).map(fee => ({id:'fee:'+fee,title:'Select '+fee+' charge',fee})),
    {id:'details',title:'Anything we should know about this job?'},
    {id:'additional',title:'Additional work for on-site estimate'},
    {id:'contact',title:'How can the business reach you?'},
    {id:'site',title:pricingOnly?'When do you need the work?':'Where is the work?'}
  ];
  const index = Math.min(position, steps.length - 1);
  const step = steps[index];
  useEffect(() => {
    heading.current?.focus({preventScroll:true});
    const scroll = heading.current?.closest('.widget-scroll');
    if (scroll) scroll.scrollTop = 0;
  }, [index, step.id]);
  function next(event) {
    event.preventDefault();
    if (sending || !service) return;
    if (index === steps.length - 1) onSubmit();
    else setPosition(index + 1);
  }
  return <form className="quote-wizard" onSubmit={next} noValidate>
    <p className="wizard-progress" aria-live="polite">Step {index + 1} of {steps.length}</p>
    <h2 ref={heading} tabIndex={-1}>{step.title}</h2>
    <fieldset disabled={sending} className="wizard-fields">
      {step.id === 'service' && <Field label="Service"><Select aria-label="Service" value={values.serviceId} onChange={event => onServiceChange(event.target.value)}>
        <option value="">Choose a service</option>{services.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select></Field>}
      {step.id === 'service' && !!service?.offeringSummary?.length && <Notice title="What this offering covers"><ul>{service.offeringSummary.map((detail,i)=><li key={i}>{detail}</li>)}</ul></Notice>}
      {step.id === 'requested' && <Field label="Requested work" help="Your earlier description is preserved. Correct it if the work has changed."><Textarea aria-label="Requested work" value={show(values.requestedService)} onChange={event => change('requestedService',event.target.value)}/></Field>}
      {step.field && <><CustomerMeasurements fields={[step.field]} scopeFields={service.customerFields} value={values.inputs} onChange={value => change('inputs',value)} knownOfferings={service.knownOfferings}/><p className="field-help">Use the measurements you know. Leave an unknown answer blank so the business can check it.</p></>}
      {step.fee && <Field label={step.title}><Select aria-label={step.title} value={values.fees[step.fee] === undefined ? '' : String(values.fees[step.fee])} onChange={event => change('fees',{...values.fees,[step.fee]:event.target.value === '' ? undefined : event.target.value === 'true'})}>
        <option value="">Unknown / not supplied</option><option value="true">Yes</option><option value="false">No</option>
      </Select></Field>}
      {step.id === 'details' && <>
        <Field label="Additional project details" help="Include details or changes that affect the selected service."><Textarea aria-label="Additional project details" value={show(values.context)} onChange={event => change('context',event.target.value)}/></Field>
        <Field label="Measurements or facts you do not know" help="List anything about this job that still needs checking."><Textarea aria-label="Measurements or facts you do not know" value={show(values.unknowns)} onChange={event => change('unknowns',event.target.value)}/></Field>
      </>}
      {step.id === 'additional' && <>
        <p>The owner will estimate this separate work on site. It will not be included in the selected service's estimate.</p>
        {(Array.isArray(values.additionalWork) && values.additionalWork.length ? values.additionalWork : ['']).map((item,i) => <Field key={i} label={i ? 'More work for on-site estimate' : 'Additional work for on-site estimate'}><Textarea aria-label={i ? "More work for on-site estimate" : "Additional work for on-site estimate"} value={show(item)} onChange={event => {
          const nextValues = Array.isArray(values.additionalWork) ? [...values.additionalWork] : [];
          nextValues[i] = event.target.value;
          change('additionalWork',nextValues.length === 1 && !event.target.value ? [] : nextValues);
        }}/></Field>)}
        {!Array.isArray(values.additionalWork) && <Notice>The original value is preserved. Enter a text description to correct it.</Notice>}
      </>}
      {step.id === 'contact' && <>
        <p>Provide an email address or phone number.{pricingOnly?' You can add your name and job site after the estimate.':' Your name is optional.'}</p>
        {(pricingOnly?['email','phone']:['name','email','phone']).map(key => <Field key={key} label={key[0].toUpperCase()+key.slice(1)}><TextInput type={key === 'phone' ? 'tel' : key === 'email' ? 'email' : 'text'} autoComplete={key === 'phone' ? 'tel' : key} value={show(values.contact[key])} onChange={event => change('contact',{...values.contact,[key]:event.target.value})}/></Field>)}
      </>}
      {step.id === 'site' && <>
        {!pricingOnly&&<p>Your address identifies the job site. Keep work requests and uncertain measurements in the job details.</p>}
        {!pricingOnly&&Object.entries(addressLabels).map(([key,label]) => <Field key={key} label={label}><TextInput value={show(values.location?.[key])} onChange={event => change('location',{...values.location,[key]:event.target.value})}/></Field>)}
        <Field label="Urgency"><Select aria-label="Urgency" value={show(values.urgency)} onChange={event => change('urgency',event.target.value)}><option value="">No timing preference</option><option value="flexible">Flexible timing</option><option value="contact_requested">Please contact me about timing</option></Select></Field>
      </>}
    </fieldset>
    <div className="wizard-actions">
      {index > 0 && <Button variant="secondary" onClick={() => setPosition(index - 1)} disabled={sending}>Back</Button>}
      <Button type="submit" disabled={sending || !service}>{sending ? 'Checking request' : index === steps.length - 1 ? 'Submit estimate request' : 'Continue'}</Button>
    </div>
  </form>;
}
