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
        <PopoverContent className="w-80 z-50">
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
  
  // Component for section labels
  const SectionLabel = ({ x, y, label }: { x: number, y: number, label: string }) => {
    return (
      <text
        x={x}
        y={y}
        fill="#94a3b8"
        fontSize="14"
        fontWeight="bold"
        textAnchor="middle"
      >
        {label}
      </text>
    );
  };
  
  // Component to draw connections between nodes
  const Connection = ({ 
    from, 
    to, 
    fromId, 
    toId,
    label,
    color = "#6b7280"
  }: { 
    from: { x: number, y: number };
    to: { x: number, y: number };
    fromId: string;
    toId: string;
    label?: string;
    color?: string;
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
          stroke={isActive ? "#fff" : color}
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
            fill={isActive ? "#fff" : color}
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
    <div className="bg-gray-900 rounded-lg p-6 h-[600px] overflow-auto">
      <div className="mb-4 text-white text-sm">
        <p>Hover over components to see connections. Click on components for more details.</p>
      </div>
      
      <svg width="800" height="580" viewBox="0 0 800 580">
        {/* Grid background */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2d3748" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Title */}
        <text x="400" y="30" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">
          Website Architecture Diagram
        </text>
        
        {/* Section Labels */}
        <SectionLabel x={150} y={80} label="FRONTEND" />
        <SectionLabel x={400} y={80} label="BACKEND" />
        <SectionLabel x={650} y={80} label="DATABASE" />
        <SectionLabel x={400} y={350} label="INTEGRATIONS" />
        
        {/* Divider lines for sections */}
        <line x1="275" y1="60" x2="275" y2="330" stroke="#475569" strokeWidth="1" strokeDasharray="4,4" />
        <line x1="525" y1="60" x2="525" y2="330" stroke="#475569" strokeWidth="1" strokeDasharray="4,4" />
        <line x1="50" y1="340" x2="750" y2="340" stroke="#475569" strokeWidth="1" strokeDasharray="4,4" />
        
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
          y={170}
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
          y={230}
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
          y={290}
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
          x={325}
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
          x={325}
          y={170}
          width={150}
          height={40}
          label="API Routes"
          type="backend"
          description="RESTful API endpoints for CRUD operations on resources like articles, team members, and carousel quotes."
          connections={["express", "storage"]}
        />
        
        <DiagramNode
          id="auth"
          x={325}
          y={230}
          width={150}
          height={40}
          label="Authentication"
          type="backend"
          description="User authentication system built with Passport.js for secure access control."
          connections={["express", "storage"]}
        />
        
        <DiagramNode
          id="storage"
          x={325}
          y={290}
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
          x={575}
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
          x={575}
          y={170}
          width={150}
          height={40}
          label="Drizzle ORM"
          type="database"
          description="TypeScript ORM that provides a type-safe interface to the database and handles schema migrations."
          connections={["database", "storage"]}
        />
        
        <DiagramNode
          id="schema"
          x={575}
          y={230}
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
          x={325}
          y={380}
          width={150}
          height={50}
          label="Integrations Core"
          type="integration"
          description="Core integration system that connects with external services."
          connections={["express", "airtable", "instagram", "imgbb"]}
        />
        
        <DiagramNode
          id="airtable"
          x={300}
          y={450}
          width={120}
          height={40}
          label="Airtable"
          type="integration"
          description="Integration with Airtable for content management and data synchronization."
          connections={["integrations"]}
        />
        
        <DiagramNode
          id="instagram"
          x={450}
          y={450}
          width={120}
          height={40}
          label="Instagram"
          type="integration"
          description="Integration with Instagram for social media content sharing and retrieval."
          connections={["integrations"]}
        />
        
        <DiagramNode
          id="imgbb"
          x={600}
          y={450}
          width={120}
          height={40}
          label="ImgBB"
          type="integration"
          description="Integration with ImgBB for image hosting and management."
          connections={["integrations"]}
        />
        
        {/* Connections */}
        {/* Frontend to Backend */}
        <Connection 
          from={{ x: 250, y: 125 }} 
          to={{ x: 325, y: 125 }} 
          fromId="react" 
          toId="express" 
          label="HTTP Requests"
          color="#3b82f6"
        />
        
        <Connection 
          from={{ x: 250, y: 190 }} 
          to={{ x: 325, y: 190 }} 
          fromId="tanstack" 
          toId="api_routes"
          color="#3b82f6"
        />
        
        {/* Internal Frontend */}
        <Connection 
          from={{ x: 175, y: 150 }} 
          to={{ x: 175, y: 170 }} 
          fromId="react" 
          toId="tanstack"
          color="#3b82f6"
        />
        
        <Connection 
          from={{ x: 175, y: 210 }} 
          to={{ x: 175, y: 230 }} 
          fromId="tanstack" 
          toId="wouter"
          color="#3b82f6"
        />
        
        <Connection 
          from={{ x: 175, y: 270 }} 
          to={{ x: 175, y: 290 }} 
          fromId="wouter" 
          toId="shadcn"
          color="#3b82f6"
        />
        
        {/* Backend Internal */}
        <Connection 
          from={{ x: 400, y: 150 }} 
          to={{ x: 400, y: 170 }} 
          fromId="express" 
          toId="api_routes"
          color="#10b981"
        />
        
        <Connection 
          from={{ x: 400, y: 210 }} 
          to={{ x: 400, y: 230 }} 
          fromId="api_routes" 
          toId="auth"
          color="#10b981"
        />
        
        <Connection 
          from={{ x: 400, y: 270 }} 
          to={{ x: 400, y: 290 }} 
          fromId="auth" 
          toId="storage"
          color="#10b981"
        />
        
        {/* Backend to Database */}
        <Connection 
          from={{ x: 475, y: 290 }} 
          to={{ x: 575, y: 125 }} 
          fromId="storage" 
          toId="database"
          color="#f97316"
        />
        
        <Connection 
          from={{ x: 475, y: 190 }} 
          to={{ x: 575, y: 190 }} 
          fromId="api_routes" 
          toId="drizzle"
          color="#f97316"
        />
        
        <Connection 
          from={{ x: 475, y: 230 }} 
          to={{ x: 575, y: 250 }} 
          fromId="api_routes" 
          toId="schema"
          color="#f97316"
        />
        
        <Connection 
          from={{ x: 575, y: 210 }} 
          to={{ x: 575, y: 170 }} 
          fromId="schema" 
          toId="drizzle"
          color="#f97316"
        />
        
        {/* Backend to Integrations */}
        <Connection 
          from={{ x: 400, y: 330 }} 
          to={{ x: 400, y: 380 }} 
          fromId="storage" 
          toId="integrations"
          color="#8b5cf6"
        />
        
        {/* Integrations to Services */}
        
        <Connection 
          from={{ x: 360, y: 430 }} 
          to={{ x: 360, y: 450 }} 
          fromId="integrations" 
          toId="airtable"
          color="#8b5cf6"
        />
        
        <Connection 
          from={{ x: 425, y: 405 }} 
          to={{ x: 490, y: 450 }} 
          fromId="integrations" 
          toId="instagram"
          color="#8b5cf6"
        />
        
        <Connection 
          from={{ x: 475, y: 405 }} 
          to={{ x: 600, y: 450 }} 
          fromId="integrations" 
          toId="imgbb"
          color="#8b5cf6"
        />
        
        {/* Legend */}
        <g transform="translate(50, 520)">
          <rect width="700" height="40" rx="5" fill="#1e293b" />
          <text x="20" y="25" fill="white" fontSize="14">Legend:</text>
          
          <rect x="90" y="15" width="20" height="10" fill="#3b82f6" />
          <text x="115" y="25" fill="white" fontSize="12">Frontend</text>
          
          <rect x="190" y="15" width="20" height="10" fill="#10b981" />
          <text x="215" y="25" fill="white" fontSize="12">Backend</text>
          
          <rect x="290" y="15" width="20" height="10" fill="#f97316" />
          <text x="315" y="25" fill="white" fontSize="12">Database</text>
          
          <rect x="390" y="15" width="20" height="10" fill="#8b5cf6" />
          <text x="415" y="25" fill="white" fontSize="12">Integrations</text>
          
          <text x="520" y="25" fill="white" fontSize="12">Click components for details</text>
        </g>
      </svg>
    </div>
  );
};

// Component for data flow diagram
const DataFlowDiagram = () => {
  return (
    <div className="bg-gray-900 rounded-lg p-6 h-[600px] overflow-auto">
      <div className="mb-4 text-white text-sm">
        <p>This diagram illustrates how data flows through different layers of the application.</p>
      </div>
      
      <svg width="800" height="550" viewBox="0 0 800 550">
        {/* Grid background */}
        <defs>
          <pattern id="flow-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2d3748" strokeWidth="0.5" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="white" />
          </marker>
          <marker id="circle" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
            <circle cx="5" cy="5" r="4" fill="white" />
          </marker>
        </defs>
        
        <rect width="100%" height="100%" fill="url(#flow-grid)" />
        
        {/* Title */}
        <text x="400" y="30" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">
          Data Flow Diagram
        </text>
        
        {/* External Services Box */}
        <g>
          <rect x="275" y="60" width="250" height="60" rx="8" fill="#8b5cf6" fillOpacity="0.8" />
          <text x="400" y="95" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">External Services</text>
        </g>
        
        {/* Service nodes */}
        <g>
          
          <rect x="340" y="150" width="120" height="40" rx="8" fill="#8b5cf6" fillOpacity="0.6" />
          <text x="400" y="175" textAnchor="middle" fill="white" fontSize="14">Airtable</text>
          
          <rect x="560" y="150" width="120" height="40" rx="8" fill="#8b5cf6" fillOpacity="0.6" />
          <text x="620" y="175" textAnchor="middle" fill="white" fontSize="14">Instagram</text>
        </g>
        
        {/* Integration Layer */}
        <g>
          <rect x="100" y="220" width="600" height="60" rx="8" fill="#10b981" fillOpacity="0.8" />
          <text x="400" y="255" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">Integration Layer</text>
          <text x="200" y="240" fill="white" fontSize="12">• API Connectors</text>
          <text x="380" y="240" fill="white" fontSize="12">• Webhook Handlers</text>
          <text x="560" y="240" fill="white" fontSize="12">• Data Transformers</text>
          <text x="290" y="270" fill="white" fontSize="12">• Event Handling</text>
          <text x="500" y="270" fill="white" fontSize="12">• Authentication</text>
        </g>
        
        {/* Storage Layer */}
        <g>
          <rect x="100" y="310" width="600" height="60" rx="8" fill="#f97316" fillOpacity="0.8" />
          <text x="400" y="345" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">Storage Layer</text>
          <text x="200" y="330" fill="white" fontSize="12">• Database Access</text>
          <text x="380" y="330" fill="white" fontSize="12">• Schema Validation</text>
          <text x="560" y="330" fill="white" fontSize="12">• Data Relationships</text>
          <text x="290" y="360" fill="white" fontSize="12">• CRUD Operations</text>
          <text x="510" y="360" fill="white" fontSize="12">• Transaction Management</text>
        </g>
        
        {/* Database */}
        <g>
          <rect x="300" y="400" width="200" height="40" rx="8" fill="#f97316" fillOpacity="0.6" />
          <text x="400" y="425" textAnchor="middle" fill="white" fontSize="14">PostgreSQL Database</text>
        </g>
        
        {/* API Layer */}
        <g>
          <rect x="100" y="470" width="600" height="40" rx="8" fill="#3b82f6" fillOpacity="0.8" />
          <text x="400" y="495" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">API Layer (Express Routes)</text>
        </g>
        
        {/* Arrows and Flow */}
        <g>
          {/* External to Integration */}
          <path d="M 180 190 L 180 220" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M 400 190 L 400 220" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M 620 190 L 620 220" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          
          <path d="M 400 120 L 400 150" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M 400 120 L 180 150" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M 400 120 L 620 150" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          
          {/* Integration to Storage */}
          <path d="M 400 280 L 400 310" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          
          {/* Storage to Database */}
          <path d="M 400 370 L 400 400" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          
          {/* Database to API */}
          <path d="M 400 440 L 400 470" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          
          {/* Bidirectional arrows */}
          <line x1="730" y1="240" x2="730" y2="360" stroke="white" strokeWidth="2" />
          <path d="M 730 240 L 730 340" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M 730 360 L 730 260" stroke="white" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <text x="750" y="300" textAnchor="middle" fill="white" fontSize="12" transform="rotate(90, 750, 300)">Bidirectional Flow</text>
          
          {/* Circular flow */}
          <path d="M 100 345 C 50 345, 50 255, 100 255" stroke="white" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" />
          <text x="40" y="300" textAnchor="middle" fill="white" fontSize="12" transform="rotate(270, 40, 300)">Data Sync</text>
        </g>
        
        {/* Legend */}
        <g>
          <rect x="600" y="65" width="150" height="75" rx="5" fill="#1e293b" />
          <text x="620" y="85" fill="white" fontSize="12" fontWeight="bold">Data Types:</text>
          <text x="620" y="105" fill="white" fontSize="11">• Content (Articles, Team)</text>
          <text x="620" y="120" fill="white" fontSize="11">• User Data</text>
          <text x="620" y="135" fill="white" fontSize="11">• Configuration</text>
        </g>
      </svg>
    </div>
  );
};

// Define type for tech category
type TechCategory = 
  | "core" 
  | "data" 
  | "ui" 
  | "auth" 
  | "navigation" 
  | "forms" 
  | "utilities" 
  | "social" 
  | "content" 
  | "media";

// Component for technology stack
const TechnologyStack = () => {  
  // Define tech item interface
  interface TechItem {
    name: string;
    description: string;
    category: TechCategory;
  }
  
  const technologies: {
    frontend: TechItem[];
    backend: TechItem[];
    integrations: TechItem[];
  } = {
    frontend: [
      { name: "React", description: "JavaScript library for building user interfaces", category: "core" },
      { name: "TypeScript", description: "Statically typed superset of JavaScript", category: "core" },
      { name: "TanStack Query", description: "Data fetching and state management library", category: "data" },
      { name: "Wouter", description: "Lightweight routing solution for React", category: "navigation" },
      { name: "ShadCN UI", description: "Accessible component library built on Radix UI", category: "ui" },
      { name: "Tailwind CSS", description: "Utility-first CSS framework", category: "ui" },
      { name: "React Hook Form", description: "Form validation with performance focus", category: "forms" },
      { name: "Zod", description: "TypeScript-first schema validation", category: "data" }
    ],
    backend: [
      { name: "Node.js", description: "JavaScript runtime for server-side applications", category: "core" },
      { name: "Express", description: "Web application framework for Node.js", category: "core" },
      { name: "Passport", description: "Authentication middleware for Node.js", category: "auth" },
      { name: "Drizzle ORM", description: "TypeScript ORM with schema management", category: "data" },
      { name: "PostgreSQL", description: "Powerful, open-source relational database", category: "data" },
      { name: "Multer", description: "Middleware for handling file uploads", category: "utilities" }
    ],
    integrations: [
      { name: "Airtable API", description: "Client for interacting with Airtable databases", category: "content" },
      { name: "Instagram API", description: "Interface for Instagram content and interactions", category: "social" },
      { name: "ImgBB API", description: "Service for image hosting and management", category: "media" }
    ]
  };
  
  // Color mapping for tech categories
  const getCategoryColor = (category: TechCategory): string => {
    const colors: Record<TechCategory, string> = {
      core: "bg-blue-50 border-blue-200",
      data: "bg-amber-50 border-amber-200",
      ui: "bg-pink-50 border-pink-200",
      auth: "bg-green-50 border-green-200",
      navigation: "bg-indigo-50 border-indigo-200",
      forms: "bg-purple-50 border-purple-200",
      utilities: "bg-gray-50 border-gray-200",
      social: "bg-violet-50 border-violet-200",
      content: "bg-emerald-50 border-emerald-200",
      media: "bg-orange-50 border-orange-200"
    };
    return colors[category] || "bg-gray-50 border-gray-200";
  };
  
  // Category badges
  const CategoryBadge = ({ category }: { category: TechCategory }) => {
    const badgeColors: Record<TechCategory, string> = {
      core: "bg-blue-100 text-blue-800",
      data: "bg-amber-100 text-amber-800",
      ui: "bg-pink-100 text-pink-800",
      auth: "bg-green-100 text-green-800",
      navigation: "bg-indigo-100 text-indigo-800",
      forms: "bg-purple-100 text-purple-800",
      utilities: "bg-gray-100 text-gray-800",
      social: "bg-violet-100 text-violet-800",
      content: "bg-emerald-100 text-emerald-800",
      media: "bg-orange-100 text-orange-800"
    };
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeColors[category]}`}>
        {category}
      </span>
    );
  };
  
  return (
    <div className="space-y-8">
      <div className="flex flex-col">
        <div className="inline-flex items-center space-x-2 mb-4">
          <div className="w-1 h-8 bg-blue-500 rounded"></div>
          <h3 className="text-lg font-bold text-blue-700">Frontend Technologies</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {technologies.frontend.map((tech, index) => (
            <div 
              key={index} 
              className={`p-4 rounded-lg border ${getCategoryColor(tech.category)} transition-all hover:shadow-md`}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-gray-900">{tech.name}</h4>
                <CategoryBadge category={tech.category} />
              </div>
              <p className="text-sm text-gray-600">{tech.description}</p>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex flex-col">
        <div className="inline-flex items-center space-x-2 mb-4">
          <div className="w-1 h-8 bg-green-500 rounded"></div>
          <h3 className="text-lg font-bold text-green-700">Backend Technologies</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {technologies.backend.map((tech, index) => (
            <div 
              key={index} 
              className={`p-4 rounded-lg border ${getCategoryColor(tech.category)} transition-all hover:shadow-md`}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-gray-900">{tech.name}</h4>
                <CategoryBadge category={tech.category} />
              </div>
              <p className="text-sm text-gray-600">{tech.description}</p>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex flex-col">
        <div className="inline-flex items-center space-x-2 mb-4">
          <div className="w-1 h-8 bg-purple-500 rounded"></div>
          <h3 className="text-lg font-bold text-purple-700">Integration Technologies</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {technologies.integrations.map((tech, index) => (
            <div 
              key={index} 
              className={`p-4 rounded-lg border ${getCategoryColor(tech.category)} transition-all hover:shadow-md`}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-gray-900">{tech.name}</h4>
                <CategoryBadge category={tech.category} />
              </div>
              <p className="text-sm text-gray-600">{tech.description}</p>
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend for categories */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold mb-3">Technology Categories</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <CategoryBadge category="core" /> 
          <CategoryBadge category="data" />
          <CategoryBadge category="ui" />
          <CategoryBadge category="auth" />
          <CategoryBadge category="navigation" />
          <CategoryBadge category="forms" />
          <CategoryBadge category="utilities" />
          <CategoryBadge category="social" />
          <CategoryBadge category="content" />
          <CategoryBadge category="media" />
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
