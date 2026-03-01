import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Send, Paperclip, Phone, Loader2 } from 'lucide-react';
import { useCustomerPageGuard } from '@/components/auth/useCustomerPageGuard';

export default function MessageThread() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const threadId = queryParams.get('id');
  const [messageContent, setMessageContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  // New thread mode
  const isNewThread = !threadId;
  const [subject, setSubject] = useState(location.state?.subject || '');
  const [category, setCategory] = useState('general');
  const [initialMessage, setInitialMessage] = useState(location.state?.initialMessage || '');

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

  const { data: thread } = useQuery({
    queryKey: ['messageThread', threadId],
    queryFn: () => base44.entities.MessageThread.get(threadId),
    enabled: !!threadId
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['threadMessages', threadId],
    queryFn: async () => {
      const result = await base44.entities.Message.filter({ threadId });
      return result.filter(m => !m.isInternal).sort((a, b) => 
        new Date(a.sentAt) - new Date(b.sentAt)
      );
    },
    enabled: !!threadId,
    refetchInterval: 5000 // Poll for new messages
  });

  const createThreadMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('createMessageThread', {
        leadId: lead.id,
        subject,
        category,
        initialMessage,
        attachments,
        aiConversationTranscript: location.state?.aiConversationTranscript
      });
      return response.data;
    },
    onSuccess: (data) => {
      navigate(createPageUrl(`MessageThread?id=${data.threadId}`));
      queryClient.invalidateQueries({ queryKey: ['messageThreads'] });
    }
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('sendMessage', {
        threadId,
        content: messageContent,
        attachments
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threadMessages'] });
      queryClient.invalidateQueries({ queryKey: ['messageThread'] });
      setMessageContent('');
      setAttachments([]);
    }
  });

  const handleSend = () => {
    if (isNewThread) {
      if (!subject.trim() || !initialMessage.trim()) {
        alert('Please provide a subject and message');
        return;
      }
      createThreadMutation.mutate();
    } else {
      if (!messageContent.trim()) return;
      sendMessageMutation.mutate();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const response = await base44.integrations.Core.UploadFile({ file });
      setAttachments([...attachments, response.file_url]);
    } catch (error) {
      alert('Failed to upload file');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!user || !lead) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-600">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate(createPageUrl('Messages'))}
        className="mb-2"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Messages
      </Button>

      {/* New Thread Form */}
      {isNewThread ? (
        <Card>
          <CardHeader>
            <CardTitle>New Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-900 text-sm">
                ⏱️ We respond within 48 hours or by the next business day
              </AlertDescription>
            </Alert>

            <div>
              <label className="block text-sm font-medium mb-2">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What do you need help with?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="general">General Question</option>
                <option value="billing">Billing</option>
                <option value="scheduling">Scheduling</option>
                <option value="service_quality">Service Quality</option>
                <option value="technical">Technical Issue</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Message</label>
              <Textarea
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
                placeholder="Please describe your issue or question..."
                rows={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Attachments</label>
              <input
                type="file"
                onChange={handleFileUpload}
                accept="image/*"
                className="text-sm"
              />
              {attachments.length > 0 && (
                <div className="mt-2 text-sm text-gray-600">
                  {attachments.length} file(s) attached
                </div>
              )}
            </div>

            <Button
              onClick={handleSend}
              disabled={createThreadMutation.isPending}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              {createThreadMutation.isPending ? 'Sending...' : 'Send Message'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Thread Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{thread?.subject}</CardTitle>
                  <div className="text-sm text-gray-600 mt-1 capitalize">
                    {thread?.category?.replace('_', ' ')}
                  </div>
                </div>
                <Badge className={
                  thread?.status === 'resolved' ? 'bg-green-100 text-green-800' :
                  thread?.status === 'waiting_on_customer' ? 'bg-purple-100 text-purple-800' :
                  'bg-blue-100 text-blue-800'
                }>
                  {thread?.status?.replace('_', ' ')}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Messages */}
          <Card className="max-h-[500px] overflow-y-auto">
            <CardContent className="p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div key={msg.id} className={`flex ${msg.senderType === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${
                    msg.senderType === 'customer'
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}>
                    {msg.senderType !== 'customer' && (
                      <div className="text-xs font-semibold mb-1 opacity-70">
                        Breez Team
                      </div>
                    )}
                    <div>{msg.content}</div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {msg.attachments.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-xs underline">
                            Attachment {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="text-xs opacity-70 mt-1">
                      {new Date(msg.sentAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </CardContent>
          </Card>

          {/* Reply Input */}
          {thread?.status !== 'closed' && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <Textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="text-sm"
                    id="reply-attach"
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="reply-attach">
                    <Button variant="outline" size="sm" as="span">
                      <Paperclip className="w-4 h-4 mr-2" />
                      Attach
                    </Button>
                  </label>
                  <Button
                    onClick={handleSend}
                    disabled={!messageContent.trim() || sendMessageMutation.isPending}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {sendMessageMutation.isPending ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Call Option */}
      <Card className="border-teal-200 bg-teal-50">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="text-sm">
            <div className="font-semibold">Need immediate help?</div>
            <div className="text-gray-600">9am–6pm Mon–Sat</div>
          </div>
          <a href="tel:(321) 524-3838">
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
              <Phone className="w-4 h-4 mr-2" />
              (321) 524-3838
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}