import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuBadge } from "fourty";

export const Rail = () => (
  <SidebarProvider>
    <Sidebar collapsible="none">
      <SidebarHeader>
        <div style={{ padding: "8px 10px", fontWeight: 800, letterSpacing: "-0.02em" }}>Fourty</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem><SidebarMenuButton isActive>Dashboard</SidebarMenuButton></SidebarMenuItem>
              <SidebarMenuItem><SidebarMenuButton>Contacts</SidebarMenuButton></SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>Deals</SidebarMenuButton>
                <SidebarMenuBadge>38</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem><SidebarMenuButton>Reports</SidebarMenuButton></SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  </SidebarProvider>
);
