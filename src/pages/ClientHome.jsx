import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
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
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: lead } = useQuery({
    queryKey: ['currentLead'],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ created_by: user.email });
      return leads[0];
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

  return (
    <div className="space-y-6">
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
    </div>
  );
}