import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Shield, User, Briefcase, Wrench } from 'lucide-react';
import { toast } from 'sonner';

export default function StaffManagement() {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ['staffUsers'],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users.filter(u => u.role !== 'customer');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }) => {
      return await base44.users.inviteUser(email, role);
    },
    onSuccess: () => {
      toast.success('Staff invitation sent');
      setInviteEmail('');
      setInviteRole('staff');
      setShowInviteForm(false);
      queryClient.invalidateQueries({ queryKey: ['staffUsers'] });
    },
    onError: (error) => {
      toast.error('Failed to send invitation: ' + error.message);
    },
  });

  const handleInvite = () => {
    if (!inviteEmail || !inviteRole) {
      toast.error('Please provide email and role');
      return;
    }
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4 text-red-600" />;
      case 'staff': return <Briefcase className="w-4 h-4 text-blue-600" />;
      case 'technician': return <Wrench className="w-4 h-4 text-teal-600" />;
      default: return <User className="w-4 h-4 text-gray-600" />;
    }
  };

  const getRoleBadge = (role) => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      staff: 'bg-blue-100 text-blue-800',
      technician: 'bg-teal-100 text-teal-800',
    };
    return (
      <Badge className={colors[role] || 'bg-gray-100 text-gray-800'}>
        {role}
      </Badge>
    );
  };

  if (user?.role !== 'admin') {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-800">Access denied. Admin role required.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Staff Management</h1>
          <p className="text-gray-600 mt-1">Invite and manage team members</p>
        </div>
        <Button 
          onClick={() => setShowInviteForm(!showInviteForm)}
          className="bg-teal-600 hover:bg-teal-700"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Staff
        </Button>
      </div>

      {/* Invite Form */}
      {showInviteForm && (
        <Card className="bg-teal-50 border-teal-200">
          <CardHeader>
            <CardTitle className="text-teal-900">Invite New Staff Member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="inviteEmail">Email Address</Label>
              <Input
                id="inviteEmail"
                type="email"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="inviteRole">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technician">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4" />
                      Technician
                    </div>
                  </SelectItem>
                  <SelectItem value="staff">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Staff / Dispatcher
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Admin
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-600 mt-1">
                {inviteRole === 'technician' && 'Access to routes, service entry, and assigned messages'}
                {inviteRole === 'staff' && 'Access to scheduling, pipeline, and full messaging'}
                {inviteRole === 'admin' && 'Full system access including pricing and settings'}
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleInvite}
                disabled={inviteMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700"
              >
                {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  setShowInviteForm(false);
                  setInviteEmail('');
                  setInviteRole('staff');
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff List */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members ({staffUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {staffUsers.length > 0 ? (
            <div className="space-y-3">
              {staffUsers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border-2 border-gray-200">
                      {getRoleIcon(member.role)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{member.full_name || member.email}</p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getRoleBadge(member.role)}
                    {member.isActive !== false ? (
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-600">Inactive</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">No staff members yet</p>
              <p className="text-sm text-gray-500 mt-1">Invite your first team member</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Wrench className="w-5 h-5 text-teal-600 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Technician</p>
              <p className="text-sm text-gray-600">
                View assigned routes, complete service visits, log chemistry readings, respond to assigned messages. Cannot access quotes, pricing, or admin settings.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Briefcase className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Staff / Dispatcher</p>
              <p className="text-sm text-gray-600">
                Full scheduling access, lead pipeline, route optimization, all messaging, billing status view. Cannot modify pricing settings or system configuration.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Admin</p>
              <p className="text-sm text-gray-600">
                Complete system access including quote logic, pricing controls, payment settings, analytics, staff management, and all operational features.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}