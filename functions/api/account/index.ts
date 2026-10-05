import { handleAccountRequest } from '../../../server/account/http';
export const onRequest: PagesFunction<Env> = ({ request, env }) => handleAccountRequest(request, env, 'profile');
