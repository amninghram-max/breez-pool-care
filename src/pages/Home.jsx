import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { getHomePageForRole } from '../components/auth/roleCapabilities';
import PublicHome from './PublicHome';

export default function Home() {
  const navigate = useNavigate();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null; // Not authenticated — render public landing below
      }
    },
  });

  // If authenticated, redirect to role-specific home
  useEffect(() => {
    if (userLoading || !user) return;
    const homePage = getHomePageForRole(user.role || 'customer');
    navigate(createPageUrl(homePage), { replace: true });
  }, [user, userLoading, navigate]);

  // While checking auth, show nothing; once resolved render public landing if not authed
  if (userLoading) return null;
  if (!user) return <PublicHome />;

  // Authenticated — show spinner while redirecting to role home
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-gray-900">Welcome to Breez</h1>
        <p className="text-gray-600">Manage your pool service business with confidence</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total Leads</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{leads.length}</p>
              </div>
              <div className="p-3 bg-teal-100 rounded-lg">
                <Droplet className="w-6 h-6 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Active Quotes</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {questionnaires.filter(q => ['generated', 'sent'].includes(q.quoteStatus)).length}
                </p>
              </div>
              <div className="p-3 bg-sky-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Monthly Revenue</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  ${leads.filter(l => l.stage === 'converted').reduce((sum, l) => sum + (l.monthlyServiceAmount || 0), 0).toFixed(0)}
                </p>
              </div>
              <div className="p-3 bg-emerald-100 rounded-lg">
                <Droplet className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Converted</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {leads.filter(l => l.stage === 'converted').length}
                </p>
              </div>
              <div className="p-3 bg-amber-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main CTA section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Pipeline */}
        <Card className="bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="text-teal-900">Lead Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-teal-800">
              Manage leads through the sales funnel from quote to conversion.
            </p>
            <Link to={createPageUrl('LeadsPipeline')}>
              <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                View Pipeline
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-white border-gray-200 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Access key management features.
            </p>
            <div className="space-y-2">
              <Link to={createPageUrl('PreQualification')}>
                <Button variant="outline" className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  New Quote Form
                </Button>
              </Link>
              <Link to={createPageUrl('Calendar')}>
                <Button variant="outline" className="w-full">
                  Schedule & Routes
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent leads */}
      {leads.length > 0 && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recent Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leads.slice(0, 5).map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {lead.firstName} {lead.lastName || ''}
                    </p>
                    <p className="text-xs text-gray-500">
                      {lead.email} | {lead.city}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    lead.stage === 'converted'
                      ? 'bg-emerald-100 text-emerald-700'
                      : lead.stage === 'new_lead'
                      ? 'bg-blue-100 text-blue-700'
                      : lead.stage === 'lost'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {lead.stage?.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin section */}
      {isAdmin && (
        <Card className="bg-orange-50 border-orange-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-orange-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Admin Panel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-orange-800 mb-4">
              Configure pricing, seasonality, risk weights, and storm recovery settings.
            </p>
            <Link to={createPageUrl('Admin')}>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white">
                Open Admin Settings
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}