import * as React from "react";
import { cn } from "@/lib/utils";

type StatusType = "published" | "draft" | "republish";

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusType | string;
  className?: string;
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, className, ...props }, ref) => {
    const statusLowerCase = status.toLowerCase() as StatusType;
    
    const statusStyles = {
      published: "bg-green-100 text-green-800",
      draft: "bg-gray-100 text-gray-800",
      republish: "bg-blue-100 text-blue-800",
    };
    
    const defaultStyle = "bg-blue-100 text-blue-800";
    
    return (
      <span 
        ref={ref}
        className={cn(
          "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
          statusStyles[statusLowerCase] || defaultStyle,
          className
        )}
        {...props}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }
);

// Display name for React DevTools
StatusBadge.displayName = "StatusBadge";

export { StatusBadge };
