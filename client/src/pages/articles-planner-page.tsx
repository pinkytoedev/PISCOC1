import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Article } from "@shared/schema";
import { Calendar, CalendarClock, Grid3X3, LayoutList } from "lucide-react";
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { EventSourceInput, EventClickArg } from '@fullcalendar/core';
import { EditArticleModal } from "@/components/modals/edit-article-modal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ArticlesPlannerPage() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const [viewType, setViewType] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'>('dayGridMonth');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  
  const { data: articles, isLoading } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
  });
  
  // Convert articles to calendar events
  const calendarEvents = articles ? articles
    .filter(article => {
      // Only include articles with a scheduled date, publishedAt date, or createdAt date
      return article.scheduled || article.publishedAt || article.createdAt;
    })
    .map(article => {
      // Priority order: scheduled > publishedAt > createdAt
      let dateStr = '';
      if (article.scheduled) {
        dateStr = article.scheduled;
      } else if (article.publishedAt) {
        dateStr = new Date(article.publishedAt).toISOString();
      } else if (article.createdAt) {
        dateStr = new Date(article.createdAt).toISOString();
      }
      
      // Extract date and time for proper display in calendar
      let startDate, endDate;
      if (dateStr) {
        // Create proper Date objects for the event
        const date = new Date(dateStr);
        
        // Default to 9 AM if no specific time was provided (most articles)
        if (dateStr && !dateStr.includes('T')) {
          // If only date is provided (no time), set it to 9:00 AM
          startDate = new Date(date.setHours(9, 0, 0));
          endDate = new Date(date.setHours(10, 0, 0)); // 1 hour duration
        } else {
          // Use the actual time from the date
          startDate = date;
          // End time is 1 hour after start time
          endDate = new Date(date);
          endDate.setHours(endDate.getHours() + 1);
        }
      }
      
      // Determine event color based on article status
      let color;
      switch (article.status) {
        case 'published':
          color = '#10b981'; // Green for published
          break;
        case 'draft':
          color = '#f59e0b'; // Orange for draft
          break;
        case 'pending':
          color = '#3b82f6'; // Blue for pending
          break;
        default:
          color = '#6b7280'; // Gray as default
      }
      
      return {
        id: article.id.toString(),
        title: article.title,
        start: startDate || dateStr,
        end: endDate || dateStr,
        allDay: viewType === 'dayGridMonth', // Set to false for time views
        backgroundColor: color,
        borderColor: color,
        extendedProps: {
          article: article
        }
      };
    }) : [];
  
  // Handle calendar event click
  const handleEventClick = (clickInfo: EventClickArg) => {
    // Use type assertion to access the article from extendedProps
    const article = clickInfo.event.extendedProps?.article as Article;
    
    if (article && article.id) {
      // Open the edit modal with the selected article
      setSelectedArticle(article);
      setEditModalOpen(true);
    }
  };
  
  // Handle changing the calendar view using state variable
  // Using key prop on FullCalendar forces re-render when viewType changes
  const handleViewChange = (newViewType: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay') => {
    setViewType(newViewType);
  };
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Article Planner" />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Breadcrumbs */}
            <nav className="text-sm font-medium mb-6" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <a href="/" className="text-gray-500 hover:text-gray-700">Dashboard</a>
                </li>
                <li className="flex items-center">
                  <svg className="h-4 w-4 text-gray-400 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <a href="/articles" className="text-gray-500 hover:text-gray-700">Articles</a>
                </li>
                <li className="flex items-center">
                  <svg className="h-4 w-4 text-gray-400 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-900">Planner</span>
                </li>
              </ol>
            </nav>

            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Article Planner</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Schedule and manage articles with calendar views
                </p>
              </div>
              <div className="flex space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <CalendarClock className="mr-2 h-4 w-4" />
                      {viewType === 'dayGridMonth' 
                        ? 'Month View' 
                        : viewType === 'timeGridWeek' 
                          ? 'Week View' 
                          : 'Day View'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleViewChange('dayGridMonth')}>
                      <Calendar className="mr-2 h-4 w-4" /> Month View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleViewChange('timeGridWeek')}>
                      <Grid3X3 className="mr-2 h-4 w-4" /> Week View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleViewChange('timeGridDay')}>
                      <LayoutList className="mr-2 h-4 w-4" /> Day View
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" onClick={() => setLocation('/articles')}>
                  View List
                </Button>
              </div>
            </div>

            {/* Calendar View */}
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 overflow-hidden" 
                style={{ 
                  height: viewType === 'timeGridDay' ? 'calc(100vh - 180px)' : 'calc(100vh - 240px)',
                }}>
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
              ) : (
                <FullCalendar
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView={viewType}
                  key={viewType} // Key prop forces complete re-render when view changes
                  headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: '' // We're using our custom UI controls
                  }}
                  events={calendarEvents as EventSourceInput}
                  eventClick={handleEventClick}
                  themeSystem="standard"
                  aspectRatio={1.8}
                  contentHeight="auto"
                  buttonText={{
                    today: 'Today',
                    month: 'Month',
                    week: 'Week',
                    day: 'Day'
                  }}
                  // Custom styling to match app design
                  dayCellClassNames="hover:bg-gray-50"
                  moreLinkClassNames="text-primary font-medium"
                  slotLabelClassNames="text-gray-600 font-medium"
                  dayHeaderClassNames="text-gray-600 font-semibold"
                  titleFormat={{ 
                    year: 'numeric', 
                    month: 'long',
                    day: 'numeric'
                  }}
                  // Time display format
                  slotLabelFormat={{
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  }}
                  eventTimeFormat={{
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  }}
                  // Better scrolling in time grid
                  scrollTime="08:00:00"
                  slotMinTime="07:00:00"
                  slotMaxTime="20:00:00"
                  eventContent={(eventInfo) => {
                    // Use type assertion to get the article from extendedProps
                    const article = eventInfo.event.extendedProps?.article as Article | undefined;
                    
                    if (!article) {
                      return (
                        <div className="cursor-pointer p-1 rounded hover:opacity-90 transition-opacity">
                          <div className="font-semibold text-white truncate text-sm">
                            {eventInfo.event.title}
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <div className="cursor-pointer p-1 rounded hover:opacity-90 transition-opacity">
                            <div className="font-semibold text-white truncate text-sm">
                              {eventInfo.event.title}
                            </div>
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" align="start">
                          <div className="p-4">
                            <h3 className="font-semibold text-lg mb-2 truncate">{article.title}</h3>
                            <div className="mb-2">
                              <StatusBadge status={article.status || 'draft'} />
                            </div>
                            <p className="text-sm text-gray-600 mb-2 line-clamp-2">{article.description}</p>
                            <div className="flex justify-between items-center text-xs text-gray-500">
                              <div>
                                {article.author && <span>By {article.author}</span>}
                              </div>
                              <div>
                                {(article.scheduled || article.publishedAt) && 
                                  new Date(article.scheduled || article.publishedAt).toLocaleString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                }
                              </div>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full mt-4"
                              onClick={() => {
                                setSelectedArticle(article);
                                setEditModalOpen(true);
                              }}
                            >
                              Edit Article
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  }}
                  height="100%"
                  dayMaxEvents={3}
                />
              )}
            </div>
            
            <div className="mt-4 flex items-center justify-center space-x-4">
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-[#10b981] mr-2"></div>
                <span className="text-sm">Published</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-[#f59e0b] mr-2"></div>
                <span className="text-sm">Draft</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-[#3b82f6] mr-2"></div>
                <span className="text-sm">Pending</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-[#6b7280] mr-2"></div>
                <span className="text-sm">Other</span>
              </div>
            </div>
          </div>
        </main>
      </div>

      <EditArticleModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        article={selectedArticle}
      />
    </div>
  );
}