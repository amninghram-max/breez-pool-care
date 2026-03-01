import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Link2, User } from 'lucide-react';

export default function LinkUserToLeadPanel({ lead }) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkedResult, setLinkedResult] = useState(null);

  const { data: users = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
  });

  const customerUsers = users.filter(u => u.role === 'customer' || !u.role);

  const handleLink = async () => {
    if (!selectedUserId) return;
    setLinking(true);
    try {
      const res = await base44.functions.invoke('linkUserToLead', {
        userId: selectedUserId,
        leadId: lead.id,
      });
      if (res.data?.success) {
        setLinkedResult(res.data);
        toast.success('User linked to lead successfully');
      } else {
        toast.error(res.data?.error || 'Failed to link user');
      }
    } catch (e) {
      toast.error(e.message || 'Failed to link user');
    } finally {
      setLinking(false);
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
          <div className="space-y-2">
            <label className="text-xs font-medium text-indigo-800">Select User by Email</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full text-sm border border-indigo-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">-- Select a user --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.email} {u.full_name ? `(${u.full_name})` : ''} — {u.role || 'no role'}
                  {u.linkedLeadId ? ' [already linked]' : ''}
                </option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            onClick={handleLink}
            disabled={!selectedUserId || linking}
            className="bg-indigo-600 hover:bg-indigo-700 text-white w-full"
          >
            <User className="w-4 h-4 mr-2" />
            {linking ? 'Linking...' : 'Link Account'}
          </Button>
        </>
      )}
    </div>
  );
}