import {api} from './api.js';

const FILES = Object.freeze({
  leads:'off-the-clock-leads.csv',
  'quote-requests':'off-the-clock-quote-requests.csv',
  bookings:'off-the-clock-bookings.csv'
});

export async function downloadOwnerCsv(kind) {
  if (!Object.hasOwn(FILES,kind)) throw new Error('Export not found');
  const blob = await api('/api/exports/'+kind,{format:'blob'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href=url;link.download=FILES[kind];document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10_000);
}
