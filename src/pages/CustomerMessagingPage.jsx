import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, Send, MessageSquare, Loader2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useCustomerPageGuard } from '@/components/auth/useCustomerPageGuard';

export default function CustomerMessagingPage() {
  const [messageText, setMessageText] = useState('');
  const bottomRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  useCustomerPageGuard(user, userLoading);

  const { data: lead } = useQuery({
    queryKey: ['customerLead'],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user,
  });

  // Find or load thread for this lead
  const { data: thread } = useQuery({
    queryKey: ['customerThread', lead?.id],
    queryFn: async () => {
      const threads = await base44.entities.MessageThread.filter({ leadId: lead.id }, '-created_date', 1);
      return threads[0] || null;
    },
    enabled: !!lead,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['threadMessages', thread?.id],
    queryFn: () => base44.entities.Message.filter({ threadId: thread.id }, 'created_date', 100),
    enabled: !!thread,
    refetchInterval: 15000,
  });

  const createThreadMutation = useMutation({
    mutationFn: () => base44.functions.invoke('createMessageThread', {
      leadId: lead.id,
      subject: 'Customer Inquiry',
      initialMessage: messageText,
      senderName: user.full_name,
    }),
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['customerThread', lead?.id] });
      queryClient.invalidateQueries({ queryKey: ['threadMessages'] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: () => base44.functions.invoke('sendMessage', {
      threadId: thread.id,
      content: messageText,
      senderType: 'customer',
    }),
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['threadMessages', thread?.id] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!messageText.trim()) return;
    if (!thread) {
      createThreadMutation.mutate();
    } else {
      sendMessageMutation.mutate();
    }
  };

  const isSending = createThreadMutation.isPending || sendMessageMutation.isPending;

  if (userLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <Link to={createPageUrl('ClientHome')}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Message Us</h1>
          <p className="text-xs text-gray-400">Our team typically replies within a few hours</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && !thread && (
          <div className="text-center py-12 space-y-2">
            <MessageSquare className="w-10 h-10 text-gray-200 mx-auto" />
            <p className="text-gray-400 text-sm">Send us a message — we're here to help</p>
          </div>
        )}

        {messages.map(msg => {
          const isCustomer = msg.senderType === 'customer';
          return (
            <div key={msg.id} className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                isCustomer ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-900'
              }`}>
                <p className="text-sm leading-relaxed">{msg.content}</p>
                <p className={`text-xs mt-1 ${isCustomer ? 'text-teal-200' : 'text-gray-400'}`}>
                  {msg.created_date ? format(new Date(msg.created_date), 'MMM d, h:mm a') : ''}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <Textarea
          placeholder="Type your message…"
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
          className="resize-none text-sm"
          rows={3}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          className="w-full bg-teal-600 hover:bg-teal-700 h-11"
          disabled={!messageText.trim() || isSending}
          onClick={handleSend}
        >
          <Send className="w-4 h-4 mr-2" />
          {isSending ? 'Sending…' : 'Send Message'}
        </Button>
      </div>
    </div>
  );
}