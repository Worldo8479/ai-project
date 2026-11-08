import Workspace from '../preview';
import {requireChatGPTUser} from '../chatgpt-auth';
export const dynamic='force-dynamic';
export default async function AccountWorkspace(){await requireChatGPTUser('/app');return <Workspace/>;}
