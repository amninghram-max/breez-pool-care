import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Plus, Clock, Loader2 } from 'lucide-react';
import { useCustomerPageGuard } from '@/components/auth/useCustomerPageGuard';

export default function Messages() {
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  useCustomerPageGuard(user, userLoading);

  const { data: lead } = useQuery({
    queryKey: ['currentLead', user?.email],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user
  });

  const { data: threads = [], isLoading } = useQuery({
    queryKey: ['messageThreads', lead?.id],
    queryFn: () => base44.entities.MessageThread.filter({ leadId: lead.id }),
    enabled: !!lead
  });

  const sortedThreads = [...threads].sort((a, b) => 
    new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
  );

  const getStatusBadge = (status) => {
    const configs = {
      new: { label: 'New', className: 'bg-blue-100 text-blue-800' },
      in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-800' },
      waiting_on_customer: { label: 'Waiting', className: 'bg-purple-100 text-purple-800' },
      resolved: { label: 'Resolved', className: 'bg-green-100 text-green-800' },
      closed: { label: 'Closed', className: 'bg-gray-100 text-gray-800' }
    };
    const config = configs[status] || configs.new;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-600 mt-1">
            ⏱️ We respond within 48 hours or by the next business day
          </p>
        </div>
        <Link to={createPageUrl('MessageThread')}>
          <Button className="bg-teal-600 hover:bg-teal-700">
            <Plus className="w-4 h-4 mr-2" />
            New Message
          </Button>
        </Link>
      </div>

      {/* Threads List */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-600">Loading messages...</p>
          </CardContent>
        </Card>
      ) : sortedThreads.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <MessageSquare className="w-16 h-16 mx-auto text-gray-400" />
            <div>
              <p className="text-gray-600 mb-4">No messages yet</p>
              <Link to={createPageUrl('MessageThread')}>
                <Button className="bg-teal-600 hover:bg-teal-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Start a Conversation
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedThreads.map(thread => (
            <Link key={thread.id} to={createPageUrl(`MessageThread?id=${thread.id}`)}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{thread.subject}</h3>
                        {thread.escalatedFromAI && (
                          <Badge variant="outline" className="text-xs">From AI</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        {new Date(thread.lastMessageAt).toLocaleDateString()}
                        <span>•</span>
                        <span className="capitalize">{thread.category?.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(thread.status)}
                      {thread.lastMessageBy === 'staff' && !thread.customerNotified && (
                        <Badge className="bg-red-100 text-red-800 text-xs">New Reply</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}