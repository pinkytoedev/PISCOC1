import { cn } from "@/lib/utils";

type StatusType = "published" | "pending" | "draft" | "rejected";

interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusLowerCase = status.toLowerCase() as StatusType;
  
  const statusStyles = {
    published: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    draft: "bg-gray-100 text-gray-800",
    rejected: "bg-red-100 text-red-800",
  };
  
  const defaultStyle = "bg-blue-100 text-blue-800";
  
  return (
    <span 
      className={cn(
        "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
        statusStyles[statusLowerCase] || defaultStyle,
        className
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
