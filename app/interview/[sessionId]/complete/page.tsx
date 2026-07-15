import { CompleteClient } from "./complete-client";

export const metadata = { title: "Interview Complete — AI Interview Coach" };

export default async function InterviewCompletePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <CompleteClient sessionId={sessionId} />;
}
