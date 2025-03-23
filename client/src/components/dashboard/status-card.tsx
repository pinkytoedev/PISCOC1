import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatusCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  iconBgColor?: string;
  iconColor?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  note?: string;
  footer?: ReactNode;
}

export function StatusCard({
  title,
  value,
  icon,
  iconBgColor = "bg-blue-100",
  iconColor = "text-primary",
  trend,
  note,
  footer
}: StatusCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", iconBgColor)}>
          <div className={cn("text-xl", iconColor)}>{icon}</div>
        </div>
      </div>
      
      {(trend || note) && (
        <div className="mt-4 flex items-center text-sm">
          {trend && (
            <span className={cn(
              "flex items-center",
              trend.isPositive ? "text-green-500" : "text-red-500"
            )}>
              {trend.isPositive ? (
                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              ) : (
                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
              <span>{trend.value}</span>
            </span>
          )}
          
          {note && <span className="text-gray-500 ml-2">{note}</span>}
        </div>
      )}
      
      {footer && (
        <div className="mt-4">
          {footer}
        </div>
      )}
    </div>
  );
}
