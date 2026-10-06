// Draft generation has no persistence capability. Only the explicit save
// endpoint changes the knowledge used by calls.
export function installKnowledgeDraftRoutes(app,{requireAuth,requireProviderWrites,asyncHandler,onboardingState,draftKnowledgeBase,saveKnowledgeBase}){
  app.post('/api/onboarding/knowledge-base/draft',requireAuth(['owner']),requireProviderWrites,asyncHandler(async(req,res)=>{
    const state=onboardingState(req.tenantOwnerId);
    const websiteUrl=Object.hasOwn(req.body||{},'websiteUrl')?req.body.websiteUrl:state.profile.knowledgeBase?.website;
    const knowledgeBase=await draftKnowledgeBase({businessName:state.account.businessName,businessTypes:state.profile.businessTypes,websiteUrl});
    return res.json({knowledgeBase:{...knowledgeBase,draft:true},status:'DRAFT'});
  }));
  app.post('/api/onboarding/knowledge-base',requireAuth(['owner']),asyncHandler(async(req,res)=>{
    const profile=saveKnowledgeBase(req.tenantOwnerId,{...(req.body||{}),draft:false});
    return res.json({profile});
  }));
}
