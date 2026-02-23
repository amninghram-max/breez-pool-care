import React from 'react';
import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

// Wrapper for public pages that should redirect authenticated users to their dashboard
export default function PublicRoute({ children }) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        return null;
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // If user is authenticated, redirect to their home page
  if (user) {
    const homePages = {
      customer: 'ClientHome',
      technician: 'TechnicianHome',
      staff: 'StaffHome',
      admin: 'AdminHome'
    };
    const homePage = homePages[user.role] || 'ClientHome';
    return <Navigate to={createPageUrl(homePage)} replace />;
  }

  // User is not authenticated, show public page
  return children;
}