import { Link } from "wouter";

interface QuickActionCardProps {
  icon: string;
  title: string;
  description: string;
  href: string;
  iconColor: string;
  bgColor: string;
}

export function QuickActionCard({ 
  icon, 
  title, 
  description, 
  href, 
  iconColor, 
  bgColor 
}: QuickActionCardProps) {
  return (
    <Link href={href}>
      <div 
        className="glass-effect rounded-xl p-6 text-center hover:scale-105 transition-transform cursor-pointer"
        data-testid={`quick-action-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <div className={`${bgColor} w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4`}>
          <i className={`${icon} ${iconColor} text-2xl`}></i>
        </div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </Link>
  );
}
