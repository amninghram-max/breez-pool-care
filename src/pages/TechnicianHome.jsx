import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Navigation, MapPin, Clock, CheckCircle, MessageSquare } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

export default function TechnicianHome() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: todayJobs = [] } = useQuery({
    queryKey: ['todayJobs'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const jobs = await base44.entities.CalendarEvent.filter(
        { scheduledDate: today, assignedTechnician: user.full_name },
        'routePosition'
      );
      return jobs;
    },
    enabled: !!user,
  });

  const { data: assignedThreads = [] } = useQuery({
    queryKey: ['assignedThreads'],
    queryFn: () => base44.entities.MessageThread.filter({ assignedTo: user.email }),
    enabled: !!user,
  });

  const nextJob = todayJobs.find(job => job.status === 'scheduled');
  const completedToday = todayJobs.filter(job => job.status === 'completed').length;
  const unreadThreads = assignedThreads.filter(t => t.status === 'new' || t.lastMessageBy === 'customer').length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-gray-900">Good morning, {user?.full_name?.split(' ')[0]}</h1>
        <p className="text-gray-600">Today's route overview</p>
      </div>

      {/* Route Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-teal-600">{todayJobs.length}</p>
              <p className="text-sm text-gray-600 mt-1">Total Jobs</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{completedToday}</p>
              <p className="text-sm text-gray-600 mt-1">Completed</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{unreadThreads}</p>
              <p className="text-sm text-gray-600 mt-1">Messages</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Next Stop */}
      {nextJob ? (
        <Card className="bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200">
          <CardHeader>
            <CardTitle className="text-teal-900 flex items-center gap-2">
              <Navigation className="w-5 h-5" />
              Next Stop
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-teal-600">Stop #{nextJob.routePosition}</Badge>
                  <Badge variant="outline">{nextJob.eventType}</Badge>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <MapPin className="w-4 h-4" />
                  <p className="font-medium">{nextJob.serviceAddress}</p>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4" />
                  <p className="text-sm">{nextJob.timeWindow || 'Flexible time'}</p>
                </div>
                {nextJob.accessNotes && (
                  <p className="text-sm text-gray-600 bg-white p-2 rounded border">
                    <strong>Access:</strong> {nextJob.accessNotes}
                  </p>
                )}
              </div>
            </div>
            <Button 
              className="w-full bg-teal-600 hover:bg-teal-700"
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nextJob.serviceAddress)}`, '_blank')}
            >
              <Navigation className="w-4 h-4 mr-2" />
              Navigate
            </Button>
            <Link to={createPageUrl('ServiceVisitEntry')}>
              <Button variant="outline" className="w-full">
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete Service
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <p className="text-lg font-medium text-gray-900">All jobs completed!</p>
            <p className="text-sm text-gray-600 mt-1">Great work today</p>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to={createPageUrl('TechnicianRoute')}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <MapPin className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">View Full Route</p>
                  <p className="text-xs text-gray-500">See all stops for today</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to={createPageUrl('AdminMessaging')}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Messages</p>
                  <p className="text-xs text-gray-500">{unreadThreads} unread</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Today's Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {todayJobs.length > 0 ? (
            <div className="space-y-2">
              {todayJobs.map((job) => (
                <div 
                  key={job.id} 
                  className={`p-3 rounded-lg border ${
                    job.status === 'completed' 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">#{job.routePosition}</Badge>
                      <div>
                        <p className="font-medium text-sm">{job.serviceAddress}</p>
                        <p className="text-xs text-gray-500">{job.timeWindow}</p>
                      </div>
                    </div>
                    {job.status === 'completed' && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No jobs scheduled for today</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}