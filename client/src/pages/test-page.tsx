import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function TestPage() {
  const [apiAppId, setApiAppId] = useState<string>('Loading...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch Facebook App ID from our API
    fetch('/api/config/facebook')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch config: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        setApiAppId(data.appId || 'Not returned from API');
      })
      .catch(err => {
        console.error('Error fetching Facebook App ID:', err);
        setError(err.message);
        setApiAppId('Error fetching');
      });
  }, []);

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Facebook Configuration Test</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium">Environment Variable (Frontend)</h3>
              <p className="text-sm text-muted-foreground">Value from import.meta.env.VITE_FACEBOOK_APP_ID:</p>
              <p className="font-mono bg-muted p-2 rounded">
                {import.meta.env.VITE_FACEBOOK_APP_ID || 'Not Set'}
              </p>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="text-lg font-medium">Backend API (Server)</h3>
              <p className="text-sm text-muted-foreground">Value from /api/config/facebook endpoint:</p>
              <p className="font-mono bg-muted p-2 rounded">
                {apiAppId}
              </p>
              {error && (
                <p className="text-red-500 text-sm mt-2">Error: {error}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}