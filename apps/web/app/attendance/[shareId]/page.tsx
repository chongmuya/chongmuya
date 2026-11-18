import { PublicAttendance } from "@/features/attendance/client";
export const metadata = {
  title: "참석 응답 | 총무야",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  return <PublicAttendance key={shareId} shareId={shareId} />;
}
