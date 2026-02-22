import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AnalyticsFilters({ filters, setFilters }) {
  const dateRanges = [
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
    { label: 'YTD', value: 'ytd' },
    { label: 'Custom', value: 'custom' }
  ];

  const handleDateRangeChange = (range) => {
    const now = new Date();
    let startDate;

    switch (range) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = null;
    }

    setFilters({
      ...filters,
      dateRange: range,
      startDate: startDate ? startDate.toISOString() : null,
      endDate: range !== 'custom' ? now.toISOString() : null
    });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Date Range */}
          <div className="flex gap-2">
            {dateRanges.map(range => (
              <Button
                key={range.value}
                size="sm"
                variant={filters.dateRange === range.value ? 'default' : 'outline'}
                onClick={() => handleDateRangeChange(range.value)}
              >
                {range.label}
              </Button>
            ))}
          </div>

          {/* Custom Date Range */}
          {filters.dateRange === 'custom' && (
            <>
              <Input
                type="date"
                value={filters.startDate ? filters.startDate.split('T')[0] : ''}
                onChange={(e) => setFilters({
                  ...filters,
                  startDate: e.target.value ? new Date(e.target.value).toISOString() : null
                })}
                className="w-40"
              />
              <span className="text-gray-600">to</span>
              <Input
                type="date"
                value={filters.endDate ? filters.endDate.split('T')[0] : ''}
                onChange={(e) => setFilters({
                  ...filters,
                  endDate: e.target.value ? new Date(e.target.value).toISOString() : null
                })}
                className="w-40"
              />
            </>
          )}

          {/* City Filter */}
          <Input
            placeholder="Filter by city..."
            value={filters.city || ''}
            onChange={(e) => setFilters({ ...filters, city: e.target.value || null })}
            className="w-40"
          />

          {/* ZIP Filter */}
          <Input
            placeholder="Filter by ZIP..."
            value={filters.zipCode || ''}
            onChange={(e) => setFilters({ ...filters, zipCode: e.target.value || null })}
            className="w-32"
          />

          {/* Reset */}
          {(filters.city || filters.zipCode) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFilters({ ...filters, city: null, zipCode: null })}
            >
              Clear Filters
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}