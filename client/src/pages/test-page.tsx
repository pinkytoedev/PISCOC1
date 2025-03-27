import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestPage() {
  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Test Page</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Facebook App ID: {import.meta.env.VITE_FACEBOOK_APP_ID || 'Not Set'}</p>
          <p>Test page is working!</p>
        </CardContent>
      </Card>
    </div>
  );
}