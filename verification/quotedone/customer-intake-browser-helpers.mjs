// Operate the real customer form. Preparation and the final save use actual HTTP.
export async function submitCustomerForm(page,url,{button='Submit estimate request'}={}) {
 const matches=response=>response.request().method()==='POST'&&(response.url().endsWith(url)||response.url().endsWith(url+'/prepare'));
 const first=page.waitForResponse(matches);
 await page.getByRole('button',{name:button,exact:true}).click();
 let response=await first;
 if(response.url().endsWith(url+'/prepare')&&response.status()===200){
  const details=await response.json();
  await page.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
  const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(url));
  await page.getByRole('button',{name:details.status==='ready'?'Get estimate':'Send request for review',exact:true}).click();
  response=await saved;
 }
 return response;
}
