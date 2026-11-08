import {getChatGPTUser} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {handleAccountRequest} from '../../../lib/account-service.js';
export const dynamic='force-dynamic';
async function handle(request:Request){return handleAccountRequest(request,await getChatGPTUser(),env.DB);}
export {handle as GET,handle as PUT};
