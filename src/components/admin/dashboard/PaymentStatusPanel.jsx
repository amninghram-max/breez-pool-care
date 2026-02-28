import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PaymentStatusPanel({ leads }) {
  const pendingActivation = leads.filter(l =>
    l.stage === 'converted' && l.activationPaymentStatus === 'pending'
  );
  const overdue = leads.filter(l =>
    l.accountStatus === 'suspended_billing' || l.accountStatus === 'suspended_strict' || l.accountStatus === 'cancelled_nonpayment'
  );
  const recurringActive = leads.filter(l =>
    l.accountStatus === 'active' && l.monthlyServiceAmount > 0 && l.autopayEnabled
  );
  const manualPay = leads.filter(l =>
    l.accountStatus === 'active' && l.monthlyServiceAmount > 0 && !l.autopayEnabled
  );

  function Row({ label, items, color, linkPage }) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
        <div className="flex items-center gap-2">
          <Badge className={color}>{items.length}</Badge>
          <span className="text-sm text-gray-700">{label}</span>
        </div>
        {linkPage && items.length > 0 && (
          <Link to={createPageUrl(linkPage)} className="text-xs text-teal-600 hover:underline">View →</Link>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="w-4 h-4" /> Payment Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Row label="Pending Activation Payment" items={pendingActivation} color="bg-yellow-100 text-yellow-800" linkPage="Billing" />
        <Row label="Overdue / Suspended" items={overdue} color="bg-red-100 text-red-800" linkPage="AdminReinstatements" />
        <Row label="AutoPay Active" items={recurringActive} color="bg-green-100 text-green-800" />
        <Row label="Manual Pay (no AutoPay)" items={manualPay} color="bg-gray-100 text-gray-700" />
      </CardContent>
    </Card>
  );
}