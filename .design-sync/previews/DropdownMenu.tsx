import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, Button } from "fourty";

// Label and items live inside a Group: Base UI reads MenuGroupContext from it,
// and a label placed directly under Content throws.
export const RecordActions = () => (
  <DropdownMenu open>
    <DropdownMenuTrigger render={<Button variant="outline">Actions</Button>} />
    <DropdownMenuContent>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Deal</DropdownMenuLabel>
        <DropdownMenuItem>Edit<DropdownMenuShortcut>⌘E</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem>Delete</DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);
