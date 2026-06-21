import Link from "next/link";

export const metadata = { title: "Interview Complete — AI Interview Coach" };

export default function InterviewCompletePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
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

          <h1 className="text-2xl font-bold text-gray-900">
            Interview Complete
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Great work — your session has been saved. The full feedback report
            will be available in a future update.
          </p>

          <div className="mt-8">
            <Link
              href="/new-session"
              className="inline-block rounded-md bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
            >
              Start another session
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
