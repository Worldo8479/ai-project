import {getChatGPTUser} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {handleReviewRequest} from '../../../lib/review-service.js';
export const dynamic='force-dynamic';
async function handle(request:Request){const user=await getChatGPTUser();return handleReviewRequest(request,user?.userId??null,env.DB);}
export {handle as GET,handle as POST,handle as DELETE,handle as PUT};
