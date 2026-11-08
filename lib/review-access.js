// Server configuration only. The deployed private preview remains free.
// This switch supports sandbox acceptance; live billing is deliberately refused.
import {createStripeSandboxGateway} from './stripe-sandbox.js';
import {createSandboxSubscriptionService} from './billing-reconciliation.js';
export async function reviewWriteAccess(environment,db,userId,{fetcher=fetch,now=Date.now}={}){
 const mode=environment.BILLING_ACCESS_MODE;
 if(mode===undefined||mode===null||mode===''||mode==='private-preview')return {allowed:true};
 if(mode!=='sandbox')throw Error('Unsupported billing access configuration.');
 const scope=environment.STRIPE_SANDBOX_SCOPE,priceId=environment.STRIPE_SANDBOX_PRICE_ID;
 const gateway=createStripeSandboxGateway({mode:'test',secretKey:environment.STRIPE_SANDBOX_SECRET_KEY,
  priceId,siteOrigin:environment.BILLING_SITE_ORIGIN},fetcher);
 const service=createSandboxSubscriptionService({db,gateway,scope,priceId,mode:'test',now});
 const state=await service.status(userId);
 return {allowed:['active','trialing'].includes(state.status)};
}
