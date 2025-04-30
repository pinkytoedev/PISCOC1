import { useEffect, useState } from 'react';

export function DebugEnv() {
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  
  useEffect(() => {
    // Get all environment variables with VITE_ prefix
    const viteVars: Record<string, string> = {};
    
    // Add the Facebook App ID
    viteVars['VITE_FACEBOOK_APP_ID'] = import.meta.env.VITE_FACEBOOK_APP_ID || 'Not set';
    
    // Output all environment variables to console
    console.log('Environment variables:', import.meta.env);
    
    setEnvVars(viteVars);
  }, []);
  
  return (
    <div className="p-4 bg-muted rounded-md text-sm">
      <h3 className="font-medium mb-2">Environment Variables Debug</h3>
      <pre className="overflow-auto">
        {JSON.stringify(envVars, null, 2)}
      </pre>
    </div>
  );
}

export default DebugEnv;