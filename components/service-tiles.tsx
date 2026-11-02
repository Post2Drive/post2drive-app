import Link from "next/link";
import type { ServiceIcon, ServiceLink } from "@/lib/serviceLinks";

const paths: Record<ServiceIcon, string> = {
  home: "M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5",
  marketplace: "M4 6h16M4 12h16M4 18h10",
  post: "M12 5v14M5 12h14",
  requirements: "M8 4h8v3H8zM6 6h12v14H6zM9 11h6M9 15h4",
  vehicles: "M2.5 7h11v9h-11zM13.5 10h4l3 3v3h-7M6 18.5a1.5 1.5 0 1 0 0-.01M17 18.5a1.5 1.5 0 1 0 0-.01",
  payments: "M3 7h18v11H3zM3 11h18M7 15h3",
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0",
  admin: "M12 3 4.5 6v5.5c0 4.4 3.2 8 7.5 9.5 4.3-1.5 7.5-5.1 7.5-9.5V6z",
  qa: "M9 12.5l2 2 4-4.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  overview: "M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z",
  notifications: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  logout: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
  phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM11 18h2",
};

export function ServiceTileIcon({ icon }: { icon: ServiceIcon }) {
  return (
    <svg className="service-tile-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d={paths[icon]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ServiceTiles({
  links,
  children,
}: {
  links: ServiceLink[];
  children?: React.ReactNode;
}) {
  return (
    <ul className="service-tiles">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className="service-tile">
            <ServiceTileIcon icon={link.icon} />
            <span className="service-tile-label">{link.label}</span>
            <span className="service-tile-hint">{link.hint}</span>
          </Link>
        </li>
      ))}
      {children}
    </ul>
  );
}
