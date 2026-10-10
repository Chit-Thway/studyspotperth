import { handleCatalogueRequest } from '../../server/libraries/catalogue';

export const onRequest: PagesFunction<Env> = (context) => handleCatalogueRequest(context.request, context.env);
