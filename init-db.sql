-- Initialize database for PISCOC1
-- This script runs when the PostgreSQL container starts

-- Ensure the database exists
SELECT 'CREATE DATABASE multi_platform_integration'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'multi_platform_integration')\gexec

-- Connect to the database
\c multi_platform_integration;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE multi_platform_integration TO piscoc1_user;
GRANT ALL ON SCHEMA public TO piscoc1_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO piscoc1_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO piscoc1_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO piscoc1_user;

-- Create application user if it doesn't exist (this might already be done by POSTGRES_USER)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'piscoc1_user') THEN
        CREATE ROLE piscoc1_user WITH LOGIN PASSWORD 'piscoc1_password';
    END IF;
END
$$;