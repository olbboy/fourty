import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "fourty";

export const Fallback = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <Avatar><AvatarFallback>MD</AvatarFallback></Avatar>
    <Avatar><AvatarFallback>AC</AvatarFallback></Avatar>
    <Avatar><AvatarFallback>NT</AvatarFallback></Avatar>
  </div>
);

export const Group = () => (
  <AvatarGroup>
    <Avatar><AvatarFallback>MD</AvatarFallback></Avatar>
    <Avatar><AvatarFallback>AC</AvatarFallback></Avatar>
    <Avatar><AvatarFallback>NT</AvatarFallback></Avatar>
    <AvatarGroupCount>+4</AvatarGroupCount>
  </AvatarGroup>
);
