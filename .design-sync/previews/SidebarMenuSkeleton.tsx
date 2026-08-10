import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuSkeleton } from "fourty";

// The skeleton is a loading row and only has a width inside the sidebar.
export const Loading = () => (
  <SidebarProvider>
    <Sidebar collapsible="none">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
              <SidebarMenuItem><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
              <SidebarMenuItem><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  </SidebarProvider>
);
