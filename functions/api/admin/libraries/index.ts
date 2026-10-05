import { handleAdminRequest } from '../../../../server/admin/http';
export const onRequest: PagesFunction<Env> = ({ request, env }) => handleAdminRequest(request, env, 'libraries');
