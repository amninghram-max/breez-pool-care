import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download } from 'lucide-react';

export default function InvoiceList({ invoices, leadId }) {
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const queryClient = useQueryClient();

  const payInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceId, paymentMethodId }) => {
      const response = await base44.functions.invoke('payInvoice', {
        invoiceId,
        paymentMethodId,
        acknowledgeStrictPolicy: true
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['currentLead'] });
      alert('Payment successful!');
      setSelectedInvoice(null);
    },
    onError: (error) => {
      alert(error.message || 'Payment failed');
    }
  });

  const sortedInvoices = [...invoices].sort((a, b) => 
    new Date(b.issueDate) - new Date(a.issueDate)
  );

  const getStatusBadge = (status) => {
    const statusConfig = {
      paid: { label: 'Paid', variant: 'default', className: 'bg-green-100 text-green-800' },
      open: { label: 'Open', variant: 'default', className: 'bg-blue-100 text-blue-800' },
      past_due: { label: 'Past Due', variant: 'destructive', className: 'bg-red-100 text-red-800' },
      cancelled: { label: 'Cancelled', variant: 'outline', className: 'bg-gray-100 text-gray-800' }
    };
    const config = statusConfig[status] || statusConfig.open;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-teal-600" />
          Invoices
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedInvoices.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No invoices yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedInvoices.map((invoice) => (
              <div key={invoice.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-medium">{invoice.invoiceNumber}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(invoice.issueDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg">${invoice.amount.toFixed(2)}</div>
                    {getStatusBadge(invoice.status)}
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-1 mb-3">
                  {invoice.lineItems?.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-600">{item.description}</span>
                      <span className={item.amount < 0 ? 'text-green-600' : ''}>
                        {item.amount < 0 ? '' : ''}${Math.abs(item.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {invoice.servicePeriodStart && invoice.servicePeriodEnd && (
                  <div className="text-xs text-gray-500 mb-3">
                    Service Period: {new Date(invoice.servicePeriodStart).toLocaleDateString()} - {new Date(invoice.servicePeriodEnd).toLocaleDateString()}
                  </div>
                )}

                {/* Actions */}
                {(invoice.status === 'open' || invoice.status === 'past_due') && (
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    Pay Now
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}