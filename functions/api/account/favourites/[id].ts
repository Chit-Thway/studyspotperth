import { handleAccountRequest } from '../../../../server/account/http';
export const onRequest: PagesFunction<Env> = ({ request, env, params }) => handleAccountRequest(request, env, 'favourite', String(params.id));
