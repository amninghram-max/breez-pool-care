import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Droplet, DollarSign, MessageSquare, Phone, Clock, CheckCircle, AlertCircle, ShieldAlert, BookOpen } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import FecalIncidentBanner from '../components/customer/FecalIncidentBanner';
import FecalIncidentForm from '../components/customer/FecalIncidentForm';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function ClientHome() {
  const [showIncidentForm, setShowIncidentForm] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: lead } = useQuery({
    queryKey: ['currentLead'],
    queryFn: async () => {
      if (!user.linkedLeadId) return null;
      const leads = await base44.entities.Lead.filter({ id: user.linkedLeadId });
      return leads[0] || null;
    },
    enabled: !!user,
  });

  const { data: nextEvent } = useQuery({
    queryKey: ['nextEvent', lead?.id],
    queryFn: async () => {
      const events = await base44.entities.CalendarEvent.filter(
        { leadId: lead.id, status: 'scheduled' },
        'scheduledDate',
        1
      );
      return events[0];
    },
    enabled: !!lead,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', lead?.id],
    queryFn: () => base44.entities.Invoice.filter({ leadId: lead.id }, '-issueDate', 5),
    enabled: !!lead,
  });

  const { data: openIncident } = useQuery({
    queryKey: ['openFecalIncident', lead?.id],
    queryFn: async () => {
      const incidents = await base44.entities.FecalIncident.filter({ leadId: lead.id, status: 'open' }, '-reportedAt', 1);
      return incidents[0] || null;
    },
    enabled: !!lead,
  });

  // Account not linked yet
  if (user && !user.linkedLeadId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-5 px-4">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-gray-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">Account setup in progress</h2>
          <p className="text-gray-600 max-w-sm">
            Your account isn't linked to a pool profile yet. If you just signed up, this can take a moment. If it persists, contact support.
          </p>
        </div>
        <div className="flex gap-3">
          <Link to={createPageUrl('Messages')}>
            <Button variant="outline">Message Support</Button>
          </Link>
          <a href="tel:+13215243838">
            <Button className="bg-teal-600 hover:bg-teal-700">
              <Phone className="w-4 h-4 mr-2" />
              Call Us
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // Check if account is suspended
  const isSuspended = lead?.accountStatus?.includes('suspended') || lead?.accountStatus?.includes('cancelled');

  if (isSuspended) {
    window.location.href = createPageUrl('ServiceReinstatement');
    return null;
  }

  const getStatusBadge = () => {
    if (lead?.accountStatus === 'active') {
      return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
    }
    return <Badge variant="outline" className="text-gray-600"><AlertCircle className="w-3 h-3 mr-1" />Inactive</Badge>;
  };

  const openInvoice = invoices.find(inv => inv.status === 'open' || inv.status === 'past_due');

  const queryClient = useQueryClient();

  return (
    <div className="space-y-6">
      {/* Unsafe to Swim Banner */}
      {openIncident && <FecalIncidentBanner incident={openIncident} />}

      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-gray-900">Welcome back, {user?.full_name?.split(' ')[0]}</h1>
        <div className="flex items-center gap-2">
          <p className="text-gray-600">Your pool service dashboard</p>
          {lead && getStatusBadge()}
        </div>
      </div>

      {/* Service Status Banner */}
      {openInvoice && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="font-medium text-orange-900">Payment Due</p>
                  <p className="text-sm text-orange-700">
                    Invoice #{openInvoice.invoiceNumber} - ${openInvoice.amount?.toFixed(2)}
                  </p>
                </div>
              </div>
              <Link to={createPageUrl('Billing')}>
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700">Pay Now</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Service Card */}
      <Card className="bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200">
        <CardHeader>
          <CardTitle className="text-teal-900 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Next Service Visit
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nextEvent ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <Clock className="w-5 h-5 text-teal-600" />
                <div>
                  <p className="text-2xl font-bold text-teal-900">
                    {format(new Date(nextEvent.scheduledDate), 'EEEE, MMMM d')}
                  </p>
                  <p className="text-sm text-teal-700">{nextEvent.timeWindow || 'Time TBD'}</p>
                </div>
              </div>
              <p className="text-sm text-teal-800">
                Technician: {nextEvent.assignedTechnician || 'To be assigned'}
              </p>
            </div>
          ) : (
            <p className="text-teal-800">No upcoming service scheduled</p>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to={createPageUrl('Messages')}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Messages</p>
                  <p className="text-xs text-gray-500">Contact our team</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to={createPageUrl('Billing')}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Billing</p>
                  <p className="text-xs text-gray-500">View payments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to={createPageUrl('HelpSupport')}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Droplet className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Help & FAQ</p>
                  <p className="text-xs text-gray-500">Get answers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <a href="tel:+13215243838">
          <Card className="hover:shadow-md transition-shadow cursor-pointer bg-teal-50 border-teal-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-teal-100 rounded-lg">
                  <Phone className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p className="font-medium text-teal-900">Call Us</p>
                  <p className="text-xs text-teal-700">(321) 524-3838</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </a>
      </div>

      {/* Safety & Incident Reporting */}
      <Card className="border-gray-200">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gray-100 rounded-lg">
                <ShieldAlert className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Safety & Incident Reporting</p>
                <p className="text-xs text-gray-500">Report a fecal incident for prompt disinfection</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={() => setShowIncidentForm(true)}
            >
              Report Incident
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Service History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your service and payment history</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <div className="space-y-3">
              {invoices.slice(0, 3).map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Invoice #{invoice.invoiceNumber}</p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(invoice.issueDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${invoice.amount?.toFixed(2)}</p>
                    <Badge 
                      className={
                        invoice.status === 'paid' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-orange-100 text-orange-800'
                      }
                    >
                      {invoice.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No recent activity</p>
          )}
        </CardContent>
      </Card>
      {/* Education link */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
        <div className="flex items-center gap-3">
          <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-800">Interested in how your pool functions?</p>
        </div>
        <Link to={createPageUrl('FAQ')}>
          <Button size="sm" variant="ghost" className="text-xs text-blue-700 hover:bg-blue-100 h-7">
            Learn More
          </Button>
        </Link>
      </div>

      {/* Fecal Incident Report Modal */}
      <Dialog open={showIncidentForm} onOpenChange={setShowIncidentForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report a Fecal Incident</DialogTitle>
          </DialogHeader>
          <FecalIncidentForm
            leadId={lead?.id}
            onSubmitted={() => {
              setShowIncidentForm(false);
              queryClient.invalidateQueries({ queryKey: ['openFecalIncident', lead?.id] });
            }}
            onCancel={() => setShowIncidentForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}