import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageSquare, Clock, User, AlertTriangle, Send } from 'lucide-react';

export default function AdminMessaging() {
  const [selectedThread, setSelectedThread] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: threads = [] } = useQuery({
    queryKey: ['allThreads', filterStatus],
    queryFn: async () => {
      const query = filterStatus === 'all' ? {} : { status: filterStatus };
      return await base44.entities.MessageThread.filter(query);
    }
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['threadMessages', selectedThread?.id],
    queryFn: async () => {
      const result = await base44.entities.Message.filter({ threadId: selectedThread.id });
      return result.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
    },
    enabled: !!selectedThread,
    refetchInterval: 5000
  });

  const { data: settings } = useQuery({
    queryKey: ['supportSettings'],
    queryFn: async () => {
      const result = await base44.entities.SupportSettings.filter({ settingKey: 'default' });
      return result[0] || {};
    }
  });

  const sendReplyMutation = useMutation({
    mutationFn: async ({ isInternal }) => {
      const response = await base44.functions.invoke('sendMessage', {
        threadId: selectedThread.id,
        content: isInternal ? internalNote : replyContent,
        isInternal
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threadMessages'] });
      queryClient.invalidateQueries({ queryKey: ['allThreads'] });
      setReplyContent('');
      setInternalNote('');
    }
  });

  const updateThreadMutation = useMutation({
    mutationFn: async (updates) => {
      await base44.entities.MessageThread.update(selectedThread.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allThreads'] });
      queryClient.invalidateQueries({ queryKey: ['threadMessages'] });
    }
  });

  // Check admin access
  if (user && user.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-gray-600">This page is only accessible to administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedThreads = [...threads].sort((a, b) => {
    // Prioritize by status and SLA
    if (a.status === 'new' && b.status !== 'new') return -1;
    if (b.status === 'new' && a.status !== 'new') return 1;
    return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
  });

  const calculateSLAStatus = (thread) => {
    if (thread.firstResponseAt) return 'met';
    const now = new Date();
    const deadline = new Date(thread.slaDeadline);
    const hoursRemaining = (deadline - now) / (1000 * 60 * 60);
    if (hoursRemaining < 0) return 'overdue';
    if (hoursRemaining < 24) return 'urgent';
    return 'ok';
  };

  return (
    <div className="grid md:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
      {/* Threads List */}
      <Card className="md:col-span-1 overflow-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Support Inbox</span>
            <Badge>{threads.length}</Badge>
          </CardTitle>
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              variant={filterStatus === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterStatus('all')}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={filterStatus === 'new' ? 'default' : 'outline'}
              onClick={() => setFilterStatus('new')}
            >
              New
            </Button>
            <Button
              size="sm"
              variant={filterStatus === 'in_progress' ? 'default' : 'outline'}
              onClick={() => setFilterStatus('in_progress')}
            >
              Active
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedThreads.map(thread => {
            const slaStatus = calculateSLAStatus(thread);
            return (
              <div
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={`p-3 border rounded cursor-pointer transition-colors ${
                  selectedThread?.id === thread.id ? 'bg-teal-50 border-teal-500' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="font-medium text-sm">{thread.subject}</span>
                  {slaStatus === 'overdue' && (
                    <Badge className="bg-red-100 text-red-800 text-xs">Overdue</Badge>
                  )}
                  {slaStatus === 'urgent' && (
                    <Badge className="bg-orange-100 text-orange-800 text-xs">Urgent</Badge>
                  )}
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(thread.lastMessageAt).toLocaleString()}
                  </div>
                  <div className="capitalize">{thread.category?.replace('_', ' ')}</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Thread Detail */}
      <Card className="md:col-span-2 flex flex-col overflow-hidden">
        {!selectedThread ? (
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Select a thread to view messages</p>
            </div>
          </CardContent>
        ) : (
          <>
            {/* Thread Header */}
            <CardHeader className="border-b">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{selectedThread.subject}</CardTitle>
                    <div className="text-sm text-gray-600 mt-1">
                      {selectedThread.escalatedFromAI && (
                        <Badge variant="outline" className="mr-2 text-xs">Escalated from AI</Badge>
                      )}
                      <span className="capitalize">{selectedThread.category?.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <select
                    value={selectedThread.status}
                    onChange={(e) => updateThreadMutation.mutate({ status: e.target.value })}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="new">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting_on_customer">Waiting on Customer</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                {/* Quick Actions */}
                {settings?.quickReplyTemplates && settings.quickReplyTemplates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {settings.quickReplyTemplates.slice(0, 3).map((template, idx) => (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        onClick={() => setReplyContent(template.content)}
                      >
                        {template.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>

            {/* Messages */}
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={msg.isInternal ? 'bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded' : ''}>
                  <div className={`flex ${msg.senderType === 'customer' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg p-3 ${
                      msg.isInternal ? 'bg-yellow-100 text-gray-900' :
                      msg.senderType === 'customer' ? 'bg-gray-100 text-gray-900' :
                      'bg-teal-600 text-white'
                    }`}>
                      <div className="text-xs font-semibold mb-1 opacity-70">
                        {msg.isInternal ? '🔒 Internal Note' : msg.senderName}
                      </div>
                      <div>{msg.content}</div>
                      <div className="text-xs opacity-70 mt-1">
                        {new Date(msg.sentAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>

            {/* Reply Area */}
            <div className="border-t p-4 space-y-3">
              {/* Customer Reply */}
              <div>
                <label className="text-sm font-medium mb-2 block">Reply to Customer</label>
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                />
                <Button
                  size="sm"
                  onClick={() => sendReplyMutation.mutate({ isInternal: false })}
                  disabled={!replyContent.trim() || sendReplyMutation.isPending}
                  className="mt-2 bg-teal-600 hover:bg-teal-700"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Reply
                </Button>
              </div>

              {/* Internal Note */}
              <div className="pt-3 border-t">
                <label className="text-sm font-medium mb-2 block">Internal Note (Staff Only)</label>
                <Textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder="Add internal note..."
                  rows={2}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendReplyMutation.mutate({ isInternal: true })}
                  disabled={!internalNote.trim() || sendReplyMutation.isPending}
                  className="mt-2"
                >
                  Add Internal Note
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}