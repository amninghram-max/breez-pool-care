import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, BarChart3, Users, Shield, DollarSign, Droplet } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

export default function AdminHome() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.list(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['allEvents'],
    queryFn: () => base44.entities.CalendarEvent.list('-scheduledDate', 100),
  });

  const totalRevenue = leads
    .filter(l => l.monthlyServiceAmount)
    .reduce((sum, l) => sum + l.monthlyServiceAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-gray-900">Admin Control Panel</h1>
        <p className="text-gray-600">System configuration and analytics</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Clients</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{leads.length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">MRR</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">${totalRevenue.toFixed(0)}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Jobs</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{events.length}</p>
              </div>
              <div className="p-3 bg-teal-100 rounded-lg">
                <Droplet className="w-5 h-5 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Routes</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {new Set(events.map(e => e.assignedTechnician)).size}
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Controls */}
      <Card className="bg-gradient-to-br from-orange-50 to-red-50 border-orange-200">
        <CardHeader>
          <CardTitle className="text-orange-900 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Admin Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to={createPageUrl('Admin')}>
            <Button className="w-full bg-orange-600 hover:bg-orange-700" size="lg">
              <Settings className="w-5 h-5 mr-2" />
              Pricing & Settings
            </Button>
          </Link>

          <Link to={createPageUrl('StaffManagement')}>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" size="lg">
              <Users className="w-5 h-5 mr-2" />
              Staff Management
            </Button>
          </Link>

          <Link to={createPageUrl('Analytics')}>
            <Button className="w-full bg-purple-600 hover:bg-purple-700" size="lg">
              <BarChart3 className="w-5 h-5 mr-2" />
              Analytics Dashboard
            </Button>
          </Link>

          <Link to={createPageUrl('AdminReviewDashboard')}>
            <Button className="w-full bg-red-600 hover:bg-red-700" size="lg">
              <Droplet className="w-5 h-5 mr-2" />
              Chemistry Review
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* All Staff Features */}
      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to={createPageUrl('Calendar')}>
            <Button variant="outline" className="w-full justify-start" size="lg">
              Scheduling & Calendar
            </Button>
          </Link>

          <Link to={createPageUrl('LeadsPipeline')}>
            <Button variant="outline" className="w-full justify-start" size="lg">
              Lead Pipeline
            </Button>
          </Link>

          <Link to={createPageUrl('AdminMessaging')}>
            <Button variant="outline" className="w-full justify-start" size="lg">
              Support Inbox
            </Button>
          </Link>

          <Link to={createPageUrl('TechnicianRoute')}>
            <Button variant="outline" className="w-full justify-start" size="lg">
              Route Management
            </Button>
          </Link>

          <Link to={createPageUrl('ServiceVisitEntry')}>
            <Button variant="outline" className="w-full justify-start" size="lg">
              Service Entry
            </Button>
          </Link>

          <Link to={createPageUrl('AdminReinstatements')}>
            <Button variant="outline" className="w-full justify-start" size="lg">
              Reinstatements
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}