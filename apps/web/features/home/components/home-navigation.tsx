import { OrganizerNavigation } from "@/shared/ui/organizer-navigation";

export function HomeNavigation({
  groupId,
  personal,
}: {
  groupId?: string;
  personal?: boolean;
}) {
  return (
    <OrganizerNavigation current="home" groupId={groupId} personal={personal} />
  );
}
