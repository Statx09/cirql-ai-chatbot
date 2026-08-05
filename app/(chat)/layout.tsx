import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <AppSidebar />

        <SidebarInset style={{ flex: 1 }}>
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}