import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Users, Mail, Shield } from 'lucide-react';

export default async function TeamPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Team</h1>
        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400">
          Coming Soon
        </span>
      </div>
      <p className="text-white/60 mb-8">Manage team members and access levels</p>

      <div className="bg-[#0d0d0d] border border-white/[0.08] rounded-[14px] p-8 text-center">
        <Users size={48} className="mx-auto mb-4 text-white/15" />
        <h2 className="text-lg font-semibold mb-2">Team Management Coming Soon</h2>
        <p className="text-white/40 max-w-md mx-auto mb-6">
          Invite team members to collaborate on your VelumX integration.
          Assign roles, manage API key access, and share MPC configurations.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-xl mx-auto text-left">
          <div className="bg-[#111111] rounded-lg p-4">
            <Mail size={20} className="text-white mb-2" />
            <h3 className="text-sm font-medium mb-1">Invite by Email</h3>
            <p className="text-xs text-white/40">Send invites to team members via email</p>
          </div>
          <div className="bg-[#111111] rounded-lg p-4">
            <Shield size={20} className="text-white mb-2" />
            <h3 className="text-sm font-medium mb-1">Role-Based Access</h3>
            <p className="text-xs text-white/40">Admin, Developer, and Viewer roles</p>
          </div>
          <div className="bg-[#111111] rounded-lg p-4">
            <Users size={20} className="text-white mb-2" />
            <h3 className="text-sm font-medium mb-1">Shared Resources</h3>
            <p className="text-xs text-white/40">Shared API keys and MPC configurations</p>
          </div>
        </div>
      </div>
    </div>
  );
}
