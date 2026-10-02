import { handleLibraryRequest } from '../../server/libraries/http';

export const onRequest: PagesFunction<Env> = (context) => handleLibraryRequest(context.request, context.env, 'suburbs');
