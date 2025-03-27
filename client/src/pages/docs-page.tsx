import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReactNode } from "react";

// SVG Component for the interactive diagram
const WebsiteArchitectureDiagram = () => {
  // Define sections for highlighting and interaction
  const [activeSection, setActiveSection] = useState<string | null>(null);
  
  const handleSectionHover = (section: string | null) => {
    setActiveSection(section);
  };
  
  // Component for interactive nodes in the diagram
  const DiagramNode = ({ 
    id, 
    x, 
    y, 
    width, 
    height, 
    label, 
    type,
    description,
    connections = [],
    children
  }: { 
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    type: "frontend" | "backend" | "database" | "integration";
    description: string;
    connections?: string[];
    children?: ReactNode;
  }) => {
    const isActive = activeSection === id;
    const isConnected = activeSection && connections.includes(activeSection);
    
    // Determine color based on type
    const getTypeColor = () => {
      switch (type) {
        case "frontend":
          return "#3b82f6"; // Blue
        case "backend":
          return "#10b981"; // Green
        case "database":
          return "#f97316"; // Orange
        case "integration":
          return "#8b5cf6"; // Purple
        default:
          return "#6b7280"; // Gray
      }
    };
    
    const backgroundColor = getTypeColor();
    
    return (
      <Popover>
        <PopoverTrigger asChild>
          <g
            onMouseEnter={() => handleSectionHover(id)}
            onMouseLeave={() => handleSectionHover(null)}
            className="cursor-pointer"
          >
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={8}
              fill={backgroundColor}
              fillOpacity={isActive || isConnected ? 1 : 0.7}
              stroke={isActive ? "#fff" : backgroundColor}
              strokeWidth={2}
              className="transition-all duration-200"
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="14"
              fontWeight={isActive ? "bold" : "normal"}
              className="transition-all duration-200 select-none"
            >
              {label}
            </text>
            {children}
          </g>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-2">
            <h3 className="font-semibold text-lg border-b pb-2" style={{ color: backgroundColor }}>
              {label}
            </h3>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        </PopoverContent>
      </Popover>
    );
  };
  
  // Component to draw connections between nodes
  const Connection = ({ 
    from, 
    to, 
    fromId, 
    toId,
    label
  }: { 
    from: { x: number, y: number };
    to: { x: number, y: number };
    fromId: string;
    toId: string;
    label?: string;
  }) => {
    const isActive = activeSection === fromId || activeSection === toId;
    
    // Calculate control points for curve
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    
    // Calculate the path
    const path = `M ${from.x} ${from.y} Q ${midX} ${midY}, ${to.x} ${to.y}`;
    
    return (
      <g>
        <path
          d={path}
          stroke={isActive ? "#fff" : "#6b7280"}
          strokeWidth={isActive ? 2 : 1}
          fill="none"
          strokeDasharray={isActive ? "none" : "4,4"}
          className="transition-all duration-200"
        />
        {label && (
          <text
            x={midX}
            y={midY - 10}
            textAnchor="middle"
            fill={isActive ? "#fff" : "#6b7280"}
            fontSize="12"
            className="transition-all duration-200"
          >
            {label}
          </text>
        )}
      </g>
    );
  };
  
  return (
    <div className="bg-gray-900 rounded-lg p-4 h-[600px] overflow-auto">
      <svg width="900" height="700" viewBox="0 0 900 700">
        {/* Grid background */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2d3748" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Title */}
        <text x="450" y="30" textAnchor="middle" fill="white" fontSize="24" fontWeight="bold">
          Website Architecture Diagram
        </text>
        
        {/* Frontend Section */}
        <DiagramNode
          id="react"
          x={100}
          y={100}
          width={150}
          height={50}
          label="React Frontend"
          type="frontend"
          description="User interface built with React, TypeScript, and Tailwind CSS. Uses wouter for routing and react-query for data fetching."
          connections={["api_routes", "tanstack", "wouter"]}
        />
        
        <DiagramNode
          id="tanstack"
          x={100}
          y={180}
          width={150}
          height={40}
          label="TanStack Query"
          type="frontend"
          description="State management and data fetching library that handles API requests and caching."
          connections={["react", "api_routes"]}
        />
        
        <DiagramNode
          id="wouter"
          x={100}
          y={250}
          width={150}
          height={40}
          label="Wouter Router"
          type="frontend"
          description="Lightweight routing solution for React applications that manages page navigation."
          connections={["react"]}
        />
        
        <DiagramNode
          id="shadcn"
          x={100}
          y={320}
          width={150}
          height={40}
          label="ShadCN UI"
          type="frontend"
          description="Component library built on Radix UI and styled with Tailwind CSS."
          connections={["react"]}
        />
        
        {/* Backend Section */}
        <DiagramNode
          id="express"
          x={400}
          y={100}
          width={150}
          height={50}
          label="Express Server"
          type="backend"
          description="Node.js server built with Express.js that handles HTTP requests and serves the React application."
          connections={["api_routes", "auth", "integrations"]}
        />
        
        <DiagramNode
          id="api_routes"
          x={400}
          y={180}
          width={150}
          height={40}
          label="API Routes"
          type="backend"
          description="RESTful API endpoints for CRUD operations on resources like articles, team members, and carousel quotes."
          connections={["express", "storage"]}
        />
        
        <DiagramNode
          id="auth"
          x={400}
          y={250}
          width={150}
          height={40}
          label="Authentication"
          type="backend"
          description="User authentication system built with Passport.js for secure access control."
          connections={["express", "storage"]}
        />
        
        <DiagramNode
          id="storage"
          x={400}
          y={320}
          width={150}
          height={40}
          label="Storage Interface"
          type="backend"
          description="Abstraction layer that provides a consistent interface for data operations, regardless of the underlying storage mechanism."
          connections={["database", "api_routes"]}
        />
        
        {/* Database Section */}
        <DiagramNode
          id="database"
          x={650}
          y={100}
          width={150}
          height={50}
          label="PostgreSQL"
          type="database"
          description="Relational database that stores all application data including users, articles, team members, and integration settings."
          connections={["storage"]}
        />
        
        <DiagramNode
          id="drizzle"
          x={650}
          y={180}
          width={150}
          height={40}
          label="Drizzle ORM"
          type="database"
          description="TypeScript ORM that provides a type-safe interface to the database and handles schema migrations."
          connections={["database", "storage"]}
        />
        
        <DiagramNode
          id="schema"
          x={650}
          y={250}
          width={150}
          height={40}
          label="Shared Schema"
          type="database"
          description="Type definitions shared between the frontend and backend for consistent data representation."
          connections={["drizzle", "storage", "api_routes"]}
        />
        
        {/* Integrations Section */}
        <DiagramNode
          id="integrations"
          x={400}
          y={400}
          width={150}
          height={50}
          label="Integrations"
          type="integration"
          description="Core integration system that connects with external services."
          connections={["express", "discord", "airtable", "instagram", "imgur"]}
        />
        
        <DiagramNode
          id="discord"
          x={250}
          y={480}
          width={120}
          height={40}
          label="Discord"
          type="integration"
          description="Integration with Discord for communication and content management through a custom bot."
          connections={["integrations"]}
        />
        
        <DiagramNode
          id="airtable"
          x={400}
          y={480}
          width={120}
          height={40}
          label="Airtable"
          type="integration"
          description="Integration with Airtable for content management and data synchronization."
          connections={["integrations"]}
        />
        
        <DiagramNode
          id="instagram"
          x={550}
          y={480}
          width={120}
          height={40}
          label="Instagram"
          type="integration"
          description="Integration with Instagram for social media content sharing and retrieval."
          connections={["integrations"]}
        />
        
        <DiagramNode
          id="imgur"
          x={400}
          y={550}
          width={120}
          height={40}
          label="Imgur"
          type="integration"
          description="Integration with Imgur for image hosting and management."
          connections={["integrations"]}
        />
        
        {/* Connections */}
        {/* Frontend to Backend */}
        <Connection from={{ x: 175, y: 125 }} to={{ x: 400, y: 125 }} fromId="react" toId="express" label="HTTP Requests" />
        <Connection from={{ x: 175, y: 200 }} to={{ x: 400, y: 200 }} fromId="tanstack" toId="api_routes" />
        
        {/* Backend Internal */}
        <Connection from={{ x: 475, y: 150 }} to={{ x: 475, y: 180 }} fromId="express" toId="api_routes" />
        <Connection from={{ x: 475, y: 220 }} to={{ x: 475, y: 250 }} fromId="api_routes" toId="auth" />
        <Connection from={{ x: 475, y: 290 }} to={{ x: 475, y: 320 }} fromId="auth" toId="storage" />
        
        {/* Backend to Database */}
        <Connection from={{ x: 550, y: 320 }} to={{ x: 650, y: 125 }} fromId="storage" toId="database" />
        <Connection from={{ x: 550, y: 200 }} to={{ x: 650, y: 200 }} fromId="api_routes" toId="drizzle" />
        <Connection from={{ x: 550, y: 250 }} to={{ x: 650, y: 250 }} fromId="api_routes" toId="schema" />
        
        {/* Integrations */}
        <Connection from={{ x: 475, y: 360 }} to={{ x: 475, y: 400 }} fromId="storage" toId="integrations" />
        <Connection from={{ x: 350, y: 425 }} to={{ x: 310, y: 480 }} fromId="integrations" toId="discord" />
        <Connection from={{ x: 450, y: 450 }} to={{ x: 450, y: 480 }} fromId="integrations" toId="airtable" />
        <Connection from={{ x: 525, y: 425 }} to={{ x: 550, y: 480 }} fromId="integrations" toId="instagram" />
        <Connection from={{ x: 475, y: 450 }} to={{ x: 475, y: 550 }} fromId="integrations" toId="imgur" />
      </svg>
    </div>
  );
};

// Component for data flow diagram
const DataFlowDiagram = () => {
  return (
    <div className="bg-gray-900 rounded-lg p-4 h-[600px] overflow-auto">
      <svg width="900" height="600" viewBox="0 0 900 600">
        {/* Grid background */}
        <defs>
          <pattern id="flow-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2d3748" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#flow-grid)" />
        
        {/* Title */}
        <text x="450" y="30" textAnchor="middle" fill="white" fontSize="24" fontWeight="bold">
          Data Flow Diagram
        </text>
        
        {/* External Services */}
        <g>
          <rect x="50" y="100" width="200" height="80" rx="10" fill="#8b5cf6" fillOpacity="0.7" />
          <text x="150" y="145" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">External Services</text>
          <line x1="165" y1="160" x2="165" y2="180" stroke="white" strokeWidth="2" strokeDasharray="4,4" />
          <text x="90" y="120" fill="white" fontSize="12">- Discord</text>
          <text x="90" y="140" fill="white" fontSize="12">- Airtable</text>
          <text x="90" y="160" fill="white" fontSize="12">- Instagram</text>
        </g>
        
        {/* Integration Layer */}
        <g>
          <rect x="100" y="200" width="700" height="80" rx="10" fill="#10b981" fillOpacity="0.7" />
          <text x="450" y="240" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">Integration Layer</text>
          <line x1="450" y1="280" x2="450" y2="300" stroke="white" strokeWidth="2" strokeDasharray="4,4" />
          <text x="200" y="220" fill="white" fontSize="12">- API Connectors</text>
          <text x="400" y="220" fill="white" fontSize="12">- Webhook Handlers</text>
          <text x="600" y="220" fill="white" fontSize="12">- Data Transformers</text>
          <text x="200" y="260" fill="white" fontSize="12">- Authentication</text>
          <text x="400" y="260" fill="white" fontSize="12">- Rate Limiting</text>
          <text x="600" y="260" fill="white" fontSize="12">- Error Handling</text>
        </g>
        
        {/* Storage Layer */}
        <g>
          <rect x="100" y="320" width="700" height="80" rx="10" fill="#f97316" fillOpacity="0.7" />
          <text x="450" y="360" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">Storage Layer</text>
          <line x1="450" y1="400" x2="450" y2="420" stroke="white" strokeWidth="2" strokeDasharray="4,4" />
          <text x="200" y="340" fill="white" fontSize="12">- Database Access</text>
          <text x="400" y="340" fill="white" fontSize="12">- Schema Validation</text>
          <text x="600" y="340" fill="white" fontSize="12">- Data Relationships</text>
          <text x="200" y="380" fill="white" fontSize="12">- CRUD Operations</text>
          <text x="400" y="380" fill="white" fontSize="12">- Query Optimization</text>
          <text x="600" y="380" fill="white" fontSize="12">- Transaction Management</text>
        </g>
        
        {/* API Layer */}
        <g>
          <rect x="100" y="440" width="700" height="60" rx="10" fill="#3b82f6" fillOpacity="0.7" />
          <text x="450" y="475" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">API Layer (Express Routes)</text>
          <line x1="450" y1="500" x2="450" y2="520" stroke="white" strokeWidth="2" strokeDasharray="4,4" />
        </g>
        
        {/* Frontend Layer */}
        <g>
          <rect x="100" y="540" width="700" height="40" rx="10" fill="#ec4899" fillOpacity="0.7" />
          <text x="450" y="565" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">React Frontend (UI)</text>
        </g>
        
        {/* Arrows for data flow */}
        <g>
          {/* External to Integration */}
          <path d="M 250 140 C 350 140, 350 140, 450 200" fill="none" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <text x="320" y="160" textAnchor="middle" fill="white" fontSize="12">Pull/Push</text>
          
          {/* Bidirectional arrows between layers */}
          <path d="M 825 240 L 850 240 L 850 360 L 825 360" fill="none" stroke="white" strokeWidth="2" />
          <path d="M 850 280 L 860 280" fill="none" stroke="white" strokeWidth="2" />
          <path d="M 850 320 L 860 320" fill="none" stroke="white" strokeWidth="2" />
          <text x="880" y="300" textAnchor="middle" fill="white" fontSize="12" transform="rotate(90, 880, 300)">Bidirectional Data Flow</text>
        </g>
        
        {/* Flow descriptions */}
        <g>
          <text x="860" y="240" fill="white" fontSize="10" textAnchor="start">Event Triggers</text>
          <text x="860" y="360" fill="white" fontSize="10" textAnchor="start">Data Updates</text>
        </g>
        
        {/* Define marker for arrows */}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="white" />
          </marker>
        </defs>
      </svg>
    </div>
  );
};

// Component for technology stack
const TechnologyStack = () => {
  const technologies = {
    frontend: [
      { name: "React", description: "JavaScript library for building user interfaces" },
      { name: "TypeScript", description: "Statically typed superset of JavaScript" },
      { name: "TanStack Query", description: "Powerful data fetching and caching library" },
      { name: "Wouter", description: "Lightweight routing solution for React" },
      { name: "ShadCN UI", description: "Accessible component library built on Radix UI" },
      { name: "Tailwind CSS", description: "Utility-first CSS framework" },
      { name: "React Hook Form", description: "Form validation library with performant UX" },
      { name: "Zod", description: "TypeScript-first schema validation library" }
    ],
    backend: [
      { name: "Node.js", description: "JavaScript runtime for server-side applications" },
      { name: "Express", description: "Web application framework for Node.js" },
      { name: "Passport", description: "Authentication middleware for Node.js" },
      { name: "Drizzle ORM", description: "TypeScript ORM with schema management" },
      { name: "PostgreSQL", description: "Powerful, open-source relational database" },
      { name: "Multer", description: "Middleware for handling file uploads" }
    ],
    integrations: [
      { name: "Discord.js", description: "Library for interacting with the Discord API" },
      { name: "Airtable API", description: "Client for interacting with Airtable databases" },
      { name: "Instagram API", description: "Interface for Instagram content and interactions" },
      { name: "Imgur API", description: "Service for image hosting and management" }
    ]
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2 text-blue-500">Frontend Technologies</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {technologies.frontend.map((tech, index) => (
            <div key={index} className="bg-gray-100 p-3 rounded-lg">
              <h4 className="font-medium">{tech.name}</h4>
              <p className="text-sm text-gray-600">{tech.description}</p>
            </div>
          ))}
        </div>
      </div>
      
      <div>
        <h3 className="text-lg font-semibold mb-2 text-green-500">Backend Technologies</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {technologies.backend.map((tech, index) => (
            <div key={index} className="bg-gray-100 p-3 rounded-lg">
              <h4 className="font-medium">{tech.name}</h4>
              <p className="text-sm text-gray-600">{tech.description}</p>
            </div>
          ))}
        </div>
      </div>
      
      <div>
        <h3 className="text-lg font-semibold mb-2 text-purple-500">Integration Technologies</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {technologies.integrations.map((tech, index) => (
            <div key={index} className="bg-gray-100 p-3 rounded-lg">
              <h4 className="font-medium">{tech.name}</h4>
              <p className="text-sm text-gray-600">{tech.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function DocsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Documentation" />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Breadcrumbs */}
            <nav className="text-sm font-medium mb-6" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <span className="text-gray-900">Documentation</span>
                </li>
              </ol>
            </nav>

            {/* Page Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">System Architecture</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Interactive diagram showing the logic of our integration platform
                </p>
              </div>
              <Button variant="outline">Download Documentation</Button>
            </div>

            {/* Interactive Diagram with Tabs */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <Tabs defaultValue="architecture">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="architecture">Architecture</TabsTrigger>
                  <TabsTrigger value="dataflow">Data Flow</TabsTrigger>
                  <TabsTrigger value="stack">Technology Stack</TabsTrigger>
                </TabsList>
                
                <TabsContent value="architecture" className="pt-2">
                  <div className="text-sm text-gray-500 mb-4">
                    <p>This interactive diagram shows the major components of our integration platform. 
                       Hover over any component to see more details, and notice how connected components highlight.</p>
                  </div>
                  <WebsiteArchitectureDiagram />
                </TabsContent>
                
                <TabsContent value="dataflow" className="pt-2">
                  <div className="text-sm text-gray-500 mb-4">
                    <p>The data flow diagram illustrates how information travels through different layers of the application,
                       from external services to the user interface.</p>
                  </div>
                  <DataFlowDiagram />
                </TabsContent>
                
                <TabsContent value="stack" className="pt-2">
                  <div className="text-sm text-gray-500 mb-4">
                    <p>Our platform utilizes a modern technology stack with TypeScript throughout the entire application.</p>
                  </div>
                  <TechnologyStack />
                </TabsContent>
              </Tabs>
            </div>

            {/* Documentation Sections */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Frontend Architecture</h2>
                <p className="text-gray-600 mb-4">
                  Our frontend is built with React and TypeScript, using modern patterns for state management,
                  routing, and component architecture.
                </p>
                <ul className="text-sm text-gray-500 space-y-2">
                  <li>• Component-based architecture with ShadCN UI</li>
                  <li>• React Query for efficient data fetching</li>
                  <li>• Wouter for lightweight routing</li>
                  <li>• Tailwind CSS for styling</li>
                </ul>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Backend Services</h2>
                <p className="text-gray-600 mb-4">
                  The backend is powered by Express.js and provides RESTful API endpoints
                  for all application features and integrations.
                </p>
                <ul className="text-sm text-gray-500 space-y-2">
                  <li>• RESTful API design</li>
                  <li>• Authentication with Passport.js</li>
                  <li>• PostgreSQL database with Drizzle ORM</li>
                  <li>• Modular integration system</li>
                </ul>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Models</h2>
                <p className="text-gray-600 mb-4">
                  Our application uses a well-defined data model with shared schemas
                  between frontend and backend.
                </p>
                <ul className="text-sm text-gray-500 space-y-2">
                  <li>• Users & authentication</li>
                  <li>• Content (articles, team members)</li>
                  <li>• Integration settings</li>
                  <li>• Activity logs</li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}