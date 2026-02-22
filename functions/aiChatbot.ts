import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messages, conversationHistory } = await req.json();

    // Get support settings
    const settings = await base44.entities.SupportSettings.filter({ settingKey: 'default' });
    const config = settings[0] || {};

    // Get FAQs for context
    const faqs = await base44.entities.FAQ.filter({ isActive: true });
    const faqContext = faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

    // System prompt
    const systemPrompt = config.aiSystemPrompt || `You are Breez Assistant, a helpful AI assistant for Breez Pool Care.

Your role:
- Answer general questions about pool service, scheduling, billing, and app navigation
- Provide friendly, clear, and concise answers
- Suggest relevant FAQ articles when applicable
- DO NOT access or discuss specific account details, gate codes, or payment information
- DO NOT make guarantees or provide safety-critical chemical advice beyond basic guidance
- For urgent safety issues, advise calling (321) 524-3838 during business hours (9am-6pm Mon-Sat)

When you CANNOT help (account-specific, billing disputes, missed service, etc.):
- Politely explain you cannot access account details
- Offer to escalate: "I can connect you with our team who has access to your account. Would you like me to do that?"
- Use the escalation flag in your response

Available FAQs:
${faqContext}

Business Phone: (321) 524-3838
Hours: 9am-6pm Monday-Saturday (Closed Sunday)`;

    // Call LLM
    const llmResponse = await base44.integrations.Core.InvokeLLM({
      prompt: JSON.stringify([
        { role: 'system', content: systemPrompt },
        ...(conversationHistory || []),
        { role: 'user', content: messages }
      ]),
      add_context_from_internet: false
    });

    // Detect if escalation is needed
    const needsEscalation = 
      llmResponse.toLowerCase().includes('connect you with our team') ||
      llmResponse.toLowerCase().includes('cannot access') ||
      llmResponse.toLowerCase().includes('account-specific');

    // Find related FAQs
    const relatedFaqs = faqs.filter(f => {
      const keywords = f.keywords || [];
      return keywords.some(kw => 
        messages.toLowerCase().includes(kw.toLowerCase()) ||
        llmResponse.toLowerCase().includes(kw.toLowerCase())
      );
    }).slice(0, 3);

    return Response.json({
      success: true,
      response: llmResponse,
      needsEscalation,
      relatedFaqs: relatedFaqs.map(f => ({
        id: f.id,
        question: f.question,
        category: f.category
      }))
    });

  } catch (error) {
    console.error('AI chatbot error:', error);
    return Response.json({ 
      error: error.message || 'Failed to process chat',
      response: "I'm having trouble right now. Please try messaging our team directly or call (321) 524-3838.",
      needsEscalation: true
    }, { status: 500 });
  }
});