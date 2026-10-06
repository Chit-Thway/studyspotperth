import { handleUsageRequest } from '../../server/usage/http';
export const onRequest: PagesFunction<Env> = ({ request, env }) => handleUsageRequest(request, env);
