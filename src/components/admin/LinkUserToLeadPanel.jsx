import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Link2, Search, UserPlus, User, Mail } from 'lucide-react';

const APP_BASE = 'https://breezpoolcare.com';

export default function LinkUserToLeadPanel({ lead }) {
  const [emailSearch, setEmailSearch] = useState('');
  const [linking, setLinking] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [linkedResult, setLinkedResult] = useState(null);
  const [inviteSent, setInviteSent] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
  });

  const trimmedEmail = emailSearch.trim().toLowerCase();
  const matchedUser = trimmedEmail
    ? users.find(u => u.email?.toLowerCase() === trimmedEmail)
    : null;
  const hasSearched = trimmedEmail.length > 0;
  const userNotFound = hasSearched && !matchedUser;

  const activationUrl = `${APP_BASE}/Activate?leadId=${encodeURIComponent(lead.id)}`;

  const handleLink = async () => {
    if (!matchedUser) return;
    setLinking(true);
    try {
      const res = await base44.functions.invoke('linkUserToLead', {
        userId: matchedUser.id,
        leadId: lead.id,
      });
      if (res.data?.success) {
        setLinkedResult(res.data);
        toast.success('User linked successfully');
      } else {
        toast.error(res.data?.error || 'Failed to link user');
      }
    } catch (e) {
      toast.error(e.message || 'Failed to link user');
    } finally {
      setLinking(false);
    }
  };

  const handleInvite = async () => {
    setInviting(true);
    try {
      // DEBUG
      console.log('DEBUG lead.id:', lead.id);
      console.log('DEBUG lead._id:', lead._id);
      console.log('DEBUG lead.leadId:', lead.leadId);
      console.log('DEBUG activationUrl:', activationUrl);
      toast.info(`DEBUG: Sending URL: ${activationUrl}`);

      const customerName = lead.firstName || 'there';
      const emailBody = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #333;">
  <p style="font-size: 16px;">Hi ${customerName},</p>
  <p style="font-size: 16px;">You've been invited to activate your Breez Pool Care customer account.</p>
  <p style="font-size: 16px;">Click the button below to create your account or log in — your pool profile will be linked automatically:</p>
  <p style="margin: 24px 0;">
    <a href="${activationUrl}" style="display: inline-block; background: #1B9B9F; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Access app</a>
  </p>
  <p style="font-size: 14px; color: #666;">Or copy and paste this link:</p>
  <p style="font-size: 14px; color: #1B9B9F; word-break: break-all;">${activationUrl}</p>
  <p style="font-size: 14px; color: #666; margin-top: 24px;">If you have any trouble, call us at (321) 524-3838.</p>
  <p style="font-size: 14px; color: #666;">— The Breez Pool Care Team</p>
</body>
</html>`;

      await base44.integrations.Core.SendEmail({
        to: trimmedEmail,
        subject: 'Activate your Breez Pool Care account',
        body: emailBody,
      });
      setInviteSent(true);
      toast.success('Invite sent!');
    } catch (e) {
      toast.error(e.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-indigo-700" />
        <h4 className="font-semibold text-indigo-900 text-sm">Link Customer Account</h4>
      </div>

      {linkedResult ? (
        <div className="space-y-1">
          <Badge className="bg-green-100 text-green-800">Account Linked ✓</Badge>
          <p className="text-xs text-gray-600">User ID: <span className="font-mono">{linkedResult.userId}</span></p>
          <p className="text-xs text-gray-600">Lead ID: <span className="font-mono">{linkedResult.leadId}</span></p>
        </div>
      ) : (
        <>
          {/* Email search */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-indigo-800">Search by email</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="email"
                placeholder="customer@example.com"
                value={emailSearch}
                onChange={e => { setEmailSearch(e.target.value); setInviteSent(false); }}
                className="w-full text-sm border border-indigo-200 rounded-md pl-8 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          {/* User found */}
          {matchedUser && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-md px-3 py-2">
                <User className="w-4 h-4 text-indigo-500" />
                <div className="text-xs">
                  <p className="font-medium text-gray-900">{matchedUser.full_name || matchedUser.email}</p>
                  <p className="text-gray-500">{matchedUser.email} — {matchedUser.role || 'no role'}</p>
                  {matchedUser.linkedLeadId && (
                    <p className="text-amber-600">⚠ Already linked to another lead</p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleLink}
                disabled={linking}
                className="bg-indigo-600 hover:bg-indigo-700 text-white w-full"
              >
                <Link2 className="w-4 h-4 mr-2" />
                {linking ? 'Linking…' : 'Link Account'}
              </Button>
            </div>
          )}

          {/* User NOT found */}
          {userNotFound && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2">
                <UserPlus className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-600">No account found for <span className="font-medium">{trimmedEmail}</span></p>
              </div>

              {inviteSent ? (
                <div className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-md px-3 py-2 space-y-1">
                  <p className="font-medium">Invite sent ✓</p>
                  <p>The customer will be linked when they create their account using the activation link.</p>
                  <p className="font-mono text-xs break-all text-teal-600 mt-1">{activationLink}</p>
                </div>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={handleInvite}
                    disabled={inviting}
                    className="bg-teal-600 hover:bg-teal-700 text-white w-full"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    {inviting ? 'Sending…' : 'Invite Customer'}
                  </Button>
                  <p className="text-xs text-gray-500">
                    We'll send an invite email. Their account will be linked automatically when they sign up via:
                  </p>
                  <p className="font-mono text-xs break-all text-indigo-600">{activationLink}</p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}