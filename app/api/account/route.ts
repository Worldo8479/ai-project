import {getChatGPTUser} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
export async function GET(){const user=await getChatGPTUser();return Response.json({signedIn:!!user,name:user?.displayName??null,subscription:'private-preview'},{headers:{'Cache-Control':'no-store'}});}
