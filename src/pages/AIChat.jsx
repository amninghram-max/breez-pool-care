import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bot, Send, Phone, MessageSquare, ExternalLink } from 'lucide-react';

export default function AIChat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm Breez Assistant. I can help answer general questions about our service, scheduling, billing, and app navigation. How can I help you today?"
    }
  ]);
  const [input, setInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState([]);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  const chatMutation = useMutation({
    mutationFn: async (userMessage) => {
      const response = await base44.functions.invoke('aiChatbot', {
        messages: userMessage,
        conversationHistory
      });
      return response.data;
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        needsEscalation: data.needsEscalation,
        relatedFaqs: data.relatedFaqs
      }]);

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: input, timestamp: new Date().toISOString() },
        { role: 'assistant', content: data.response, timestamp: new Date().toISOString() }
      ]);
    }
  });

  const handleSend = () => {
    if (!input.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: input }]);
    chatMutation.mutate(input);
    setInput('');
  };

  const handleEscalate = () => {
    navigate(createPageUrl('MessageThread'), {
      state: {
        subject: 'Escalated from AI Assistant',
        initialMessage: `I was chatting with Breez Assistant and need help with: ${input}`,
        aiConversationTranscript: conversationHistory
      }
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-200px)] flex flex-col">
      {/* Header */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-600" />
              Breez Assistant
            </span>
            <Badge className="bg-purple-100 text-purple-800">AI</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-blue-900 text-sm">
              I can help with general questions. For account-specific issues, I'll connect you with our team.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Messages */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx}>
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {msg.content}
                </div>
              </div>

              {/* Related FAQs */}
              {msg.relatedFaqs && msg.relatedFaqs.length > 0 && (
                <div className="mt-2 ml-4">
                  <div className="text-xs text-gray-600 mb-1">Related articles:</div>
                  <div className="flex flex-wrap gap-2">
                    {msg.relatedFaqs.map(faq => (
                      <a key={faq.id} href={createPageUrl('FAQ')} target="_blank" rel="noopener noreferrer">
                        <Badge variant="outline" className="cursor-pointer hover:bg-gray-100 text-xs">
                          {faq.question}
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </Badge>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Escalation Prompt */}
              {msg.needsEscalation && (
                <div className="mt-2 ml-4">
                  <Button
                    size="sm"
                    onClick={handleEscalate}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Connect with Our Team
                  </Button>
                </div>
              )}
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3 text-gray-600">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask me anything about Breez..."
              disabled={chatMutation.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Call Option */}
      <Card className="mt-4 border-teal-200 bg-teal-50">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="text-sm">
            <div className="font-semibold">Prefer to talk?</div>
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