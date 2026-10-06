export type InvitationFlow = {
  stage: string;
  email?: string;
  businessName?: string;
  role?: string;
  workspaceId?: string;
};
export function invitationDestination(flow: InvitationFlow) {
  return ({register:'/sign-up',verify:'/verify-email',login:'/login',onboarding:'/onboarding'} as Record<string,string>)[flow.stage] ?? '/join';
}
