import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Link2, Search, UserPlus, User, Mail, Copy, Check } from 'lucide-react';

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
      await base44.users.inviteUser(trimmedEmail, 'user');
      setInviteSent(true);
      toast.success('Invite sent via Base44');
    } catch (e) {
      toast.error(e.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const handleSendActivationEmail = async () => {
    try {
      const customerName = lead.firstName || 'there';
      const emailBody = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #333;">
  <p style="font-size: 16px;">Hi ${customerName},</p>
  <p style="font-size: 16px;">Here is your Breez Pool Care activation link:</p>
  <p style="margin: 24px 0;">
    <a href="${activationUrl}" style="display: inline-block; background: #1B9B9F; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Activate Account</a>
  </p>
  <p style="font-size: 14px; color: #666;">Or copy and paste: <span style="color: #1B9B9F;">${activationUrl}</span></p>
  <p style="font-size: 14px; color: #666; margin-top: 24px;">— The Breez Pool Care Team</p>
</body>
</html>`;
      await base44.integrations.Core.SendEmail({
        to: matchedUser.email,
        subject: 'Your Breez Pool Care activation link',
        body: emailBody,
      });
      toast.success('Activation link sent!');
    } catch (e) {
      toast.error(e.message || 'Failed to send email');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(activationUrl);
    toast.success('Copied!');
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
                <div className="bg-teal-50 border border-teal-200 rounded-md px-3 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-600" />
                    <p className="text-xs font-semibold text-teal-800">Invite sent via Base44</p>
                  </div>
                  <p className="text-xs text-gray-600">Share the activation link with the customer so they land on the right page after signing up:</p>
                  <p className="font-mono text-xs break-all text-teal-700 bg-white border border-teal-200 rounded p-2">{activationUrl}</p>
                  <Button
                    size="sm"
                    onClick={handleCopyLink}
                    variant="outline"
                    className="w-full border-teal-400 text-teal-700 hover:bg-teal-50"
                  >
                    <Copy className="w-3.5 h-3.5 mr-2" />
                    Copy Activation Link
                  </Button>
                  <p className="text-xs text-gray-500">After the customer creates their account, you can send them the activation link again.</p>
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
                    {inviting ? 'Sending…' : 'Invite Customer (Activation Link)'}
                  </Button>
                  <p className="text-xs text-gray-500">
                    Sends a Base44 invite. Share the activation link with the customer after they sign up:
                  </p>
                  <p className="font-mono text-xs break-all text-indigo-600">{activationUrl}</p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}