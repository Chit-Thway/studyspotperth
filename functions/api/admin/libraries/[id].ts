import { handleAdminRequest } from '../../../../server/admin/http';
export const onRequest: PagesFunction<Env> = ({ request, env, params }) => handleAdminRequest(request, env, 'library', String(params.id));
