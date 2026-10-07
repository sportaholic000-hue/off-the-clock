import express from 'express';
export function installBillingVoiceRoutes(app,{validator,meter}){
  app.post('/api/twilio/voice/status',express.urlencoded({extended:false,limit:'16kb',parameterLimit:64}),async(req,res)=>{
    try {
      if(!req.body||Object.values(req.body).some(value=>typeof value!=='string'))return res.sendStatus(400);
      const params={...req.body};
      await validator.validateHttp({signature:req.get('x-twilio-signature'),requestPath:req.originalUrl,params});
      if(!['completed','busy','failed','no-answer','canceled'].includes(params.CallStatus))return res.sendStatus(204);
      meter.providerComplete(params);return res.sendStatus(204);
    } catch(error){return res.status(error.statusCode||409).json({error:'Call usage could not be confirmed.'});}
  });
}
