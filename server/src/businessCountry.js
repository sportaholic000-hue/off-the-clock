// The business country and region saved at sign-up, through
// POST /api/business/jurisdiction. Quotes read the country for sales tax,
// for which jobs are outside the country, for lead-paint screening on painting
// jobs and for the roofing building code, so changing it when services are
// approved needs the owner's confirmation. The confirmation names the old
// country, the new country and the price-book revision it was shown for; any
// other edit makes it stale. Profile, book and approval receipts change
// together under the price-book lock: the profile update is held in a database
// transaction that commits only after the book is written, and a failure on
// either side leaves both as they were.
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {resolveJurisdiction} from '../taxJurisdiction.js';
import {parseOwnerNumericInput} from '../priceBookMoney.js';
import {withPricebookLock,loadPricebook,savePricebook,writePricebookFile,pricebookDirectory,pricebookCreationRecorded} from '../priceBookService.js';
import {db} from './db.js';
import {getBusinessProfile,saveJurisdictionProfile} from './onboardingService.js';
import {bookRevision,countryChangeReceipts,approvedServiceCount} from './quoteDoneBridge.js';

const TAX_MODES=new Set(['TAX_NONE','TAX_MATERIALS','TAX_ALL']);
const COUNTRY_NAMES={CA:'Canada',US:'the United States'};
export const COUNTRY_CHANGE_ACTION='Change country';
export const countryChangeMessage=country=>`Changing your country to ${COUNTRY_NAMES[country]||country} changes how your quotes handle sales tax, which jobs are outside your country, and lead-paint screening on painting jobs. Your approved prices stay approved. Confirm your sales tax for ${COUNTRY_NAMES[country]||country} below.`;
const failure=(message,statusCode=400,extra={})=>Object.assign(new Error(message),{statusCode,...extra});
const savedCountry=ownerId=>{const country=getBusinessProfile(ownerId)?.country;return ['CA','US'].includes(country)?country:null;};

export function saveBusinessJurisdiction(ownerId,body={},{afterBookWrite}={}){
  const country=String(body?.country||'').toUpperCase(),region=String(body?.region||'').toUpperCase();
  const defaultCurrency={CA:'CAD',US:'USD'}[country];
  let resolved=resolveJurisdiction(country,region);
  // Jurisdiction lookup supplies a prefill. Explicit owner settings must be
  // validated and saved even when that location already has a preset.
  const explicitTaxSettings=Object.hasOwn(body||{},'taxMode')||Object.hasOwn(body||{},'taxPercent');
  // Validated after any country-change confirmation is asked for, so the
  // confirmation (which asks for the tax) comes first.
  const confirmTax=()=>{
    if(!explicitTaxSettings&&!resolved.needsOwnerConfirmation)return;
    const taxMode=body?.taxMode;
    const taxPercent=parseOwnerNumericInput(body?.taxPercent,{path:'taxPercent'});
    if(!TAX_MODES.has(taxMode))throw failure('Choose how you handle sales tax on customer invoices');
    if(taxMode!=='TAX_NONE'&&(!Number.isFinite(taxPercent)||taxPercent<=0||taxPercent>100))throw failure('Enter a valid sales tax rate');
    resolved={...resolved,taxMode,taxPercent:taxMode==='TAX_NONE'?0:taxPercent,needsOwnerConfirmation:false};
  };
  return withPricebookLock(ownerId,()=>{
    let book=loadPricebook(ownerId);
    const from=savedCountry(ownerId),changing=['CA','US'].includes(country)&&from!==country;
    const approved=changing?approvedServiceCount(book):0;
    if(approved){
      const shown={from,to:country,revision:bookRevision(book)},given=body?.countryChange;
      const matches=given&&typeof given==='object'&&given.from===shown.from&&given.to===shown.to&&given.revision===shown.revision;
      // The confirmation asks for the sales tax for the new country, prefilled
      // from that country and region's preset when there is one, else blank.
      const preset=resolveJurisdiction(country,region);
      const tax=preset.taxMode?{taxMode:preset.taxMode,taxPercent:preset.taxPercent}:{taxMode:null,taxPercent:null};
      const details={countryChange:shown,message:countryChangeMessage(country),action:COUNTRY_CHANGE_ACTION,tax};
      if(!matches)throw failure(countryChangeMessage(country),409,{code:given?'COUNTRY_CHANGE_CONFIRMATION_STALE':'COUNTRY_CHANGE_CONFIRMATION_REQUIRED',details});
      // The confirmed change saves the tax the owner confirmed, so it must be sent.
      if(!explicitTaxSettings)throw failure(countryChangeMessage(country),409,{code:'COUNTRY_CHANGE_TAX_REQUIRED',details});
    }
    confirmTax();
    // A book that does not exist yet is created first, unchanged: creation is
    // confirmed outside any open database transaction.
    const directory=pricebookDirectory(),target=resolve(directory,`${ownerId}.json`);
    if(!existsSync(target)||!pricebookCreationRecorded(ownerId))book=savePricebook(ownerId,book).pricebook;
    const previous=readFileSync(target,'utf8');
    // Receipts current just before the change stay current with the tax mode
    // and rate saved with it.
    const tax={taxMode:resolved.taxMode,taxPercent:resolved.taxPercent};
    const stamped=changing?countryChangeReceipts(book,country,{taxDefaults:tax}).services:book.services;
    const defaults={...(book.defaults||{}),...tax};
    // The first business country supplies a denomination only when the book
    // does not already have one. Revisiting jurisdiction never converts prices.
    if(!defaults.currency&&defaultCurrency)defaults.currency=defaultCurrency;
    let bookWritten=false;
    try{
      db.transaction(()=>{
        saveJurisdictionProfile(ownerId,{country,region});
        savePricebook(ownerId,{...book,defaults,services:stamped});bookWritten=true;
        afterBookWrite?.();
      })();
    }catch(error){
      // The profile update rolled back with the transaction; put the book back.
      if(bookWritten)writePricebookFile(directory,ownerId,previous);
      throw error;
    }
    return approved?{...resolved,countryChanged:true,approvedServices:approved}:resolved;
  });
}
