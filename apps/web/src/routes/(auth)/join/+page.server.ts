import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => ({ invitation: locals.invitation, userId: locals.user?.id ?? null });
