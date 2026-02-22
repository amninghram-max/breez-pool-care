import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Droplet, TrendingUp, AlertCircle } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

export default function Home() {
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        return null;
      }
    },
  });

  // Redirect to role-specific home only if user is logged in
  React.useEffect(() => {
    if (user?.email) {
      const role = user.role || 'customer';
      const homePages = {
        customer: 'ClientHome',
        technician: 'TechnicianHome',
        staff: 'StaffHome',
        admin: 'AdminHome'
      };
      const targetPage = homePages[role] || 'ClientHome';
      if (window.location.pathname !== `/${targetPage}`) {
        window.location.href = createPageUrl(targetPage);
      }
    }
  }, [user]);

  const { data: properties = [] } = useQuery({
    queryKey: ['properties'],
    queryFn: () => base44.entities.Property.list(),
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => base44.entities.Quote.list(),
  });

  const isAdmin = user?.role === 'admin';

  const handleGenerateSampleQuote = async () => {
    if (!properties.length) {
      alert('Please create a property first');
      return;
    }

    setIsLoadingQuote(true);
    try {
      const response = await base44.functions.invoke('generateQuote', {
        propertyId: properties[0].id
      });

      if (response.data.success) {
        // Refresh quotes
        window.location.reload();
      }
    } catch (error) {
      console.error('Error generating quote:', error);
      alert('Failed to generate quote');
    } finally {
      setIsLoadingQuote(false);
    }
  };

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
                <p className="text-sm text-gray-600 font-medium">Properties</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{properties.length}</p>
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
                  {quotes.filter(q => q.status !== 'expired').length}
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
                <p className="text-sm text-gray-600 font-medium">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  ${quotes.reduce((sum, q) => sum + (q.monthlyBasePrice || 0), 0).toFixed(0)}
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
                <p className="text-sm text-gray-600 font-medium">Avg Margin</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.length > 0
                    ? Math.round(
                        quotes.reduce((sum, q) => sum + (q.grossMarginPercent || 0), 0) /
                          quotes.length
                      )
                    : 0}
                  %
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
        {/* New Quote */}
        <Card className="bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="text-teal-900">Generate New Quote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-teal-800">
              Create pre-qualification quotes with automated chemical cost estimation, risk scoring, and dynamic upsells.
            </p>
            <Button
              onClick={handleGenerateSampleQuote}
              disabled={isLoadingQuote || properties.length === 0}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              {isLoadingQuote ? 'Generating...' : 'Generate Quote'}
            </Button>
            {properties.length === 0 && (
              <p className="text-xs text-teal-600">
                Add a property first to generate quotes
              </p>
            )}
          </CardContent>
        </Card>

        {/* Properties */}
        <Card className="bg-white border-gray-200 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Manage your client pool properties and their characteristics.
            </p>
            <Link to={createPageUrl('Properties')}>
              <Button variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Property
              </Button>
            </Link>
            {properties.length > 0 && (
              <div className="text-xs text-gray-500">
                {properties.length} property/ies in system
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent quotes */}
      {quotes.length > 0 && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recent Quotes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {quotes.slice(0, 5).map((quote) => (
                <div key={quote.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      Monthly: ${quote.monthlyBasePrice?.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Risk: {quote.riskScore} | Freq: {quote.recommendedFrequency}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    quote.status === 'accepted'
                      ? 'bg-emerald-100 text-emerald-700'
                      : quote.status === 'draft'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {quote.status}
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