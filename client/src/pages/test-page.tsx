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
        // We'll parse the JSON even for error responses
        return response.json().then(data => {
          if (!response.ok) {
            // Check if we have a structured error response
            if (data && data.status === 'error' && data.message) {
              throw new Error(data.message);
            } else {
              throw new Error(`Failed to fetch config: ${response.status}`);
            }
          }
          return data;
        });
      })
      .then(data => {
        if (data.configured && data.status === 'success') {
          setApiAppId('✓ Facebook is configured');
        } else if (data.appId === 'CONFIGURED') {
          setApiAppId('✓ Facebook is configured');
        } else if (data.appId) {
          // For security, don't display the actual App ID
          setApiAppId('✓ Facebook App ID returned from API');
        } else {
          setApiAppId('✗ Facebook is not configured');
        }
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