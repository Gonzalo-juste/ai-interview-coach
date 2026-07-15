import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, difficulty_archetype, status, persona_config, created_at")
    .eq("id", id)
    .single();

  if (!session) redirect("/new-session");
  if (session.status === "completed") redirect(`/interview/${id}/complete`);

  const extraction = (
    session.persona_config as { extraction?: { role_title?: string } } | null
  )?.extraction;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-2xl px-4 text-center">
        <div className="rounded-xl bg-white p-10 shadow-sm ring-1 ring-gray-200">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">Session Ready</h1>
          {extraction?.role_title && (
            <p className="mt-1 text-gray-600">
              {extraction.role_title} &middot;{" "}
              <span className="capitalize">{session.difficulty_archetype}</span>{" "}
              interviewer
            </p>
          )}

          <p className="mt-6 text-sm text-gray-500">
            Your interviewer persona has been configured. Press the button below
            when you&apos;re ready — make sure you&apos;re in a quiet place with a
            working microphone.
          </p>

          <div className="mt-8">
            <Link
              href={`/interview/${session.id}`}
              className="inline-block rounded-md bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
            >
              Start Interview
            </Link>
          </div>

          <p className="mt-6 text-xs text-gray-400">Session ID: {session.id}</p>
        </div>
      </div>
    </div>
  );
}
